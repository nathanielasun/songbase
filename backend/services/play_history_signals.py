"""
Play History Signals Service

Extracts behavioral signals from play history for enhanced recommendations.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.db.connection import get_connection

logger = logging.getLogger(__name__)


def get_frequently_played_songs(
    min_plays: int = 3,
    days: int = 30,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Get songs that have been played frequently.

    Args:
        min_plays: Minimum number of plays to qualify
        days: Number of days to look back
        limit: Maximum number of songs to return

    Returns:
        List of song dicts with sha_id, play_count, and avg_completion
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    sha_id,
                    COUNT(*) as play_count,
                    ROUND(AVG(completion_percent)::numeric, 2) as avg_completion,
                    COUNT(*) FILTER (WHERE completed) as completed_count
                FROM play_sessions
                WHERE started_at >= %s
                GROUP BY sha_id
                HAVING COUNT(*) >= %s
                ORDER BY play_count DESC, avg_completion DESC
                LIMIT %s
                """,
                (cutoff, min_plays, limit),
            )
            rows = cur.fetchall()

    return [
        {
            "sha_id": row[0],
            "play_count": row[1],
            "avg_completion": float(row[2]) if row[2] else 0,
            "completed_count": row[3],
        }
        for row in rows
    ]


def get_recently_played_songs(
    days: int = 7,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Get recently played songs, prioritizing completed listens.

    Args:
        days: Number of days to look back
        limit: Maximum number of songs to return

    Returns:
        List of song dicts with sha_id, last_played, and completed status
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (sha_id)
                    sha_id,
                    started_at,
                    completed,
                    completion_percent
                FROM play_sessions
                WHERE started_at >= %s
                ORDER BY sha_id, started_at DESC
                """,
                (cutoff,),
            )
            rows = cur.fetchall()

    # Sort by recency and limit
    songs = [
        {
            "sha_id": row[0],
            "last_played": row[1].isoformat() if row[1] else None,
            "completed": row[2],
            "completion_percent": float(row[3]) if row[3] else 0,
        }
        for row in rows
    ]
    songs.sort(key=lambda x: x["last_played"] or "", reverse=True)
    return songs[:limit]


def get_often_skipped_songs(
    min_skips: int = 2,
    days: int = 30,
    max_completion: float = 30.0,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Get songs that are often skipped (low completion rate).

    Args:
        min_skips: Minimum number of skips to qualify
        days: Number of days to look back
        max_completion: Maximum average completion percent to count as skip
        limit: Maximum number of songs to return

    Returns:
        List of song dicts with sha_id, skip_count, and avg_completion
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    sha_id,
                    COUNT(*) FILTER (WHERE skipped OR completion_percent < %s) as skip_count,
                    COUNT(*) as total_plays,
                    ROUND(AVG(completion_percent)::numeric, 2) as avg_completion
                FROM play_sessions
                WHERE started_at >= %s
                GROUP BY sha_id
                HAVING COUNT(*) FILTER (WHERE skipped OR completion_percent < %s) >= %s
                ORDER BY skip_count DESC
                LIMIT %s
                """,
                (max_completion, cutoff, max_completion, min_skips, limit),
            )
            rows = cur.fetchall()

    return [
        {
            "sha_id": row[0],
            "skip_count": row[1],
            "total_plays": row[2],
            "avg_completion": float(row[3]) if row[3] else 0,
        }
        for row in rows
    ]


def get_completed_songs(
    days: int = 30,
    min_completion: float = 80.0,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Get songs that are frequently completed (listened to in full).

    Args:
        days: Number of days to look back
        min_completion: Minimum completion percent to count as completed
        limit: Maximum number of songs to return

    Returns:
        List of song dicts with sha_id, completed_count, and total_plays
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    sha_id,
                    COUNT(*) FILTER (WHERE completed OR completion_percent >= %s) as completed_count,
                    COUNT(*) as total_plays,
                    ROUND(AVG(completion_percent)::numeric, 2) as avg_completion
                FROM play_sessions
                WHERE started_at >= %s
                GROUP BY sha_id
                HAVING COUNT(*) FILTER (WHERE completed OR completion_percent >= %s) > 0
                ORDER BY completed_count DESC, avg_completion DESC
                LIMIT %s
                """,
                (min_completion, cutoff, min_completion, limit),
            )
            rows = cur.fetchall()

    return [
        {
            "sha_id": row[0],
            "completed_count": row[1],
            "total_plays": row[2],
            "avg_completion": float(row[3]) if row[3] else 0,
        }
        for row in rows
    ]


def get_listening_context_preferences(days: int = 30) -> dict[str, list[str]]:
    """
    Get songs grouped by listening context (radio, playlist, album, etc.).

    Args:
        days: Number of days to look back

    Returns:
        Dict mapping context_type to list of sha_ids
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(context_type, 'unknown') as context,
                    sha_id,
                    COUNT(*) as plays
                FROM play_sessions
                WHERE started_at >= %s
                GROUP BY context_type, sha_id
                ORDER BY context, plays DESC
                """,
                (cutoff,),
            )
            rows = cur.fetchall()

    context_songs: dict[str, list[str]] = {}
    for row in rows:
        context = row[0]
        sha_id = row[1]
        if context not in context_songs:
            context_songs[context] = []
        context_songs[context].append(sha_id)

    return context_songs


def calculate_implicit_preference_score(sha_id: str, days: int = 30) -> float:
    """
    Calculate an implicit preference score for a song based on play history.

    Score is based on:
    - Play frequency (weight: 0.4)
    - Completion rate (weight: 0.4)
    - Recency (weight: 0.2)

    Args:
        sha_id: Song SHA ID
        days: Number of days to look back

    Returns:
        Score between 0 and 1
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    now = datetime.now(timezone.utc)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) as play_count,
                    AVG(completion_percent) as avg_completion,
                    MAX(started_at) as last_played
                FROM play_sessions
                WHERE sha_id = %s AND started_at >= %s
                """,
                (sha_id, cutoff),
            )
            row = cur.fetchone()

    if not row or not row[0]:
        return 0.0

    play_count = row[0]
    avg_completion = float(row[1]) if row[1] else 0
    last_played = row[2]

    # Normalize play count (assume 10+ plays is max)
    frequency_score = min(play_count / 10.0, 1.0)

    # Completion score (0-100 -> 0-1)
    completion_score = avg_completion / 100.0

    # Recency score (decays over time)
    if last_played:
        days_since = (now - last_played).days
        recency_score = max(0, 1.0 - (days_since / days))
    else:
        recency_score = 0

    # Weighted combination
    return (0.4 * frequency_score) + (0.4 * completion_score) + (0.2 * recency_score)
