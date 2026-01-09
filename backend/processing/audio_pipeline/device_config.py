"""GPU/Metal device configuration for VGGish embeddings."""
from __future__ import annotations

import logging
import platform
import sys
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class DeviceType(Enum):
    """Available device types for inference."""
    AUTO = "auto"
    CPU = "cpu"
    GPU = "gpu"
    METAL = "metal"


class DeviceInfo:
    """Information about available compute devices."""

    def __init__(
        self,
        device_type: DeviceType,
        device_name: str,
        available: bool,
        details: dict[str, Any] | None = None,
    ):
        self.device_type = device_type
        self.device_name = device_name
        self.available = available
        self.details = details or {}

    def __repr__(self) -> str:
        status = "available" if self.available else "unavailable"
        return f"DeviceInfo({self.device_type.value}: {self.device_name} - {status})"


def _is_tensorflow_metal_installed() -> bool:
    """Check if tensorflow-metal package is installed."""
    try:
        from importlib.metadata import distributions
        installed_packages = {dist.metadata['Name'].lower() for dist in distributions()}
        return 'tensorflow-metal' in installed_packages
    except Exception:
        # Fallback: try to find via pip
        try:
            import subprocess
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'show', 'tensorflow-metal'],
                capture_output=True, text=True
            )
            return result.returncode == 0
        except Exception:
            return False


def detect_available_devices() -> list[DeviceInfo]:
    """Detect all available compute devices."""
    devices = []

    try:
        import tensorflow.compat.v1 as tf
        tf.disable_v2_behavior()

        # Check for CPU (always available)
        devices.append(DeviceInfo(
            device_type=DeviceType.CPU,
            device_name="CPU",
            available=True,
            details={"platform": platform.system()},
        ))

        # Check GPU devices
        import tensorflow as tf2
        gpu_devices = tf2.config.list_physical_devices('GPU')
        is_cuda = tf2.test.is_built_with_cuda()
        is_apple_silicon = platform.system() == "Darwin" and platform.processor() == "arm"
        metal_installed = _is_tensorflow_metal_installed()

        # On Apple Silicon with tensorflow-metal, GPU devices are Metal GPUs
        if is_apple_silicon:
            if metal_installed and gpu_devices:
                # Metal GPU available via tensorflow-metal plugin
                devices.append(DeviceInfo(
                    device_type=DeviceType.METAL,
                    device_name="Metal GPU",
                    available=True,
                    details={
                        "plugin": "tensorflow-metal",
                        "device": gpu_devices[0].name if gpu_devices else "GPU:0",
                    },
                ))
                logger.info("Metal GPU acceleration available via tensorflow-metal")
                # Also register as GPU for compatibility
                devices.append(DeviceInfo(
                    device_type=DeviceType.GPU,
                    device_name=gpu_devices[0].name,
                    available=True,
                    details={"index": 0, "type": "metal"},
                ))
            else:
                # Apple Silicon but no Metal support
                devices.append(DeviceInfo(
                    device_type=DeviceType.METAL,
                    device_name="Metal",
                    available=False,
                    details={"reason": "tensorflow-metal not installed"},
                ))
                logger.info(
                    "Metal GPU unavailable: tensorflow-metal not installed. "
                    "Install with: pip install tensorflow-metal"
                )
                devices.append(DeviceInfo(
                    device_type=DeviceType.GPU,
                    device_name="GPU",
                    available=False,
                    details={"reason": "No GPU acceleration available"},
                ))
        else:
            # Non-Apple: check for CUDA GPUs
            devices.append(DeviceInfo(
                device_type=DeviceType.METAL,
                device_name="Metal",
                available=False,
                details={"reason": "Not Apple Silicon"},
            ))

            if gpu_devices and is_cuda:
                for i, device in enumerate(gpu_devices):
                    devices.append(DeviceInfo(
                        device_type=DeviceType.GPU,
                        device_name=device.name,
                        available=True,
                        details={"index": i, "type": "cuda"},
                    ))
                logger.info(f"Found {len(gpu_devices)} CUDA GPU device(s)")
            elif gpu_devices:
                # GPU found but not CUDA (rare case)
                for i, device in enumerate(gpu_devices):
                    devices.append(DeviceInfo(
                        device_type=DeviceType.GPU,
                        device_name=device.name,
                        available=True,
                        details={"index": i, "type": "unknown"},
                    ))
                logger.info(f"Found {len(gpu_devices)} GPU device(s)")
            else:
                devices.append(DeviceInfo(
                    device_type=DeviceType.GPU,
                    device_name="GPU",
                    available=False,
                    details={"reason": "No GPU devices found"},
                ))

    except Exception as e:
        logger.error(f"Device detection failed: {e}")
        # Fallback to CPU only
        devices.append(DeviceInfo(
            device_type=DeviceType.CPU,
            device_name="CPU",
            available=True,
            details={"fallback": True},
        ))

    return devices


def get_tf_session_config(
    device_preference: str = "auto",
    gpu_memory_fraction: float = 0.8,
    allow_growth: bool = True,
) -> Any:
    """
    Create TensorFlow v1 session configuration for optimal device usage.

    Args:
        device_preference: Device preference ("auto", "cpu", "gpu", "metal")
        gpu_memory_fraction: Fraction of GPU memory to allocate (0.0-1.0)
        allow_growth: Allow GPU memory to grow as needed

    Returns:
        TensorFlow ConfigProto object
    """
    try:
        import tensorflow.compat.v1 as tf
        tf.disable_v2_behavior()

        config = tf.ConfigProto()

        devices = detect_available_devices()
        available_device_types = {d.device_type for d in devices if d.available}

        # Determine which device to use
        requested_device = DeviceType(device_preference.lower())

        if requested_device == DeviceType.AUTO:
            # Auto-select best available device
            if DeviceType.METAL in available_device_types:
                selected_device = DeviceType.METAL
            elif DeviceType.GPU in available_device_types:
                selected_device = DeviceType.GPU
            else:
                selected_device = DeviceType.CPU
        else:
            selected_device = requested_device

        # Configure based on selected device
        if selected_device == DeviceType.CPU or selected_device not in available_device_types:
            if selected_device != DeviceType.CPU:
                logger.warning(
                    f"Requested device '{selected_device.value}' not available, "
                    f"falling back to CPU"
                )
            # Disable GPU usage for CPU-only mode
            config.device_count['GPU'] = 0
            logger.info("Using CPU for VGGish embeddings")

        elif selected_device == DeviceType.GPU:
            config.gpu_options.allow_growth = allow_growth
            config.gpu_options.per_process_gpu_memory_fraction = gpu_memory_fraction
            logger.info(
                f"Using GPU for VGGish embeddings "
                f"(memory_fraction={gpu_memory_fraction}, allow_growth={allow_growth})"
            )

        elif selected_device == DeviceType.METAL:
            # Metal uses GPU:0 in TensorFlow
            config.gpu_options.allow_growth = allow_growth
            logger.info("Using Metal GPU acceleration for VGGish embeddings")

        # General optimizations
        config.allow_soft_placement = True
        config.log_device_placement = False

        return config

    except Exception as e:
        logger.error(f"Failed to create TensorFlow session config: {e}")
        # Return None to use default config
        return None


def log_device_info() -> None:
    """Log information about available devices."""
    devices = detect_available_devices()

    logger.info("=== Available Compute Devices ===")
    for device in devices:
        status = "✓" if device.available else "✗"
        logger.info(f"  {status} {device.device_type.value.upper()}: {device.device_name}")
        if device.details:
            for key, value in device.details.items():
                logger.info(f"      {key}: {value}")
    logger.info("=" * 34)
