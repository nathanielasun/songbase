from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from backend.processing.acquisition_pipeline import config as acquisition_config

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_METADATA_DIR = Path(
    os.environ.get("SONGBASE_METADATA_DIR", REPO_ROOT / ".metadata")
)
SETTINGS_PATH = DEFAULT_METADATA_DIR / "settings.json"


def _default_settings() -> dict[str, Any]:
    return {
        "pipeline": {
            "download_limit": 25,
            "process_limit": 25,
            "download_workers": None,
            "pcm_workers": 2,
            "hash_workers": 2,
            "embed_workers": 1,
            "verify": True,
            "images": True,
        },
        "paths": {
            "preprocessed_cache_dir": str(acquisition_config.PREPROCESSED_CACHE_DIR),
            "song_cache_dir": str(acquisition_config.REPO_ROOT / ".song_cache"),
            "metadata_dir": str(DEFAULT_METADATA_DIR),
        },
        "sources": {
            "last_seeded_at": None,
        },
    }


def _deep_merge(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = _deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


def load_settings() -> dict[str, Any]:
    defaults = _default_settings()
    if not SETTINGS_PATH.exists():
        return defaults
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return defaults
    if not isinstance(data, dict):
        return defaults
    return _deep_merge(defaults, data)


def update_settings(patch: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    updated = _deep_merge(current, patch)
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(updated, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    return updated


def resolve_paths(settings: dict[str, Any] | None = None) -> dict[str, Path]:
    settings = settings or load_settings()
    paths = settings.get("paths") if isinstance(settings, dict) else {}
    if not isinstance(paths, dict):
        paths = {}

    preprocessed = paths.get("preprocessed_cache_dir")
    song_cache = paths.get("song_cache_dir")
    metadata_dir = paths.get("metadata_dir")

    return {
        "preprocessed_cache_dir": Path(
            preprocessed or acquisition_config.PREPROCESSED_CACHE_DIR
        ).expanduser(),
        "song_cache_dir": Path(
            song_cache or acquisition_config.REPO_ROOT / ".song_cache"
        ).expanduser(),
        "metadata_dir": Path(metadata_dir or DEFAULT_METADATA_DIR).expanduser(),
    }
