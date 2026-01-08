from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import app_settings
from backend.db.connection import get_connection
from backend.db.image_connection import get_image_connection

router = APIRouter()


class SettingsPatch(BaseModel):
    pipeline: dict[str, Any] | None = None
    paths: dict[str, Any] | None = None


class ResetRequest(BaseModel):
    clear_embeddings: bool = False
    clear_hashed_music: bool = False
    clear_artist_album: bool = False
    confirm: str | None = None


def _clear_dir_contents(path: Path) -> int:
    if not path.exists():
        return 0
    if not path.is_dir():
        raise RuntimeError(f"Expected directory path: {path}")
    resolved = path.resolve()
    if resolved == Path("/") or resolved == Path.home():
        raise RuntimeError(f"Refusing to clear critical path: {resolved}")
    removed = 0
    for entry in resolved.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
        removed += 1
    return removed


@router.get("")
async def get_settings() -> dict[str, Any]:
    return app_settings.load_settings()


@router.put("")
async def update_settings(payload: SettingsPatch) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if payload.pipeline is not None:
        patch["pipeline"] = payload.pipeline
    if payload.paths is not None:
        patch["paths"] = payload.paths
    return app_settings.update_settings(patch)


@router.post("/reset")
async def reset_storage(payload: ResetRequest) -> dict[str, Any]:
    if payload.confirm != "CLEAR":
        raise HTTPException(
            status_code=400, detail="Confirmation token missing or invalid."
        )
    if (
        not payload.clear_embeddings
        and not payload.clear_hashed_music
        and not payload.clear_artist_album
    ):
        raise HTTPException(status_code=400, detail="No reset options selected.")

    result: dict[str, int] = {
        "songs_deleted": 0,
        "embeddings_deleted": 0,
        "song_cache_entries_deleted": 0,
        "embedding_files_deleted": 0,
        "albums_deleted": 0,
        "album_tracks_deleted": 0,
        "artist_profiles_deleted": 0,
        "album_images_deleted": 0,
        "song_images_deleted": 0,
        "image_assets_deleted": 0,
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            if payload.clear_hashed_music:
                cur.execute("SELECT COUNT(*) FROM metadata.songs")
                result["songs_deleted"] = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM embeddings.vggish_embeddings")
                result["embeddings_deleted"] = cur.fetchone()[0]
                cur.execute("DELETE FROM metadata.songs")
            elif payload.clear_embeddings:
                cur.execute("SELECT COUNT(*) FROM embeddings.vggish_embeddings")
                result["embeddings_deleted"] = cur.fetchone()[0]
                cur.execute("DELETE FROM embeddings.vggish_embeddings")
            if payload.clear_artist_album:
                cur.execute("SELECT COUNT(*) FROM metadata.album_tracks")
                result["album_tracks_deleted"] = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM metadata.albums")
                result["albums_deleted"] = cur.fetchone()[0]
                cur.execute("DELETE FROM metadata.album_tracks")
                cur.execute("DELETE FROM metadata.albums")
                cur.execute(
                    """
                    UPDATE metadata.songs
                    SET
                        musicbrainz_release_id = NULL,
                        musicbrainz_release_group_id = NULL
                    """
                )
        conn.commit()

    paths = app_settings.resolve_paths()
    embedding_dir = app_settings.REPO_ROOT / ".embeddings"
    if payload.clear_embeddings or payload.clear_hashed_music:
        try:
            result["embedding_files_deleted"] = _clear_dir_contents(embedding_dir)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.clear_hashed_music:
        song_cache_dir = paths["song_cache_dir"]
        try:
            result["song_cache_entries_deleted"] = _clear_dir_contents(song_cache_dir)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.clear_artist_album:
        with get_image_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM media.song_images")
                result["song_images_deleted"] = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM media.album_images")
                result["album_images_deleted"] = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM media.artist_profiles")
                result["artist_profiles_deleted"] = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM media.image_assets")
                result["image_assets_deleted"] = cur.fetchone()[0]
                cur.execute("DELETE FROM media.song_images")
                cur.execute("DELETE FROM media.album_images")
                cur.execute("DELETE FROM media.artist_profiles")
                cur.execute("DELETE FROM media.image_assets")
            conn.commit()

    return result
