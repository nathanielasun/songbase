from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROCESSING_DIR = BASE_DIR.parent
REPO_ROOT = PROCESSING_DIR.parent.parent

PREPROCESSED_CACHE_DIR = REPO_ROOT / "preprocessed_cache"
PREPROCESSED_METADATA_SUFFIX = ".json"

SOURCES_PATH = BASE_DIR / "sources.jsonl"

DOWNLOAD_STATUS_PENDING = "pending"
DOWNLOAD_STATUS_DOWNLOADING = "downloading"
DOWNLOAD_STATUS_DOWNLOADED = "downloaded"
DOWNLOAD_STATUS_FAILED = "failed"

DEFAULT_WORKERS = max(1, min(4, os.cpu_count() or 2))

YTDLP_FORMAT = "bestaudio/best"
YTDLP_RETRIES = 2
YTDLP_AUDIO_FORMAT = "mp3"
YTDLP_AUDIO_QUALITY = "0"
