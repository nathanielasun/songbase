from __future__ import annotations

import datetime as dt
import json
import threading
from collections import deque
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import app_settings
from backend.db.connection import get_connection
from backend.db.ingest import collect_mp3_files, ingest_paths
from backend.processing import orchestrator
from backend.processing.acquisition_pipeline import config as acquisition_config
from backend.processing.acquisition_pipeline import sources as acquisition_sources
from backend.processing.audio_pipeline import config as vggish_config

router = APIRouter()


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


class SeedSourcesRequest(BaseModel):
    sources_file: str | None = None


class ClearSourcesRequest(BaseModel):
    sources_file: str | None = None


_pipeline_lock = threading.Lock()
_pipeline_thread: threading.Thread | None = None
_pipeline_state: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "last_config": None,
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


def _source_key(title: str, artist: str | None) -> tuple[str, str]:
    return (title.strip().lower(), (artist or "").strip().lower())


def _queue_status_lookup(
    items: list[acquisition_sources.SourceItem],
) -> tuple[dict[tuple[str, str], str], bool]:
    if not items:
        return {}, True
    title_set = {item.title.strip().lower() for item in items if item.title}
    if not title_set:
        return {}, True

    query = """
        SELECT title, artist, status
        FROM metadata.download_queue
        WHERE LOWER(title) = ANY(%s)
    """
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (sorted(title_set),))
                rows = cur.fetchall()
    except Exception:
        return {}, False

    status_map: dict[tuple[str, str], str] = {}
    for title, artist, status in rows:
        key = _source_key(title, artist)
        status_map[key] = status
    return status_map, True


def _last_seeded_at() -> str | None:
    settings = app_settings.load_settings()
    sources = settings.get("sources")
    if isinstance(sources, dict):
        value = sources.get("last_seeded_at")
        if isinstance(value, str):
            return value
    return None


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


@router.get("/songs/{sha_id}")
async def get_song(sha_id: str) -> dict[str, Any]:
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
                        ARRAY_AGG(DISTINCT a.name)
                        FILTER (WHERE a.name IS NOT NULL),
                        ARRAY[]::TEXT[]
                    ) AS artists,
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
                    ) AS producers
                FROM metadata.songs s
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
        raise HTTPException(status_code=404, detail="Song not found.")

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
        "genres": row[11],
        "labels": row[12],
        "producers": row[13],
    }


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
    query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
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


@router.get("/sources")
async def list_sources(limit: int = 200, offset: int = 0) -> dict[str, Any]:
    if limit < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    sources_path = acquisition_config.SOURCES_PATH
    items = acquisition_sources.load_sources_file(sources_path)
    total = len(items)
    sliced = items[offset : offset + limit]

    status_map, queue_available = _queue_status_lookup(sliced)
    payload = []
    for item in sliced:
        status = status_map.get(_source_key(item.title, item.artist))
        payload.append(
            {
                "title": item.title,
                "artist": item.artist,
                "album": item.album,
                "genre": item.genre,
                "search_query": item.search_query,
                "source_url": item.source_url,
                "queued": status is not None if queue_available else None,
                "queue_status": status,
            }
        )

    return {
        "items": payload,
        "total": total,
        "path": str(sources_path),
        "queue_available": queue_available,
        "last_seeded_at": _last_seeded_at(),
    }


@router.post("/seed-sources")
async def seed_sources(payload: SeedSourcesRequest) -> dict[str, Any]:
    sources_path = (
        Path(payload.sources_file).expanduser().resolve()
        if payload.sources_file
        else acquisition_config.SOURCES_PATH
    )
    if not sources_path.exists():
        raise HTTPException(status_code=400, detail="sources.jsonl not found.")

    items = acquisition_sources.load_sources_file(sources_path)
    inserted = acquisition_sources.insert_sources(items)
    app_settings.update_settings({"sources": {"last_seeded_at": _utc_now()}})

    return {
        "inserted": inserted,
        "total": len(items),
        "path": str(sources_path),
        "last_seeded_at": _last_seeded_at(),
    }


@router.post("/sources/clear")
async def clear_sources(payload: ClearSourcesRequest) -> dict[str, Any]:
    sources_path = (
        Path(payload.sources_file).expanduser().resolve()
        if payload.sources_file
        else acquisition_config.SOURCES_PATH
    )
    cleared = acquisition_sources.clear_sources_file(sources_path)
    app_settings.update_settings({"sources": {"last_seeded_at": None}})
    return {
        "cleared": cleared,
        "path": str(sources_path),
        "last_seeded_at": _last_seeded_at(),
    }


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
        )
        pipeline_paths = _resolve_pipeline_paths()

        _pipeline_state.update(
            {
                "running": True,
                "started_at": _utc_now(),
                "finished_at": None,
                "last_error": None,
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
                orchestrator.run_orchestrator(config, paths=pipeline_paths)
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
