from __future__ import annotations

import datetime as dt
import difflib
import hashlib
import io
import json
import re
import shutil
import string
import tempfile
import threading
import zipfile
from collections import deque
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel

from backend import app_settings
from backend.db.connection import get_connection
from backend.db.image_connection import get_image_connection
from backend.db.ingest import collect_mp3_files, ingest_paths
from backend.processing import orchestrator
from backend.processing.acquisition_pipeline import config as acquisition_config
from backend.processing.acquisition_pipeline import importer as acquisition_importer
from backend.processing.acquisition_pipeline import sources as acquisition_sources
from backend.processing.audio_pipeline import config as vggish_config
from backend.processing.metadata_pipeline.image_pipeline import sync_images_and_profiles
from backend.processing.metadata_pipeline.pipeline import (
    verify_songs_by_sha_ids,
    verify_unverified_songs,
)
from backend.processing.storage_utils import song_cache_path
from backend.processing.metadata_pipeline.id3_writer import write_id3_tags

router = APIRouter()

ALBUM_KEY_SQL = "md5(lower(coalesce(s.album, '')) || '::' || lower(coalesce(a_primary.name, '')))"


class IngestRequest(BaseModel):
    input_path: str
    embedding_dir: str | None = None
    ingestion_source: str | None = None
    model_name: str = "vggish"
    model_version: str | None = None
    preprocess_version: str | None = None
    limit: int | None = None


class QueueSong(BaseModel):
    title: str
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    search_query: str | None = None
    source_url: str | None = None


class QueueInsertRequest(BaseModel):
    items: list[QueueSong]
    append_sources: bool = False


class PipelineRunRequest(BaseModel):
    seed_sources: bool = False
    download: bool = True
    download_limit: int | None = None
    process_limit: int | None = None
    download_workers: int | None = None
    pcm_workers: int | None = None
    hash_workers: int | None = None
    embed_workers: int | None = None
    overwrite: bool = False
    dry_run: bool = False
    verify: bool | None = None
    images: bool | None = None
    image_limit_songs: int | None = None
    image_limit_artists: int | None = None
    image_rate_limit: float | None = None
    sources_file: str | None = None
    run_until_empty: bool = False


class LinkSongsRequest(BaseModel):
    album_id: str
    sha_ids: list[str]
    mark_verified: bool = True


class SongUpdateRequest(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    release_year: int | None = None
    track_number: int | None = None


class CatalogEntry(BaseModel):
    sha_id: str
    title: str | None = None
    album: str | None = None
    duration_sec: int | None = None
    release_year: int | None = None
    track_number: int | None = None
    verified: bool | None = None
    verification_source: str | None = None
    artists: list[str] = []
    artist_ids: list[int] = []
    primary_artist_id: int | None = None
    album_id: str | None = None


class VerifyMetadataRequest(BaseModel):
    limit: int | None = None
    min_score: int | None = None
    rate_limit: float | None = None
    dry_run: bool = False


class VerifySongRequest(BaseModel):
    min_score: int | None = None
    rate_limit: float | None = None
    dry_run: bool = False


class ImageSyncRequest(BaseModel):
    limit_songs: int | None = None
    limit_artists: int | None = None
    rate_limit: float | None = None
    dry_run: bool = False


class StopMetadataRequest(BaseModel):
    task: str


_pipeline_lock = threading.Lock()
_pipeline_thread: threading.Thread | None = None
_pipeline_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "last_config": None,
    "stop_requested": False,
}
_pipeline_stop_event = threading.Event()

_metadata_lock = threading.Lock()
_metadata_threads: dict[str, threading.Thread | None] = {
    "verification": None,
    "images": None,
}
_metadata_state: dict[str, dict[str, Any]] = {
    "verification": {
        "running": False,
        "started_at": None,
        "finished_at": None,
        "last_error": None,
        "last_result": None,
        "last_config": None,
        "stop_requested": False,
        "last_status": None,
    },
    "images": {
        "running": False,
        "started_at": None,
        "finished_at": None,
        "last_error": None,
        "last_result": None,
        "last_config": None,
        "stop_requested": False,
        "last_status": None,
    },
}
_metadata_stop_events: dict[str, threading.Event] = {
    "verification": threading.Event(),
    "images": threading.Event(),
}


def _utc_now() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


def _normalize_queue_items(items: list[QueueSong]) -> list[acquisition_sources.SourceItem]:
    normalized: list[acquisition_sources.SourceItem] = []
    for item in items:
        search_query = item.search_query
        if not search_query:
            if item.artist:
                search_query = f"{item.artist} - {item.title}"
            else:
                search_query = item.title
        normalized.append(
            acquisition_sources.SourceItem(
                title=item.title,
                artist=item.artist,
                album=item.album,
                genre=item.genre,
                search_query=search_query,
                source_url=item.source_url,
            )
        )
    return normalized


def _pipeline_defaults() -> dict[str, Any]:
    settings = app_settings.load_settings()
    pipeline = settings.get("pipeline", {})
    if isinstance(pipeline, dict):
        return pipeline
    return {}


def _resolve_pipeline_paths() -> orchestrator.PipelinePaths:
    settings = app_settings.load_settings()
    paths = app_settings.resolve_paths(settings)
    return orchestrator.PipelinePaths.from_overrides(
        preprocessed_cache_dir=paths["preprocessed_cache_dir"].resolve(),
        song_cache_dir=paths["song_cache_dir"].resolve(),
    )


def _normalize_sha_id(sha_id: str) -> str:
    normalized = sha_id.strip().lower()
    if len(normalized) != 64 or any(char not in string.hexdigits for char in normalized):
        raise HTTPException(status_code=400, detail="Invalid song hash.")
    return normalized


def _normalize_album_key(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip().lower()


def _album_key(title: str | None, artist: str | None) -> str:
    title_key = _normalize_album_key(title)
    if not title_key:
        return ""
    artist_key = _normalize_album_key(artist)
    return f"{title_key}::{artist_key}"


def _album_id(title: str | None, artist: str | None) -> str:
    base = f"{(title or '').lower()}::{(artist or '').lower()}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def _ensure_artist(cur, name: str | None) -> int | None:
    if not name:
        return None
    cur.execute(
        """
        INSERT INTO metadata.artists (name)
        VALUES (%s)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING artist_id
        """,
        (name,),
    )
    return cur.fetchone()[0]


def _ensure_genre(cur, name: str) -> int:
    cur.execute(
        """
        INSERT INTO metadata.genres (name)
        VALUES (%s)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING genre_id
        """,
        (name,),
    )
    return cur.fetchone()[0]


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = value.lower()
    lowered = re.sub(r"\([^)]*\)", " ", lowered)
    lowered = re.sub(r"\[[^\]]*\]", " ", lowered)
    lowered = re.sub(r"\{[^}]*\}", " ", lowered)
    lowered = re.sub(r"\b(feat|featuring|ft)\.?\b.*", " ", lowered)
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    return " ".join(lowered.split()).strip()


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _parse_names(value: str | None) -> list[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return []
    return [part.strip() for part in re.split(r"[;,]", cleaned) if part.strip()]


def _resolve_artist_match(cur, name: str) -> tuple[int, str] | None:
    cleaned = _clean_text(name)
    if not cleaned:
        return None
    cur.execute(
        "SELECT artist_id, name FROM metadata.artists WHERE lower(name) = lower(%s) LIMIT 1",
        (cleaned,),
    )
    row = cur.fetchone()
    if row:
        return row[0], row[1]

    tokens = _normalize_text(cleaned).split()
    if not tokens:
        return None
    cur.execute(
        "SELECT artist_id, name FROM metadata.artists WHERE name ILIKE %s LIMIT 25",
        (f"%{tokens[0]}%",),
    )
    candidates = cur.fetchall()
    best: tuple[int, str] | None = None
    best_score = 0.0
    for artist_id, artist_name in candidates:
        score = _similarity(_normalize_text(cleaned), _normalize_text(artist_name))
        if score > best_score:
            best_score = score
            best = (artist_id, artist_name)
    if best and best_score >= 0.82:
        return best
    return None


def _resolve_album_match(
    cur,
    title: str,
    artist_name: str | None,
) -> dict[str, Any] | None:
    cleaned_title = _clean_text(title)
    if not cleaned_title:
        return None
    params: list[Any] = [cleaned_title]
    where_clause = "lower(title) = lower(%s)"
    if artist_name:
        where_clause += " AND lower(artist_name) = lower(%s)"
        params.append(artist_name)
    cur.execute(
        f"""
        SELECT album_id, title, artist_name, release_year, release_date
        FROM metadata.albums
        WHERE {where_clause}
        LIMIT 1
        """,
        params,
    )
    row = cur.fetchone()
    if row:
        return {
            "album_id": row[0],
            "title": row[1],
            "artist_name": row[2],
            "release_year": row[3],
            "release_date": row[4],
        }

    cur.execute(
        """
        SELECT album_id, title, artist_name, release_year, release_date
        FROM metadata.albums
        WHERE title ILIKE %s
        LIMIT 25
        """,
        (f"%{cleaned_title}%",),
    )
    candidates = cur.fetchall()
    best: dict[str, Any] | None = None
    best_score = 0.0
    for album_id, candidate_title, candidate_artist, release_year, release_date in candidates:
        title_score = _similarity(
            _normalize_text(cleaned_title), _normalize_text(candidate_title)
        )
        artist_score = 1.0
        if artist_name:
            artist_score = _similarity(
                _normalize_text(artist_name), _normalize_text(candidate_artist)
            )
        score = (title_score * 0.7) + (artist_score * 0.3)
        if score > best_score:
            best_score = score
            best = {
                "album_id": album_id,
                "title": candidate_title,
                "artist_name": candidate_artist,
                "release_year": release_year,
                "release_date": release_date,
            }
    if best and best_score >= 0.8:
        return best
    return None


def _fetch_song_detail(sha_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.duration_sec,
                    s.release_year,
                    s.track_number,
                    s.verified,
                    s.verification_source,
                    s.verification_score,
                    s.musicbrainz_recording_id,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids,
                    COALESCE(
                        ARRAY_AGG(DISTINCT g.name)
                        FILTER (WHERE g.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS genres,
                    COALESCE(
                        ARRAY_AGG(DISTINCT l.name)
                        FILTER (WHERE l.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS labels,
                    COALESCE(
                        ARRAY_AGG(DISTINCT p.name)
                        FILTER (WHERE p.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS producers,
                    COALESCE(MAX(a_primary.artist_id), MAX(a.artist_id)) AS primary_artist_id,
                    COALESCE(MAX(a_primary.name), MAX(a.name)) AS primary_artist_name
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                LEFT JOIN metadata.song_genres sg ON sg.sha_id = s.sha_id
                LEFT JOIN metadata.genres g ON g.genre_id = sg.genre_id
                LEFT JOIN metadata.song_labels sl ON sl.sha_id = s.sha_id
                LEFT JOIN metadata.labels l ON l.label_id = sl.label_id
                LEFT JOIN metadata.song_producers sp ON sp.sha_id = s.sha_id
                LEFT JOIN metadata.producers p ON p.producer_id = sp.producer_id
                WHERE s.sha_id = %s
                GROUP BY s.sha_id
                """,
                (sha_id,),
            )
            row = cur.fetchone()

            if not row:
                return None

            primary_artist_name = row[16]
            fallback_artist = row[10][0] if row[10] else None
            album_id = None
            if row[2] and (primary_artist_name or fallback_artist):
                album_id = _album_id(row[2], primary_artist_name or fallback_artist)
            album_release_date = None
            album_release_year = None
            album_artist_name = None
            if album_id:
                cur.execute(
                    """
                    SELECT artist_name, release_year, release_date
                    FROM metadata.albums
                    WHERE album_id = %s
                    """,
                    (album_id,),
                )
                album_row = cur.fetchone()
                if album_row:
                    album_artist_name = album_row[0]
                    album_release_year = album_row[1]
                    album_release_date = album_row[2]
                else:
                    album_id = None

    return {
        "sha_id": row[0],
        "title": row[1],
        "album": row[2],
        "duration_sec": row[3],
        "release_year": row[4],
        "track_number": row[5],
        "verified": row[6],
        "verification_source": row[7],
        "verification_score": row[8],
        "musicbrainz_recording_id": row[9],
        "artists": row[10],
        "artist_ids": list(row[11]) if row[11] else [],
        "genres": row[12],
        "labels": row[13],
        "producers": row[14],
        "primary_artist_id": row[15],
        "primary_artist_name": row[16],
        "album_id": album_id,
        "album_artist_name": album_artist_name,
        "album_release_year": album_release_year,
        "album_release_date": album_release_date,
    }


def _album_key_for_album_id(album_id: str) -> str | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT album_key FROM metadata.albums WHERE album_id = %s",
                (album_id,),
            )
            row = cur.fetchone()
            if row and row[0]:
                return row[0]

            cur.execute(
                f"""
                SELECT
                    s.album,
                    COALESCE(MAX(a_primary.name), MAX(a.name))
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                WHERE s.album IS NOT NULL
                  AND {ALBUM_KEY_SQL} = %s
                GROUP BY s.album
                LIMIT 1
                """,
                (album_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return _album_key(row[0], row[1])


def _fetch_image_bytes(query: str, params: tuple[Any, ...]) -> tuple[bytes, str] | None:
    with get_image_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            if not row:
                return None
            image_bytes, mime_type = row
            if not image_bytes:
                return None
            return image_bytes, (mime_type or "application/octet-stream")


def _get_placeholder_image() -> tuple[bytes, str]:
    """Return a 1x1 transparent PNG as placeholder."""
    # 1x1 transparent PNG (67 bytes)
    placeholder_png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000a49444154789c6300010000050001"
        "0d0a2db40000000049454e44ae426082"
    )
    return placeholder_png, "image/png"


def _resolve_song_file(sha_id: str) -> Path | None:
    settings = app_settings.load_settings()
    paths = app_settings.resolve_paths(settings)
    try:
        cache_path = song_cache_path(paths["song_cache_dir"], sha_id, extension=".mp3")
    except ValueError:
        return None
    if cache_path.exists():
        return cache_path

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT file_path
                    FROM metadata.song_files
                    WHERE sha_id = %s
                    ORDER BY created_at DESC
                    """,
                    (sha_id,),
                )
                rows = cur.fetchall()
    except Exception:
        return None

    for row in rows:
        file_path = row[0]
        if not file_path:
            continue
        candidate = Path(file_path).expanduser()
        if candidate.exists():
            return candidate
    return None


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    if not range_header or not range_header.startswith("bytes="):
        return None
    range_value = range_header.split("=", 1)[1].strip()
    if "," in range_value:
        range_value = range_value.split(",", 1)[0].strip()
    if "-" not in range_value:
        return None
    start_str, end_str = range_value.split("-", 1)
    if start_str == "":
        try:
            suffix_len = int(end_str)
        except ValueError:
            return None
        if suffix_len <= 0:
            return None
        suffix_len = min(suffix_len, file_size)
        start = max(file_size - suffix_len, 0)
        end = file_size - 1
    else:
        try:
            start = int(start_str)
        except ValueError:
            return None
        if end_str:
            try:
                end = int(end_str)
            except ValueError:
                return None
        else:
            end = file_size - 1
        if end >= file_size:
            end = file_size - 1
    if start < 0 or end < start or start >= file_size:
        return None
    return start, end


def _iter_file_range(path: Path, start: int, end: int, chunk_size: int = 1024 * 1024):
    with path.open("rb") as handle:
        handle.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _tail_state(path: Path, limit: int) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    entries: deque[dict[str, Any]] = deque(maxlen=limit)
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                entries.append(payload)
    return list(entries)


def _coerce_result(payload: Any) -> Any:
    if payload is None:
        return None
    if is_dataclass(payload):
        return asdict(payload)
    if isinstance(payload, dict):
        return payload
    return {"result": str(payload)}


def _start_metadata_task(
    task: str,
    config: dict[str, Any],
    runner: Callable[[threading.Event, Callable[[str], None] | None], Any],
) -> dict[str, Any]:
    with _metadata_lock:
        thread = _metadata_threads.get(task)
        if thread and thread.is_alive():
            raise HTTPException(
                status_code=409,
                detail=f"{task} task already running.",
            )
        state = _metadata_state.setdefault(task, {})
        stop_event = _metadata_stop_events.setdefault(task, threading.Event())
        stop_event.clear()
        state.update(
            {
                "running": True,
                "started_at": _utc_now(),
                "finished_at": None,
                "last_error": None,
                "last_result": None,
                "last_config": config,
                "stop_requested": False,
                "last_status": None,
            }
        )

        def _status_callback(message: str) -> None:
            if message.startswith("__PROGRESS__"):
                return
            with _metadata_lock:
                state["last_status"] = message

        def _worker() -> None:
            try:
                result = runner(stop_event, _status_callback)
                with _metadata_lock:
                    state["last_result"] = _coerce_result(result)
            except Exception as exc:  # noqa: BLE001
                with _metadata_lock:
                    state["last_error"] = str(exc)
            finally:
                with _metadata_lock:
                    state["running"] = False
                    state["finished_at"] = _utc_now()

        thread = threading.Thread(target=_worker, daemon=True)
        _metadata_threads[task] = thread
        thread.start()
        return {"status": "started", "state": dict(state)}


@router.post("/ingest")
async def ingest_songs(payload: IngestRequest):
    input_path = Path(payload.input_path).expanduser().resolve()
    if not input_path.exists():
        raise HTTPException(status_code=400, detail="Input path not found.")

    mp3_files = collect_mp3_files(input_path)
    if payload.limit is not None:
        if payload.limit < 1:
            raise HTTPException(status_code=400, detail="limit must be >= 1")
        mp3_files = mp3_files[: payload.limit]

    if not mp3_files:
        raise HTTPException(status_code=400, detail="No MP3 files found.")

    embedding_dir = (
        Path(payload.embedding_dir).expanduser().resolve()
        if payload.embedding_dir
        else None
    )
    if embedding_dir and not embedding_dir.is_dir():
        raise HTTPException(status_code=400, detail="Embedding directory not found.")

    model_version = payload.model_version or vggish_config.VGGISH_CHECKPOINT_VERSION
    preprocess_version = payload.preprocess_version or (
        f"sr={vggish_config.TARGET_SAMPLE_RATE}"
        f";frame={vggish_config.VGGISH_FRAME_SEC}"
        f";hop={vggish_config.VGGISH_HOP_SEC}"
    )

    counts = ingest_paths(
        mp3_files,
        embedding_dir=embedding_dir,
        ingestion_source=payload.ingestion_source,
        model_name=payload.model_name,
        model_version=model_version,
        preprocess_version=preprocess_version,
    )

    return {
        "status": "success",
        "songs": counts["songs"],
        "embeddings": counts["embeddings"],
    }


@router.get("/songs")
async def list_songs(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    sha_id,
                    title,
                    album,
                    duration_sec,
                    release_year,
                    track_number,
                    verified,
                    verification_source
                FROM metadata.songs
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            rows = cur.fetchall()

    return [
        {
            "sha_id": row[0],
            "title": row[1],
            "album": row[2],
            "duration_sec": row[3],
            "release_year": row[4],
            "track_number": row[5],
            "verified": row[6],
            "verification_source": row[7],
        }
        for row in rows
    ]


@router.get("/catalog")
async def list_catalog(
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    search = q.strip() if q else None
    where_clause = ""
    params: list[Any] = []
    if search:
        pattern = f"%{search}%"
        where_clause = """
            WHERE s.title ILIKE %s OR s.album ILIKE %s OR a.name ILIKE %s
        """
        params.extend([pattern, pattern, pattern])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(DISTINCT s.sha_id)
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                {where_clause}
                """,
                params,
            )
            total = cur.fetchone()[0]

            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.duration_sec,
                    s.release_year,
                    s.track_number,
                    s.verified,
                    s.verification_source,
                    COALESCE(MAX(a_primary.artist_id), MAX(a.artist_id)) AS primary_artist_id,
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        WHEN MAX(a_primary.name) IS NULL THEN NULL
                        ELSE md5(
                            lower(coalesce(s.album, ''))
                            || '::'
                            || lower(MAX(a_primary.name))
                        )
                    END AS album_id,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                {where_clause}
                GROUP BY s.sha_id
                ORDER BY s.created_at DESC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cur.fetchall()

    items = [
        CatalogEntry(
            sha_id=row[0],
            title=row[1],
            album=row[2],
            duration_sec=row[3],
            release_year=row[4],
            track_number=row[5],
            verified=row[6],
            verification_source=row[7],
            primary_artist_id=row[8],
            album_id=row[9],
            artists=list(row[10] or []),
            artist_ids=list(row[11] or []),
        ).model_dump()
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "query": search,
    }


@router.get("/artists")
async def list_artists(
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    search = q.strip() if q else None
    where_clause = ""
    params: list[Any] = []
    if search:
        where_clause = "WHERE a.name ILIKE %s"
        params.append(f"%{search}%")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)
                FROM metadata.artists a
                {where_clause}
                """,
                params,
            )
            total = cur.fetchone()[0]

            cur.execute(
                f"""
                SELECT
                    a.artist_id,
                    a.name,
                    COUNT(DISTINCT s.sha_id) AS song_count,
                    COUNT(DISTINCT s.album) FILTER (WHERE s.album IS NOT NULL AND s.album <> '') AS album_count
                FROM metadata.artists a
                LEFT JOIN metadata.song_artists sa ON sa.artist_id = a.artist_id
                LEFT JOIN metadata.songs s ON s.sha_id = sa.sha_id
                {where_clause}
                GROUP BY a.artist_id
                ORDER BY a.name ASC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cur.fetchall()

    items = [
        {
            "artist_id": row[0],
            "name": row[1],
            "song_count": row[2],
            "album_count": row[3],
        }
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "query": search,
    }


@router.get("/albums")
async def list_albums(
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    search = q.strip() if q else None
    where_clause = ""
    params: list[Any] = []
    if search:
        where_clause = "WHERE a.title ILIKE %s OR a.artist_name ILIKE %s"
        params.extend([f"%{search}%", f"%{search}%"])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)
                FROM metadata.albums a
                {where_clause}
                """,
                params,
            )
            total = cur.fetchone()[0]

            cur.execute(
                f"""
                WITH song_counts AS (
                    SELECT
                        md5(lower(coalesce(s.album, '')) || '::' || lower(coalesce(a_primary.name, ''))) AS album_id,
                        COUNT(*) AS song_count
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa_primary
                        ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                    LEFT JOIN metadata.artists a_primary
                        ON a_primary.artist_id = sa_primary.artist_id
                    WHERE s.album IS NOT NULL AND s.album <> ''
                    GROUP BY md5(lower(coalesce(s.album, '')) || '::' || lower(coalesce(a_primary.name, '')))
                )
                SELECT
                    a.album_id,
                    a.title,
                    a.artist_name,
                    a.artist_id,
                    a.release_year,
                    a.track_count,
                    a.total_duration_sec,
                    COALESCE(sc.song_count, 0) AS song_count
                FROM metadata.albums a
                LEFT JOIN song_counts sc ON sc.album_id = a.album_id
                {where_clause}
                ORDER BY a.release_year DESC NULLS LAST, a.title ASC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cur.fetchall()

    items = [
        {
            "album_id": row[0],
            "title": row[1],
            "artist_name": row[2],
            "artist_id": row[3],
            "release_year": row[4],
            "track_count": row[5],
            "duration_sec_total": row[6],
            "song_count": row[7],
        }
        for row in rows
    ]

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "query": search,
    }


@router.get("/artists/popular")
async def popular_artists(limit: int = 50) -> dict[str, Any]:
    """Get most popular artists by song count.

    Args:
        limit: Maximum number of artists to return

    Returns:
        List of popular artists with metadata
    """
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 200")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    a.artist_id,
                    a.name,
                    COUNT(DISTINCT s.sha_id) as song_count,
                    COUNT(DISTINCT s.album) FILTER (WHERE s.album IS NOT NULL AND s.album != '') as album_count
                FROM metadata.artists a
                JOIN metadata.song_artists sa ON a.artist_id = sa.artist_id
                JOIN metadata.songs s ON sa.sha_id = s.sha_id
                GROUP BY a.artist_id, a.name
                ORDER BY song_count DESC, a.name
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    artists = []
    for row in rows:
        artists.append({
            "artist_id": row[0],
            "name": row[1],
            "song_count": row[2],
            "album_count": row[3],
        })

    return {"artists": artists, "total": len(artists)}


@router.get("/artists/{artist_id}")
async def get_artist(
    artist_id: int,
    song_limit: int = 100,
    song_offset: int = 0,
) -> dict[str, Any]:
    if song_limit < 1:
        raise HTTPException(status_code=400, detail="song_limit must be >= 1")
    if song_offset < 0:
        raise HTTPException(status_code=400, detail="song_offset must be >= 0")

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Try to get artist name from artists table first
            cur.execute(
                "SELECT name FROM metadata.artists WHERE artist_id = %s",
                (artist_id,),
            )
            row = cur.fetchone()

            if not row:
                # Artist doesn't exist in artists table
                # This can happen if artist_id is referenced in songs but the artist record is missing
                # Return a helpful error message
                cur.execute(
                    """
                    SELECT COUNT(*) FROM metadata.song_artists WHERE artist_id = %s
                    """,
                    (artist_id,),
                )
                song_ref_count = cur.fetchone()[0]
                if song_ref_count > 0:
                    error_msg = (
                        f"Artist data is incomplete. "
                        f"Artist ID {artist_id} is referenced by {song_ref_count} song(s) "
                        f"but has no artist record. Please run metadata verification to fix this."
                    )
                    raise HTTPException(status_code=500, detail=error_msg)
                else:
                    raise HTTPException(status_code=404, detail=f"Artist with ID {artist_id} not found.")

            artist_name = row[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM metadata.song_artists sa
                WHERE sa.artist_id = %s
                """,
                (artist_id,),
            )
            song_count = cur.fetchone()[0]

            cur.execute(
                """
                WITH song_counts AS (
                    SELECT
                        s.album,
                        md5(lower(coalesce(s.album, '')) || '::' || lower(%s)) AS album_id,
                        COUNT(*) AS song_count
                    FROM metadata.songs s
                    JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                    WHERE sa.artist_id = %s
                      AND s.album IS NOT NULL AND s.album <> ''
                    GROUP BY s.album
                )
                SELECT
                    a.album_id,
                    a.title,
                    COALESCE(sc.song_count, 0) AS song_count,
                    a.release_year,
                    a.total_duration_sec
                FROM metadata.albums a
                LEFT JOIN song_counts sc ON sc.album_id = a.album_id
                WHERE a.artist_id = %s OR lower(a.artist_name) = lower(%s)
                ORDER BY a.release_year DESC NULLS LAST, a.title ASC
                """,
                (artist_name, artist_id, artist_id, artist_name),
            )
            album_rows = cur.fetchall()
            if not album_rows:
                cur.execute(
                    f"""
                    SELECT
                        CASE
                            WHEN s.album IS NULL OR s.album = '' THEN NULL
                            ELSE md5(lower(coalesce(s.album, '')) || '::' || lower(%s))
                        END AS album_id,
                        s.album,
                        COUNT(*) AS song_count,
                        MAX(s.release_year) AS release_year,
                        SUM(s.duration_sec) AS duration_total
                    FROM metadata.songs s
                    JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                    WHERE sa.artist_id = %s
                      AND s.album IS NOT NULL AND s.album <> ''
                    GROUP BY s.album
                    ORDER BY release_year DESC NULLS LAST, s.album ASC
                    """,
                    (artist_name, artist_id),
                )
                album_rows = cur.fetchall()

            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.duration_sec,
                    s.track_number,
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        ELSE md5(lower(coalesce(s.album, '')) || '::' || lower(%s))
                    END AS album_id,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                WHERE sa.artist_id = %s
                ORDER BY s.release_year DESC NULLS LAST,
                         s.album ASC,
                         s.track_number NULLS LAST,
                         s.title ASC
                LIMIT %s OFFSET %s
                """,
                (artist_name, artist_id, song_limit, song_offset),
            )
            song_rows = cur.fetchall()

    return {
        "artist_id": artist_id,
        "name": artist_name,
        "song_count": song_count,
        "songs": [
            {
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "track_number": row[4],
                "album_id": row[5],
                "artists": list(row[6] or []),
                "artist_ids": list(row[7] or []),
            }
            for row in song_rows
        ],
        "songs_limit": song_limit,
        "songs_offset": song_offset,
        "albums": [
            {
                "album_id": row[0],
                "title": row[1],
                "song_count": row[2],
                "release_year": row[3],
                "duration_sec_total": row[4],
            }
            for row in album_rows
        ],
    }


@router.get("/albums/popular")
async def popular_albums(limit: int = 50) -> dict[str, Any]:
    """Get most popular albums by song count.

    Args:
        limit: Maximum number of albums to return

    Returns:
        List of popular albums with metadata
    """
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 200")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    {ALBUM_KEY_SQL} AS album_id,
                    s.album,
                    COUNT(DISTINCT s.sha_id) as song_count,
                    MAX(a_primary.name) AS primary_artist,
                    MAX(a_primary.artist_id) AS primary_artist_id,
                    MIN(s.release_year) as release_year
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                WHERE s.album IS NOT NULL AND s.album != ''
                GROUP BY s.album, {ALBUM_KEY_SQL}
                HAVING {ALBUM_KEY_SQL} IS NOT NULL
                ORDER BY song_count DESC, s.album
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    albums = []
    for row in rows:
        albums.append({
            "album_id": row[0],
            "title": row[1],
            "song_count": row[2],
            "artists": [row[3]] if row[3] else [],
            "artist_ids": [row[4]] if row[4] else [],
            "release_year": row[5],
        })

    return {"albums": albums, "total": len(albums)}


@router.get("/albums/{album_id}")
async def get_album(
    album_id: str,
    song_limit: int = 200,
    song_offset: int = 0,
) -> dict[str, Any]:
    if song_limit < 1:
        raise HTTPException(status_code=400, detail="song_limit must be >= 1")
    if song_offset < 0:
        raise HTTPException(status_code=400, detail="song_offset must be >= 0")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    a.title,
                    a.artist_name,
                    a.artist_id,
                    a.release_year,
                    a.track_count,
                    a.total_duration_sec
                FROM metadata.albums a
                WHERE a.album_id = %s
                """,
                (album_id,),
            )
            album_header = cur.fetchone()

            tracks: list[dict[str, Any]] = []
            if album_header:
                album_title, artist_name, artist_id, release_year, track_count, duration_total = (
                    album_header
                )

                cur.execute(
                    """
                    SELECT
                        track_number,
                        title,
                        duration_sec,
                        musicbrainz_recording_id
                    FROM metadata.album_tracks
                    WHERE album_id = %s
                    ORDER BY track_number NULLS LAST, title ASC
                    LIMIT %s OFFSET %s
                    """,
                    (album_id, song_limit, song_offset),
                )
                track_rows = cur.fetchall()
                tracks = [
                    {
                        "track_number": row[0],
                        "title": row[1],
                        "duration_sec": row[2],
                        "musicbrainz_recording_id": row[3],
                    }
                    for row in track_rows
                ]
            else:
                cur.execute(
                    f"""
                    SELECT
                        s.album,
                        a_primary.name,
                        a_primary.artist_id,
                        MAX(s.release_year) AS release_year,
                        COUNT(*) AS song_count,
                        SUM(s.duration_sec) AS duration_total
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa_primary
                        ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                    LEFT JOIN metadata.artists a_primary
                        ON a_primary.artist_id = sa_primary.artist_id
                    WHERE s.album IS NOT NULL
                      AND {ALBUM_KEY_SQL} = %s
                    GROUP BY s.album, a_primary.name, a_primary.artist_id
                    """,
                    (album_id,),
                )
                header = cur.fetchone()
                if not header:
                    raise HTTPException(status_code=404, detail="Album not found.")
                album_title, artist_name, artist_id, release_year, track_count, duration_total = header

            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.duration_sec,
                    s.track_number,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                WHERE s.album IS NOT NULL
                  AND {ALBUM_KEY_SQL} = %s
                ORDER BY s.track_number NULLS LAST, s.title ASC
                LIMIT %s OFFSET %s
                """,
                (album_id, song_limit, song_offset),
            )
            song_rows = cur.fetchall()

    return {
        "album_id": album_id,
        "title": album_title,
        "artist_name": artist_name,
        "artist_id": artist_id,
        "release_year": release_year,
        "song_count": track_count or len(song_rows),
        "duration_sec_total": duration_total,
        "tracks": tracks,
        "songs": [
            {
                "sha_id": row[0],
                "title": row[1],
                "duration_sec": row[2],
                "track_number": row[3],
                "artists": list(row[4] or []),
                "artist_ids": list(row[5] or []),
            }
            for row in song_rows
        ],
        "songs_limit": song_limit,
        "songs_offset": song_offset,
    }


@router.get("/songs/unlinked")
async def list_unlinked_songs(limit: int = 50, offset: int = 0) -> dict[str, Any]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    query = """
        SELECT
            s.sha_id,
            s.title,
            s.album,
            COALESCE(
                MAX(a.name) FILTER (WHERE sa.role = 'primary'),
                MAX(a.name)
            ) AS artist_name
        FROM metadata.songs s
        LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
        LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
        WHERE (s.album IS NULL OR s.album = '')
           OR a.name IS NULL
        GROUP BY s.sha_id
        ORDER BY s.updated_at DESC
        LIMIT %s OFFSET %s
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (limit, offset))
            rows = cur.fetchall()

            cur.execute(
                """
                SELECT COUNT(*)
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                WHERE (s.album IS NULL OR s.album = '')
                   OR a.name IS NULL
                """
            )
            total = cur.fetchone()[0]

    items = [
        {
            "sha_id": row[0],
            "title": row[1],
            "album": row[2],
            "artist": row[3],
        }
        for row in rows
    ]

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/songs/{sha_id}")
async def get_song(sha_id: str) -> dict[str, Any]:
    detail = _fetch_song_detail(sha_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Song not found.")
    return detail


@router.post("/songs/{sha_id}/verify")
async def verify_song_metadata(sha_id: str, payload: VerifySongRequest) -> dict[str, Any]:
    normalized = _normalize_sha_id(sha_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT title FROM metadata.songs WHERE sha_id = %s",
                (normalized,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Song not found.")

    config = {
        "sha_id": normalized,
        "min_score": payload.min_score,
        "rate_limit": payload.rate_limit,
        "dry_run": payload.dry_run,
    }

    def _runner(
        stop_event: threading.Event,
        status_callback: Callable[[str], None] | None,
    ) -> Any:
        return verify_songs_by_sha_ids(
            [normalized],
            min_score=payload.min_score,
            rate_limit_seconds=payload.rate_limit,
            dry_run=payload.dry_run,
            stop_event=stop_event,
            status_callback=status_callback,
        )

    result = _start_metadata_task("verification", config, _runner)
    result["sha_id"] = normalized
    result["title"] = row[0]
    return result


@router.put("/songs/{sha_id}")
async def update_song(sha_id: str, payload: SongUpdateRequest) -> dict[str, Any]:
    sha_id = _normalize_sha_id(sha_id)
    if not payload.model_fields_set:
        raise HTTPException(status_code=400, detail="No updates provided.")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT title, album, release_year, track_number
                FROM metadata.songs
                WHERE sha_id = %s
                """,
                (sha_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Song not found.")

            title_value = row[0]
            album_value = row[1]
            release_year_value = row[2]
            track_number_value = row[3]

            if "title" in payload.model_fields_set:
                title_value = _clean_text(payload.title)

            primary_artist_name = None
            if "artist" in payload.model_fields_set:
                artist_names = _parse_names(payload.artist)
                cur.execute("DELETE FROM metadata.song_artists WHERE sha_id = %s", (sha_id,))
                if artist_names:
                    for index, artist_name in enumerate(artist_names):
                        match = _resolve_artist_match(cur, artist_name)
                        if match:
                            artist_id, canonical_name = match
                        else:
                            artist_id = _ensure_artist(cur, artist_name)
                            canonical_name = artist_name
                        role = "primary" if index == 0 else "featured"
                        cur.execute(
                            """
                            INSERT INTO metadata.song_artists (sha_id, artist_id, role)
                            VALUES (%s, %s, %s)
                            ON CONFLICT DO NOTHING
                            """,
                            (sha_id, artist_id, role),
                        )
                        if index == 0:
                            primary_artist_name = canonical_name
            else:
                cur.execute(
                    """
                    SELECT a.name
                    FROM metadata.song_artists sa
                    JOIN metadata.artists a ON a.artist_id = sa.artist_id
                    WHERE sa.sha_id = %s AND sa.role = 'primary'
                    ORDER BY a.artist_id
                    LIMIT 1
                    """,
                    (sha_id,),
                )
                existing_artist = cur.fetchone()
                primary_artist_name = existing_artist[0] if existing_artist else None

            if "album" in payload.model_fields_set:
                album_input = _clean_text(payload.album)
                if album_input:
                    album_match = _resolve_album_match(cur, album_input, primary_artist_name)
                    album_value = album_match["title"] if album_match else album_input
                else:
                    album_value = None

            if "release_year" in payload.model_fields_set:
                release_year_value = payload.release_year

            if "track_number" in payload.model_fields_set:
                track_number_value = payload.track_number

            if "genre" in payload.model_fields_set:
                genre_names = _parse_names(payload.genre)
                cur.execute("DELETE FROM metadata.song_genres WHERE sha_id = %s", (sha_id,))
                for genre_name in genre_names:
                    genre_id = _ensure_genre(cur, genre_name)
                    cur.execute(
                        """
                        INSERT INTO metadata.song_genres (sha_id, genre_id)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (sha_id, genre_id),
                    )

            cur.execute(
                """
                UPDATE metadata.songs
                SET
                    title = %s,
                    album = %s,
                    release_year = %s,
                    track_number = %s,
                    updated_at = NOW()
                WHERE sha_id = %s
                """,
                (
                    title_value,
                    album_value,
                    release_year_value,
                    track_number_value,
                    sha_id,
                ),
            )
        conn.commit()

    detail = _fetch_song_detail(sha_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Song not found.")
    return detail


@router.post("/songs/link")
async def link_songs_to_album(payload: LinkSongsRequest) -> dict[str, Any]:
    if not payload.sha_ids:
        raise HTTPException(status_code=400, detail="No songs provided.")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    title,
                    artist_name,
                    artist_id,
                    musicbrainz_release_id,
                    musicbrainz_release_group_id
                FROM metadata.albums
                WHERE album_id = %s
                """,
                (payload.album_id,),
            )
            album_row = cur.fetchone()
            if not album_row:
                raise HTTPException(status_code=404, detail="Album not found.")

            album_title, artist_name, artist_id, release_id, release_group_id = album_row
            if artist_id is None:
                artist_id = _ensure_artist(cur, artist_name)

            updated = 0
            for sha_id in payload.sha_ids:
                cur.execute(
                    """
                    UPDATE metadata.songs
                    SET
                        album = %s,
                        verified = CASE WHEN %s THEN TRUE ELSE verified END,
                        verified_at = CASE WHEN %s THEN NOW() ELSE verified_at END,
                        verification_source = CASE WHEN %s THEN %s ELSE verification_source END,
                        musicbrainz_release_id = COALESCE(%s, musicbrainz_release_id),
                        musicbrainz_release_group_id = COALESCE(%s, musicbrainz_release_group_id),
                        updated_at = NOW()
                    WHERE sha_id = %s
                    """,
                    (
                        album_title,
                        payload.mark_verified,
                        payload.mark_verified,
                        payload.mark_verified,
                        "manual",
                        release_id,
                        release_group_id,
                        sha_id,
                    ),
                )
                update_count = cur.rowcount
                if artist_name and artist_id:
                    cur.execute(
                        "DELETE FROM metadata.song_artists WHERE sha_id = %s",
                        (sha_id,),
                    )
                    cur.execute(
                        """
                        INSERT INTO metadata.song_artists (sha_id, artist_id, role)
                        VALUES (%s, %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (sha_id, artist_id, "primary"),
                    )
                updated += update_count

        conn.commit()

    return {"linked": updated, "album_id": payload.album_id}


@router.get("/stream/{sha_id}")
async def stream_song(sha_id: str, request: Request):
    normalized = _normalize_sha_id(sha_id)
    song_path = _resolve_song_file(normalized)
    if not song_path or not song_path.exists():
        raise HTTPException(status_code=404, detail="Song file not found.")

    file_size = song_path.stat().st_size
    range_header = request.headers.get("range")
    if range_header:
        byte_range = _parse_range_header(range_header, file_size)
        if not byte_range:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}"},
            )
        start, end = byte_range
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1),
        }
        return StreamingResponse(
            _iter_file_range(song_path, start, end),
            status_code=206,
            headers=headers,
            media_type="audio/mpeg",
        )

    return FileResponse(
        song_path,
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )


def _get_song_metadata_for_download(sha_id: str) -> dict[str, Any]:
    """Get full song metadata for download with ID3 tags."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.title,
                    s.album,
                    s.release_year,
                    s.track_number,
                    COALESCE(
                        ARRAY_AGG(DISTINCT a.name)
                        FILTER (WHERE a.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        ARRAY_AGG(DISTINCT g.name)
                        FILTER (WHERE g.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS genres
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
                LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
                LEFT JOIN metadata.song_genres sg ON sg.sha_id = s.sha_id
                LEFT JOIN metadata.genres g ON g.genre_id = sg.genre_id
                WHERE s.sha_id = %s
                GROUP BY s.sha_id
                """,
                (sha_id,),
            )
            row = cur.fetchone()
            if not row:
                return {}

            return {
                "title": row[0],
                "album": row[1],
                "year": row[2],
                "track_number": row[3],
                "artists": list(row[4]) if row[4] else [],
                "genres": list(row[5]) if row[5] else [],
            }


def _get_song_cover_art(sha_id: str) -> tuple[bytes | None, str]:
    """Get cover art for a song."""
    try:
        with get_image_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ia.image_bytes, ia.mime_type
                    FROM media.song_images si
                    JOIN media.image_assets ia ON ia.image_id = si.image_id
                    WHERE si.song_sha_id = %s AND si.image_type = 'cover'
                    ORDER BY si.created_at DESC
                    LIMIT 1
                    """,
                    (sha_id,),
                )
                row = cur.fetchone()
                if row:
                    return row[0], row[1] or "image/jpeg"
    except Exception:
        pass
    return None, "image/jpeg"


def _create_tagged_song_file(sha_id: str, source_path: Path) -> Path:
    """Create a temporary MP3 file with ID3 tags from database metadata."""
    metadata = _get_song_metadata_for_download(sha_id)
    if not metadata:
        # Return original file if no metadata
        return source_path

    cover_art, cover_mime = _get_song_cover_art(sha_id)

    # Create temp directory and file
    temp_dir = tempfile.mkdtemp(prefix="songbase_download_")
    temp_path = Path(temp_dir) / "song.mp3"
    shutil.copy2(source_path, temp_path)

    # Write ID3 tags
    artist_str = ", ".join(metadata["artists"]) if metadata["artists"] else None
    write_id3_tags(
        temp_path,
        title=metadata.get("title"),
        artist=artist_str,
        album_artist=metadata["artists"][0] if metadata["artists"] else None,
        album=metadata.get("album"),
        year=metadata.get("year"),
        track_number=metadata.get("track_number"),
        genres=metadata.get("genres") if metadata.get("genres") else None,
        cover_art=cover_art,
        cover_art_mime=cover_mime,
    )

    return temp_path


def _sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filename."""
    return "".join(c if c.isalnum() or c in " -_()[]" else "_" for c in name).strip()


@router.get("/download/song/{sha_id}")
async def download_song(sha_id: str) -> Response:
    """Download a song file with formatted filename and ID3 metadata."""
    normalized = _normalize_sha_id(sha_id)

    # Get song metadata
    metadata = _get_song_metadata_for_download(normalized)
    if not metadata:
        raise HTTPException(status_code=404, detail="Song not found")

    # Resolve song file
    song_file = _resolve_song_file(normalized)
    if not song_file or not song_file.exists():
        raise HTTPException(status_code=404, detail="Song file not found")

    # Create tagged version
    tagged_file = _create_tagged_song_file(normalized, song_file)

    # Load settings for filename format
    settings = app_settings.load_settings()
    download_format = settings.get("download_filename_format", "{artist} - {title}")

    # Format filename
    artist_str = ", ".join(metadata["artists"]) if metadata["artists"] else "Unknown Artist"
    filename_parts = {
        "artist": artist_str,
        "title": metadata.get("title") or "Unknown Title",
        "album": metadata.get("album") or "",
    }

    try:
        filename = download_format.format(**filename_parts)
        filename = _sanitize_filename(filename) + ".mp3"
    except KeyError:
        filename = _sanitize_filename(f"{artist_str} - {metadata.get('title')}") + ".mp3"

    # Read file content
    content = tagged_file.read_bytes()

    # Cleanup temp file
    if tagged_file != song_file:
        try:
            shutil.rmtree(tagged_file.parent)
        except Exception:
            pass

    return Response(
        content=content,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
        },
    )


class DownloadSongsRequest(BaseModel):
    """Request body for downloading multiple songs as a zip."""
    song_ids: list[str]
    archive_name: str = "songs"


@router.post("/download/songs")
async def download_songs_zip(request: DownloadSongsRequest) -> Response:
    """Download multiple songs as a zip file with ID3 metadata.

    Used for playlist downloads where songs are specified by the frontend.
    """
    if not request.song_ids:
        raise HTTPException(status_code=400, detail="No songs specified")

    # Create zip file in memory
    zip_buffer = io.BytesIO()
    filenames_used: dict[str, int] = {}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for sha_id in request.song_ids:
            normalized = _normalize_sha_id(sha_id)
            metadata = _get_song_metadata_for_download(normalized)
            if not metadata:
                continue

            song_file = _resolve_song_file(normalized)
            if not song_file or not song_file.exists():
                continue

            # Create tagged version
            tagged_file = _create_tagged_song_file(normalized, song_file)

            # Generate filename
            artist_str = ", ".join(metadata["artists"]) if metadata["artists"] else "Unknown Artist"
            title = metadata.get("title") or "Unknown Title"
            base_filename = _sanitize_filename(f"{artist_str} - {title}")

            # Handle duplicate filenames
            if base_filename in filenames_used:
                filenames_used[base_filename] += 1
                filename = f"{base_filename} ({filenames_used[base_filename]}).mp3"
            else:
                filenames_used[base_filename] = 0
                filename = f"{base_filename}.mp3"

            # Add to zip
            zf.write(tagged_file, filename)

            # Cleanup temp file
            if tagged_file != song_file:
                try:
                    shutil.rmtree(tagged_file.parent)
                except Exception:
                    pass

    zip_buffer.seek(0)
    archive_name = _sanitize_filename(request.archive_name) or "songs"

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}.zip"',
        },
    )


@router.get("/download/album/{album_id}")
async def download_album_zip(album_id: str) -> Response:
    """Download all songs in an album as a zip file with ID3 metadata."""
    # Get album info and songs
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Find songs with this album_id
            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.track_number,
                    {ALBUM_KEY_SQL} AS album_key,
                    COALESCE(
                        ARRAY_AGG(DISTINCT a.name)
                        FILTER (WHERE a.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    MAX(a_primary.name) AS primary_artist
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id
                LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                GROUP BY s.sha_id, s.title, s.album, s.track_number
                HAVING {ALBUM_KEY_SQL} = %s
                ORDER BY s.track_number NULLS LAST, s.title
                """,
                (album_id,),
            )
            rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="Album not found or has no songs")

    # Get album name and artist from first row
    album_name = rows[0][2] or "Unknown Album"
    album_artist = rows[0][6] or "Unknown Artist"
    total_tracks = len(rows)

    # Create zip file in memory
    zip_buffer = io.BytesIO()
    filenames_used: dict[str, int] = {}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for row in rows:
            sha_id = row[0]
            title = row[1] or "Unknown Title"
            track_number = row[3]
            artists = list(row[5]) if row[5] else []

            song_file = _resolve_song_file(sha_id)
            if not song_file or not song_file.exists():
                continue

            # Get full metadata
            metadata = _get_song_metadata_for_download(sha_id)
            if metadata:
                metadata["track_total"] = total_tracks

            # Create tagged version
            cover_art, cover_mime = _get_song_cover_art(sha_id)
            temp_dir = tempfile.mkdtemp(prefix="songbase_album_")
            temp_path = Path(temp_dir) / "song.mp3"
            shutil.copy2(song_file, temp_path)

            artist_str = ", ".join(artists) if artists else None
            write_id3_tags(
                temp_path,
                title=title,
                artist=artist_str,
                album_artist=album_artist,
                album=album_name,
                year=metadata.get("year") if metadata else None,
                track_number=track_number,
                track_total=total_tracks,
                genres=metadata.get("genres") if metadata else None,
                cover_art=cover_art,
                cover_art_mime=cover_mime,
            )

            # Generate filename with track number
            artist_display = ", ".join(artists) if artists else "Unknown Artist"
            if track_number:
                base_filename = _sanitize_filename(f"{track_number:02d} - {artist_display} - {title}")
            else:
                base_filename = _sanitize_filename(f"{artist_display} - {title}")

            # Handle duplicate filenames
            if base_filename in filenames_used:
                filenames_used[base_filename] += 1
                filename = f"{base_filename} ({filenames_used[base_filename]}).mp3"
            else:
                filenames_used[base_filename] = 0
                filename = f"{base_filename}.mp3"

            # Add to zip
            zf.write(temp_path, filename)

            # Cleanup temp file
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

    zip_buffer.seek(0)
    archive_name = _sanitize_filename(f"{album_artist} - {album_name}") or "album"

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}.zip"',
        },
    )


@router.get("/images/song/{sha_id}")
async def song_image(sha_id: str) -> Response:
    normalized = _normalize_sha_id(sha_id)
    payload = _fetch_image_bytes(
        """
        SELECT ia.image_bytes, ia.mime_type
        FROM media.song_images si
        JOIN media.image_assets ia ON ia.image_id = si.image_id
        WHERE si.song_sha_id = %s AND si.image_type = %s
        ORDER BY si.created_at DESC
        LIMIT 1
        """,
        (normalized, "cover"),
    )
    if not payload:
        # Return placeholder instead of 404
        image_bytes, mime_type = _get_placeholder_image()
        return Response(content=image_bytes, media_type=mime_type)
    image_bytes, mime_type = payload
    return Response(content=image_bytes, media_type=mime_type)


@router.get("/images/album/{album_id}")
async def album_image(album_id: str) -> Response:
    album_key = _album_key_for_album_id(album_id)
    if not album_key:
        # Return placeholder instead of 404
        image_bytes, mime_type = _get_placeholder_image()
        return Response(content=image_bytes, media_type=mime_type)
    payload = _fetch_image_bytes(
        """
        SELECT ia.image_bytes, ia.mime_type
        FROM media.album_images ai
        JOIN media.image_assets ia ON ia.image_id = ai.image_id
        WHERE ai.album_key = %s AND ai.image_type = %s
        ORDER BY ai.created_at DESC
        LIMIT 1
        """,
        (album_key, "cover"),
    )
    if not payload:
        # Return placeholder instead of 404
        image_bytes, mime_type = _get_placeholder_image()
        return Response(content=image_bytes, media_type=mime_type)
    image_bytes, mime_type = payload
    return Response(content=image_bytes, media_type=mime_type)


@router.get("/images/artist/{artist_id}")
async def artist_image(artist_id: int) -> Response:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name FROM metadata.artists WHERE artist_id = %s",
                (artist_id,),
            )
            row = cur.fetchone()
            if not row:
                # Return placeholder instead of 404
                image_bytes, mime_type = _get_placeholder_image()
                return Response(content=image_bytes, media_type=mime_type)
            artist_name = row[0]

    payload = _fetch_image_bytes(
        """
        SELECT ia.image_bytes, ia.mime_type
        FROM media.artist_profiles ap
        JOIN media.image_assets ia ON ia.image_id = ap.image_id
        WHERE lower(ap.artist_name) = lower(%s) AND ap.image_id IS NOT NULL
        ORDER BY ap.created_at DESC
        LIMIT 1
        """,
        (artist_name,),
    )
    if not payload:
        # Return placeholder instead of 404
        image_bytes, mime_type = _get_placeholder_image()
        return Response(content=image_bytes, media_type=mime_type)
    image_bytes, mime_type = payload
    return Response(content=image_bytes, media_type=mime_type)


@router.post("/queue")
async def queue_songs(payload: QueueInsertRequest) -> dict[str, Any]:
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items provided.")

    items = _normalize_queue_items(payload.items)
    inserted = acquisition_sources.insert_sources(items)
    if payload.append_sources:
        acquisition_sources.append_sources_file(items)

    return {
        "requested": len(items),
        "queued": inserted,
        "appended_to_sources": payload.append_sources,
    }


@router.post("/import")
async def import_local_files(
    request: Request,
    files: list[UploadFile] = File(...),
) -> dict[str, Any]:
    max_body_bytes = 5 * 1024 * 1024 * 1024
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_body_bytes:
                raise HTTPException(
                    status_code=413,
                    detail="Max upload size reached (5GB).",
                )
        except ValueError:
            pass
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    settings = app_settings.load_settings()
    paths = app_settings.resolve_paths(settings)
    output_dir = paths["preprocessed_cache_dir"].resolve()

    file_pairs: list[tuple[str, Any]] = []
    for uploaded in files:
        filename = uploaded.filename or "upload"
        try:
            uploaded.file.seek(0)
        except Exception:  # noqa: BLE001
            pass
        file_pairs.append((filename, uploaded.file))

    imported, failures = acquisition_importer.import_streams(file_pairs, output_dir)

    for uploaded in files:
        try:
            await uploaded.close()
        except Exception:  # noqa: BLE001
            continue

    return {
        "queued": len(imported),
        "imported": [asdict(item) for item in imported],
        "failed": [asdict(item) for item in failures],
    }


@router.post("/queue/clear")
async def clear_queue() -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM metadata.download_queue")
            cleared = cur.fetchone()[0]
            cur.execute("DELETE FROM metadata.download_queue")
        conn.commit()
    return {"cleared": cleared}


@router.get("/queue")
async def list_queue(
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    query = """
        SELECT
            queue_id,
            title,
            artist,
            album,
            genre,
            search_query,
            source_url,
            status,
            download_path,
            sha_id,
            stored_path,
            attempts,
            last_error,
            created_at,
            updated_at,
            downloaded_at,
            processed_at,
            hashed_at,
            embedded_at,
            stored_at
        FROM metadata.download_queue
    """
    params: list[Any] = []
    if status:
        statuses = [entry.strip() for entry in status.split(",") if entry.strip()]
        if statuses:
            query += " WHERE status = ANY(%s)"
            params.append(statuses)
    query += " ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [
        {
            "queue_id": row[0],
            "title": row[1],
            "artist": row[2],
            "album": row[3],
            "genre": row[4],
            "search_query": row[5],
            "source_url": row[6],
            "status": row[7],
            "download_path": row[8],
            "sha_id": row[9],
            "stored_path": row[10],
            "attempts": row[11],
            "last_error": row[12],
            "created_at": row[13],
            "updated_at": row[14],
            "downloaded_at": row[15],
            "processed_at": row[16],
            "hashed_at": row[17],
            "embedded_at": row[18],
            "stored_at": row[19],
        }
        for row in rows
    ]


@router.get("/stats")
async def library_stats() -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM metadata.songs")
            songs = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM metadata.songs WHERE verified = TRUE")
            verified = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM embeddings.vggish_embeddings")
            embeddings = cur.fetchone()[0]
            cur.execute(
                "SELECT status, COUNT(*) FROM metadata.download_queue GROUP BY status"
            )
            queue_rows = cur.fetchall()

    queue_counts = {row[0]: row[1] for row in queue_rows}
    return {
        "songs": songs,
        "verified_songs": verified,
        "embeddings": embeddings,
        "queue": queue_counts,
        "last_updated": _utc_now(),
    }


@router.get("/metadata/status")
async def metadata_status() -> dict[str, Any]:
    with _metadata_lock:
        return {key: dict(value) for key, value in _metadata_state.items()}


@router.post("/metadata/stop")
async def stop_metadata_task(payload: StopMetadataRequest) -> dict[str, Any]:
    task = payload.task.strip().lower()
    if task not in _metadata_state:
        raise HTTPException(status_code=400, detail="Unknown metadata task.")

    with _metadata_lock:
        thread = _metadata_threads.get(task)
        state = _metadata_state.setdefault(task, {})
        if thread and thread.is_alive():
            stop_event = _metadata_stop_events.setdefault(task, threading.Event())
            stop_event.set()
            state["stop_requested"] = True
            return {"status": "stopping", "state": dict(state)}

        state["stop_requested"] = False
        return {"status": "idle", "state": dict(state)}


@router.post("/metadata/verify")
async def verify_metadata(payload: VerifyMetadataRequest) -> dict[str, Any]:
    config = {
        "limit": payload.limit,
        "min_score": payload.min_score,
        "rate_limit": payload.rate_limit,
        "dry_run": payload.dry_run,
    }

    def _runner(
        stop_event: threading.Event,
        status_callback: Callable[[str], None] | None,
    ) -> Any:
        return verify_unverified_songs(
            limit=payload.limit,
            min_score=payload.min_score,
            rate_limit_seconds=payload.rate_limit,
            dry_run=payload.dry_run,
            stop_event=stop_event,
            status_callback=status_callback,
        )

    return _start_metadata_task("verification", config, _runner)


@router.post("/metadata/images")
async def sync_images(payload: ImageSyncRequest) -> dict[str, Any]:
    config = {
        "limit_songs": payload.limit_songs,
        "limit_artists": payload.limit_artists,
        "rate_limit": payload.rate_limit,
        "dry_run": payload.dry_run,
    }

    def _runner(
        stop_event: threading.Event,
        status_callback: Callable[[str], None] | None,
    ) -> Any:
        return sync_images_and_profiles(
            limit_songs=payload.limit_songs,
            limit_artists=payload.limit_artists,
            rate_limit_seconds=payload.rate_limit,
            dry_run=payload.dry_run,
            stop_event=stop_event,
            status_callback=status_callback,
        )

    return _start_metadata_task("images", config, _runner)


@router.post("/pipeline/run")
async def run_pipeline(payload: PipelineRunRequest) -> dict[str, Any]:
    global _pipeline_thread

    with _pipeline_lock:
        if _pipeline_thread and _pipeline_thread.is_alive():
            raise HTTPException(status_code=409, detail="Pipeline already running.")

        defaults = _pipeline_defaults()
        verify = (
            payload.verify
            if payload.verify is not None
            else bool(defaults.get("verify", True))
        )
        images = (
            payload.images
            if payload.images is not None
            else bool(defaults.get("images", False))
        )
        config = orchestrator.OrchestratorConfig(
            seed_sources=payload.seed_sources,
            download=payload.download,
            download_limit=payload.download_limit
            if payload.download_limit is not None
            else defaults.get("download_limit"),
            process_limit=payload.process_limit
            if payload.process_limit is not None
            else defaults.get("process_limit"),
            download_workers=payload.download_workers
            if payload.download_workers is not None
            else defaults.get("download_workers"),
            pcm_workers=payload.pcm_workers
            if payload.pcm_workers is not None
            else int(defaults.get("pcm_workers", 2)),
            hash_workers=payload.hash_workers
            if payload.hash_workers is not None
            else int(defaults.get("hash_workers", 2)),
            embed_workers=payload.embed_workers
            if payload.embed_workers is not None
            else int(defaults.get("embed_workers", 1)),
            overwrite=payload.overwrite,
            dry_run=payload.dry_run,
            verify=verify,
            images=images,
            image_limit_songs=payload.image_limit_songs,
            image_limit_artists=payload.image_limit_artists,
            image_rate_limit=payload.image_rate_limit,
            sources_file=Path(payload.sources_file).expanduser().resolve()
            if payload.sources_file
            else None,
            run_until_empty=payload.run_until_empty,
        )
        pipeline_paths = _resolve_pipeline_paths()
        try:
            orchestrator.preflight_dependencies()
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        _pipeline_stop_event.clear()
        _pipeline_state.update(
            {
                "running": True,
                "started_at": _utc_now(),
                "finished_at": None,
                "last_error": None,
                "stop_requested": False,
                "last_config": {
                    "config": config.__dict__,
                    "paths": {
                        "preprocessed_cache_dir": str(
                            pipeline_paths.preprocessed_cache_dir
                        ),
                        "song_cache_dir": str(pipeline_paths.song_cache_dir),
                    },
                },
            }
        )

        def _worker() -> None:
            try:
                orchestrator.run_orchestrator(
                    config,
                    paths=pipeline_paths,
                    stop_event=_pipeline_stop_event,
                )
            except Exception as exc:  # noqa: BLE001
                with _pipeline_lock:
                    _pipeline_state["last_error"] = str(exc)
            finally:
                with _pipeline_lock:
                    _pipeline_state["running"] = False
                    _pipeline_state["finished_at"] = _utc_now()

        _pipeline_thread = threading.Thread(target=_worker, daemon=True)
        _pipeline_thread.start()

    return {"status": "started", "state": dict(_pipeline_state)}


@router.post("/pipeline/stop")
async def stop_pipeline() -> dict[str, Any]:
    with _pipeline_lock:
        if _pipeline_thread and _pipeline_thread.is_alive():
            _pipeline_stop_event.set()
            _pipeline_state["stop_requested"] = True
            return {"status": "stopping", "state": dict(_pipeline_state)}

        _pipeline_state["stop_requested"] = False
        return {"status": "idle", "state": dict(_pipeline_state)}


@router.get("/pipeline/status")
async def pipeline_status(events_limit: int = 50) -> dict[str, Any]:
    if events_limit < 0:
        raise HTTPException(status_code=400, detail="events_limit must be >= 0")
    pipeline_paths = _resolve_pipeline_paths()
    events = _tail_state(pipeline_paths.pipeline_state_path, events_limit)
    with _pipeline_lock:
        state = dict(_pipeline_state)
    state["events"] = events
    return state


# ============================================================================
# Search and Similarity Endpoints
# ============================================================================


@router.get("/search")
async def search_library(
    q: str | None = None,
    genre: str | None = None,
    artist_id: int | None = None,
    album_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Search the music library by text query, genre, artist, or album.

    Args:
        q: Text search query (searches title, artist, album)
        genre: Filter by genre name
        artist_id: Filter by artist ID
        album_id: Filter by album ID (MD5 hash)
        limit: Maximum number of results
        offset: Offset for pagination

    Returns:
        Dictionary with songs, total count, and query info
    """
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 500")
    if offset < 0:
        raise HTTPException(status_code=400, detail="Offset must be >= 0")

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Build WHERE clause based on filters
            where_clauses = []
            params: list[Any] = []

            if q:
                # Text search across title, album, and artists
                search_term = f"%{q}%"
                where_clauses.append("""(
                    s.title ILIKE %s
                    OR s.album ILIKE %s
                    OR EXISTS (
                        SELECT 1 FROM metadata.song_artists sa_search
                        JOIN metadata.artists a_search ON sa_search.artist_id = a_search.artist_id
                        WHERE sa_search.sha_id = s.sha_id AND a_search.name ILIKE %s
                    )
                )""")
                params.extend([search_term, search_term, search_term])

            if genre:
                # Genre is stored in a separate table
                where_clauses.append("""EXISTS (
                    SELECT 1 FROM metadata.song_genres sg
                    JOIN metadata.genres g ON sg.genre_id = g.genre_id
                    WHERE sg.sha_id = s.sha_id AND g.name ILIKE %s
                )""")
                params.append(f"%{genre}%")

            if artist_id:
                where_clauses.append("""EXISTS (
                    SELECT 1 FROM metadata.song_artists sa_filter
                    WHERE sa_filter.sha_id = s.sha_id AND sa_filter.artist_id = %s
                )""")
                params.append(artist_id)

            if album_id:
                # album_id is a computed MD5 hash
                where_clauses.append(f"{ALBUM_KEY_SQL} = %s")
                params.append(album_id)

            where_clause = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

            # Count total results - need to join for album_id computation
            count_query = f"""
                SELECT COUNT(DISTINCT s.sha_id)
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                {where_clause}
            """
            cur.execute(count_query, params)
            total = cur.fetchone()[0]

            # Get paginated results
            query = f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        WHEN MAX(a_primary.name) IS NULL THEN NULL
                        ELSE md5(
                            lower(coalesce(s.album, ''))
                            || '::'
                            || lower(MAX(a_primary.name))
                        )
                    END AS album_id,
                    s.duration_sec,
                    s.release_year,
                    (SELECT g.name FROM metadata.song_genres sg
                     JOIN metadata.genres g ON sg.genre_id = g.genre_id
                     WHERE sg.sha_id = s.sha_id LIMIT 1) AS genre,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids,
                    MAX(a_primary.artist_id) AS primary_artist_id
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                {where_clause}
                GROUP BY s.sha_id, s.title, s.album, s.duration_sec, s.release_year
                ORDER BY s.title, s.sha_id
                LIMIT %s OFFSET %s
            """
            cur.execute(query, params + [limit, offset])
            rows = cur.fetchall()

    songs = []
    for row in rows:
        songs.append({
            "sha_id": row[0],
            "title": row[1],
            "album": row[2],
            "album_id": row[3],
            "duration_sec": row[4],
            "release_year": row[5],
            "genre": row[6],
            "artists": list(row[7]) if row[7] else [],
            "artist_ids": list(row[8]) if row[8] else [],
            "primary_artist_id": row[9],
        })

    return {
        "songs": songs,
        "total": total,
        "limit": limit,
        "offset": offset,
        "query": {
            "text": q,
            "genre": genre,
            "artist_id": artist_id,
            "album_id": album_id,
        },
    }


@router.get("/genres")
async def list_genres(limit: int = 100) -> dict[str, Any]:
    """List all genres in the library with song counts.

    Args:
        limit: Maximum number of genres to return

    Returns:
        List of genres with counts
    """
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 500")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT g.name, COUNT(DISTINCT sg.sha_id) as count
                FROM metadata.genres g
                JOIN metadata.song_genres sg ON g.genre_id = sg.genre_id
                GROUP BY g.genre_id, g.name
                ORDER BY count DESC, g.name
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    genres = [{"name": row[0], "count": row[1]} for row in rows]

    return {"genres": genres, "total": len(genres)}


@router.get("/radio/song/{sha_id}")
async def song_radio(
    sha_id: str,
    limit: int = 50,
    metric: str = "cosine",
    diversity: bool = True,
) -> dict[str, Any]:
    """Generate a song radio playlist based on similarity.

    Args:
        sha_id: Seed song SHA ID
        limit: Number of songs in the radio playlist
        metric: Similarity metric (cosine, euclidean, dot)
        diversity: Apply diversity constraints to avoid too many songs from same album/artist

    Returns:
        Radio playlist with similar songs
    """
    from backend.processing.similarity_pipeline import pipeline as similarity_pipeline

    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")

    if metric not in ("cosine", "euclidean", "dot"):
        raise HTTPException(status_code=400, detail="Metric must be cosine, euclidean, or dot")

    # Check if seed song exists
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT sha_id, title FROM metadata.songs WHERE sha_id = %s",
                (sha_id,),
            )
            seed_song = cur.fetchone()

    if not seed_song:
        raise HTTPException(status_code=404, detail="Song not found")

    try:
        songs = similarity_pipeline.generate_song_radio(
            sha_id=sha_id,
            limit=limit,
            metric=metric,
            apply_diversity=diversity,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate radio: {str(e)}")

    return {
        "seed_song": {
            "sha_id": seed_song[0],
            "title": seed_song[1],
        },
        "songs": songs,
        "total": len(songs),
        "metric": metric,
        "diversity": diversity,
    }


@router.get("/radio/artist/{artist_id}")
async def artist_radio(
    artist_id: int,
    limit: int = 50,
    metric: str = "cosine",
    diversity: bool = True,
) -> dict[str, Any]:
    """Generate an artist radio playlist based on similarity.

    Args:
        artist_id: Seed artist ID
        limit: Number of songs in the radio playlist
        metric: Similarity metric (cosine, euclidean, dot)
        diversity: Apply diversity constraints

    Returns:
        Radio playlist with songs similar to the artist's style
    """
    from backend.processing.similarity_pipeline import pipeline as similarity_pipeline

    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")

    if metric not in ("cosine", "euclidean", "dot"):
        raise HTTPException(status_code=400, detail="Metric must be cosine, euclidean, or dot")

    # Check if artist exists
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT artist_id, name FROM metadata.artists WHERE artist_id = %s",
                (artist_id,),
            )
            seed_artist = cur.fetchone()

    if not seed_artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    try:
        songs = similarity_pipeline.generate_artist_radio(
            artist_id=artist_id,
            limit=limit,
            metric=metric,
            apply_diversity=diversity,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate radio: {str(e)}")

    return {
        "seed_artist": {
            "artist_id": seed_artist[0],
            "name": seed_artist[1],
        },
        "songs": songs,
        "total": len(songs),
        "metric": metric,
        "diversity": diversity,
    }


@router.get("/similar/{sha_id}")
async def similar_songs(
    sha_id: str,
    limit: int = 10,
    metric: str = "cosine",
) -> dict[str, Any]:
    """Find songs similar to a given song.

    Args:
        sha_id: Seed song SHA ID
        limit: Number of similar songs to return
        metric: Similarity metric (cosine, euclidean, dot)

    Returns:
        List of similar songs with similarity scores
    """
    from backend.processing.similarity_pipeline import pipeline as similarity_pipeline

    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 50")

    if metric not in ("cosine", "euclidean", "dot"):
        raise HTTPException(status_code=400, detail="Metric must be cosine, euclidean, or dot")

    # Check if seed song exists
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT sha_id, title FROM metadata.songs WHERE sha_id = %s",
                (sha_id,),
            )
            seed_song = cur.fetchone()

    if not seed_song:
        raise HTTPException(status_code=404, detail="Song not found")

    try:
        songs = similarity_pipeline.find_similar_songs(
            sha_id=sha_id,
            limit=limit,
            metric=metric,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to find similar songs: {str(e)}")

    return {
        "seed_song": {
            "sha_id": seed_song[0],
            "title": seed_song[1],
        },
        "songs": songs,
        "total": len(songs),
        "metric": metric,
    }


class PreferencePlaylistRequest(BaseModel):
    """Request body for preference-based playlist generation."""
    liked_song_ids: list[str]
    disliked_song_ids: list[str] = []
    limit: int = 50
    metric: str = "cosine"
    diversity: bool = True
    dislike_weight: float = 0.5


@router.post("/playlist/preferences")
async def generate_preference_playlist(
    request: PreferencePlaylistRequest,
) -> dict[str, Any]:
    """Generate a playlist based on user preferences (liked/disliked songs).

    Uses song embeddings to find songs similar to liked songs while avoiding
    songs similar to disliked ones.

    Args:
        request: Preference playlist request containing:
            - liked_song_ids: List of SHA IDs of liked songs
            - disliked_song_ids: List of SHA IDs of disliked songs
            - limit: Number of songs to return (1-100)
            - metric: Similarity metric (cosine, euclidean, dot)
            - diversity: Whether to apply diversity constraints
            - dislike_weight: Weight for dislike penalty (0-1)

    Returns:
        Playlist with songs ranked by preference score
    """
    from backend.processing.similarity_pipeline import pipeline as similarity_pipeline

    if not request.liked_song_ids:
        raise HTTPException(status_code=400, detail="At least one liked song is required")

    if request.limit < 1 or request.limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")

    if request.metric not in ("cosine", "euclidean", "dot"):
        raise HTTPException(status_code=400, detail="Metric must be cosine, euclidean, or dot")

    if request.dislike_weight < 0 or request.dislike_weight > 1:
        raise HTTPException(status_code=400, detail="Dislike weight must be between 0 and 1")

    try:
        result = similarity_pipeline.generate_preference_playlist(
            liked_sha_ids=request.liked_song_ids,
            disliked_sha_ids=request.disliked_song_ids,
            limit=request.limit,
            metric=request.metric,
            apply_diversity=request.diversity,
            dislike_weight=request.dislike_weight,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate playlist: {str(e)}")

    return {
        "playlist_type": "preferences",
        "config": {
            "liked_count": len(request.liked_song_ids),
            "disliked_count": len(request.disliked_song_ids),
            "limit": request.limit,
            "metric": request.metric,
            "diversity": request.diversity,
            "dislike_weight": request.dislike_weight,
        },
        "result": result,
        "songs": result.get("songs", []),
        "total": len(result.get("songs", [])),
    }
