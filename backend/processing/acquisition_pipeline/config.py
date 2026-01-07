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

def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


YTDLP_FORMAT = os.environ.get(
    "SONGBASE_YTDLP_FORMAT",
    "bestaudio[ext=m4a]/bestaudio/best",
)
YTDLP_RETRIES = int(os.environ.get("SONGBASE_YTDLP_RETRIES", "2"))
YTDLP_FRAGMENT_RETRIES = int(os.environ.get("SONGBASE_YTDLP_FRAGMENT_RETRIES", "5"))
YTDLP_EXTRACTOR_RETRIES = int(os.environ.get("SONGBASE_YTDLP_EXTRACTOR_RETRIES", "3"))
YTDLP_SLEEP_INTERVAL = float(os.environ.get("SONGBASE_YTDLP_SLEEP_INTERVAL", "1.0"))
YTDLP_MAX_SLEEP_INTERVAL = float(
    os.environ.get("SONGBASE_YTDLP_MAX_SLEEP_INTERVAL", "3.0")
)
YTDLP_FORCE_IPV4 = _parse_bool(os.environ.get("SONGBASE_YTDLP_FORCE_IPV4"))
YTDLP_COOKIES_FILE = os.environ.get("SONGBASE_YTDLP_COOKIES_FILE")
YTDLP_DEBUG = _parse_bool(os.environ.get("SONGBASE_YTDLP_DEBUG"), default=True)
YTDLP_AUDIO_FORMAT = "mp3"
YTDLP_AUDIO_QUALITY = "0"
YTDLP_SEARCH_COUNT = int(os.environ.get("SONGBASE_YTDLP_SEARCH_COUNT", "5"))
YTDLP_MIN_DURATION = int(os.environ.get("SONGBASE_YTDLP_MIN_DURATION", "30"))

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
