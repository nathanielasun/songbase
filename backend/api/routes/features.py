"""Audio feature extraction API routes."""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# Global state for analysis task
_analysis_task: Optional[asyncio.Task] = None
_analysis_stop_requested = False


class AnalyzeRequest(BaseModel):
    """Request body for batch analysis."""
    limit: int = 100
    force: bool = False


class AnalyzeResponse(BaseModel):
    """Response for batch analysis start."""
    status: str
    message: str


@router.get("/{sha_id}")
async def get_song_features(sha_id: str):
    """
    Get audio features for a specific song.

    Returns extracted features including BPM, key, energy, mood, etc.
    """
    from backend.processing.feature_pipeline.db import get_features_for_song

    features = await get_features_for_song(sha_id)

    if not features:
        raise HTTPException(status_code=404, detail="Features not found for this song")

    return features


@router.get("/stats/summary")
async def get_feature_stats():
    """
    Get statistics about audio feature analysis.

    Returns counts of analyzed, pending, and failed songs.
    """
    from backend.processing.feature_pipeline.db import get_feature_stats

    return await get_feature_stats()


@router.post("/analyze")
async def start_analysis(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Start batch audio feature analysis.

    Use the SSE stream endpoint to monitor progress.
    """
    global _analysis_task, _analysis_stop_requested

    if _analysis_task and not _analysis_task.done():
        return AnalyzeResponse(
            status="already_running",
            message="Analysis is already in progress. Use /analyze/stop to cancel."
        )

    _analysis_stop_requested = False

    # Import here to avoid circular imports
    from backend.processing.feature_pipeline.db import get_songs_needing_analysis

    # Check how many songs need analysis
    songs = await get_songs_needing_analysis(limit=request.limit, force=request.force)

    if not songs:
        return AnalyzeResponse(
            status="no_songs",
            message="No songs need analysis"
        )

    return AnalyzeResponse(
        status="ready",
        message=f"Ready to analyze {len(songs)} songs. Use /analyze/stream to start with progress."
    )


@router.get("/analyze/stream")
async def analyze_stream(
    limit: int = Query(default=100, ge=1, le=1000),
    force: bool = Query(default=False),
):
    """
    SSE stream for audio feature analysis with live progress.

    Streams progress events as JSON, then a completion event.
    """
    global _analysis_task, _analysis_stop_requested

    if _analysis_task and not _analysis_task.done():
        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Analysis already running'})}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    _analysis_stop_requested = False

    async def generate():
        from backend.processing.feature_pipeline.db import process_batch
        from backend.processing.feature_pipeline.config import FeatureConfig

        progress_queue = asyncio.Queue()

        def progress_callback(data):
            try:
                progress_queue.put_nowait(data)
            except asyncio.QueueFull:
                pass

        def stop_check():
            return _analysis_stop_requested

        # Start processing in background
        config = FeatureConfig()

        async def run_analysis():
            return await process_batch(
                limit=limit,
                force=force,
                config=config,
                progress_callback=progress_callback,
                stop_check=stop_check,
            )

        global _analysis_task
        _analysis_task = asyncio.create_task(run_analysis())

        # Stream progress updates
        try:
            while not _analysis_task.done():
                try:
                    data = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    event = {
                        "type": "progress",
                        **data
                    }
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Send heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

            # Get final result
            result = await _analysis_task

            # Drain any remaining progress events
            while not progress_queue.empty():
                try:
                    data = progress_queue.get_nowait()
                    event = {"type": "progress", **data}
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.QueueEmpty:
                    break

            # Send completion event
            completion = {
                "type": "complete",
                "processed": result["processed"],
                "failed": result["failed"],
                "skipped": result["skipped"],
                "stopped": _analysis_stop_requested,
            }
            yield f"data: {json.dumps(completion)}\n\n"

        except asyncio.CancelledError:
            yield f"data: {json.dumps({'type': 'cancelled'})}\n\n"
        except Exception as e:
            logger.error(f"Analysis stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/analyze/stop")
async def stop_analysis():
    """
    Stop ongoing audio feature analysis.

    Analysis will stop after the current song completes.
    """
    global _analysis_stop_requested, _analysis_task

    if not _analysis_task or _analysis_task.done():
        return {"success": False, "message": "No analysis in progress"}

    _analysis_stop_requested = True
    return {"success": True, "message": "Stop requested, analysis will halt after current song"}


@router.get("/pending")
async def get_pending_songs(
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Get list of songs that need audio feature analysis.
    """
    from backend.processing.feature_pipeline.db import get_songs_needing_analysis

    songs = await get_songs_needing_analysis(limit=limit, force=False)
    return {
        "count": len(songs),
        "songs": songs
    }


@router.get("/failed")
async def get_failed_songs(
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Get list of songs where feature analysis failed.
    """
    from backend.db.connection import get_connection

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT af.sha_id, s.title, af.error_message, af.updated_at
            FROM metadata.audio_features af
            JOIN metadata.songs s ON s.sha_id = af.sha_id
            WHERE af.error_message IS NOT NULL
            ORDER BY af.updated_at DESC
            LIMIT %s
            """,
            (limit,)
        ).fetchall()

        return {
            "count": len(rows),
            "songs": [
                {
                    "sha_id": r[0],
                    "title": r[1],
                    "error": r[2],
                    "analyzed_at": r[3].isoformat() if r[3] else None,
                }
                for r in rows
            ]
        }


@router.post("/{sha_id}/reanalyze")
async def reanalyze_song(sha_id: str):
    """
    Re-analyze audio features for a specific song.
    """
    import time
    from pathlib import Path
    from backend.processing.feature_pipeline.pipeline import FeaturePipeline
    from backend.processing.feature_pipeline.db import save_features, get_song_cache_path

    # Get audio path
    audio_path = get_song_cache_path(sha_id)

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found in cache")

    # Extract features
    pipeline = FeaturePipeline()
    start_time = time.time()

    try:
        features = pipeline.extract_from_file(audio_path)
        analysis_duration_ms = int((time.time() - start_time) * 1000)

        # Save to database
        await save_features(sha_id, features, analysis_duration_ms)

        return {
            "success": features.success,
            "sha_id": sha_id,
            "features": features.to_dict(),
            "analysis_duration_ms": analysis_duration_ms,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
