"""
Statistics Aggregator Service

Handles aggregation and calculation of listening statistics.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.db.connection import get_connection

logger = logging.getLogger(__name__)


def format_duration(ms: int | None) -> str:
    """Format milliseconds to human-readable duration."""
    if not ms:
        return "0m"
    seconds = ms // 1000
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    remaining_minutes = minutes % 60
    if hours < 24:
        return f"{hours}h {remaining_minutes}m"
    days = hours // 24
    remaining_hours = hours % 24
    return f"{days}d {remaining_hours}h"


def parse_period(period: str) -> tuple[datetime, datetime]:
    """
    Convert period string to date range.

    Args:
        period: One of 'week', 'month', 'year', 'all', 'YYYY', or 'YYYY-MM'

    Returns:
        Tuple of (start_datetime, end_datetime)
    """
    now = datetime.now(timezone.utc)

    if period == "week":
        start = now - timedelta(days=7)
        return start, now
    elif period == "month":
        start = now - timedelta(days=30)
        return start, now
    elif period == "year":
        start = now - timedelta(days=365)
        return start, now
    elif period == "all":
        start = datetime.min.replace(tzinfo=timezone.utc)
        return start, now
    elif re.match(r"^\d{4}$", period):
        # Year like "2024"
        year = int(period)
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        return start, end
    elif re.match(r"^\d{4}-\d{2}$", period):
        # Month like "2024-01"
        year, month = map(int, period.split("-"))
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        return start, end
    else:
        # Default to month
        start = now - timedelta(days=30)
        return start, now


class StatsAggregator:
    """Service for aggregating and calculating listening statistics."""

    def get_overview(self, period: str = "month") -> dict[str, Any]:
        """
        Get high-level statistics for a period.

        Args:
            period: Time period (week, month, year, all, YYYY, YYYY-MM)

        Returns:
            Overview statistics dict
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Basic counts
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as total_plays,
                        COUNT(*) FILTER (WHERE completed) as completed_plays,
                        COUNT(DISTINCT sha_id) as unique_songs,
                        COALESCE(SUM(duration_played_ms), 0) as total_duration_ms,
                        ROUND(AVG(completion_percent)::numeric, 2) as avg_completion
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    """,
                    (start, end),
                )
                result = cur.fetchone()
                total_plays = result[0] or 0
                completed_plays = result[1] or 0
                unique_songs = result[2] or 0
                total_duration_ms = result[3] or 0
                avg_completion = float(result[4]) if result[4] else 0

                # Unique artists
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT sa.artist_id)
                    FROM play_sessions ps
                    JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    """,
                    (start, end),
                )
                unique_artists = cur.fetchone()[0] or 0

                # Unique albums
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT s.album)
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    AND s.album IS NOT NULL
                    """,
                    (start, end),
                )
                unique_albums = cur.fetchone()[0] or 0

                # Calculate days in period
                days_in_period = (end - start).days or 1

                # Most active day
                cur.execute(
                    """
                    SELECT DATE(started_at AT TIME ZONE 'UTC') as play_date, COUNT(*) as plays
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY play_date
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                most_active = cur.fetchone()
                most_active_day = str(most_active[0]) if most_active else None

                # Current streak
                cur.execute(
                    """
                    SELECT length_days, start_date, end_date
                    FROM listening_streaks
                    WHERE is_current = TRUE
                    LIMIT 1
                    """,
                )
                streak_result = cur.fetchone()
                current_streak_days = streak_result[0] if streak_result else 0

                # Longest streak
                cur.execute(
                    """
                    SELECT MAX(length_days)
                    FROM listening_streaks
                    """,
                )
                longest_streak = cur.fetchone()
                longest_streak_days = longest_streak[0] if longest_streak and longest_streak[0] else 0

        return {
            "period": period,
            "total_plays": total_plays,
            "completed_plays": completed_plays,
            "total_duration_ms": total_duration_ms,
            "total_duration_formatted": format_duration(total_duration_ms),
            "unique_songs": unique_songs,
            "unique_artists": unique_artists,
            "unique_albums": unique_albums,
            "avg_completion_percent": avg_completion,
            "avg_plays_per_day": round(total_plays / days_in_period, 1),
            "most_active_day": most_active_day,
            "current_streak_days": current_streak_days,
            "longest_streak_days": longest_streak_days,
        }

    def get_top_songs(self, period: str = "month", limit: int = 10) -> dict[str, Any]:
        """
        Get most played songs.

        Args:
            period: Time period
            limit: Maximum number of songs to return

        Returns:
            List of top songs
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        ps.sha_id,
                        s.title,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id,
                        s.album,
                        s.duration_sec,
                        COUNT(*) as play_count,
                        SUM(ps.duration_played_ms) as total_duration_ms,
                        ROUND(AVG(ps.completion_percent)::numeric, 2) as avg_completion
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY ps.sha_id, s.title, a.name, a.artist_id, s.album, s.duration_sec
                    ORDER BY play_count DESC, total_duration_ms DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                )
                rows = cur.fetchall()

        songs = [
            {
                "sha_id": row[0],
                "title": row[1] or "Unknown",
                "artist": row[2],
                "artist_id": row[3],
                "album": row[4],
                "duration_sec": row[5] or 0,
                "play_count": row[6],
                "total_duration_ms": row[7] or 0,
                "avg_completion": float(row[8]) if row[8] else 0,
            }
            for row in rows
        ]

        return {"period": period, "songs": songs}

    def get_top_artists(self, period: str = "month", limit: int = 10) -> dict[str, Any]:
        """
        Get most played artists.

        Args:
            period: Time period
            limit: Maximum number of artists to return

        Returns:
            List of top artists
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        a.artist_id,
                        a.name,
                        COUNT(*) as play_count,
                        COUNT(DISTINCT ps.sha_id) as unique_songs,
                        SUM(ps.duration_played_ms) as total_duration_ms
                    FROM play_sessions ps
                    JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                    JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY a.artist_id, a.name
                    ORDER BY play_count DESC, total_duration_ms DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                )
                rows = cur.fetchall()

        artists = [
            {
                "artist_id": row[0],
                "name": row[1],
                "play_count": row[2],
                "unique_songs": row[3],
                "total_duration_ms": row[4] or 0,
            }
            for row in rows
        ]

        return {"period": period, "artists": artists}

    def get_top_albums(self, period: str = "month", limit: int = 10) -> dict[str, Any]:
        """
        Get most played albums.

        Args:
            period: Time period
            limit: Maximum number of albums to return

        Returns:
            List of top albums
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        s.album,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        COUNT(*) as play_count,
                        COUNT(DISTINCT ps.sha_id) as unique_songs,
                        SUM(ps.duration_played_ms) as total_duration_ms
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    AND s.album IS NOT NULL AND s.album != ''
                    GROUP BY s.album, a.name
                    ORDER BY play_count DESC, total_duration_ms DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                )
                rows = cur.fetchall()

        albums = [
            {
                "album": row[0],
                "artist": row[1],
                "play_count": row[2],
                "unique_songs": row[3],
                "total_duration_ms": row[4] or 0,
            }
            for row in rows
        ]

        return {"period": period, "albums": albums}

    def get_history(self, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        """
        Get paginated play history.

        Args:
            limit: Maximum number of items per page
            offset: Offset for pagination

        Returns:
            Paginated history with total count
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get total count
                cur.execute("SELECT COUNT(*) FROM play_sessions")
                total = cur.fetchone()[0]

                # Get paginated results
                cur.execute(
                    """
                    SELECT
                        ps.session_id,
                        ps.sha_id,
                        s.title,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id,
                        s.album,
                        ps.started_at,
                        ps.duration_played_ms,
                        ps.completed,
                        ps.skipped,
                        ps.context_type,
                        ps.context_id,
                        ps.completion_percent
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    ORDER BY ps.started_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
                rows = cur.fetchall()

        items = [
            {
                "session_id": str(row[0]),
                "sha_id": row[1],
                "title": row[2] or "Unknown",
                "artist": row[3],
                "artist_id": row[4],
                "album": row[5],
                "started_at": row[6].isoformat() if row[6] else None,
                "duration_played_ms": row[7] or 0,
                "completed": row[8],
                "skipped": row[9],
                "context_type": row[10],
                "context_id": row[11],
                "completion_percent": float(row[12]) if row[12] else 0,
            }
            for row in rows
        ]

        return {"total": total, "items": items}

    def get_heatmap(self, year: int | None = None) -> dict[str, Any]:
        """
        Get listening activity by day of week and hour.

        Args:
            year: Year to analyze (defaults to current year)

        Returns:
            Heatmap data with peak/quiet times
        """
        if year is None:
            year = datetime.now(timezone.utc).year

        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        EXTRACT(DOW FROM started_at AT TIME ZONE 'UTC') as day_of_week,
                        EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC') as hour,
                        COUNT(*) as plays
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY day_of_week, hour
                    ORDER BY day_of_week, hour
                    """,
                    (start, end),
                )
                rows = cur.fetchall()

        # Build heatmap data
        data = [
            {"day": int(row[0]), "hour": int(row[1]), "plays": row[2]}
            for row in rows
        ]

        # Find peak and quiet times
        day_totals: dict[int, int] = {}
        hour_totals: dict[int, int] = {}
        for item in data:
            day_totals[item["day"]] = day_totals.get(item["day"], 0) + item["plays"]
            hour_totals[item["hour"]] = hour_totals.get(item["hour"], 0) + item["plays"]

        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        peak_day = max(day_totals, key=day_totals.get) if day_totals else 0
        quiet_day = min(day_totals, key=day_totals.get) if day_totals else 0
        peak_hour = max(hour_totals, key=hour_totals.get) if hour_totals else 0
        quiet_hour = min(hour_totals, key=hour_totals.get) if hour_totals else 0

        return {
            "year": year,
            "data": data,
            "peak_day": day_names[peak_day],
            "peak_hour": peak_hour,
            "quiet_day": day_names[quiet_day],
            "quiet_hour": quiet_hour,
        }

    def get_genre_breakdown(self, period: str = "month") -> dict[str, Any]:
        """
        Get genre distribution for a period.

        Args:
            period: Time period

        Returns:
            Genre breakdown with percentages
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        g.name as genre,
                        COUNT(*) as play_count
                    FROM play_sessions ps
                    JOIN metadata.song_genres sg ON ps.sha_id = sg.sha_id
                    JOIN metadata.genres g ON sg.genre_id = g.genre_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY g.name
                    ORDER BY play_count DESC
                    """,
                    (start, end),
                )
                rows = cur.fetchall()

        total_plays = sum(row[1] for row in rows) or 1
        genres = [
            {
                "genre": row[0],
                "play_count": row[1],
                "percentage": round((row[1] / total_plays) * 100, 1),
            }
            for row in rows
        ]

        return {"period": period, "genres": genres}

    def get_trends(self, period: str = "week") -> dict[str, Any]:
        """
        Compare current period to previous period.

        Args:
            period: Time period (week, month)

        Returns:
            Comparison statistics
        """
        now = datetime.now(timezone.utc)

        if period == "week":
            days = 7
        elif period == "month":
            days = 30
        else:
            days = 7

        current_start = now - timedelta(days=days)
        previous_start = now - timedelta(days=days * 2)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Current period stats
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration,
                        COUNT(DISTINCT sha_id) as songs
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    """,
                    (current_start, now),
                )
                current = cur.fetchone()

                # Previous period stats
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration,
                        COUNT(DISTINCT sha_id) as songs
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    """,
                    (previous_start, current_start),
                )
                previous = cur.fetchone()

                # New songs discovered (first plays in current period)
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT sha_id)
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    AND sha_id NOT IN (
                        SELECT DISTINCT sha_id
                        FROM play_sessions
                        WHERE started_at < %s
                    )
                    """,
                    (current_start, now, current_start),
                )
                new_songs = cur.fetchone()[0] or 0

                # Rising artists (more plays this period)
                cur.execute(
                    """
                    WITH current_plays AS (
                        SELECT a.name, COUNT(*) as plays
                        FROM play_sessions ps
                        JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                        JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        WHERE ps.started_at >= %s AND ps.started_at < %s
                        GROUP BY a.name
                    ),
                    previous_plays AS (
                        SELECT a.name, COUNT(*) as plays
                        FROM play_sessions ps
                        JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                        JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        WHERE ps.started_at >= %s AND ps.started_at < %s
                        GROUP BY a.name
                    )
                    SELECT c.name
                    FROM current_plays c
                    LEFT JOIN previous_plays p ON c.name = p.name
                    WHERE c.plays > COALESCE(p.plays, 0) * 1.5
                    ORDER BY c.plays DESC
                    LIMIT 5
                    """,
                    (current_start, now, previous_start, current_start),
                )
                rising_artists = [row[0] for row in cur.fetchall()]

                # Declining artists (fewer plays this period)
                cur.execute(
                    """
                    WITH current_plays AS (
                        SELECT a.name, COUNT(*) as plays
                        FROM play_sessions ps
                        JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                        JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        WHERE ps.started_at >= %s AND ps.started_at < %s
                        GROUP BY a.name
                    ),
                    previous_plays AS (
                        SELECT a.name, COUNT(*) as plays
                        FROM play_sessions ps
                        JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                        JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        WHERE ps.started_at >= %s AND ps.started_at < %s
                        GROUP BY a.name
                    )
                    SELECT p.name
                    FROM previous_plays p
                    LEFT JOIN current_plays c ON p.name = c.name
                    WHERE COALESCE(c.plays, 0) < p.plays * 0.5
                    ORDER BY p.plays DESC
                    LIMIT 5
                    """,
                    (current_start, now, previous_start, current_start),
                )
                declining_artists = [row[0] for row in cur.fetchall()]

        # Calculate percentage changes
        def pct_change(current_val: int, previous_val: int) -> float:
            if previous_val == 0:
                return 100.0 if current_val > 0 else 0.0
            return round(((current_val - previous_val) / previous_val) * 100, 1)

        return {
            "current_period": f"{current_start.date()} to {now.date()}",
            "previous_period": f"{previous_start.date()} to {current_start.date()}",
            "plays_change": pct_change(current[0], previous[0]),
            "duration_change": pct_change(current[1], previous[1]),
            "new_songs_discovered": new_songs,
            "rising_artists": rising_artists,
            "declining_artists": declining_artists,
        }

    def generate_wrapped(self, year: int) -> dict[str, Any]:
        """
        Generate year-in-review summary.

        Args:
            year: Year to summarize

        Returns:
            Comprehensive year summary
        """
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total stats
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as total_plays,
                        COALESCE(SUM(duration_played_ms), 0) as total_duration_ms,
                        COUNT(DISTINCT sha_id) as unique_songs
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    """,
                    (start, end),
                )
                totals = cur.fetchone()
                total_plays = totals[0] or 0
                total_duration_ms = totals[1] or 0
                unique_songs = totals[2] or 0

                # Unique artists
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT sa.artist_id)
                    FROM play_sessions ps
                    JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    """,
                    (start, end),
                )
                unique_artists = cur.fetchone()[0] or 0

                # Top song
                cur.execute(
                    """
                    SELECT ps.sha_id, s.title, COALESCE(a.name, 'Unknown') as artist, COUNT(*) as plays
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY ps.sha_id, s.title, a.name
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                top_song_row = cur.fetchone()
                top_song = {
                    "sha_id": top_song_row[0],
                    "title": top_song_row[1],
                    "artist": top_song_row[2],
                    "play_count": top_song_row[3],
                } if top_song_row else None

                # Top artist
                cur.execute(
                    """
                    SELECT a.artist_id, a.name, COUNT(*) as plays
                    FROM play_sessions ps
                    JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                    JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY a.artist_id, a.name
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                top_artist_row = cur.fetchone()
                top_artist = {
                    "artist_id": top_artist_row[0],
                    "name": top_artist_row[1],
                    "play_count": top_artist_row[2],
                } if top_artist_row else None

                # Top album
                cur.execute(
                    """
                    SELECT s.album, COALESCE(a.name, 'Unknown') as artist, COUNT(*) as plays
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    AND s.album IS NOT NULL AND s.album != ''
                    GROUP BY s.album, a.name
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                top_album_row = cur.fetchone()
                top_album = {
                    "album": top_album_row[0],
                    "artist": top_album_row[1],
                    "play_count": top_album_row[2],
                } if top_album_row else None

                # Top genre
                cur.execute(
                    """
                    SELECT g.name, COUNT(*) as plays
                    FROM play_sessions ps
                    JOIN metadata.song_genres sg ON ps.sha_id = sg.sha_id
                    JOIN metadata.genres g ON sg.genre_id = g.genre_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY g.name
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                top_genre_row = cur.fetchone()
                top_genre = top_genre_row[0] if top_genre_row else None

                # Listening personality based on peak hour
                heatmap = self.get_heatmap(year)
                peak_hour = heatmap["peak_hour"]
                if 5 <= peak_hour < 9:
                    personality = "Early Bird"
                elif 9 <= peak_hour < 17:
                    personality = "Daytime Listener"
                elif 17 <= peak_hour < 21:
                    personality = "Evening Enthusiast"
                else:
                    personality = "Night Owl"

                # Most replayed day
                cur.execute(
                    """
                    SELECT DATE(started_at AT TIME ZONE 'UTC') as day, COUNT(*) as plays
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY day
                    ORDER BY plays DESC
                    LIMIT 1
                    """,
                    (start, end),
                )
                most_replayed = cur.fetchone()
                most_replayed_day = str(most_replayed[0]) if most_replayed else None

                # Monthly breakdown
                cur.execute(
                    """
                    SELECT
                        EXTRACT(MONTH FROM started_at AT TIME ZONE 'UTC') as month,
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration_ms
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY month
                    ORDER BY month
                    """,
                    (start, end),
                )
                monthly_rows = cur.fetchall()
                monthly_breakdown = [
                    {
                        "month": int(row[0]),
                        "plays": row[1],
                        "duration_ms": row[2],
                    }
                    for row in monthly_rows
                ]

        return {
            "year": year,
            "total_minutes": total_duration_ms // 60000,
            "total_plays": total_plays,
            "unique_songs": unique_songs,
            "unique_artists": unique_artists,
            "top_song": top_song,
            "top_artist": top_artist,
            "top_album": top_album,
            "top_genre": top_genre,
            "listening_personality": personality,
            "most_replayed_day": most_replayed_day,
            "monthly_breakdown": monthly_breakdown,
        }


# Singleton instance
_aggregator: StatsAggregator | None = None


def get_stats_aggregator() -> StatsAggregator:
    """Get the singleton StatsAggregator instance."""
    global _aggregator
    if _aggregator is None:
        _aggregator = StatsAggregator()
    return _aggregator
