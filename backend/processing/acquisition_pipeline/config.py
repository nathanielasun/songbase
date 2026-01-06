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

# Discovery settings (song list acquisition).
DISCOVERY_SEED_GENRES = int(os.environ.get("SONGBASE_DISCOVERY_SEED_GENRES", "5"))
DISCOVERY_SEED_ARTISTS = int(os.environ.get("SONGBASE_DISCOVERY_SEED_ARTISTS", "5"))
DISCOVERY_SEED_ALBUMS = int(os.environ.get("SONGBASE_DISCOVERY_SEED_ALBUMS", "5"))

DISCOVERY_LIMIT_PER_GENRE = int(
    os.environ.get("SONGBASE_DISCOVERY_LIMIT_PER_GENRE", "10")
)
DISCOVERY_LIMIT_PER_ARTIST = int(
    os.environ.get("SONGBASE_DISCOVERY_LIMIT_PER_ARTIST", "10")
)
DISCOVERY_LIMIT_PER_ALBUM = int(
    os.environ.get("SONGBASE_DISCOVERY_LIMIT_PER_ALBUM", "10")
)

DISCOVERY_RATE_LIMIT_SECONDS = float(
    os.environ.get("SONGBASE_DISCOVERY_RATE_LIMIT_SECONDS", "1.0")
)

HOTLIST_URLS = [
    url.strip()
    for url in os.environ.get("SONGBASE_HOTLIST_URLS", "").split(",")
    if url.strip()
]
HOTLIST_TIMEOUT_SECONDS = float(
    os.environ.get("SONGBASE_HOTLIST_TIMEOUT_SECONDS", "10")
)
