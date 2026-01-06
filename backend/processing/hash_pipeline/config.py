from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSING_DIR = BASE_DIR.parent

HASH_PIPELINE_VERSION = "v1"

TARGET_SAMPLE_RATE = 22050
PCM_DTYPE = "float32"

OUTPUT_EXTENSION = ".wav"
OUTPUT_SAMPLE_WIDTH_BYTES = 2
OUTPUT_CHANNELS = 1

NORMALIZE_AMPLITUDE = True
TRIM_SILENCE = True
TRIM_SILENCE_DB = -45.0
