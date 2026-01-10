"""
Playback Tracker Service

Handles tracking of play sessions, events, and listening streaks.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from backend.db.connection import get_connection
from backend.services.stats_cache import invalidate_stats_on_play

logger = logging.getLogger(__name__)

# Completion thresholds
COMPLETION_THRESHOLD = 0.80  # 80% = completed
SKIP_THRESHOLD = 0.30  # <30% = skipped


def _schedule_broadcast(sha_id: str, event_type: str, session_id: str | None = None) -> None:
    """Schedule a broadcast event for real-time stats updates."""
    try:
        from backend.api.routes import stats_stream

        loop = asyncio.get_running_loop()
        loop.create_task(
            stats_stream.notify_play_update(sha_id, event_type, session_id)
        )
    except RuntimeError:
        # No running event loop (e.g., called from sync context)
        pass
    except Exception as e:
        logger.debug(f"Could not broadcast event: {e}")


def _emit_library_event(
    event_type: str,
    sha_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Emit a library event for smart playlist refresh scheduling."""
    try:
        from backend.api.events.library_events import emit_library_event

        emit_library_event(event_type, sha_id=sha_id, payload=payload)
    except Exception as e:
        logger.debug(f"Could not emit library event: {e}")


class PlaybackTracker:
    """Service for tracking playback sessions and events."""

    def start_session(
        self,
        sha_id: str,
        context_type: str | None = None,
        context_id: str | None = None,
        position_ms: int = 0,
        client_id: str | None = None,
        user_agent: str | None = None,
    ) -> str:
        """
        Create a new play session.

        Args:
            sha_id: The song's SHA-256 hash ID
            context_type: Where the song was played from (radio, playlist, album, etc.)
            context_id: ID of the context (playlist_id, album_id, etc.)
            position_ms: Starting position in milliseconds (for resume)
            client_id: Browser fingerprint or device ID
            user_agent: User agent string

        Returns:
            session_id: UUID of the created session
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get song duration from metadata
                cur.execute(
                    "SELECT duration_sec FROM metadata.songs WHERE sha_id = %s",
                    (sha_id,),
                )
                result = cur.fetchone()
                song_duration_ms = (result[0] * 1000) if result and result[0] else None

                # Create session
                cur.execute(
                    """
                    INSERT INTO play_sessions (
                        sha_id, song_duration_ms, context_type, context_id,
                        client_id, user_agent, duration_played_ms
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING session_id
                    """,
                    (
                        sha_id,
                        song_duration_ms,
                        context_type,
                        context_id,
                        client_id,
                        user_agent,
                        position_ms,
                    ),
                )
                session_id = cur.fetchone()[0]

                # Record start event
                cur.execute(
                    """
                    INSERT INTO play_events (session_id, event_type, position_ms)
                    VALUES (%s, 'start', %s)
                    """,
                    (session_id, position_ms),
                )

            conn.commit()

        logger.info(f"Started play session {session_id} for song {sha_id[:12]}...")

        # Broadcast event for real-time stats
        _schedule_broadcast(sha_id, "start", str(session_id))

        return str(session_id)

    def record_event(
        self,
        session_id: str,
        event_type: str,
        position_ms: int,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        """
        Record an event within a session.

        Args:
            session_id: UUID of the session
            event_type: Type of event (pause, resume, seek, skip)
            position_ms: Current playback position in milliseconds
            metadata: Optional metadata (e.g., seek target)

        Returns:
            success: Whether the event was recorded
        """
        valid_events = {"pause", "resume", "seek", "skip"}
        if event_type not in valid_events:
            logger.warning(f"Invalid event type: {event_type}")
            return False

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Verify session exists and is not ended
                cur.execute(
                    "SELECT ended_at FROM play_sessions WHERE session_id = %s",
                    (session_id,),
                )
                result = cur.fetchone()
                if not result:
                    logger.warning(f"Session {session_id} not found")
                    return False
                if result[0] is not None:
                    logger.warning(f"Session {session_id} already ended")
                    return False

                # Record event
                cur.execute(
                    """
                    INSERT INTO play_events (session_id, event_type, position_ms, metadata)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (session_id, event_type, position_ms, metadata or {}),
                )

                # Update duration played if this is a pause or skip
                if event_type in {"pause", "skip"}:
                    cur.execute(
                        """
                        UPDATE play_sessions
                        SET duration_played_ms = %s
                        WHERE session_id = %s
                        """,
                        (position_ms, session_id),
                    )

            conn.commit()

        logger.debug(f"Recorded {event_type} event for session {session_id}")
        return True

    def complete_session(
        self,
        session_id: str,
        final_position_ms: int,
    ) -> dict[str, Any]:
        """
        Mark session as completed (song finished naturally).

        Args:
            session_id: UUID of the session
            final_position_ms: Final playback position in milliseconds

        Returns:
            dict with success status and completion info
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get session info
                cur.execute(
                    """
                    SELECT song_duration_ms, ended_at
                    FROM play_sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                result = cur.fetchone()
                if not result:
                    return {"success": False, "error": "Session not found"}
                if result[1] is not None:
                    return {"success": False, "error": "Session already ended"}

                song_duration_ms = result[0]

                # Calculate completion percentage
                completion_percent = 100.0
                if song_duration_ms and song_duration_ms > 0:
                    completion_percent = min(
                        100.0, (final_position_ms / song_duration_ms) * 100
                    )

                # Record complete event
                cur.execute(
                    """
                    INSERT INTO play_events (session_id, event_type, position_ms)
                    VALUES (%s, 'complete', %s)
                    """,
                    (session_id, final_position_ms),
                )

                # Update session
                cur.execute(
                    """
                    UPDATE play_sessions
                    SET ended_at = NOW(),
                        duration_played_ms = %s,
                        completion_percent = %s,
                        completed = TRUE,
                        skipped = FALSE
                    WHERE session_id = %s
                    """,
                    (final_position_ms, completion_percent, session_id),
                )

            conn.commit()

        logger.info(f"Completed session {session_id} at {completion_percent:.1f}%")

        # Update streak
        self.update_streak()

        # Broadcast event for real-time stats
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT sha_id FROM play_sessions WHERE session_id = %s",
                    (session_id,),
                )
                row = cur.fetchone()
                if row:
                    _schedule_broadcast(row[0], "complete", session_id)
                    _emit_library_event(
                        "play_history_updated",
                        sha_id=row[0],
                        payload={"event": "complete", "session_id": session_id},
                    )

        return {
            "success": True,
            "completed": True,
            "completion_percent": round(completion_percent, 2),
        }

    def end_session(
        self,
        session_id: str,
        final_position_ms: int,
        reason: str = "unknown",
    ) -> dict[str, Any]:
        """
        End session (skip, next song, page close).

        Args:
            session_id: UUID of the session
            final_position_ms: Final playback position in milliseconds
            reason: Why the session ended (next_song, user_stop, page_close)

        Returns:
            dict with success status and session info
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get session info
                cur.execute(
                    """
                    SELECT song_duration_ms, ended_at
                    FROM play_sessions
                    WHERE session_id = %s
                    """,
                    (session_id,),
                )
                result = cur.fetchone()
                if not result:
                    return {"success": False, "error": "Session not found"}
                if result[1] is not None:
                    return {"success": False, "error": "Session already ended"}

                song_duration_ms = result[0]

                # Calculate completion percentage
                completion_percent = 0.0
                if song_duration_ms and song_duration_ms > 0:
                    completion_percent = min(
                        100.0, (final_position_ms / song_duration_ms) * 100
                    )

                # Determine if completed or skipped
                completed = completion_percent >= (COMPLETION_THRESHOLD * 100)
                skipped = (
                    completion_percent < (SKIP_THRESHOLD * 100) and reason == "next_song"
                )

                # Record end event
                cur.execute(
                    """
                    INSERT INTO play_events (session_id, event_type, position_ms, metadata)
                    VALUES (%s, 'end', %s, %s)
                    """,
                    (session_id, final_position_ms, {"reason": reason}),
                )

                # Update session
                cur.execute(
                    """
                    UPDATE play_sessions
                    SET ended_at = NOW(),
                        duration_played_ms = %s,
                        completion_percent = %s,
                        completed = %s,
                        skipped = %s
                    WHERE session_id = %s
                    """,
                    (final_position_ms, completion_percent, completed, skipped, session_id),
                )

            conn.commit()

        logger.info(
            f"Ended session {session_id}: {completion_percent:.1f}% "
            f"(completed={completed}, skipped={skipped})"
        )

        # Update streak if we had a meaningful listen
        if completion_percent >= 10:  # At least 10% played
            self.update_streak()

        # Broadcast event for real-time stats
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT sha_id FROM play_sessions WHERE session_id = %s",
                    (session_id,),
                )
                row = cur.fetchone()
                if row:
                    event_type = "skip" if skipped else "end"
                    _schedule_broadcast(row[0], event_type, session_id)
                    _emit_library_event(
                        "play_history_updated",
                        sha_id=row[0],
                        payload={"event": event_type, "session_id": session_id},
                    )

        # Invalidate stats cache to reflect new play data
        invalidate_stats_on_play()

        return {
            "success": True,
            "completed": completed,
            "skipped": skipped,
            "completion_percent": round(completion_percent, 2),
        }

    def update_streak(self) -> dict[str, Any]:
        """
        Check and update listening streak based on today's activity.

        Returns:
            dict with current streak info
        """
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Check if we have any plays today
                cur.execute(
                    """
                    SELECT COUNT(*) FROM play_sessions
                    WHERE DATE(started_at AT TIME ZONE 'UTC') = %s
                    """,
                    (today,),
                )
                today_plays = cur.fetchone()[0]

                if today_plays == 0:
                    # No plays today, check current streak
                    cur.execute(
                        """
                        SELECT streak_id, end_date, length_days
                        FROM listening_streaks
                        WHERE is_current = TRUE
                        """,
                    )
                    result = cur.fetchone()
                    if result:
                        return {
                            "current_streak": result[2],
                            "streak_end_date": str(result[1]),
                            "is_active": result[1] >= yesterday,
                        }
                    return {"current_streak": 0, "is_active": False}

                # We have plays today, update streak
                cur.execute(
                    """
                    SELECT streak_id, start_date, end_date
                    FROM listening_streaks
                    WHERE is_current = TRUE
                    """,
                )
                current_streak = cur.fetchone()

                if current_streak:
                    streak_id, start_date, end_date = current_streak
                    if end_date == today:
                        # Already updated today
                        pass
                    elif end_date == yesterday:
                        # Extend streak
                        cur.execute(
                            """
                            UPDATE listening_streaks
                            SET end_date = %s
                            WHERE streak_id = %s
                            """,
                            (today, streak_id),
                        )
                    else:
                        # Streak broken, start new one
                        cur.execute(
                            "UPDATE listening_streaks SET is_current = FALSE WHERE is_current = TRUE"
                        )
                        cur.execute(
                            """
                            INSERT INTO listening_streaks (start_date, end_date, is_current)
                            VALUES (%s, %s, TRUE)
                            """,
                            (today, today),
                        )
                else:
                    # No current streak, start new one
                    cur.execute(
                        """
                        INSERT INTO listening_streaks (start_date, end_date, is_current)
                        VALUES (%s, %s, TRUE)
                        """,
                        (today, today),
                    )

                # Get updated streak info
                cur.execute(
                    """
                    SELECT length_days, start_date, end_date
                    FROM listening_streaks
                    WHERE is_current = TRUE
                    """,
                )
                result = cur.fetchone()

            conn.commit()

        if result:
            return {
                "current_streak": result[0],
                "streak_start": str(result[1]),
                "streak_end": str(result[2]),
                "is_active": True,
            }
        return {"current_streak": 0, "is_active": False}

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        """
        Get session details.

        Args:
            session_id: UUID of the session

        Returns:
            Session details or None if not found
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        ps.session_id, ps.sha_id, ps.started_at, ps.ended_at,
                        ps.duration_played_ms, ps.song_duration_ms,
                        ps.completion_percent, ps.completed, ps.skipped,
                        ps.context_type, ps.context_id,
                        s.title, s.album
                    FROM play_sessions ps
                    LEFT JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    WHERE ps.session_id = %s
                    """,
                    (session_id,),
                )
                result = cur.fetchone()

        if not result:
            return None

        return {
            "session_id": str(result[0]),
            "sha_id": result[1],
            "started_at": result[2].isoformat() if result[2] else None,
            "ended_at": result[3].isoformat() if result[3] else None,
            "duration_played_ms": result[4],
            "song_duration_ms": result[5],
            "completion_percent": float(result[6]) if result[6] else 0,
            "completed": result[7],
            "skipped": result[8],
            "context_type": result[9],
            "context_id": result[10],
            "title": result[11],
            "album": result[12],
        }


# Singleton instance
_tracker: PlaybackTracker | None = None


def get_playback_tracker() -> PlaybackTracker:
    """Get the singleton PlaybackTracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = PlaybackTracker()
    return _tracker
