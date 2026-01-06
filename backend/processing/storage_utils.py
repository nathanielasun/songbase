from __future__ import annotations

import os
from pathlib import Path


def song_cache_path(root: Path, sha_id: str, extension: str = ".mp3") -> Path:
    if len(sha_id) < 2:
        raise ValueError("sha_id must be at least 2 characters long.")
    return Path(root) / sha_id[:2] / f"{sha_id}{extension}"


def atomic_move(source: Path, target: Path) -> None:
    target_path = Path(target)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    os.replace(source, target_path)
