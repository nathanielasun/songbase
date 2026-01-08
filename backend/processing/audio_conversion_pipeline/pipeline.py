from __future__ import annotations

from pathlib import Path
from typing import Any
import os
import shutil

from backend.db.connection import get_connection
from backend.processing.acquisition_pipeline import config as acquisition_config
from backend.processing.acquisition_pipeline import io as acquisition_io

from . import config, converter


def fetch_items_needing_conversion(limit: int | None = None) -> list[dict[str, Any]]:
    """Fetch queue items that need audio conversion.

    Returns items with status 'converting' or newly downloaded files that need conversion.
    """
    query = """
        SELECT queue_id, download_path
        FROM metadata.download_queue
        WHERE status = %s AND download_path IS NOT NULL
        ORDER BY updated_at ASC
    """
    params: list[Any] = [config.CONVERSION_STATUS_CONVERTING]

    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [
        {"queue_id": row[0], "download_path": row[1]}
        for row in rows
    ]


def mark_converting(queue_id: int) -> None:
    """Mark a queue item as converting."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE metadata.download_queue
                SET status = %s, updated_at = NOW()
                WHERE queue_id = %s
                """,
                (config.CONVERSION_STATUS_CONVERTING, queue_id),
            )
        conn.commit()


def mark_converted(queue_id: int, converted_path: str) -> None:
    """Mark a queue item as converted and update the download path."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE metadata.download_queue
                SET
                    status = %s,
                    download_path = %s,
                    updated_at = NOW()
                WHERE queue_id = %s
                """,
                (config.CONVERSION_STATUS_CONVERTED, converted_path, queue_id),
            )
        conn.commit()


def mark_conversion_failed(queue_id: int, error: str) -> None:
    """Mark a queue item as failed conversion."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE metadata.download_queue
                SET
                    status = %s,
                    last_error = %s,
                    attempts = attempts + 1,
                    updated_at = NOW()
                WHERE queue_id = %s
                """,
                (acquisition_config.DOWNLOAD_STATUS_FAILED, error, queue_id),
            )
        conn.commit()


def convert_pending(
    limit: int | None = None,
    output_dir: Path | None = None,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Convert pending audio/video files to MP3 format.

    Args:
        limit: Maximum number of items to convert
        output_dir: Output directory (defaults to same as input)
        overwrite: Whether to overwrite existing files

    Returns:
        Dictionary with conversion statistics
    """
    items = fetch_items_needing_conversion(limit)

    stats = {
        "total": len(items),
        "converted": 0,
        "skipped": 0,
        "failed": 0,
    }

    if not items:
        return stats

    ffmpeg_path = converter._resolve_ffmpeg_path()

    for item in items:
        queue_id = item["queue_id"]
        download_path = Path(item["download_path"])

        if not download_path.exists():
            mark_conversion_failed(queue_id, f"File not found: {download_path}")
            stats["failed"] += 1
            continue

        # Check if conversion is needed
        if not converter.needs_conversion(download_path):
            # Already MP3, mark as converted
            mark_converted(queue_id, str(download_path))
            stats["skipped"] += 1
            print(f"[{queue_id}] Already MP3, skipping conversion")
            continue

        # Determine output path
        if output_dir:
            output_path = output_dir / f"{download_path.stem}.mp3"
        else:
            output_path = download_path.with_suffix(".mp3")

        print(f"[{queue_id}] Converting {download_path.name} to MP3...")

        # Perform conversion
        result = converter.convert_to_mp3(
            input_path=download_path,
            output_path=output_path,
            ffmpeg_path=ffmpeg_path,
            overwrite=overwrite,
        )

        if result.success:
            source_metadata = acquisition_io.metadata_path_for_mp3(download_path)
            target_metadata = acquisition_io.metadata_path_for_mp3(result.output_path)
            if source_metadata != target_metadata and source_metadata.exists():
                if not target_metadata.exists():
                    try:
                        os.replace(source_metadata, target_metadata)
                    except OSError:
                        try:
                            shutil.copyfile(source_metadata, target_metadata)
                        except OSError:
                            pass
            mark_converted(queue_id, str(result.output_path))
            stats["converted"] += 1
            print(f"[{queue_id}] ✓ Converted to {result.output_path}")

            # Optionally delete original file if it's different
            if result.output_path != download_path:
                try:
                    download_path.unlink()
                    print(f"[{queue_id}] Deleted original file")
                except Exception as e:
                    print(f"[{queue_id}] Warning: Could not delete original: {e}")
        else:
            mark_conversion_failed(queue_id, result.error or "Unknown error")
            stats["failed"] += 1
            print(f"[{queue_id}] ✗ Conversion failed: {result.error}")

    return stats
