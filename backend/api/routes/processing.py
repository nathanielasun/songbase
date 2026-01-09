from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import sys
import asyncio
import queue
import json
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from backend.processing import mp3_to_pcm
from backend.processing.audio_pipeline import config as audio_config
from backend.processing.metadata_pipeline.pipeline import verify_unverified_songs
from backend.processing.metadata_pipeline.image_pipeline import sync_images_and_profiles

router = APIRouter()

# Global queues for status messages
status_queue: queue.Queue = queue.Queue()
image_sync_queue: queue.Queue = queue.Queue()
verification_stop_event = threading.Event()
image_sync_stop_event = threading.Event()

class ProcessingStatus(BaseModel):
    status: str
    message: str

@router.get("/config")
async def get_processing_config():
    return {
        "audio_sample_rate": audio_config.TARGET_SAMPLE_RATE,
        "ffmpeg_threads": mp3_to_pcm.DEFAULT_THREADS
    }

@router.post("/convert")
async def convert_mp3_to_pcm(input_path: str, output_path: str, threads: Optional[int] = None):
    try:
        results = mp3_to_pcm.convert_directory(
            input_path,
            output_path,
            threads=threads or mp3_to_pcm.DEFAULT_THREADS,
            verbose=False,
        )

        if results["total"] == 0:
            message = f"No .mp3 files found under {input_path}"
        else:
            message = (
                f"Converted {results['converted']} of {results['total']} file(s) "
                f"from {input_path} to {output_path}"
            )

        return ProcessingStatus(
            status="success",
            message=message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metadata/verify-stream")
async def verify_metadata_stream(
    limit: Optional[int] = None,
    min_score: Optional[int] = None,
):
    """
    Stream metadata verification status updates using Server-Sent Events.

    This endpoint provides real-time updates as songs are being verified.
    """
    async def event_generator():
        # Clear the queue before starting
        while not status_queue.empty():
            try:
                status_queue.get_nowait()
            except queue.Empty:
                break

        verification_stop_event.clear()

        # Status callback that adds messages to the queue
        def status_callback(message: str):
            status_queue.put(message)

        # Run verification in a separate thread
        import threading

        result = {"processed": 0, "verified": 0, "skipped": 0, "album_images": 0, "artist_images": 0, "error": None}

        def run_verification():
            try:
                res = verify_unverified_songs(
                    limit=limit,
                    min_score=min_score,
                    rate_limit_seconds=1.0,
                    dry_run=False,
                    status_callback=status_callback,
                    stop_event=verification_stop_event,
                )
                result["processed"] = res.processed
                result["verified"] = res.verified
                result["skipped"] = res.skipped
                result["album_images"] = res.album_images_fetched
                result["artist_images"] = res.artist_images_fetched
            except Exception as e:
                result["error"] = str(e)
                status_queue.put(f"ERROR: {str(e)}")
            finally:
                # Signal completion
                status_queue.put("__DONE__")

        # Start verification thread
        thread = threading.Thread(target=run_verification)
        thread.start()

        # Stream status updates
        while True:
            try:
                # Non-blocking check with timeout
                message = status_queue.get(timeout=0.5)

                if message == "__DONE__":
                    # Send final result
                    if result["error"]:
                        yield f"data: {json.dumps({'type': 'error', 'message': result['error']})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'complete', 'processed': result['processed'], 'verified': result['verified'], 'skipped': result['skipped'], 'album_images': result['album_images'], 'artist_images': result['artist_images']})}\n\n"
                    break

                # Check if this is a progress message
                if message.startswith("__PROGRESS__:"):
                    # Parse progress: __PROGRESS__:verified:processed:skipped:album_images:artist_images
                    parts = message.split(":")
                    if len(parts) == 6:
                        yield f"data: {json.dumps({'type': 'progress', 'verified': int(parts[1]), 'processed': int(parts[2]), 'skipped': int(parts[3]), 'album_images': int(parts[4]), 'artist_images': int(parts[5])})}\n\n"
                    continue

                # Use json.dumps to properly escape message and create valid JSON
                yield f"data: {json.dumps({'type': 'status', 'message': message})}\n\n"

            except queue.Empty:
                # Send keep-alive
                yield f": keep-alive\n\n"
                await asyncio.sleep(0.1)

        # Wait for thread to complete
        thread.join(timeout=1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable buffering in nginx
        },
    )


@router.post("/metadata/verify/stop")
async def stop_verify_metadata() -> dict:
    verification_stop_event.set()
    return {"status": "stopping"}


@router.get("/metadata/images-stream")
async def sync_images_stream(
    limit_songs: Optional[int] = None,
    limit_artists: Optional[int] = None,
    rate_limit: Optional[float] = None,
    dry_run: bool = False,
):
    """
    Stream image sync status updates using Server-Sent Events.

    This endpoint provides real-time updates as images are being synced.
    """
    async def event_generator():
        # Clear the queue before starting
        while not image_sync_queue.empty():
            try:
                image_sync_queue.get_nowait()
            except queue.Empty:
                break

        image_sync_stop_event.clear()

        # Status callback that adds messages to the queue
        def status_callback(message: str):
            image_sync_queue.put(message)

        # Result storage
        result = {
            "songs_processed": 0,
            "song_images": 0,
            "album_images": 0,
            "album_metadata": 0,
            "album_tracks": 0,
            "artist_profiles": 0,
            "artist_images": 0,
            "skipped": 0,
            "failed": 0,
            "error": None,
        }

        def run_sync():
            try:
                res = sync_images_and_profiles(
                    limit_songs=limit_songs,
                    limit_artists=limit_artists,
                    rate_limit_seconds=rate_limit or 1.0,
                    dry_run=dry_run,
                    status_callback=status_callback,
                    stop_event=image_sync_stop_event,
                )
                result["songs_processed"] = res.songs_processed
                result["song_images"] = res.song_images
                result["album_images"] = res.album_images
                result["album_metadata"] = res.album_metadata
                result["album_tracks"] = res.album_tracks
                result["artist_profiles"] = res.artist_profiles
                result["artist_images"] = res.artist_images
                result["skipped"] = res.skipped
                result["failed"] = res.failed
            except Exception as e:
                result["error"] = str(e)
                image_sync_queue.put(f"ERROR: {str(e)}")
            finally:
                # Signal completion
                image_sync_queue.put("__DONE__")

        # Start sync thread
        thread = threading.Thread(target=run_sync)
        thread.start()

        # Stream status updates
        while True:
            try:
                # Non-blocking check with timeout
                message = image_sync_queue.get(timeout=0.5)

                if message == "__DONE__":
                    # Send final result
                    if result["error"]:
                        yield f"data: {json.dumps({'type': 'error', 'message': result['error']})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'complete', **result})}\n\n"
                    break

                # Check if this is a progress message
                # Format: __PROGRESS__:songs_processed:song_images:album_images:artist_profiles:artist_images:skipped:failed
                if message.startswith("__PROGRESS__:"):
                    parts = message.split(":")
                    if len(parts) == 8:
                        yield f"data: {json.dumps({'type': 'progress', 'songs_processed': int(parts[1]), 'song_images': int(parts[2]), 'album_images': int(parts[3]), 'artist_profiles': int(parts[4]), 'artist_images': int(parts[5]), 'skipped': int(parts[6]), 'failed': int(parts[7])})}\n\n"
                    continue

                # Regular status message
                yield f"data: {json.dumps({'type': 'status', 'message': message})}\n\n"

            except queue.Empty:
                # Send keep-alive
                yield f": keep-alive\n\n"
                await asyncio.sleep(0.1)

        # Wait for thread to complete
        thread.join(timeout=1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/metadata/images/stop")
async def stop_image_sync() -> dict:
    image_sync_stop_event.set()
    return {"status": "stopping"}
