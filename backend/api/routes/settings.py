from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend import app_settings
from backend.db.connection import get_connection
from backend.db.image_connection import get_image_connection

router = APIRouter()
logger = logging.getLogger(__name__)

# Global state for embedding recalculation task
_embedding_task_state: dict[str, Any] = {
    "running": False,
    "stop_requested": False,
    "started_at": None,
    "finished_at": None,
    "last_error": None,
    "last_result": None,
}


class SettingsPatch(BaseModel):
    pipeline: dict[str, Any] | None = None
    paths: dict[str, Any] | None = None
    download_filename_format: str | None = None


class ResetRequest(BaseModel):
    clear_embeddings: bool = False
    clear_hashed_music: bool = False
    clear_artist_album: bool = False
    clear_song_metadata: bool = False
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
    if payload.download_filename_format is not None:
        patch["download_filename_format"] = payload.download_filename_format
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
        and not payload.clear_song_metadata
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
            elif payload.clear_song_metadata:
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
    if payload.clear_embeddings or payload.clear_hashed_music or payload.clear_song_metadata:
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


# --------------------------------------------------------------------------
# VGGish Configuration Endpoints
# --------------------------------------------------------------------------


class VggishConfigPatch(BaseModel):
    target_sample_rate: int | None = None
    frame_sec: float | None = None
    hop_sec: float | None = None
    stft_window_sec: float | None = None
    stft_hop_sec: float | None = None
    num_mel_bins: int | None = None
    mel_min_hz: int | None = None
    mel_max_hz: int | None = None
    log_offset: float | None = None
    device_preference: str | None = None
    gpu_memory_fraction: float | None = None
    gpu_allow_growth: bool | None = None
    use_postprocess: bool | None = None


class EmbeddingRecalculateRequest(BaseModel):
    sha_ids: list[str] | None = None  # None = all songs
    limit: int | None = None
    force: bool = False  # If true, recalculate even if embedding exists


def _detect_devices() -> list[dict[str, Any]]:
    """Detect available compute devices for VGGish."""
    try:
        from backend.processing.audio_pipeline.device_config import detect_available_devices
        devices = detect_available_devices()
        return [
            {
                "device_type": d.device_type.value,
                "device_name": d.device_name,
                "available": d.available,
                "details": d.details,
            }
            for d in devices
        ]
    except Exception as e:
        logger.warning(f"Device detection failed: {e}")
        return [{"device_type": "cpu", "device_name": "CPU", "available": True, "details": {}}]


@router.get("/vggish")
async def get_vggish_config() -> dict[str, Any]:
    """Get VGGish configuration and available devices."""
    settings = app_settings.load_settings()
    vggish_config = settings.get("vggish", {})

    # Get available devices
    devices = _detect_devices()

    return {
        "config": vggish_config,
        "devices": devices,
        "embedding_task": {
            "running": _embedding_task_state["running"],
            "started_at": _embedding_task_state["started_at"],
            "finished_at": _embedding_task_state["finished_at"],
            "last_error": _embedding_task_state["last_error"],
            "last_result": _embedding_task_state["last_result"],
        },
    }


@router.put("/vggish")
async def update_vggish_config(payload: VggishConfigPatch) -> dict[str, Any]:
    """Update VGGish configuration."""
    patch: dict[str, Any] = {}

    for field in [
        "target_sample_rate", "frame_sec", "hop_sec", "stft_window_sec",
        "stft_hop_sec", "num_mel_bins", "mel_min_hz", "mel_max_hz",
        "log_offset", "device_preference", "gpu_memory_fraction",
        "gpu_allow_growth", "use_postprocess"
    ]:
        value = getattr(payload, field)
        if value is not None:
            patch[field] = value

    # Validate device_preference if provided
    if payload.device_preference is not None:
        valid_devices = ["auto", "cpu", "gpu", "metal"]
        if payload.device_preference not in valid_devices:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid device_preference. Must be one of: {valid_devices}"
            )

    # Validate gpu_memory_fraction if provided
    if payload.gpu_memory_fraction is not None:
        if not 0.0 < payload.gpu_memory_fraction <= 1.0:
            raise HTTPException(
                status_code=400,
                detail="gpu_memory_fraction must be between 0.0 and 1.0"
            )

    if patch:
        app_settings.update_settings({"vggish": patch})

    return await get_vggish_config()


@router.get("/vggish/recalculate-stream")
async def recalculate_embeddings_stream(
    limit: int | None = None,
    force: bool = False,
) -> StreamingResponse:
    """
    Recalculate VGGish embeddings for songs (SSE stream).

    Args:
        limit: Maximum number of songs to process (None = all)
        force: If true, recalculate even if embedding exists
    """
    global _embedding_task_state

    if _embedding_task_state["running"]:
        raise HTTPException(status_code=409, detail="Embedding recalculation already running")

    async def event_stream():
        global _embedding_task_state
        import datetime

        _embedding_task_state["running"] = True
        _embedding_task_state["stop_requested"] = False
        _embedding_task_state["started_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        _embedding_task_state["finished_at"] = None
        _embedding_task_state["last_error"] = None
        _embedding_task_state["last_result"] = None

        processed = 0
        recalculated = 0
        skipped = 0
        failed = 0

        try:
            yield f"data: {json.dumps({'type': 'status', 'message': 'Starting embedding recalculation...'})}\n\n"
            await asyncio.sleep(0)

            # Get songs to process
            with get_connection() as conn:
                with conn.cursor() as cur:
                    if force:
                        # Get all songs (or limited number)
                        query = "SELECT sha_id, title FROM metadata.songs ORDER BY sha_id"
                        if limit:
                            query += f" LIMIT {int(limit)}"
                    else:
                        # Get songs without embeddings
                        query = """
                            SELECT s.sha_id, s.title
                            FROM metadata.songs s
                            LEFT JOIN embeddings.vggish_embeddings e ON s.sha_id = e.sha_id
                            WHERE e.sha_id IS NULL
                            ORDER BY s.sha_id
                        """
                        if limit:
                            query += f" LIMIT {int(limit)}"

                    cur.execute(query)
                    songs = cur.fetchall()

            total = len(songs)
            yield f"data: {json.dumps({'type': 'status', 'message': f'Found {total} songs to process'})}\n\n"
            await asyncio.sleep(0)

            if total == 0:
                yield f"data: {json.dumps({'type': 'status', 'message': 'No songs need embedding recalculation'})}\n\n"
            else:
                # Load VGGish config
                settings = app_settings.load_settings()
                vggish_config = settings.get("vggish", {})

                yield f"data: {json.dumps({'type': 'status', 'message': 'Loading VGGish model...'})}\n\n"
                await asyncio.sleep(0)

                # Import and load model
                try:
                    from backend.processing.audio_pipeline.vggish_model import load_vggish_model
                    from backend.processing.audio_pipeline.embedding import pcm_to_examples, embed_examples
                    from backend.processing.audio_pipeline import io as audio_io
                    from backend.db.embeddings import upsert_embedding
                    import numpy as np

                    model = load_vggish_model(
                        device_preference=vggish_config.get("device_preference", "auto"),
                        gpu_memory_fraction=vggish_config.get("gpu_memory_fraction", 0.8),
                        gpu_allow_growth=vggish_config.get("gpu_allow_growth", True),
                        use_postprocess=vggish_config.get("use_postprocess", True),
                    )

                    yield f"data: {json.dumps({'type': 'status', 'message': 'VGGish model loaded successfully'})}\n\n"
                    await asyncio.sleep(0)

                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to load VGGish model: {str(e)}'})}\n\n"
                    raise

                # Get paths
                from backend.processing.storage_utils import song_cache_path
                paths = app_settings.resolve_paths()
                song_cache_dir = paths["song_cache_dir"]
                embedding_dir = app_settings.REPO_ROOT / ".embeddings"
                embedding_dir.mkdir(parents=True, exist_ok=True)

                for idx, (sha_id, title) in enumerate(songs):
                    if _embedding_task_state["stop_requested"]:
                        yield f"data: {json.dumps({'type': 'status', 'message': 'Stop requested, finishing...'})}\n\n"
                        break

                    processed += 1
                    display_title = title or sha_id[:12]
                    yield f"data: {json.dumps({'type': 'status', 'message': f'[{idx + 1}/{total}] Processing: {display_title}'})}\n\n"
                    await asyncio.sleep(0)

                    try:
                        # Find the audio file using the standard path structure
                        mp3_path = song_cache_path(song_cache_dir, sha_id, extension=".mp3")

                        if not mp3_path.exists():
                            yield f"data: {json.dumps({'type': 'status', 'message': f'  → Skipped: audio file not found'})}\n\n"
                            skipped += 1
                            continue

                        # Convert MP3 to PCM
                        yield f"data: {json.dumps({'type': 'status', 'message': f'  → Converting to PCM...'})}\n\n"
                        await asyncio.sleep(0)

                        # Use ffmpeg to convert MP3 to PCM
                        import subprocess
                        import tempfile

                        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                            tmp_path = tmp.name

                        try:
                            target_sr = vggish_config.get("target_sample_rate", 16000)
                            cmd = [
                                "ffmpeg", "-y", "-i", str(mp3_path),
                                "-ar", str(target_sr), "-ac", "1", "-f", "wav",
                                tmp_path
                            ]
                            subprocess.run(cmd, capture_output=True, check=True)

                            # Load the WAV file
                            audio, sr = audio_io.load_wav(tmp_path)

                            # Generate embedding
                            yield f"data: {json.dumps({'type': 'status', 'message': f'  → Generating embedding...'})}\n\n"
                            await asyncio.sleep(0)

                            examples = pcm_to_examples(audio, sr)
                            embedding = embed_examples(model, examples)

                            # Average the embeddings if multiple frames
                            if len(embedding.shape) > 1 and embedding.shape[0] > 1:
                                avg_embedding = np.mean(embedding, axis=0)
                            else:
                                avg_embedding = embedding.flatten()[:128]

                            # Save to database
                            with get_connection() as conn:
                                upsert_embedding(conn, sha_id, avg_embedding.tolist())

                            # Save to file
                            npz_path = embedding_dir / f"{sha_id}.npz"
                            np.savez_compressed(
                                npz_path,
                                embedding=embedding,
                                postprocessed=avg_embedding,
                            )

                            yield f"data: {json.dumps({'type': 'status', 'message': f'  ✓ Embedding saved'})}\n\n"
                            recalculated += 1

                        finally:
                            Path(tmp_path).unlink(missing_ok=True)

                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'status', 'message': f'  ✗ Error: {str(e)}'})}\n\n"
                        failed += 1

                    # Send progress update
                    progress = {
                        "type": "progress",
                        "processed": processed,
                        "recalculated": recalculated,
                        "skipped": skipped,
                        "failed": failed,
                        "total": total,
                    }
                    yield f"data: {json.dumps(progress)}\n\n"
                    await asyncio.sleep(0)

            result = {
                "processed": processed,
                "recalculated": recalculated,
                "skipped": skipped,
                "failed": failed,
            }
            _embedding_task_state["last_result"] = result

            yield f"data: {json.dumps({'type': 'complete', **result})}\n\n"

        except Exception as e:
            logger.exception("Embedding recalculation failed")
            _embedding_task_state["last_error"] = str(e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        finally:
            _embedding_task_state["running"] = False
            _embedding_task_state["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/vggish/recalculate/stop")
async def stop_embedding_recalculation() -> dict[str, Any]:
    """Request the active embedding recalculation to stop."""
    global _embedding_task_state

    if not _embedding_task_state["running"]:
        raise HTTPException(status_code=400, detail="No embedding recalculation running")

    _embedding_task_state["stop_requested"] = True
    return {"status": "stop_requested"}
