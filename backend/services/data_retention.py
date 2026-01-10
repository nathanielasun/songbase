"""
Data Retention & Privacy Service

Handles cleanup of old play history data and privacy controls.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.db.connection import get_connection

logger = logging.getLogger(__name__)


# Default retention policies (in days)
DEFAULT_RETENTION_POLICIES = {
    "play_events_days": 90,      # Detailed events kept for 90 days
    "play_sessions_days": 365,    # Sessions kept for 1 year
    "aggregate_stats_days": 1825, # Aggregate stats kept for 5 years
}


class DataRetentionService:
    """
    Service for managing data retention and cleanup.
    """

    def __init__(
        self,
        play_events_days: int = 90,
        play_sessions_days: int = 365,
        aggregate_stats_days: int = 1825,
        cleanup_interval_hours: float = 24.0,
    ):
        """
        Initialize the data retention service.

        Args:
            play_events_days: Days to keep detailed play events
            play_sessions_days: Days to keep play sessions
            aggregate_stats_days: Days to keep aggregated statistics
            cleanup_interval_hours: Hours between automatic cleanup runs
        """
        self.play_events_days = play_events_days
        self.play_sessions_days = play_sessions_days
        self.aggregate_stats_days = aggregate_stats_days
        self.cleanup_interval = cleanup_interval_hours * 3600  # Convert to seconds

        self._running = False
        self._cleanup_task: asyncio.Task | None = None
        self._last_cleanup: datetime | None = None
        self._cleanup_stats: dict[str, Any] = {}

    def start(self) -> None:
        """Start the background cleanup task."""
        if self._running:
            return
        self._running = True
        try:
            loop = asyncio.get_running_loop()
            self._cleanup_task = loop.create_task(self._periodic_cleanup())
        except RuntimeError:
            # No running event loop - start a background thread instead
            thread = threading.Thread(target=self._sync_periodic_cleanup, daemon=True)
            thread.start()

    def stop(self) -> None:
        """Stop the background cleanup task."""
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()

    def cleanup_old_events(self) -> int:
        """
        Delete play events older than the retention period.

        Returns:
            Number of deleted events
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.play_events_days)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM play_events
                    WHERE timestamp < %s
                    """,
                    (cutoff,),
                )
                deleted = cur.rowcount
            conn.commit()

        logger.info(f"Deleted {deleted} play events older than {self.play_events_days} days")
        return deleted

    def cleanup_old_sessions(self) -> int:
        """
        Delete play sessions older than the retention period.

        Sessions are aggregated before deletion to preserve statistics.

        Returns:
            Number of deleted sessions
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.play_sessions_days)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Delete old sessions (cascade will delete events too)
                cur.execute(
                    """
                    DELETE FROM play_sessions
                    WHERE started_at < %s
                    """,
                    (cutoff,),
                )
                deleted = cur.rowcount
            conn.commit()

        logger.info(f"Deleted {deleted} play sessions older than {self.play_sessions_days} days")
        return deleted

    def cleanup_orphaned_streaks(self) -> int:
        """
        Delete non-current streaks that are no longer relevant.

        Returns:
            Number of deleted streaks
        """
        # Keep only the current streak and the longest streak
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Find the longest streak
                cur.execute(
                    """
                    SELECT streak_id FROM listening_streaks
                    ORDER BY length_days DESC
                    LIMIT 1
                    """
                )
                longest = cur.fetchone()
                longest_id = longest[0] if longest else None

                # Delete non-current, non-longest streaks older than 1 year
                cutoff = datetime.now(timezone.utc).date() - timedelta(days=365)
                cur.execute(
                    """
                    DELETE FROM listening_streaks
                    WHERE is_current = FALSE
                    AND end_date < %s
                    AND streak_id != COALESCE(%s, -1)
                    """,
                    (cutoff, longest_id),
                )
                deleted = cur.rowcount
            conn.commit()

        logger.info(f"Deleted {deleted} orphaned listening streaks")
        return deleted

    def run_full_cleanup(self) -> dict[str, int]:
        """
        Run all cleanup tasks.

        Returns:
            Dictionary with counts of deleted items
        """
        results = {
            "events_deleted": self.cleanup_old_events(),
            "sessions_deleted": self.cleanup_old_sessions(),
            "streaks_deleted": self.cleanup_orphaned_streaks(),
        }

        self._last_cleanup = datetime.now(timezone.utc)
        self._cleanup_stats = results

        logger.info(f"Cleanup complete: {results}")
        return results

    def delete_all_history(self) -> dict[str, int]:
        """
        Delete ALL play history (for privacy reset).

        This is a destructive operation and cannot be undone.

        Returns:
            Dictionary with counts of deleted items
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Delete in order to respect foreign keys
                cur.execute("DELETE FROM play_events")
                events_deleted = cur.rowcount

                cur.execute("DELETE FROM play_sessions")
                sessions_deleted = cur.rowcount

                cur.execute("DELETE FROM listening_streaks")
                streaks_deleted = cur.rowcount

            conn.commit()

        results = {
            "events_deleted": events_deleted,
            "sessions_deleted": sessions_deleted,
            "streaks_deleted": streaks_deleted,
        }

        logger.warning(f"All play history deleted: {results}")
        return results

    def delete_history_for_song(self, sha_id: str) -> dict[str, int]:
        """
        Delete play history for a specific song.

        Args:
            sha_id: Song SHA ID

        Returns:
            Dictionary with counts of deleted items
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Delete events for sessions of this song
                cur.execute(
                    """
                    DELETE FROM play_events
                    WHERE session_id IN (
                        SELECT session_id FROM play_sessions WHERE sha_id = %s
                    )
                    """,
                    (sha_id,),
                )
                events_deleted = cur.rowcount

                # Delete sessions for this song
                cur.execute(
                    "DELETE FROM play_sessions WHERE sha_id = %s",
                    (sha_id,),
                )
                sessions_deleted = cur.rowcount

            conn.commit()

        results = {
            "events_deleted": events_deleted,
            "sessions_deleted": sessions_deleted,
        }

        logger.info(f"Deleted history for song {sha_id[:12]}...: {results}")
        return results

    def get_data_summary(self) -> dict[str, Any]:
        """
        Get a summary of stored play history data.

        Returns:
            Dictionary with data counts and date ranges
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Session count and date range
                cur.execute(
                    """
                    SELECT
                        COUNT(*),
                        MIN(started_at),
                        MAX(started_at)
                    FROM play_sessions
                    """
                )
                sessions = cur.fetchone()

                # Event count
                cur.execute("SELECT COUNT(*) FROM play_events")
                event_count = cur.fetchone()[0]

                # Streak count
                cur.execute("SELECT COUNT(*) FROM listening_streaks")
                streak_count = cur.fetchone()[0]

                # Calculate storage estimate (rough)
                # Assume ~200 bytes per session, ~100 bytes per event
                storage_estimate_kb = (sessions[0] * 200 + event_count * 100) / 1024

        return {
            "session_count": sessions[0],
            "event_count": event_count,
            "streak_count": streak_count,
            "oldest_session": sessions[1].isoformat() if sessions[1] else None,
            "newest_session": sessions[2].isoformat() if sessions[2] else None,
            "estimated_storage_kb": round(storage_estimate_kb, 2),
            "retention_policy": {
                "play_events_days": self.play_events_days,
                "play_sessions_days": self.play_sessions_days,
                "aggregate_stats_days": self.aggregate_stats_days,
            },
            "last_cleanup": self._last_cleanup.isoformat() if self._last_cleanup else None,
            "last_cleanup_stats": self._cleanup_stats,
        }

    async def _periodic_cleanup(self) -> None:
        """Async periodic cleanup loop."""
        while self._running:
            try:
                await asyncio.sleep(self.cleanup_interval)
                await asyncio.get_event_loop().run_in_executor(None, self.run_full_cleanup)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic cleanup error: {e}")

    def _sync_periodic_cleanup(self) -> None:
        """Sync periodic cleanup loop for thread-based execution."""
        import time
        while self._running:
            try:
                time.sleep(self.cleanup_interval)
                self.run_full_cleanup()
            except Exception as e:
                logger.error(f"Periodic cleanup error: {e}")


# Singleton instance
_retention_service: DataRetentionService | None = None


def get_retention_service() -> DataRetentionService:
    """Get the singleton data retention service."""
    global _retention_service
    if _retention_service is None:
        _retention_service = DataRetentionService()
    return _retention_service


def configure_retention_service(
    play_events_days: int | None = None,
    play_sessions_days: int | None = None,
    aggregate_stats_days: int | None = None,
) -> DataRetentionService:
    """
    Configure the data retention service with custom policies.

    Args:
        play_events_days: Days to keep detailed play events
        play_sessions_days: Days to keep play sessions
        aggregate_stats_days: Days to keep aggregated statistics

    Returns:
        Configured retention service
    """
    global _retention_service

    service = get_retention_service()

    if play_events_days is not None:
        service.play_events_days = play_events_days
    if play_sessions_days is not None:
        service.play_sessions_days = play_sessions_days
    if aggregate_stats_days is not None:
        service.aggregate_stats_days = aggregate_stats_days

    return service
