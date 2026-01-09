from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import config
from .device_config import get_tf_session_config, log_device_info

logger = logging.getLogger(__name__)


@dataclass
class VggishModel:
    session: Any
    input_tensor: Any
    output_tensor: Any
    postprocessor: Any | None
    metadata: dict


def _ensure_vggish_on_path() -> None:
    vggish_path = str(config.VGGISH_DIR)
    if vggish_path not in sys.path:
        sys.path.insert(0, vggish_path)


def _apply_param_overrides(vggish_params) -> None:
    overrides = {
        "SAMPLE_RATE": config.TARGET_SAMPLE_RATE,
        "STFT_WINDOW_LENGTH_SECONDS": config.VGGISH_STFT_WINDOW_SEC,
        "STFT_HOP_LENGTH_SECONDS": config.VGGISH_STFT_HOP_SEC,
        "NUM_MEL_BINS": config.VGGISH_NUM_MEL_BINS,
        "MEL_MIN_HZ": config.VGGISH_MEL_MIN_HZ,
        "MEL_MAX_HZ": config.VGGISH_MEL_MAX_HZ,
        "LOG_OFFSET": config.VGGISH_LOG_OFFSET,
        "EXAMPLE_WINDOW_SECONDS": config.VGGISH_FRAME_SEC,
        "EXAMPLE_HOP_SECONDS": config.VGGISH_HOP_SEC,
        "INPUT_TENSOR_NAME": config.VGGISH_INPUT_TENSOR_NAME,
        "OUTPUT_TENSOR_NAME": config.VGGISH_OUTPUT_TENSOR_NAME,
        "EMBEDDING_SIZE": config.VGGISH_EMBEDDING_SIZE,
    }
    for name, value in overrides.items():
        if hasattr(vggish_params, name):
            setattr(vggish_params, name, value)


def load_vggish_model(
    checkpoint_path: Path | None = None,
    pca_params_path: Path | None = None,
    use_postprocess: bool = True,
    device_preference: str | None = None,
    gpu_memory_fraction: float | None = None,
    gpu_allow_growth: bool | None = None,
) -> VggishModel:
    """
    Load VGGish model with GPU/Metal support.

    Args:
        checkpoint_path: Path to VGGish checkpoint file
        pca_params_path: Path to PCA parameters file
        use_postprocess: Whether to apply PCA postprocessing
        device_preference: Device to use ("auto", "cpu", "gpu", "metal")
        gpu_memory_fraction: Fraction of GPU memory to allocate
        gpu_allow_growth: Allow GPU memory to grow dynamically

    Returns:
        VggishModel instance
    """
    _ensure_vggish_on_path()

    import tensorflow.compat.v1 as tf  # type: ignore

    tf.disable_v2_behavior()

    import vggish_params
    import vggish_postprocess
    import vggish_slim

    _apply_param_overrides(vggish_params)

    checkpoint = Path(checkpoint_path or config.VGGISH_CHECKPOINT_PATH)
    pca_params = Path(pca_params_path or config.VGGISH_PCA_PARAMS_PATH)

    # Log available devices
    log_device_info()

    # Get device configuration
    device_pref = device_preference or config.VGGISH_DEVICE_PREFERENCE
    gpu_mem_frac = gpu_memory_fraction or config.VGGISH_GPU_MEMORY_FRACTION
    gpu_growth = gpu_allow_growth if gpu_allow_growth is not None else config.VGGISH_GPU_ALLOW_GROWTH

    session_config = get_tf_session_config(
        device_preference=device_pref,
        gpu_memory_fraction=gpu_mem_frac,
        allow_growth=gpu_growth,
    )

    graph = tf.Graph()
    with graph.as_default():
        vggish_slim.define_vggish_slim(training=False)

        # Create session with GPU/Metal configuration
        if session_config is not None:
            session = tf.Session(graph=graph, config=session_config)
            logger.info("VGGish model loaded with custom device configuration")
        else:
            session = tf.Session(graph=graph)
            logger.info("VGGish model loaded with default configuration")

        vggish_slim.load_vggish_slim_checkpoint(session, str(checkpoint))

        input_tensor = graph.get_tensor_by_name(vggish_params.INPUT_TENSOR_NAME)
        output_tensor = graph.get_tensor_by_name(vggish_params.OUTPUT_TENSOR_NAME)

    postprocessor = None
    if use_postprocess:
        postprocessor = vggish_postprocess.Postprocessor(str(pca_params))

    metadata = {
        "model": "vggish",
        "checkpoint_path": str(checkpoint),
        "checkpoint_version": config.VGGISH_CHECKPOINT_VERSION,
        "pca_params_path": str(pca_params),
        "pca_params_version": config.VGGISH_PCA_PARAMS_VERSION,
        "sample_rate": config.TARGET_SAMPLE_RATE,
        "frame_sec": config.VGGISH_FRAME_SEC,
        "hop_sec": config.VGGISH_HOP_SEC,
        "postprocess": bool(postprocessor),
        "device_preference": device_pref,
        "gpu_memory_fraction": gpu_mem_frac,
        "gpu_allow_growth": gpu_growth,
    }

    return VggishModel(
        session=session,
        input_tensor=input_tensor,
        output_tensor=output_tensor,
        postprocessor=postprocessor,
        metadata=metadata,
    )
