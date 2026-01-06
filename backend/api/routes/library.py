from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.connection import get_connection
from backend.db.ingest import collect_mp3_files, ingest_paths
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
                SELECT sha_id, title, album, duration_sec, release_year, track_number
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
        "artists": row[6],
        "genres": row[7],
        "labels": row[8],
        "producers": row[9],
    }
