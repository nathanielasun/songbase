from __future__ import annotations

from pathlib import Path

from . import config
from .io import load_wav, save_metadata, save_wav
from .preprocessing import normalize_amplitude, resample, to_mono, trim_silence


def normalize_wav_file(path):
    audio, sr = load_wav(path)
    audio = to_mono(audio)
    audio = resample(audio, sr, config.TARGET_SAMPLE_RATE)

    if config.NORMALIZE_AMPLITUDE:
        audio = normalize_amplitude(audio)
    if config.TRIM_SILENCE:
        audio = trim_silence(audio, threshold_db=config.TRIM_SILENCE_DB)

    return audio, config.TARGET_SAMPLE_RATE


def normalization_metadata() -> dict:
    return {
        "pipeline": "hash_pipeline",
        "version": config.HASH_PIPELINE_VERSION,
        "sample_rate": config.TARGET_SAMPLE_RATE,
        "pcm_dtype": config.PCM_DTYPE,
        "normalize_amplitude": config.NORMALIZE_AMPLITUDE,
        "trim_silence": config.TRIM_SILENCE,
        "trim_silence_db": config.TRIM_SILENCE_DB,
    }


def output_path_for_wav(input_dir: Path, output_dir: Path, wav_path: Path) -> Path:
    relative_path = wav_path.relative_to(input_dir)
    return (output_dir / relative_path).with_suffix(config.OUTPUT_EXTENSION)


def metadata_path_for_wav(output_path: Path) -> Path:
    return output_path.with_suffix(output_path.suffix + ".json")


def save_normalized_wav(
    input_path: Path,
    output_path: Path,
    write_metadata: bool,
) -> None:
    audio, sample_rate = normalize_wav_file(input_path)
    save_wav(output_path, audio, sample_rate)

    if write_metadata:
        metadata = normalization_metadata()
        metadata["input_path"] = str(input_path)
        metadata["output_path"] = str(output_path)
        save_metadata(metadata_path_for_wav(output_path), metadata)
