from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import queue
import threading
from typing import Any


@dataclass(frozen=True)
class LibraryEvent:
    """Represents a library or smart playlist lifecycle event."""

    event_type: str
    timestamp: str
    sha_id: str | None = None
    payload: dict[str, Any] | None = None


class LibraryEventHub:
    """Thread-safe broadcaster for library events."""

    def __init__(self) -> None:
        self._subscribers: set[queue.Queue[LibraryEvent]] = set()
        self._lock = threading.Lock()

    def subscribe(self, maxsize: int = 200) -> queue.Queue[LibraryEvent]:
        """Register a subscriber queue for events."""
        subscriber: queue.Queue[LibraryEvent] = queue.Queue(maxsize=maxsize)
        with self._lock:
            self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue[LibraryEvent]) -> None:
        """Remove a subscriber queue."""
        with self._lock:
            self._subscribers.discard(subscriber)

    def emit(self, event: LibraryEvent) -> None:
        """Broadcast an event to all subscribers."""
        with self._lock:
            subscribers = list(self._subscribers)

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                try:
                    subscriber.get_nowait()
                    subscriber.put_nowait(event)
                except queue.Empty:
                    continue


_event_hub: LibraryEventHub | None = None


def get_library_event_hub() -> LibraryEventHub:
    """Get the singleton LibraryEventHub instance."""
    global _event_hub
    if _event_hub is None:
        _event_hub = LibraryEventHub()
    return _event_hub


def emit_library_event(
    event_type: str,
    sha_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> LibraryEvent:
    """Emit a library event to the hub."""
    event = LibraryEvent(
        event_type=event_type,
        sha_id=sha_id,
        payload=payload or None,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    get_library_event_hub().emit(event)
    return event


def event_to_payload(event: LibraryEvent) -> dict[str, Any]:
    """Serialize a LibraryEvent for JSON payloads."""
    return asdict(event)
