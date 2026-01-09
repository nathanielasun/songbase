#!/usr/bin/env python3
"""Test script to verify GPU/Metal detection and configuration."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from device_config import detect_available_devices, get_tf_session_config, log_device_info

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def main() -> int:
    """Run GPU detection tests."""
    print("=" * 60)
    print("VGGish GPU/Metal Detection Test")
    print("=" * 60)
    print()

    # Test 1: Detect available devices
    print("Test 1: Detecting available compute devices...")
    print("-" * 60)
    devices = detect_available_devices()

    for device in devices:
        status_symbol = "✓" if device.available else "✗"
        status_text = "AVAILABLE" if device.available else "UNAVAILABLE"
        print(f"{status_symbol} {device.device_type.value.upper()}: {status_text}")

        if device.details:
            for key, value in device.details.items():
                print(f"    {key}: {value}")

    print()

    # Test 2: Log device info using the logging system
    print("Test 2: Device info via logging system...")
    print("-" * 60)
    log_device_info()
    print()

    # Test 3: Test session configurations for each device type
    print("Test 3: Testing TensorFlow session configurations...")
    print("-" * 60)

    test_configs = ["auto", "cpu", "gpu", "metal"]

    for device_pref in test_configs:
        print(f"\nTesting device preference: '{device_pref}'")
        try:
            config = get_tf_session_config(
                device_preference=device_pref,
                gpu_memory_fraction=0.8,
                allow_growth=True,
            )
            if config is not None:
                print(f"  ✓ Session config created successfully")
                print(f"    - allow_soft_placement: {config.allow_soft_placement}")
                print(f"    - log_device_placement: {config.log_device_placement}")
                if hasattr(config, 'gpu_options'):
                    print(f"    - GPU allow_growth: {config.gpu_options.allow_growth}")
                    print(f"    - GPU memory_fraction: {config.gpu_options.per_process_gpu_memory_fraction}")
                if hasattr(config, 'device_count'):
                    print(f"    - Device count: {dict(config.device_count)}")
            else:
                print(f"  ✗ Failed to create session config (using default)")
        except Exception as e:
            print(f"  ✗ Error: {e}")

    print()
    print("=" * 60)
    print("Test completed!")
    print("=" * 60)

    # Summary
    available_gpu = any(d.available for d in devices if d.device_type.value in ['gpu', 'metal'])

    if available_gpu:
        print("\n✓ GPU acceleration is available on this system!")
        gpu_types = [d.device_type.value for d in devices if d.available and d.device_type.value in ['gpu', 'metal']]
        print(f"  Available GPU types: {', '.join(gpu_types)}")
    else:
        print("\nℹ No GPU acceleration available - will use CPU for embeddings")
        print("  This is normal on systems without dedicated GPUs.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
