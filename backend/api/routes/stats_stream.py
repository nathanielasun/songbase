"""
Real-Time Statistics Streaming

WebSocket endpoint for live stats updates.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.stats_aggregator import get_stats_aggregator

router = APIRouter()
logger = logging.getLogger(__name__)

# Store connected clients
_connected_clients: set[WebSocket] = set()

# Event queue for broadcasting
_event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()


async def broadcast_event(event: dict[str, Any]) -> None:
    """Broadcast an event to all connected clients."""
    await _event_queue.put(event)


async def notify_play_update(
    sha_id: str,
    event_type: str,
    session_id: str | None = None,
) -> None:
    """Notify connected clients about a play event."""
    aggregator = get_stats_aggregator()
    today_stats = aggregator.get_overview("week")

    await broadcast_event({
        "type": "play_update",
        "event_type": event_type,
        "sha_id": sha_id,
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "today_plays": today_stats.get("total_plays", 0),
        "today_duration_formatted": today_stats.get("total_duration_formatted", "0m"),
        "current_streak": today_stats.get("current_streak_days", 0),
    })


async def _broadcast_worker() -> None:
    """Background worker to broadcast events to connected clients."""
    while True:
        try:
            event = await _event_queue.get()
            disconnected = set()

            for client in _connected_clients:
                try:
                    await client.send_json(event)
                except Exception:
                    disconnected.add(client)

            # Remove disconnected clients
            for client in disconnected:
                _connected_clients.discard(client)

        except Exception as e:
            logger.error(f"Broadcast worker error: {e}")
            await asyncio.sleep(1)


# Start broadcast worker on module load
_broadcast_task: asyncio.Task | None = None


def _ensure_broadcast_worker() -> None:
    """Ensure the broadcast worker is running."""
    global _broadcast_task
    if _broadcast_task is None or _broadcast_task.done():
        try:
            loop = asyncio.get_running_loop()
            _broadcast_task = loop.create_task(_broadcast_worker())
        except RuntimeError:
            pass  # No running loop yet


@router.websocket("/live")
async def stats_live(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time stats updates.

    Sends:
    - Initial stats on connect
    - Play updates when songs are played/paused/completed
    - Periodic stats refresh every 30 seconds
    """
    await websocket.accept()
    _connected_clients.add(websocket)
    _ensure_broadcast_worker()

    try:
        # Send current stats on connect
        aggregator = get_stats_aggregator()
        current_stats = aggregator.get_overview("week")

        await websocket.send_json({
            "type": "initial",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "stats": current_stats,
        })

        # Keep connection alive and send periodic updates
        while True:
            try:
                # Wait for client messages (pings/pongs) or timeout
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0
                )

                # Handle client messages
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif message.get("type") == "refresh":
                        # Client requested stats refresh
                        current_stats = aggregator.get_overview("week")
                        await websocket.send_json({
                            "type": "refresh",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "stats": current_stats,
                        })
                except json.JSONDecodeError:
                    pass

            except asyncio.TimeoutError:
                # Send periodic stats update
                current_stats = aggregator.get_overview("week")
                await websocket.send_json({
                    "type": "periodic",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "stats": {
                        "total_plays": current_stats.get("total_plays", 0),
                        "total_duration_formatted": current_stats.get("total_duration_formatted", "0m"),
                        "current_streak_days": current_stats.get("current_streak_days", 0),
                    },
                })

    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        _connected_clients.discard(websocket)


@router.get("/clients")
async def get_connected_clients() -> dict[str, int]:
    """Get the number of connected WebSocket clients."""
    return {"connected_clients": len(_connected_clients)}
