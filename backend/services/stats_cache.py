"""
Stats Caching Service

Provides in-memory caching for expensive stats aggregation queries with TTL-based
expiration and selective cache invalidation.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class CacheEntry:
    """A single cache entry with TTL tracking."""

    value: Any
    expires_at: float
    created_at: float = field(default_factory=time.time)

    def is_expired(self) -> bool:
        """Check if this entry has expired."""
        return time.time() > self.expires_at


class StatsCache:
    """
    Thread-safe in-memory cache for stats data with TTL support.

    Features:
    - Configurable TTL per cache key pattern
    - Pattern-based cache invalidation
    - Thread-safe operations
    - Automatic cleanup of expired entries
    - Hit/miss tracking for monitoring
    """

    # Default TTL values in seconds
    DEFAULT_TTL = 300  # 5 minutes
    TTL_SHORT = 60  # 1 minute for frequently changing data
    TTL_MEDIUM = 300  # 5 minutes for moderate change rate
    TTL_LONG = 3600  # 1 hour for stable data
    TTL_VERY_LONG = 86400  # 24 hours for rarely changing data

    # TTL configuration by key pattern
    TTL_CONFIG: dict[str, int] = {
        # Frequently changing (1 minute)
        "overview:": TTL_SHORT,
        "history:": TTL_SHORT,
        "daily_activity:": TTL_SHORT,
        # Moderate change rate (5 minutes)
        "top_songs:": TTL_MEDIUM,
        "top_artists:": TTL_MEDIUM,
        "top_albums:": TTL_MEDIUM,
        "heatmap:": TTL_MEDIUM,
        "genres:": TTL_MEDIUM,
        "trends:": TTL_MEDIUM,
        "listening_timeline:": TTL_MEDIUM,
        "completion_trend:": TTL_MEDIUM,
        "skip_analysis:": TTL_MEDIUM,
        "context_distribution:": TTL_MEDIUM,
        "listening_sessions:": TTL_MEDIUM,
        "discoveries:": TTL_MEDIUM,
        # Slower changing (1 hour)
        "library_stats:": TTL_LONG,
        "library_growth:": TTL_LONG,
        "library_composition:": TTL_LONG,
        "audio_features:": TTL_LONG,
        "feature_correlations:": TTL_LONG,
        "key_distribution:": TTL_LONG,
        "mood_distribution:": TTL_LONG,
        "unplayed_songs:": TTL_LONG,
        "one_hit_wonders:": TTL_LONG,
        "hidden_gems:": TTL_LONG,
        # Very stable (24 hours)
        "wrapped:": TTL_VERY_LONG,
    }

    def __init__(self, max_size: int = 1000) -> None:
        """
        Initialize the stats cache.

        Args:
            max_size: Maximum number of entries to keep in cache
        """
        self._cache: dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self._max_size = max_size
        self._hits = 0
        self._misses = 0
        self._last_cleanup = time.time()
        self._cleanup_interval = 60  # Cleanup every 60 seconds

    def _get_ttl(self, key: str) -> int:
        """Get TTL for a given key based on pattern matching."""
        for pattern, ttl in self.TTL_CONFIG.items():
            if key.startswith(pattern):
                return ttl
        return self.DEFAULT_TTL

    def _maybe_cleanup(self) -> None:
        """Perform periodic cleanup of expired entries."""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        self._last_cleanup = now
        expired_keys = [k for k, v in self._cache.items() if v.is_expired()]
        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    def _evict_if_needed(self) -> None:
        """Evict oldest entries if cache is too large."""
        if len(self._cache) < self._max_size:
            return

        # Remove oldest 10% of entries
        entries_to_remove = max(1, self._max_size // 10)
        sorted_entries = sorted(
            self._cache.items(), key=lambda x: x[1].created_at
        )
        for key, _ in sorted_entries[:entries_to_remove]:
            del self._cache[key]

        logger.debug(f"Evicted {entries_to_remove} cache entries due to size limit")

    def get(self, key: str) -> tuple[bool, Any]:
        """
        Get a value from cache.

        Args:
            key: Cache key

        Returns:
            Tuple of (hit: bool, value: Any)
        """
        with self._lock:
            self._maybe_cleanup()

            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return False, None

            if entry.is_expired():
                del self._cache[key]
                self._misses += 1
                return False, None

            self._hits += 1
            return True, entry.value

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """
        Set a value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Optional TTL override in seconds
        """
        with self._lock:
            self._evict_if_needed()

            actual_ttl = ttl if ttl is not None else self._get_ttl(key)
            self._cache[key] = CacheEntry(
                value=value,
                expires_at=time.time() + actual_ttl,
            )

    def delete(self, key: str) -> bool:
        """
        Delete a specific key from cache.

        Args:
            key: Cache key to delete

        Returns:
            True if key was found and deleted
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching a pattern.

        Args:
            pattern: Key prefix pattern to match

        Returns:
            Number of keys invalidated
        """
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(pattern)]
            for key in keys_to_delete:
                del self._cache[key]
            if keys_to_delete:
                logger.info(f"Invalidated {len(keys_to_delete)} cache entries matching '{pattern}'")
            return len(keys_to_delete)

    def invalidate_all(self) -> int:
        """
        Clear the entire cache.

        Returns:
            Number of entries cleared
        """
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            logger.info(f"Cleared entire stats cache ({count} entries)")
            return count

    def invalidate_on_play(self) -> None:
        """
        Invalidate cache entries that should refresh after a new play.

        Called when a play session is recorded.
        """
        patterns = [
            "overview:",
            "history:",
            "daily_activity:",
            "top_songs:",
            "top_artists:",
            "top_albums:",
            "heatmap:",
            "trends:",
            "listening_timeline:",
            "completion_trend:",
            "skip_analysis:",
            "context_distribution:",
            "listening_sessions:",
            "discoveries:",
            "unplayed_songs:",
            "one_hit_wonders:",
            "hidden_gems:",
        ]
        total = 0
        for pattern in patterns:
            total += self.invalidate_pattern(pattern)
        if total:
            logger.debug(f"Invalidated {total} cache entries on play event")

    def invalidate_on_library_change(self) -> None:
        """
        Invalidate cache entries that should refresh after library changes.

        Called when songs are added, removed, or modified.
        """
        patterns = [
            "library_stats:",
            "library_growth:",
            "library_composition:",
            "audio_features:",
            "feature_correlations:",
            "key_distribution:",
            "mood_distribution:",
            "unplayed_songs:",
            "genres:",
        ]
        total = 0
        for pattern in patterns:
            total += self.invalidate_pattern(pattern)
        if total:
            logger.debug(f"Invalidated {total} cache entries on library change")

    def get_stats(self) -> dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dict with hit/miss counts and ratios
        """
        with self._lock:
            total = self._hits + self._misses
            hit_ratio = self._hits / total if total > 0 else 0
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_ratio": round(hit_ratio, 4),
                "total_requests": total,
            }


def make_cache_key(*args: Any, **kwargs: Any) -> str:
    """
    Generate a cache key from function arguments.

    Args:
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        A unique cache key string
    """
    key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True, default=str)
    return hashlib.md5(key_data.encode()).hexdigest()[:16]


def cached(prefix: str, ttl: int | None = None):
    """
    Decorator to cache function results.

    Args:
        prefix: Cache key prefix (e.g., "overview")
        ttl: Optional TTL override in seconds

    Example:
        @cached("overview")
        def get_overview(self, period: str):
            ...
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        def wrapper(self, *args: Any, **kwargs: Any) -> T:
            cache = get_stats_cache()
            key = f"{prefix}:{make_cache_key(*args, **kwargs)}"

            hit, value = cache.get(key)
            if hit:
                logger.debug(f"Cache hit for {prefix}")
                return value

            logger.debug(f"Cache miss for {prefix}, computing...")
            result = func(self, *args, **kwargs)
            cache.set(key, result, ttl)
            return result

        return wrapper

    return decorator


# Singleton instance
_stats_cache: StatsCache | None = None


def get_stats_cache() -> StatsCache:
    """Get the singleton StatsCache instance."""
    global _stats_cache
    if _stats_cache is None:
        _stats_cache = StatsCache()
    return _stats_cache


def invalidate_stats_on_play() -> None:
    """Convenience function to invalidate stats after a play event."""
    get_stats_cache().invalidate_on_play()


def invalidate_stats_on_library_change() -> None:
    """Convenience function to invalidate stats after library changes."""
    get_stats_cache().invalidate_on_library_change()
