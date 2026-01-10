"""
Playback Tracking API Routes

Endpoints for tracking play sessions and events.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.services.playback_tracker import get_playback_tracker

router = APIRouter()
logger = logging.getLogger(__name__)


class StartSessionRequest(BaseModel):
    sha_id: str
    context_type: str | None = None
    context_id: str | None = None
    position_ms: int = 0


class EventRequest(BaseModel):
    session_id: str
    event_type: str  # pause, resume, seek, skip
    position_ms: int
    metadata: dict[str, Any] | None = None


class CompleteRequest(BaseModel):
    session_id: str
    final_position_ms: int


class EndRequest(BaseModel):
    session_id: str
    final_position_ms: int
    reason: str = "unknown"  # next_song, user_stop, page_close


@router.post("/start")
async def start_session(payload: StartSessionRequest, request: Request) -> dict[str, Any]:
    """
    Start a new play session.

    Called when a song starts playing.
    """
    tracker = get_playback_tracker()

    # Extract client info from request
    user_agent = request.headers.get("user-agent")
    client_id = request.headers.get("x-client-id")

    try:
        session_id = tracker.start_session(
            sha_id=payload.sha_id,
            context_type=payload.context_type,
            context_id=payload.context_id,
            position_ms=payload.position_ms,
            client_id=client_id,
            user_agent=user_agent,
        )
        return {"session_id": session_id}
    except Exception as e:
        logger.exception("Failed to start session")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event")
async def record_event(payload: EventRequest) -> dict[str, Any]:
    """
    Record a play event within a session.

    Called for pause, resume, seek, skip events.
    """
    tracker = get_playback_tracker()

    valid_events = {"pause", "resume", "seek", "skip"}
    if payload.event_type not in valid_events:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event_type. Must be one of: {valid_events}",
        )

    try:
        success = tracker.record_event(
            session_id=payload.session_id,
            event_type=payload.event_type,
            position_ms=payload.position_ms,
            metadata=payload.metadata,
        )
        if not success:
            raise HTTPException(
                status_code=400,
                detail="Failed to record event. Session may not exist or already ended.",
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to record event")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete")
async def complete_session(payload: CompleteRequest) -> dict[str, Any]:
    """
    Complete a play session.

    Called when a song finishes naturally.
    """
    tracker = get_playback_tracker()

    try:
        result = tracker.complete_session(
            session_id=payload.session_id,
            final_position_ms=payload.final_position_ms,
        )
        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to complete session"),
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to complete session")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end")
async def end_session(payload: EndRequest) -> dict[str, Any]:
    """
    End a play session.

    Called when playback stops (close tab, switch song, etc.)
    """
    tracker = get_playback_tracker()

    try:
        result = tracker.end_session(
            session_id=payload.session_id,
            final_position_ms=payload.final_position_ms,
            reason=payload.reason,
        )
        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to end session"),
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to end session")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    """
    Get session details.
    """
    tracker = get_playback_tracker()

    try:
        session = tracker.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get session")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streak")
async def get_streak() -> dict[str, Any]:
    """
    Get current listening streak info.
    """
    tracker = get_playback_tracker()

    try:
        return tracker.update_streak()
    except Exception as e:
        logger.exception("Failed to get streak")
        raise HTTPException(status_code=500, detail=str(e))
