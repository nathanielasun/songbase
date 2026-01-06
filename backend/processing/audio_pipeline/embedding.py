from __future__ import annotations

import numpy as np

from . import config


def pcm_to_examples(audio: np.ndarray, sr: int) -> np.ndarray:
    if sr != config.TARGET_SAMPLE_RATE:
        raise ValueError(
            f"Expected sample rate {config.TARGET_SAMPLE_RATE}, got {sr}"
        )

    if audio.dtype != np.float32:
        audio = audio.astype(np.float32)

    import vggish_input

    return vggish_input.waveform_to_examples(audio, sr)


def embed_examples(model, examples: np.ndarray) -> np.ndarray:
    embeddings = model.session.run(
        model.output_tensor,
        feed_dict={model.input_tensor: examples},
    )
    if model.postprocessor is not None:
        embeddings = model.postprocessor.postprocess(embeddings)
    return embeddings
