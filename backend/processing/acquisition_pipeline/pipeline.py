from __future__ import annotations

from pathlib import Path

from . import config
from .sources import ensure_sources


def download_pending(
    limit: int | None = None,
    workers: int | None = None,
    sources_file: Path | None = None,
    output_dir: Path | None = None,
    seed_sources: bool = True,
) -> dict[str, int]:
    """Download pending items from the queue.

    NOTE: External downloading (yt-dlp) has been removed from Songbase.
    This function now returns immediately. Use local file import instead.
    """
    if seed_sources:
        ensure_sources(sources_file)

    # External downloading is no longer supported
    # Users should import local audio files instead
    return {"requested": 0, "downloaded": 0, "failed": 0, "note": "External downloading disabled"}
