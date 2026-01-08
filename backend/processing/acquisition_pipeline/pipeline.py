from __future__ import annotations

import datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from . import config
from .db import fetch_pending, mark_batch, mark_status
from .downloader import DownloadResult, download_item
from .io import write_metadata
from .sources import ensure_sources


def _build_metadata(result: DownloadResult) -> dict:
    item = result.item
    metadata = {
        "queue_id": item.queue_id,
        "title": item.title,
        "artist": item.artist,
        "album": item.album,
        "genre": item.genre,
        "search_query": item.search_query,
        "source_url": item.source_url,
        "downloaded_at": dt.datetime.utcnow().isoformat() + "Z",
        "download_path": str(result.output_path) if result.output_path else None,
        "download_source": "yt-dlp",
        "yt_dlp": result.info or {},
    }
    return metadata


def download_pending(
    limit: int | None = None,
    workers: int | None = None,
    sources_file: Path | None = None,
    output_dir: Path | None = None,
    seed_sources: bool = True,
) -> dict[str, int]:
    if seed_sources:
        ensure_sources(sources_file)

    items = fetch_pending(limit)
    if not items:
        return {"requested": 0, "downloaded": 0, "failed": 0}

    output_root = output_dir or config.PREPROCESSED_CACHE_DIR
    output_root.mkdir(parents=True, exist_ok=True)

    mark_batch([item.queue_id for item in items], config.DOWNLOAD_STATUS_DOWNLOADING)

    downloaded = 0
    failed = 0

    max_workers = workers or config.DEFAULT_WORKERS
    max_workers = max(1, min(max_workers, len(items)))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(download_item, item, output_root): item for item in items
        }
        for future in as_completed(futures):
            result = future.result()
            if result.success and result.output_path:
                metadata = _build_metadata(result)
                write_metadata(result.output_path, metadata)

                # Check if the file needs audio conversion
                if result.needs_conversion:
                    # Mark as "converting" status to trigger conversion step
                    mark_status(
                        result.item.queue_id,
                        "converting",
                        download_path=str(result.output_path),
                    )
                else:
                    # Already MP3, mark as downloaded
                    mark_status(
                        result.item.queue_id,
                        config.DOWNLOAD_STATUS_DOWNLOADED,
                        download_path=str(result.output_path),
                    )
                downloaded += 1
            else:
                mark_status(
                    result.item.queue_id,
                    config.DOWNLOAD_STATUS_FAILED,
                    error=result.error,
                    increment_attempts=True,
                )
                failed += 1

    return {"requested": len(items), "downloaded": downloaded, "failed": failed}
