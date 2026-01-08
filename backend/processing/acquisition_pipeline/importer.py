from __future__ import annotations

import datetime as dt
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Iterable

from backend.processing import dependencies
from backend.processing.audio_conversion_pipeline import config as conversion_config
from backend.processing.audio_conversion_pipeline import converter
from backend.processing.metadata_pipeline.filename_parser import parse_filename

from . import config, db, io


@dataclass(frozen=True)
class ImportResult:
    queue_id: int
    filename: str
    title: str
    artist: str | None
    status: str
    download_path: str


@dataclass(frozen=True)
class ImportFailure:
    filename: str
    error: str


def _parse_filename(filename: str) -> tuple[str, str | None]:
    stem = Path(filename).stem or filename
    results = parse_filename(stem)
    if results:
        parsed = results[0]
        title = parsed.title or stem
        artist = parsed.artist
    else:
        title = stem
        artist = None
    return title, artist


def _needs_conversion(filename: str) -> bool:
    suffix = Path(filename).suffix.lower()
    if not suffix:
        return False
    return suffix != ".mp3"


def import_streams(
    files: Iterable[tuple[str, BinaryIO]],
    output_dir: Path,
) -> tuple[list[ImportResult], list[ImportFailure]]:
    output_dir.mkdir(parents=True, exist_ok=True)

    items = list(files)
    if any(_needs_conversion(name) for name, _ in items):
        dependencies.ensure_dependencies(["ffmpeg"])

    imported: list[ImportResult] = []
    failures: list[ImportFailure] = []

    for filename, stream in items:
        if not filename:
            failures.append(ImportFailure(filename=filename or "unknown", error="Missing filename"))
            continue
        suffix = Path(filename).suffix.lower()
        if suffix not in conversion_config.ALL_SUPPORTED_FORMATS:
            failures.append(
                ImportFailure(
                    filename=filename,
                    error=f"Unsupported format: {suffix or 'unknown'}",
                )
            )
            continue

        title, artist = _parse_filename(filename)
        status = (
            conversion_config.CONVERSION_STATUS_CONVERTING
            if _needs_conversion(filename)
            else config.DOWNLOAD_STATUS_DOWNLOADED
        )
        source_url = f"local://{uuid.uuid4()}"

        try:
            queue_id = db.insert_import_item(
                title=title,
                artist=artist,
                album=None,
                genre=None,
                search_query=filename,
                source_url=source_url,
                status=status,
            )
        except Exception as exc:  # noqa: BLE001
            failures.append(ImportFailure(filename=filename, error=str(exc)))
            continue

        output_path = output_dir / f"{queue_id}{suffix}"

        try:
            with output_path.open("wb") as handle:
                shutil.copyfileobj(stream, handle)

            if output_path.stat().st_size == 0:
                raise ValueError("Imported file is empty")

            metadata = {
                "queue_id": queue_id,
                "title": title,
                "artist": artist,
                "album": None,
                "genre": None,
                "search_query": filename,
                "source_url": source_url,
                "download_source": "local-import",
                "imported_at": dt.datetime.utcnow().isoformat() + "Z",
                "original_filename": filename,
            }
            io.write_metadata(output_path, metadata)
            if status == conversion_config.CONVERSION_STATUS_CONVERTING:
                mp3_path = output_path.with_suffix(".mp3")
                io.write_metadata(mp3_path, metadata)

            db.mark_status(queue_id, status, download_path=str(output_path))

            imported.append(
                ImportResult(
                    queue_id=queue_id,
                    filename=filename,
                    title=title,
                    artist=artist,
                    status=status,
                    download_path=str(output_path),
                )
            )
        except Exception as exc:  # noqa: BLE001
            try:
                db.mark_status(
                    queue_id,
                    config.DOWNLOAD_STATUS_FAILED,
                    error=str(exc),
                    increment_attempts=True,
                )
            except Exception:  # noqa: BLE001
                pass
            try:
                if output_path.exists():
                    output_path.unlink()
            except OSError:
                pass
            failures.append(ImportFailure(filename=filename, error=str(exc)))

    return imported, failures
