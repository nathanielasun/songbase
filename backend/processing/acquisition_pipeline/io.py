from __future__ import annotations

import json
from pathlib import Path

from . import config


def metadata_path_for_mp3(mp3_path: Path) -> Path:
    return mp3_path.with_suffix(config.PREPROCESSED_METADATA_SUFFIX)


def write_metadata(mp3_path: Path, metadata: dict) -> Path:
    metadata_path = metadata_path_for_mp3(mp3_path)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata_path
