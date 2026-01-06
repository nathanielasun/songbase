from __future__ import annotations

import numpy as np


def resample(audio, sr: int, target_sr: int):
    if sr == target_sr:
        return audio

    try:
        import resampy
    except ImportError as exc:
        raise RuntimeError("resampy is required for resampling audio.") from exc

    return resampy.resample(audio, sr, target_sr)


def to_mono(audio):
    if audio.ndim == 1:
        return audio
    if audio.ndim == 2:
        return audio.mean(axis=1)
    raise ValueError("Audio array has unsupported dimensions.")


def normalize_amplitude(audio):
    peak = np.max(np.abs(audio)) if audio.size else 0.0
    if peak == 0.0:
        return audio
    return audio / peak


def trim_silence(audio, threshold_db: float = -40):
    if audio.size == 0:
        return audio

    eps = 1e-12
    magnitude = np.maximum(np.abs(audio), eps)
    db = 20.0 * np.log10(magnitude)
    mask = db > threshold_db
    if not np.any(mask):
        return audio[:0]

    indices = np.where(mask)[0]
    start = indices[0]
    end = indices[-1] + 1
    return audio[start:end]
