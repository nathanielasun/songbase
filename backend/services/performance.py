"""
Performance Optimization Services

Provides batching, caching, and background task scheduling.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable

from backend.db.connection import get_connection

logger = logging.getLogger(__name__)


# ============================================================================
# Event Batching
# ============================================================================

class EventBuffer:
    """
    Buffer for batching play events before database insertion.

    Reduces database load by collecting events and flushing periodically
    or when the buffer reaches a certain size.
    """

    def __init__(
        self,
        flush_interval: float = 5.0,
        max_size: int = 100,
    ):
        """
        Initialize the event buffer.

        Args:
            flush_interval: Seconds between automatic flushes
            max_size: Maximum events before triggering flush
        """
        self.buffer: deque[dict[str, Any]] = deque()
        self.flush_interval = flush_interval
        self.max_size = max_size
        self._lock = threading.Lock()
        self._flush_task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        """Start the background flush task."""
        if self._running:
            return
        self._running = True
        try:
            loop = asyncio.get_running_loop()
            self._flush_task = loop.create_task(self._periodic_flush())
        except RuntimeError:
            # No running event loop - start a background thread instead
            thread = threading.Thread(target=self._sync_periodic_flush, daemon=True)
            thread.start()

    def stop(self) -> None:
        """Stop the background flush task and flush remaining events."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
        self._sync_flush()

    def add_event(self, event: dict[str, Any]) -> None:
        """Add an event to the buffer."""
        with self._lock:
            self.buffer.append(event)
            if len(self.buffer) >= self.max_size:
                self._sync_flush()

    async def _periodic_flush(self) -> None:
        """Async periodic flush loop."""
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self._async_flush()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic flush error: {e}")

    def _sync_periodic_flush(self) -> None:
        """Sync periodic flush loop for thread-based execution."""
        while self._running:
            try:
                time.sleep(self.flush_interval)
                self._sync_flush()
            except Exception as e:
                logger.error(f"Periodic flush error: {e}")

    def _sync_flush(self) -> None:
        """Synchronously flush all buffered events to database."""
        with self._lock:
            if not self.buffer:
                return

            events = list(self.buffer)
            self.buffer.clear()

        if not events:
            return

        try:
            self._bulk_insert_events(events)
            logger.debug(f"Flushed {len(events)} events to database")
        except Exception as e:
            logger.error(f"Failed to flush events: {e}")
            # Re-add events on failure
            with self._lock:
                for event in events:
                    self.buffer.appendleft(event)

    async def _async_flush(self) -> None:
        """Async wrapper for flush."""
        await asyncio.get_event_loop().run_in_executor(None, self._sync_flush)

    def _bulk_insert_events(self, events: list[dict[str, Any]]) -> None:
        """Bulk insert events into play_events table."""
        if not events:
            return

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Use executemany for bulk insert
                cur.executemany(
                    """
                    INSERT INTO play_events (session_id, event_type, position_ms, metadata)
                    VALUES (%(session_id)s, %(event_type)s, %(position_ms)s, %(metadata)s)
                    """,
                    events,
                )
            conn.commit()

    @property
    def pending_count(self) -> int:
        """Get the number of pending events in the buffer."""
        with self._lock:
            return len(self.buffer)


# Singleton buffer instance
_event_buffer: EventBuffer | None = None


def get_event_buffer() -> EventBuffer:
    """Get the singleton event buffer."""
    global _event_buffer
    if _event_buffer is None:
        _event_buffer = EventBuffer()
        _event_buffer.start()
    return _event_buffer


# ============================================================================
# Query Caching
# ============================================================================

class QueryCache:
    """
    Simple in-memory cache for expensive query results.

    Uses TTL-based expiration.
    """

    def __init__(self, default_ttl: float = 60.0):
        """
        Initialize the cache.

        Args:
            default_ttl: Default time-to-live in seconds
        """
        self._cache: dict[str, tuple[Any, float]] = {}
        self._default_ttl = default_ttl
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        """Get a cached value if it exists and hasn't expired."""
        with self._lock:
            if key not in self._cache:
                return None

            value, expires_at = self._cache[key]
            if time.time() > expires_at:
                del self._cache[key]
                return None

            return value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Set a cached value with optional custom TTL."""
        ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.time() + ttl

        with self._lock:
            self._cache[key] = (value, expires_at)

    def delete(self, key: str) -> bool:
        """Delete a cached value."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear all cached values."""
        with self._lock:
            self._cache.clear()

    def cleanup_expired(self) -> int:
        """Remove expired entries. Returns count of removed entries."""
        now = time.time()
        removed = 0

        with self._lock:
            expired_keys = [
                key for key, (_, expires_at) in self._cache.items()
                if now > expires_at
            ]
            for key in expired_keys:
                del self._cache[key]
                removed += 1

        return removed

    @property
    def size(self) -> int:
        """Get the number of cached entries."""
        with self._lock:
            return len(self._cache)


# Singleton cache instance
_query_cache: QueryCache | None = None


def get_query_cache() -> QueryCache:
    """Get the singleton query cache."""
    global _query_cache
    if _query_cache is None:
        _query_cache = QueryCache(default_ttl=60.0)
    return _query_cache


def cached(ttl: float = 60.0, key_prefix: str = "") -> Callable:
    """
    Decorator for caching function results.

    Args:
        ttl: Time-to-live in seconds
        key_prefix: Prefix for cache key

    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Build cache key from function name and arguments
            cache_key = f"{key_prefix}{func.__name__}:{args}:{sorted(kwargs.items())}"
            cache = get_query_cache()

            # Check cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl)
            return result

        return wrapper
    return decorator


# ============================================================================
# Materialized View Refresh
# ============================================================================

class MaterializedViewRefresher:
    """
    Handles scheduling and execution of materialized view refreshes.
    """

    def __init__(self, refresh_interval: float = 300.0):  # 5 minutes default
        """
        Initialize the refresher.

        Args:
            refresh_interval: Seconds between refreshes
        """
        self.refresh_interval = refresh_interval
        self._running = False
        self._last_refresh: datetime | None = None
        self._refresh_task: asyncio.Task | None = None

    def start(self) -> None:
        """Start the background refresh task."""
        if self._running:
            return
        self._running = True
        try:
            loop = asyncio.get_running_loop()
            self._refresh_task = loop.create_task(self._periodic_refresh())
        except RuntimeError:
            # No running event loop - start a background thread instead
            thread = threading.Thread(target=self._sync_periodic_refresh, daemon=True)
            thread.start()

    def stop(self) -> None:
        """Stop the background refresh task."""
        self._running = False
        if self._refresh_task:
            self._refresh_task.cancel()

    def refresh_now(self) -> bool:
        """
        Trigger an immediate refresh of materialized views.

        Returns:
            Success status
        """
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    # Refresh daily listening stats
                    cur.execute("SELECT refresh_daily_listening_stats()")
                conn.commit()

            self._last_refresh = datetime.now(timezone.utc)
            logger.info("Materialized views refreshed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to refresh materialized views: {e}")
            return False

    async def _periodic_refresh(self) -> None:
        """Async periodic refresh loop."""
        while self._running:
            try:
                await asyncio.sleep(self.refresh_interval)
                await asyncio.get_event_loop().run_in_executor(None, self.refresh_now)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic refresh error: {e}")

    def _sync_periodic_refresh(self) -> None:
        """Sync periodic refresh loop for thread-based execution."""
        while self._running:
            try:
                time.sleep(self.refresh_interval)
                self.refresh_now()
            except Exception as e:
                logger.error(f"Periodic refresh error: {e}")

    @property
    def last_refresh(self) -> datetime | None:
        """Get the timestamp of the last successful refresh."""
        return self._last_refresh


# Singleton refresher instance
_view_refresher: MaterializedViewRefresher | None = None


def get_view_refresher() -> MaterializedViewRefresher:
    """Get the singleton materialized view refresher."""
    global _view_refresher
    if _view_refresher is None:
        _view_refresher = MaterializedViewRefresher()
    return _view_refresher


# ============================================================================
# Performance Metrics
# ============================================================================

def get_performance_metrics() -> dict[str, Any]:
    """Get current performance metrics."""
    cache = get_query_cache()
    buffer = get_event_buffer()
    refresher = get_view_refresher()

    return {
        "cache": {
            "size": cache.size,
        },
        "event_buffer": {
            "pending_events": buffer.pending_count,
        },
        "materialized_views": {
            "last_refresh": refresher.last_refresh.isoformat() if refresher.last_refresh else None,
            "refresh_interval_seconds": refresher.refresh_interval,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
