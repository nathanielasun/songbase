from __future__ import annotations

import logging
import queue
import threading
import time
from typing import Any, Iterable

from backend.api.events.library_events import (
    LibraryEvent,
    emit_library_event,
    get_library_event_hub,
)
from backend.db.connection import get_connection
from backend.services.playlist_refresher import get_playlist_refresher
from backend.services.rule_engine import Condition, ConditionGroup, get_rule_engine

logger = logging.getLogger(__name__)

DEFAULT_DEBOUNCE_SECONDS = 2.0
DEFAULT_BATCH_LIMIT = 200

METADATA_EVENT_TYPES = {
    "song_added",
    "song_deleted",
    "song_metadata_updated",
    "library_changed",
    "library_reset",
    "embeddings_updated",
}

PLAYBACK_EVENT_TYPES = {
    "play_history_updated",
}

PREFERENCE_EVENT_TYPES = {
    "preferences_updated",
}

PREFERENCE_FIELDS = {"is_liked", "is_disliked"}
PLAYBACK_FIELDS = {
    "play_count",
    "last_played",
    "skip_count",
    "completion_rate",
    "last_week_plays",
    "trending",
    "declining",
}
METADATA_FIELDS = {
    "title",
    "artist",
    "album",
    "genre",
    "release_year",
    "duration_sec",
    "track_number",
    "added_at",
    "verified",
    "has_embedding",
    "bpm",
    "energy",
    "key",
    "key_mode",
    "danceability",
    "mood",
    "similar_to",
}


class PlaylistRefreshScheduler:
    """Background scheduler for auto-refreshing smart playlists."""

    def __init__(
        self,
        debounce_seconds: float = DEFAULT_DEBOUNCE_SECONDS,
        batch_limit: int = DEFAULT_BATCH_LIMIT,
    ) -> None:
        self.debounce_seconds = debounce_seconds
        self.batch_limit = batch_limit
        self._stop_event = threading.Event()
        self._worker_thread: threading.Thread | None = None
        self._event_queue: queue.Queue[LibraryEvent] | None = None
        self._last_preferences: dict[str, Any] = {
            "liked_song_ids": set(),
            "disliked_song_ids": set(),
            "updated_at": None,
        }
        self._rule_engine = get_rule_engine()
        self._refresher = get_playlist_refresher()

    def start(self) -> None:
        """Start the background refresh worker."""
        if self._worker_thread and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        self._event_queue = get_library_event_hub().subscribe()
        self._worker_thread = threading.Thread(target=self._run, daemon=True)
        self._worker_thread.start()
        logger.info("Smart playlist refresh scheduler started")

    def stop(self) -> None:
        """Stop the background refresh worker."""
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=2.0)
        if self._event_queue is not None:
            get_library_event_hub().unsubscribe(self._event_queue)
        logger.info("Smart playlist refresh scheduler stopped")

    def _run(self) -> None:
        """Main worker loop that batches events and triggers refreshes."""
        if self._event_queue is None:
            return

        while not self._stop_event.is_set():
            try:
                event = self._event_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            batch = [event]
            deadline = time.time() + self.debounce_seconds

            while len(batch) < self.batch_limit:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                try:
                    batch.append(self._event_queue.get(timeout=remaining))
                except queue.Empty:
                    break

            try:
                self._process_batch(batch)
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Failed to process refresh batch: {exc}")

    def _process_batch(self, events: Iterable[LibraryEvent]) -> None:
        events = list(events)
        if not events:
            return

        event_types = {event.event_type for event in events}
        refresh_all = bool(event_types & METADATA_EVENT_TYPES)
        refresh_playback = bool(event_types & PLAYBACK_EVENT_TYPES)
        refresh_preferences = bool(event_types & PREFERENCE_EVENT_TYPES)

        for event in events:
            if event.event_type == "preferences_updated" and event.payload:
                liked_ids = set(event.payload.get("liked_song_ids", []))
                disliked_ids = set(event.payload.get("disliked_song_ids", []))
                self._last_preferences.update(
                    {
                        "liked_song_ids": liked_ids,
                        "disliked_song_ids": disliked_ids,
                        "updated_at": event.timestamp,
                    }
                )

        playlists = self._load_auto_refresh_playlists()
        if not playlists:
            return

        if refresh_all:
            target_playlists = playlists
        else:
            target_playlists = []
            for playlist in playlists:
                parsed_rules = playlist.get("parsed_rules")
                if parsed_rules is None:
                    continue

                if refresh_playback and self._rules_use_fields(parsed_rules, PLAYBACK_FIELDS):
                    target_playlists.append(playlist)
                    continue
                if refresh_preferences and self._rules_use_fields(parsed_rules, PREFERENCE_FIELDS):
                    target_playlists.append(playlist)
                    continue

        if not target_playlists:
            return

        emit_library_event(
            "smart_playlist_refresh_batch_started",
            payload={
                "playlist_ids": [p["playlist_id"] for p in target_playlists],
                "event_types": sorted(event_types),
            },
        )

        liked_song_ids = self._last_preferences["liked_song_ids"]
        disliked_song_ids = self._last_preferences["disliked_song_ids"]
        has_preferences = self._last_preferences["updated_at"] is not None

        for playlist in target_playlists:
            playlist_id = playlist["playlist_id"]
            parsed_rules = playlist.get("parsed_rules")
            uses_preferences = (
                parsed_rules is not None
                and self._rules_use_fields(parsed_rules, PREFERENCE_FIELDS)
            )

            if uses_preferences and not has_preferences:
                emit_library_event(
                    "smart_playlist_refresh_skipped",
                    payload={
                        "playlist_id": playlist_id,
                        "reason": "missing_preferences",
                    },
                )
                continue

            emit_library_event(
                "smart_playlist_refresh_started",
                payload={"playlist_id": playlist_id},
            )
            try:
                result = self._refresher.refresh_single(
                    playlist_id,
                    liked_song_ids=liked_song_ids if uses_preferences else None,
                    disliked_song_ids=disliked_song_ids if uses_preferences else None,
                )
                emit_library_event(
                    "smart_playlist_refresh_completed",
                    payload={
                        "playlist_id": playlist_id,
                        "song_count": result.get("song_count", 0),
                        "refreshed_at": result.get("refreshed_at"),
                    },
                )
            except Exception as exc:  # noqa: BLE001
                emit_library_event(
                    "smart_playlist_refresh_failed",
                    payload={
                        "playlist_id": playlist_id,
                        "error": str(exc),
                    },
                )
                logger.error(f"Refresh failed for {playlist_id}: {exc}")

        emit_library_event(
            "smart_playlist_refresh_batch_completed",
            payload={"playlist_ids": [p["playlist_id"] for p in target_playlists]},
        )

    def _load_auto_refresh_playlists(self) -> list[dict[str, Any]]:
        playlists: list[dict[str, Any]] = []
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT playlist_id, rules
                    FROM smart_playlists
                    WHERE auto_refresh = TRUE AND is_template = FALSE
                    """
                )
                rows = cur.fetchall()

        for row in rows:
            playlist_id = str(row[0])
            rules = row[1]
            parsed_rules = None
            try:
                parsed_rules = self._rule_engine.parse(rules)
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"Skipping playlist {playlist_id} with invalid rules: {exc}")
            playlists.append(
                {
                    "playlist_id": playlist_id,
                    "rules": rules,
                    "parsed_rules": parsed_rules,
                }
            )

        return playlists

    def _rules_use_fields(
        self,
        rules: ConditionGroup,
        fields: set[str],
    ) -> bool:
        for cond in rules.conditions:
            if isinstance(cond, ConditionGroup):
                if self._rules_use_fields(cond, fields):
                    return True
            elif isinstance(cond, Condition):
                if cond.field in fields:
                    return True
        return False


_scheduler: PlaylistRefreshScheduler | None = None


def get_playlist_refresh_scheduler() -> PlaylistRefreshScheduler:
    """Get the singleton refresh scheduler."""
    global _scheduler
    if _scheduler is None:
        _scheduler = PlaylistRefreshScheduler()
    return _scheduler
