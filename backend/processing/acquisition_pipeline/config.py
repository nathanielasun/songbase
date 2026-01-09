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


# Format selection is now done dynamically in downloader.py
# This allows intelligent selection from available formats
# Prefer audio-only over video+audio to save space and conversion time
YTDLP_PREFER_AUDIO_ONLY = _parse_bool(os.environ.get("SONGBASE_YTDLP_PREFER_AUDIO_ONLY"), default=True)
YTDLP_MAX_AUDIO_QUALITY = int(os.environ.get("SONGBASE_YTDLP_MAX_AUDIO_QUALITY", "256"))  # Max kbps for audio
YTDLP_RETRIES = int(os.environ.get("SONGBASE_YTDLP_RETRIES", "2"))
YTDLP_FRAGMENT_RETRIES = int(os.environ.get("SONGBASE_YTDLP_FRAGMENT_RETRIES", "5"))
YTDLP_EXTRACTOR_RETRIES = int(os.environ.get("SONGBASE_YTDLP_EXTRACTOR_RETRIES", "3"))
YTDLP_SLEEP_INTERVAL = float(os.environ.get("SONGBASE_YTDLP_SLEEP_INTERVAL", "1.0"))
YTDLP_MAX_SLEEP_INTERVAL = float(
    os.environ.get("SONGBASE_YTDLP_MAX_SLEEP_INTERVAL", "3.0")
)
YTDLP_FORCE_IPV4 = _parse_bool(os.environ.get("SONGBASE_YTDLP_FORCE_IPV4"))
YTDLP_DEBUG = _parse_bool(os.environ.get("SONGBASE_YTDLP_DEBUG"), default=True)

# Player client fallback strategies for YouTube extraction
# When signature extraction fails with one client, the downloader will try others
# Comma-separated list of clients to try: default,android,ios,web,mediaconnect
# Set to empty string to disable fallback and use only default client
YTDLP_PLAYER_CLIENTS = os.environ.get("SONGBASE_YTDLP_PLAYER_CLIENTS", "default,android,ios,web,mediaconnect")


def get_ytdlp_cookies_file() -> str | None:
    """Get yt-dlp cookies file from stored settings or environment variable.

    Returns the expanded and validated path to the cookies file, or None if not configured.
    """
    cookies_path = None

    # First try environment variable for backwards compatibility
    env_cookies = os.environ.get("SONGBASE_YTDLP_COOKIES_FILE")
    if env_cookies:
        cookies_path = env_cookies
    else:
        # Then try stored acquisition settings
        try:
            from backend import app_settings
            settings = app_settings.load_settings()
            paths = app_settings.resolve_paths(settings)
            metadata_dir = paths["metadata_dir"]
            acquisition_settings_path = metadata_dir / "acquisition_settings.json"

            if acquisition_settings_path.exists():
                import json
                with acquisition_settings_path.open("r", encoding="utf-8") as f:
                    acquisition_settings = json.load(f)

                active_backend = acquisition_settings.get("active_backend", "yt-dlp")
                backends = acquisition_settings.get("backends", {})

                if active_backend in backends:
                    backend = backends[active_backend]
                    if backend.get("enabled") and backend.get("cookies_file"):
                        cookies_path = backend["cookies_file"]
        except Exception:  # noqa: BLE001
            # If anything fails, just return None
            pass

    # Expand and validate the path
    if cookies_path:
        # Expand ~ and environment variables
        expanded_path = Path(cookies_path).expanduser().resolve()

        # Check if file exists and is readable
        if expanded_path.exists() and expanded_path.is_file():
            return str(expanded_path)
        else:
            # File doesn't exist, but return the expanded path anyway
            # yt-dlp will give a clearer error message
            print(f"Warning: Cookies file not found at {expanded_path}")
            return str(expanded_path)

    return None


# Note: This is evaluated at module import time
# For dynamic loading, use get_ytdlp_cookies_file() directly
YTDLP_COOKIES_FILE = get_ytdlp_cookies_file()
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
