from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np

from . import config


def _decode_pcm(raw: bytes, sampwidth: int) -> tuple[np.ndarray, float]:
    if sampwidth == 1:
        data = np.frombuffer(raw, dtype=np.uint8).astype(np.int16) - 128
        scale = float(1 << 7)
        return data.astype(np.float32), scale
    if sampwidth == 2:
        data = np.frombuffer(raw, dtype=np.int16)
        scale = float(1 << 15)
        return data.astype(np.float32), scale
    if sampwidth == 3:
        raw_u8 = np.frombuffer(raw, dtype=np.uint8)
        if raw_u8.size % 3 != 0:
            raise ValueError("Invalid 24-bit PCM buffer size.")
        raw_u8 = raw_u8.reshape(-1, 3)
        data = (
            raw_u8[:, 0].astype(np.int32)
            | (raw_u8[:, 1].astype(np.int32) << 8)
            | (raw_u8[:, 2].astype(np.int32) << 16)
        )
        sign_bit = 1 << 23
        data = (data ^ sign_bit) - sign_bit
        scale = float(1 << 23)
        return data.astype(np.float32), scale
    if sampwidth == 4:
        data = np.frombuffer(raw, dtype=np.int32)
        scale = float(1 << 31)
        return data.astype(np.float32), scale

    raise ValueError(f"Unsupported sample width: {sampwidth} bytes")


def load_wav(path) -> tuple[np.ndarray, int]:
    wav_path = Path(path)
    with wave.open(str(wav_path), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        sampwidth = wav_file.getsampwidth()
        frames = wav_file.getnframes()
        raw_audio = wav_file.readframes(frames)

    pcm, scale = _decode_pcm(raw_audio, sampwidth)
    if channels > 1:
        pcm = pcm.reshape(-1, channels)

    pcm = pcm / scale
    pcm = pcm.astype(np.dtype(config.PCM_DTYPE))
    return pcm, sample_rate


def save_wav(path, audio: np.ndarray, sample_rate: int) -> None:
    if audio.ndim != 1:
        raise ValueError("Expected mono audio array for saving.")

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * (2**15 - 1)).astype(np.int16)

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(config.OUTPUT_CHANNELS)
        wav_file.setsampwidth(config.OUTPUT_SAMPLE_WIDTH_BYTES)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())


def save_metadata(path, metadata: dict) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
