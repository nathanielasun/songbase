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
from backend.services.stats_cache import cached

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

    @cached("overview")
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

    @cached("top_songs")
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

    @cached("top_artists")
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

    @cached("top_albums")
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

    @cached("heatmap")
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

    @cached("library_stats")
    def get_library_stats(self) -> dict[str, Any]:
        """
        Get comprehensive library statistics.

        Returns:
            Dict with total_songs, total_albums, total_artists, total_duration,
            avg_song_length, songs_by_decade, songs_by_year, storage_size
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Basic counts
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as total_songs,
                        COUNT(DISTINCT album) FILTER (WHERE album IS NOT NULL AND album != '') as total_albums,
                        COALESCE(SUM(duration_sec), 0) as total_duration_sec,
                        ROUND(AVG(duration_sec)::numeric, 1) as avg_song_length_sec,
                        MIN(duration_sec) as shortest_song_sec,
                        MAX(duration_sec) as longest_song_sec
                    FROM metadata.songs
                    """
                )
                result = cur.fetchone()
                total_songs = result[0] or 0
                total_albums = result[1] or 0
                total_duration_sec = result[2] or 0
                avg_song_length_sec = float(result[3]) if result[3] else 0
                shortest_song_sec = result[4] or 0
                longest_song_sec = result[5] or 0

                # Total unique artists
                cur.execute("SELECT COUNT(*) FROM metadata.artists")
                total_artists = cur.fetchone()[0] or 0

                # Storage size from song_files
                cur.execute(
                    """
                    SELECT COALESCE(SUM(file_size), 0) as total_size
                    FROM metadata.song_files
                    """
                )
                storage_bytes = cur.fetchone()[0] or 0

                # Songs by decade
                cur.execute(
                    """
                    SELECT
                        FLOOR(release_year / 10) * 10 as decade,
                        COUNT(*) as count
                    FROM metadata.songs
                    WHERE release_year IS NOT NULL AND release_year >= 1900
                    GROUP BY decade
                    ORDER BY decade
                    """
                )
                songs_by_decade = [
                    {"decade": int(row[0]), "count": row[1]}
                    for row in cur.fetchall()
                ]

                # Songs by year (recent years)
                cur.execute(
                    """
                    SELECT
                        release_year,
                        COUNT(*) as count
                    FROM metadata.songs
                    WHERE release_year IS NOT NULL AND release_year >= 1900
                    GROUP BY release_year
                    ORDER BY release_year
                    """
                )
                songs_by_year = [
                    {"year": row[0], "count": row[1]}
                    for row in cur.fetchall()
                ]

                # Get release year span
                cur.execute(
                    """
                    SELECT MIN(release_year), MAX(release_year)
                    FROM metadata.songs
                    WHERE release_year IS NOT NULL AND release_year >= 1900
                    """
                )
                year_span = cur.fetchone()
                earliest_year = year_span[0] if year_span else None
                latest_year = year_span[1] if year_span else None

                # Longest and shortest songs with details
                cur.execute(
                    """
                    SELECT s.sha_id, s.title, COALESCE(a.name, 'Unknown Artist') as artist, s.duration_sec
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE s.duration_sec = (SELECT MAX(duration_sec) FROM metadata.songs WHERE duration_sec IS NOT NULL)
                    LIMIT 1
                    """
                )
                longest_song_row = cur.fetchone()
                longest_song = {
                    "sha_id": longest_song_row[0],
                    "title": longest_song_row[1],
                    "artist": longest_song_row[2],
                    "duration_sec": longest_song_row[3],
                } if longest_song_row else None

                cur.execute(
                    """
                    SELECT s.sha_id, s.title, COALESCE(a.name, 'Unknown Artist') as artist, s.duration_sec
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE s.duration_sec = (SELECT MIN(duration_sec) FROM metadata.songs WHERE duration_sec IS NOT NULL AND duration_sec > 0)
                    LIMIT 1
                    """
                )
                shortest_song_row = cur.fetchone()
                shortest_song = {
                    "sha_id": shortest_song_row[0],
                    "title": shortest_song_row[1],
                    "artist": shortest_song_row[2],
                    "duration_sec": shortest_song_row[3],
                } if shortest_song_row else None

                # Most prolific artist
                cur.execute(
                    """
                    SELECT a.name, COUNT(DISTINCT sa.sha_id) as song_count
                    FROM metadata.artists a
                    JOIN metadata.song_artists sa ON a.artist_id = sa.artist_id
                    GROUP BY a.artist_id, a.name
                    ORDER BY song_count DESC
                    LIMIT 1
                    """
                )
                prolific_row = cur.fetchone()
                most_prolific_artist = {
                    "name": prolific_row[0],
                    "song_count": prolific_row[1],
                } if prolific_row else None

        # Calculate derived values
        total_duration_ms = total_duration_sec * 1000
        decades_spanned = len(songs_by_decade)

        return {
            "total_songs": total_songs,
            "total_albums": total_albums,
            "total_artists": total_artists,
            "total_duration_sec": total_duration_sec,
            "total_duration_formatted": format_duration(total_duration_ms),
            "avg_song_length_sec": avg_song_length_sec,
            "avg_song_length_formatted": format_duration(int(avg_song_length_sec * 1000)),
            "storage_bytes": storage_bytes,
            "storage_formatted": self._format_storage_size(storage_bytes),
            "songs_by_decade": songs_by_decade,
            "songs_by_year": songs_by_year,
            "earliest_year": earliest_year,
            "latest_year": latest_year,
            "decades_spanned": decades_spanned,
            "longest_song": longest_song,
            "shortest_song": shortest_song,
            "most_prolific_artist": most_prolific_artist,
        }

    def get_library_growth(self, period: str = "year") -> dict[str, Any]:
        """
        Get library growth over time.

        Args:
            period: Grouping period - 'day', 'week', 'month', or 'year'

        Returns:
            Dict with time series of library additions
        """
        # Determine date truncation based on period
        if period == "day":
            trunc = "day"
        elif period == "week":
            trunc = "week"
        elif period == "month":
            trunc = "month"
        else:
            trunc = "month"  # Default to month

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT
                        DATE_TRUNC('{trunc}', created_at) as period_start,
                        COUNT(*) as songs_added,
                        SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('{trunc}', created_at)) as cumulative_total
                    FROM metadata.songs
                    GROUP BY DATE_TRUNC('{trunc}', created_at)
                    ORDER BY period_start
                    """
                )
                rows = cur.fetchall()

        data = [
            {
                "date": row[0].isoformat() if row[0] else None,
                "songs_added": row[1],
                "cumulative_total": row[2],
            }
            for row in rows
        ]

        return {
            "period": period,
            "data": data,
            "total_periods": len(data),
        }

    def get_library_composition(self) -> dict[str, Any]:
        """
        Get library composition breakdown.

        Returns:
            Dict with breakdowns by source, verification status, and audio features
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total songs for percentages
                cur.execute("SELECT COUNT(*) FROM metadata.songs")
                total_songs = cur.fetchone()[0] or 1  # Avoid division by zero

                # Breakdown by ingestion source
                cur.execute(
                    """
                    SELECT
                        COALESCE(sf.ingestion_source, 'unknown') as source,
                        COUNT(DISTINCT s.sha_id) as count
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_files sf ON s.sha_id = sf.sha_id
                    GROUP BY sf.ingestion_source
                    ORDER BY count DESC
                    """
                )
                by_source = [
                    {
                        "source": row[0],
                        "count": row[1],
                        "percentage": round((row[1] / total_songs) * 100, 1),
                    }
                    for row in cur.fetchall()
                ]

                # Verified vs unverified
                cur.execute(
                    """
                    SELECT
                        verified,
                        COUNT(*) as count
                    FROM metadata.songs
                    GROUP BY verified
                    """
                )
                verification_rows = cur.fetchall()
                verified_count = 0
                unverified_count = 0
                for row in verification_rows:
                    if row[0]:
                        verified_count = row[1]
                    else:
                        unverified_count = row[1]

                by_verification = {
                    "verified": {
                        "count": verified_count,
                        "percentage": round((verified_count / total_songs) * 100, 1),
                    },
                    "unverified": {
                        "count": unverified_count,
                        "percentage": round((unverified_count / total_songs) * 100, 1),
                    },
                }

                # With vs without audio features
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT sha_id) FROM metadata.audio_features
                    """
                )
                with_features = cur.fetchone()[0] or 0
                without_features = total_songs - with_features

                by_audio_features = {
                    "with_features": {
                        "count": with_features,
                        "percentage": round((with_features / total_songs) * 100, 1),
                    },
                    "without_features": {
                        "count": without_features,
                        "percentage": round((without_features / total_songs) * 100, 1),
                    },
                }

                # With vs without release year
                cur.execute(
                    """
                    SELECT
                        CASE WHEN release_year IS NOT NULL THEN true ELSE false END as has_year,
                        COUNT(*) as count
                    FROM metadata.songs
                    GROUP BY has_year
                    """
                )
                year_rows = cur.fetchall()
                with_year = 0
                without_year = 0
                for row in year_rows:
                    if row[0]:
                        with_year = row[1]
                    else:
                        without_year = row[1]

                by_release_year = {
                    "with_year": {
                        "count": with_year,
                        "percentage": round((with_year / total_songs) * 100, 1),
                    },
                    "without_year": {
                        "count": without_year,
                        "percentage": round((without_year / total_songs) * 100, 1),
                    },
                }

                # With vs without album info
                cur.execute(
                    """
                    SELECT
                        CASE WHEN album IS NOT NULL AND album != '' THEN true ELSE false END as has_album,
                        COUNT(*) as count
                    FROM metadata.songs
                    GROUP BY has_album
                    """
                )
                album_rows = cur.fetchall()
                with_album = 0
                without_album = 0
                for row in album_rows:
                    if row[0]:
                        with_album = row[1]
                    else:
                        without_album = row[1]

                by_album = {
                    "with_album": {
                        "count": with_album,
                        "percentage": round((with_album / total_songs) * 100, 1),
                    },
                    "without_album": {
                        "count": without_album,
                        "percentage": round((without_album / total_songs) * 100, 1),
                    },
                }

        return {
            "total_songs": total_songs,
            "by_source": by_source,
            "by_verification": by_verification,
            "by_audio_features": by_audio_features,
            "by_release_year": by_release_year,
            "by_album": by_album,
        }

    def _format_storage_size(self, size_bytes: int) -> str:
        """Format bytes to human-readable size."""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"

    @cached("audio_features")
    def get_audio_feature_stats(self) -> dict[str, Any]:
        """
        Get distribution statistics for audio features.

        Returns:
            Feature distributions with min, max, avg, median, and histogram buckets.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get basic statistics for all audio features
                cur.execute(
                    """
                    SELECT
                        COUNT(*) as total_analyzed,
                        MIN(bpm) as bpm_min,
                        MAX(bpm) as bpm_max,
                        AVG(bpm) as bpm_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bpm) as bpm_median,
                        MIN(energy) as energy_min,
                        MAX(energy) as energy_max,
                        AVG(energy) as energy_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY energy) as energy_median,
                        MIN(danceability) as danceability_min,
                        MAX(danceability) as danceability_max,
                        AVG(danceability) as danceability_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY danceability) as danceability_median,
                        MIN(acousticness) as acousticness_min,
                        MAX(acousticness) as acousticness_max,
                        AVG(acousticness) as acousticness_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY acousticness) as acousticness_median,
                        MIN(instrumentalness) as instrumentalness_min,
                        MAX(instrumentalness) as instrumentalness_max,
                        AVG(instrumentalness) as instrumentalness_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY instrumentalness) as instrumentalness_median,
                        MIN(speechiness) as speechiness_min,
                        MAX(speechiness) as speechiness_max,
                        AVG(speechiness) as speechiness_avg,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY speechiness) as speechiness_median
                    FROM metadata.audio_features
                    WHERE bpm IS NOT NULL OR energy IS NOT NULL
                    """
                )
                stats = cur.fetchone()

                # BPM distribution buckets
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN bpm < 80 THEN '60-80'
                            WHEN bpm < 100 THEN '80-100'
                            WHEN bpm < 120 THEN '100-120'
                            WHEN bpm < 140 THEN '120-140'
                            WHEN bpm < 160 THEN '140-160'
                            ELSE '160+'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE bpm IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(bpm)
                    """
                )
                bpm_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

                # Energy distribution (0-100 scale, buckets of 20)
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN energy < 20 THEN '0-20'
                            WHEN energy < 40 THEN '20-40'
                            WHEN energy < 60 THEN '40-60'
                            WHEN energy < 80 THEN '60-80'
                            ELSE '80-100'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE energy IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(energy)
                    """
                )
                energy_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

                # Danceability distribution
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN danceability < 20 THEN '0-20'
                            WHEN danceability < 40 THEN '20-40'
                            WHEN danceability < 60 THEN '40-60'
                            WHEN danceability < 80 THEN '60-80'
                            ELSE '80-100'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE danceability IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(danceability)
                    """
                )
                danceability_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

                # Acousticness distribution
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN acousticness < 20 THEN '0-20'
                            WHEN acousticness < 40 THEN '20-40'
                            WHEN acousticness < 60 THEN '40-60'
                            WHEN acousticness < 80 THEN '60-80'
                            ELSE '80-100'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE acousticness IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(acousticness)
                    """
                )
                acousticness_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

                # Instrumentalness distribution
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN instrumentalness < 20 THEN '0-20'
                            WHEN instrumentalness < 40 THEN '20-40'
                            WHEN instrumentalness < 60 THEN '40-60'
                            WHEN instrumentalness < 80 THEN '60-80'
                            ELSE '80-100'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE instrumentalness IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(instrumentalness)
                    """
                )
                instrumentalness_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

                # Speechiness distribution
                cur.execute(
                    """
                    SELECT
                        CASE
                            WHEN speechiness < 20 THEN '0-20'
                            WHEN speechiness < 40 THEN '20-40'
                            WHEN speechiness < 60 THEN '40-60'
                            WHEN speechiness < 80 THEN '60-80'
                            ELSE '80-100'
                        END as range,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE speechiness IS NOT NULL
                    GROUP BY range
                    ORDER BY MIN(speechiness)
                    """
                )
                speechiness_distribution = [
                    {"range": row[0], "count": row[1]} for row in cur.fetchall()
                ]

        def safe_float(val: Any) -> float | None:
            return round(float(val), 2) if val is not None else None

        return {
            "total_analyzed": stats[0] or 0,
            "bpm": {
                "min": safe_float(stats[1]),
                "max": safe_float(stats[2]),
                "avg": safe_float(stats[3]),
                "median": safe_float(stats[4]),
                "distribution": bpm_distribution,
            },
            "energy": {
                "min": safe_float(stats[5]),
                "max": safe_float(stats[6]),
                "avg": safe_float(stats[7]),
                "median": safe_float(stats[8]),
                "distribution": energy_distribution,
            },
            "danceability": {
                "min": safe_float(stats[9]),
                "max": safe_float(stats[10]),
                "avg": safe_float(stats[11]),
                "median": safe_float(stats[12]),
                "distribution": danceability_distribution,
            },
            "acousticness": {
                "min": safe_float(stats[13]),
                "max": safe_float(stats[14]),
                "avg": safe_float(stats[15]),
                "median": safe_float(stats[16]),
                "distribution": acousticness_distribution,
            },
            "instrumentalness": {
                "min": safe_float(stats[17]),
                "max": safe_float(stats[18]),
                "avg": safe_float(stats[19]),
                "median": safe_float(stats[20]),
                "distribution": instrumentalness_distribution,
            },
            "speechiness": {
                "min": safe_float(stats[21]),
                "max": safe_float(stats[22]),
                "avg": safe_float(stats[23]),
                "median": safe_float(stats[24]),
                "distribution": speechiness_distribution,
            },
        }

    @cached("feature_correlations")
    def get_feature_correlations(self) -> dict[str, Any]:
        """
        Get correlation matrix between audio features.

        Returns:
            Correlation coefficients and scatter plot data.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Calculate Pearson correlations between features
                cur.execute(
                    """
                    SELECT
                        CORR(bpm, energy) as bpm_energy,
                        CORR(bpm, danceability) as bpm_danceability,
                        CORR(bpm, acousticness) as bpm_acousticness,
                        CORR(energy, danceability) as energy_danceability,
                        CORR(energy, acousticness) as energy_acousticness,
                        CORR(danceability, acousticness) as danceability_acousticness,
                        CORR(energy, instrumentalness) as energy_instrumentalness,
                        CORR(danceability, instrumentalness) as danceability_instrumentalness,
                        CORR(acousticness, instrumentalness) as acousticness_instrumentalness,
                        CORR(energy, speechiness) as energy_speechiness,
                        CORR(danceability, speechiness) as danceability_speechiness
                    FROM metadata.audio_features
                    WHERE bpm IS NOT NULL
                      AND energy IS NOT NULL
                      AND danceability IS NOT NULL
                    """
                )
                corr = cur.fetchone()

                # Sample data for scatter plots (limit for performance)
                cur.execute(
                    """
                    SELECT sha_id, bpm, energy, danceability, acousticness
                    FROM metadata.audio_features
                    WHERE bpm IS NOT NULL
                      AND energy IS NOT NULL
                      AND danceability IS NOT NULL
                    ORDER BY RANDOM()
                    LIMIT 500
                    """
                )
                scatter_data = [
                    {
                        "sha_id": row[0],
                        "bpm": float(row[1]) if row[1] else None,
                        "energy": float(row[2]) if row[2] else None,
                        "danceability": float(row[3]) if row[3] else None,
                        "acousticness": float(row[4]) if row[4] else None,
                    }
                    for row in cur.fetchall()
                ]

        def safe_round(val: Any) -> float | None:
            return round(float(val), 3) if val is not None else None

        # Build correlation matrix
        features = ["bpm", "energy", "danceability", "acousticness", "instrumentalness", "speechiness"]
        correlations = {
            "bpm_energy": safe_round(corr[0]),
            "bpm_danceability": safe_round(corr[1]),
            "bpm_acousticness": safe_round(corr[2]),
            "energy_danceability": safe_round(corr[3]),
            "energy_acousticness": safe_round(corr[4]),
            "danceability_acousticness": safe_round(corr[5]),
            "energy_instrumentalness": safe_round(corr[6]),
            "danceability_instrumentalness": safe_round(corr[7]),
            "acousticness_instrumentalness": safe_round(corr[8]),
            "energy_speechiness": safe_round(corr[9]),
            "danceability_speechiness": safe_round(corr[10]),
        }

        return {
            "features": features,
            "correlations": correlations,
            "scatter_sample": scatter_data,
        }

    @cached("key_distribution")
    def get_key_distribution(self) -> dict[str, Any]:
        """
        Get distribution of musical keys in the library.

        Returns:
            Songs by key with mode (major/minor) and Camelot notation.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Key distribution with mode
                cur.execute(
                    """
                    SELECT
                        key,
                        key_mode,
                        key_camelot,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE key IS NOT NULL
                    GROUP BY key, key_mode, key_camelot
                    ORDER BY count DESC
                    """
                )
                keys = cur.fetchall()

                # Total count for percentage
                total = sum(row[3] for row in keys) or 1

                # Separate major vs minor counts
                cur.execute(
                    """
                    SELECT
                        key_mode,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE key IS NOT NULL AND key_mode IS NOT NULL
                    GROUP BY key_mode
                    ORDER BY count DESC
                    """
                )
                mode_totals = {row[0]: row[1] for row in cur.fetchall()}

        key_distribution = [
            {
                "key": row[0],
                "mode": row[1],
                "camelot": row[2],
                "count": row[3],
                "percentage": round((row[3] / total) * 100, 1),
            }
            for row in keys
        ]

        return {
            "total_with_key": total,
            "keys": key_distribution,
            "mode_breakdown": {
                "major": mode_totals.get("major", 0),
                "minor": mode_totals.get("minor", 0),
            },
        }

    @cached("mood_distribution")
    def get_mood_distribution(self) -> dict[str, Any]:
        """
        Get distribution of moods in the library.

        Returns:
            Primary and secondary mood breakdown with audio feature averages.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Primary mood distribution
                cur.execute(
                    """
                    SELECT
                        mood_primary,
                        COUNT(*) as count,
                        AVG(energy) as avg_energy,
                        AVG(danceability) as avg_danceability,
                        AVG(bpm) as avg_bpm
                    FROM metadata.audio_features
                    WHERE mood_primary IS NOT NULL
                    GROUP BY mood_primary
                    ORDER BY count DESC
                    """
                )
                primary_moods = cur.fetchall()

                # Total count for percentage
                total = sum(row[1] for row in primary_moods) or 1

                # Secondary mood distribution
                cur.execute(
                    """
                    SELECT
                        mood_secondary,
                        COUNT(*) as count
                    FROM metadata.audio_features
                    WHERE mood_secondary IS NOT NULL
                    GROUP BY mood_secondary
                    ORDER BY count DESC
                    """
                )
                secondary_moods = cur.fetchall()

                secondary_total = sum(row[1] for row in secondary_moods) or 1

        mood_distribution = [
            {
                "mood": row[0],
                "count": row[1],
                "percentage": round((row[1] / total) * 100, 1),
                "avg_energy": round(float(row[2]), 1) if row[2] else None,
                "avg_danceability": round(float(row[3]), 1) if row[3] else None,
                "avg_bpm": round(float(row[4]), 1) if row[4] else None,
            }
            for row in primary_moods
        ]

        secondary_distribution = [
            {
                "mood": row[0],
                "count": row[1],
                "percentage": round((row[1] / secondary_total) * 100, 1),
            }
            for row in secondary_moods
        ]

        return {
            "total_with_mood": total,
            "primary_moods": mood_distribution,
            "secondary_moods": secondary_distribution,
        }

    def get_listening_timeline(
        self, period: str = "month", granularity: str = "day"
    ) -> dict[str, Any]:
        """
        Get listening activity timeline.

        Args:
            period: Time range (week, month, year, all)
            granularity: Grouping (hour, day, week, month)

        Returns:
            Time series of plays and duration with comparison data.
        """
        start, end = parse_period(period)

        # Determine date truncation
        trunc = "day" if granularity in ["hour", "day"] else granularity

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Current period data
                cur.execute(
                    f"""
                    SELECT
                        DATE_TRUNC('{trunc}', started_at) as period_start,
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration_ms,
                        COUNT(*) FILTER (WHERE completed) as completed,
                        ROUND(AVG(completion_percent)::numeric, 1) as avg_completion
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY DATE_TRUNC('{trunc}', started_at)
                    ORDER BY period_start
                    """,
                    (start, end),
                )
                current_data = cur.fetchall()

                # Previous period data for comparison
                period_length = end - start
                prev_start = start - period_length
                prev_end = start

                cur.execute(
                    f"""
                    SELECT
                        DATE_TRUNC('{trunc}', started_at + INTERVAL '%s days') as period_start,
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration_ms
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY DATE_TRUNC('{trunc}', started_at + INTERVAL '%s days')
                    ORDER BY period_start
                    """,
                    (period_length.days, prev_start, prev_end, period_length.days),
                )
                previous_data = {row[0]: {"plays": row[1], "duration_ms": row[2]} for row in cur.fetchall()}

        # Build timeline with comparison
        timeline = []
        for row in current_data:
            date = row[0]
            prev = previous_data.get(date, {"plays": 0, "duration_ms": 0})
            timeline.append({
                "date": date.isoformat() if date else None,
                "plays": row[1],
                "duration_ms": row[2],
                "completed": row[3],
                "avg_completion": float(row[4]) if row[4] else 0,
                "previous_plays": prev["plays"],
                "previous_duration_ms": prev["duration_ms"],
            })

        return {
            "period": period,
            "granularity": granularity,
            "timeline": timeline,
        }

    def get_completion_rate_trend(self, period: str = "month") -> dict[str, Any]:
        """
        Get completion rate trend over time.

        Args:
            period: Time range (week, month, year)

        Returns:
            Daily completion rates and skip rates.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        DATE(started_at AT TIME ZONE 'UTC') as play_date,
                        COUNT(*) as total_plays,
                        COUNT(*) FILTER (WHERE completed) as completed,
                        COUNT(*) FILTER (WHERE skipped) as skipped,
                        ROUND(AVG(completion_percent)::numeric, 1) as avg_completion,
                        ROUND(
                            COUNT(*) FILTER (WHERE completed) * 100.0 / NULLIF(COUNT(*), 0),
                            1
                        ) as completion_rate,
                        ROUND(
                            COUNT(*) FILTER (WHERE skipped) * 100.0 / NULLIF(COUNT(*), 0),
                            1
                        ) as skip_rate
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY play_date
                    ORDER BY play_date
                    """,
                    (start, end),
                )
                rows = cur.fetchall()

        data = [
            {
                "date": str(row[0]),
                "total_plays": row[1],
                "completed": row[2],
                "skipped": row[3],
                "avg_completion": float(row[4]) if row[4] else 0,
                "completion_rate": float(row[5]) if row[5] else 0,
                "skip_rate": float(row[6]) if row[6] else 0,
            }
            for row in rows
        ]

        # Calculate overall averages
        total_plays = sum(d["total_plays"] for d in data) or 1
        total_completed = sum(d["completed"] for d in data)
        total_skipped = sum(d["skipped"] for d in data)

        return {
            "period": period,
            "data": data,
            "summary": {
                "avg_completion_rate": round((total_completed / total_plays) * 100, 1),
                "avg_skip_rate": round((total_skipped / total_plays) * 100, 1),
                "total_completed": total_completed,
                "total_skipped": total_skipped,
            },
        }

    def get_skip_analysis(self, period: str = "month", limit: int = 20) -> dict[str, Any]:
        """
        Get detailed skip analysis.

        Args:
            period: Time range
            limit: Max songs to return

        Returns:
            Most skipped songs, skip rate by genre, skip rate by time of day.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Most skipped songs
                cur.execute(
                    """
                    SELECT
                        ps.sha_id,
                        s.title,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        COUNT(*) as total_plays,
                        COUNT(*) FILTER (WHERE ps.skipped) as skip_count,
                        ROUND(
                            COUNT(*) FILTER (WHERE ps.skipped) * 100.0 / NULLIF(COUNT(*), 0),
                            1
                        ) as skip_rate
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY ps.sha_id, s.title, a.name
                    HAVING COUNT(*) >= 3
                    ORDER BY skip_rate DESC, skip_count DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                )
                most_skipped = [
                    {
                        "sha_id": row[0],
                        "title": row[1],
                        "artist": row[2],
                        "total_plays": row[3],
                        "skip_count": row[4],
                        "skip_rate": float(row[5]) if row[5] else 0,
                    }
                    for row in cur.fetchall()
                ]

                # Skip rate by genre
                cur.execute(
                    """
                    SELECT
                        g.name as genre,
                        COUNT(*) as total_plays,
                        COUNT(*) FILTER (WHERE ps.skipped) as skipped,
                        ROUND(
                            COUNT(*) FILTER (WHERE ps.skipped) * 100.0 / NULLIF(COUNT(*), 0),
                            1
                        ) as skip_rate
                    FROM play_sessions ps
                    JOIN metadata.song_genres sg ON ps.sha_id = sg.sha_id
                    JOIN metadata.genres g ON sg.genre_id = g.genre_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY g.name
                    HAVING COUNT(*) >= 5
                    ORDER BY skip_rate DESC
                    """,
                    (start, end),
                )
                by_genre = [
                    {
                        "genre": row[0],
                        "total_plays": row[1],
                        "skipped": row[2],
                        "skip_rate": float(row[3]) if row[3] else 0,
                    }
                    for row in cur.fetchall()
                ]

                # Skip rate by hour of day
                cur.execute(
                    """
                    SELECT
                        EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC') as hour,
                        COUNT(*) as total_plays,
                        COUNT(*) FILTER (WHERE skipped) as skipped,
                        ROUND(
                            COUNT(*) FILTER (WHERE skipped) * 100.0 / NULLIF(COUNT(*), 0),
                            1
                        ) as skip_rate
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY hour
                    ORDER BY hour
                    """,
                    (start, end),
                )
                by_hour = [
                    {
                        "hour": int(row[0]),
                        "total_plays": row[1],
                        "skipped": row[2],
                        "skip_rate": float(row[3]) if row[3] else 0,
                    }
                    for row in cur.fetchall()
                ]

        return {
            "period": period,
            "most_skipped_songs": most_skipped,
            "skip_rate_by_genre": by_genre,
            "skip_rate_by_hour": by_hour,
        }

    def get_context_distribution(self, period: str = "month") -> dict[str, Any]:
        """
        Get distribution of play contexts.

        Args:
            period: Time range

        Returns:
            Breakdown of where plays originated (radio, playlist, album, etc.)
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Overall context distribution
                cur.execute(
                    """
                    SELECT
                        COALESCE(context_type, 'unknown') as context,
                        COUNT(*) as plays,
                        COALESCE(SUM(duration_played_ms), 0) as duration_ms,
                        COUNT(*) FILTER (WHERE completed) as completed,
                        ROUND(AVG(completion_percent)::numeric, 1) as avg_completion
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY context_type
                    ORDER BY plays DESC
                    """,
                    (start, end),
                )
                rows = cur.fetchall()
                total_plays = sum(row[1] for row in rows) or 1

                distribution = [
                    {
                        "context": row[0],
                        "plays": row[1],
                        "percentage": round((row[1] / total_plays) * 100, 1),
                        "duration_ms": row[2],
                        "completed": row[3],
                        "avg_completion": float(row[4]) if row[4] else 0,
                    }
                    for row in rows
                ]

                # Context trend over time (by week)
                cur.execute(
                    """
                    SELECT
                        DATE_TRUNC('week', started_at) as week,
                        COALESCE(context_type, 'unknown') as context,
                        COUNT(*) as plays
                    FROM play_sessions
                    WHERE started_at >= %s AND started_at < %s
                    GROUP BY week, context_type
                    ORDER BY week, plays DESC
                    """,
                    (start, end),
                )
                trend_rows = cur.fetchall()

                # Build trend data
                trend_by_week: dict[str, dict[str, int]] = {}
                for row in trend_rows:
                    week = row[0].isoformat() if row[0] else "unknown"
                    if week not in trend_by_week:
                        trend_by_week[week] = {}
                    trend_by_week[week][row[1]] = row[2]

                trend = [
                    {"week": week, **contexts}
                    for week, contexts in trend_by_week.items()
                ]

        return {
            "period": period,
            "distribution": distribution,
            "trend": trend,
        }

    def get_listening_sessions(self, period: str = "month", limit: int = 10) -> dict[str, Any]:
        """
        Get listening session analysis.

        Args:
            period: Time range
            limit: Max sessions to return for longest sessions

        Returns:
            Session stats, length distribution, and longest sessions.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Identify sessions (plays within 30 minutes of each other)
                # Using a window function to detect session boundaries
                cur.execute(
                    """
                    WITH session_boundaries AS (
                        SELECT
                            session_id,
                            sha_id,
                            started_at,
                            ended_at,
                            duration_played_ms,
                            completed,
                            CASE WHEN
                                LAG(started_at) OVER (ORDER BY started_at) IS NULL
                                OR started_at - LAG(COALESCE(ended_at, started_at)) OVER (ORDER BY started_at) > INTERVAL '30 minutes'
                            THEN 1 ELSE 0 END as is_new_session
                        FROM play_sessions
                        WHERE started_at >= %s AND started_at < %s
                    ),
                    sessions AS (
                        SELECT
                            *,
                            SUM(is_new_session) OVER (ORDER BY started_at) as listening_session_id
                        FROM session_boundaries
                    ),
                    session_stats AS (
                        SELECT
                            listening_session_id,
                            MIN(started_at) as session_start,
                            MAX(COALESCE(ended_at, started_at)) as session_end,
                            COUNT(*) as songs_played,
                            SUM(duration_played_ms) as total_duration_ms,
                            COUNT(*) FILTER (WHERE completed) as completed_songs
                        FROM sessions
                        GROUP BY listening_session_id
                    )
                    SELECT
                        session_start,
                        session_end,
                        songs_played,
                        total_duration_ms,
                        completed_songs,
                        EXTRACT(EPOCH FROM (session_end - session_start)) * 1000 as session_length_ms
                    FROM session_stats
                    ORDER BY session_start DESC
                    """,
                    (start, end),
                )
                all_sessions = cur.fetchall()

        if not all_sessions:
            return {
                "period": period,
                "total_sessions": 0,
                "avg_songs_per_session": 0,
                "avg_session_length_ms": 0,
                "length_distribution": [],
                "longest_sessions": [],
            }

        # Calculate statistics
        total_sessions = len(all_sessions)
        avg_songs = sum(s[2] for s in all_sessions) / total_sessions
        avg_length_ms = sum(s[5] for s in all_sessions if s[5]) / total_sessions

        # Session length distribution (buckets)
        length_buckets = {"<15min": 0, "15-30min": 0, "30-60min": 0, "1-2hr": 0, ">2hr": 0}
        for session in all_sessions:
            length_ms = session[5] or 0
            length_min = length_ms / 60000
            if length_min < 15:
                length_buckets["<15min"] += 1
            elif length_min < 30:
                length_buckets["15-30min"] += 1
            elif length_min < 60:
                length_buckets["30-60min"] += 1
            elif length_min < 120:
                length_buckets["1-2hr"] += 1
            else:
                length_buckets[">2hr"] += 1

        length_distribution = [
            {"range": k, "count": v, "percentage": round((v / total_sessions) * 100, 1)}
            for k, v in length_buckets.items()
        ]

        # Longest sessions
        sorted_by_length = sorted(all_sessions, key=lambda s: s[5] or 0, reverse=True)
        longest_sessions = [
            {
                "start": row[0].isoformat() if row[0] else None,
                "end": row[1].isoformat() if row[1] else None,
                "songs_played": row[2],
                "duration_ms": row[3],
                "completed_songs": row[4],
                "session_length_ms": row[5],
                "session_length_formatted": format_duration(int(row[5])) if row[5] else "0m",
            }
            for row in sorted_by_length[:limit]
        ]

        return {
            "period": period,
            "total_sessions": total_sessions,
            "avg_songs_per_session": round(avg_songs, 1),
            "avg_session_length_ms": int(avg_length_ms),
            "avg_session_length_formatted": format_duration(int(avg_length_ms)),
            "length_distribution": length_distribution,
            "longest_sessions": longest_sessions,
        }

    def get_enhanced_heatmap(self, year: int | None = None) -> dict[str, Any]:
        """
        Get enhanced listening heatmap with song details.

        Args:
            year: Year to analyze (defaults to current year)

        Returns:
            Heatmap data with top song for each time slot.
        """
        if year is None:
            year = datetime.now(timezone.utc).year

        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Heatmap with top song per slot
                cur.execute(
                    """
                    WITH slot_plays AS (
                        SELECT
                            EXTRACT(DOW FROM ps.started_at AT TIME ZONE 'UTC') as day_of_week,
                            EXTRACT(HOUR FROM ps.started_at AT TIME ZONE 'UTC') as hour,
                            ps.sha_id,
                            s.title,
                            COALESCE(a.name, 'Unknown') as artist,
                            COUNT(*) as plays
                        FROM play_sessions ps
                        JOIN metadata.songs s ON ps.sha_id = s.sha_id
                        LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                        LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        WHERE ps.started_at >= %s AND ps.started_at < %s
                        GROUP BY day_of_week, hour, ps.sha_id, s.title, a.name
                    ),
                    slot_totals AS (
                        SELECT
                            day_of_week,
                            hour,
                            SUM(plays) as total_plays
                        FROM slot_plays
                        GROUP BY day_of_week, hour
                    ),
                    top_songs AS (
                        SELECT DISTINCT ON (day_of_week, hour)
                            day_of_week,
                            hour,
                            sha_id,
                            title,
                            artist,
                            plays as top_song_plays
                        FROM slot_plays
                        ORDER BY day_of_week, hour, plays DESC
                    )
                    SELECT
                        st.day_of_week,
                        st.hour,
                        st.total_plays,
                        ts.sha_id,
                        ts.title,
                        ts.artist,
                        ts.top_song_plays
                    FROM slot_totals st
                    LEFT JOIN top_songs ts ON st.day_of_week = ts.day_of_week AND st.hour = ts.hour
                    ORDER BY st.day_of_week, st.hour
                    """,
                    (start, end),
                )
                rows = cur.fetchall()

        data = [
            {
                "day": int(row[0]),
                "hour": int(row[1]),
                "plays": row[2],
                "top_song": {
                    "sha_id": row[3],
                    "title": row[4],
                    "artist": row[5],
                    "plays": row[6],
                } if row[3] else None,
            }
            for row in rows
        ]

        # Find peak times
        day_totals: dict[int, int] = {}
        hour_totals: dict[int, int] = {}
        for item in data:
            day_totals[item["day"]] = day_totals.get(item["day"], 0) + item["plays"]
            hour_totals[item["hour"]] = hour_totals.get(item["hour"], 0) + item["plays"]

        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        peak_day = max(day_totals, key=day_totals.get) if day_totals else 0
        peak_hour = max(hour_totals, key=hour_totals.get) if hour_totals else 0

        return {
            "year": year,
            "data": data,
            "peak_day": day_names[peak_day],
            "peak_day_index": peak_day,
            "peak_hour": peak_hour,
            "day_totals": [{"day": day_names[i], "plays": day_totals.get(i, 0)} for i in range(7)],
            "hour_totals": [{"hour": i, "plays": hour_totals.get(i, 0)} for i in range(24)],
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

    def get_daily_activity(self, days: int = 7) -> dict[str, Any]:
        """
        Get daily activity data for sparkline charts.

        Args:
            days: Number of days to fetch (default 7)

        Returns:
            Dict with activity list containing date, plays, and songs_added per day
        """
        from datetime import timedelta

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get daily plays from play_sessions
                cur.execute(
                    """
                    SELECT
                        DATE(started_at) as date,
                        COUNT(*) as plays
                    FROM play_sessions
                    WHERE started_at >= CURRENT_DATE - INTERVAL '%s days'
                    GROUP BY DATE(started_at)
                    ORDER BY date
                    """,
                    (days,),
                )
                plays_by_date = {str(row[0]): row[1] for row in cur.fetchall()}

                # Get daily songs added from songs.created_at
                cur.execute(
                    """
                    SELECT
                        DATE(created_at) as date,
                        COUNT(*) as songs_added
                    FROM metadata.songs
                    WHERE created_at >= CURRENT_DATE - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date
                    """,
                    (days,),
                )
                added_by_date = {str(row[0]): row[1] for row in cur.fetchall()}

        # Build complete list for all days
        today = datetime.now().date()
        activity = []
        for i in range(days - 1, -1, -1):  # From oldest to newest
            date = today - timedelta(days=i)
            date_str = str(date)
            activity.append({
                "date": date_str,
                "plays": plays_by_date.get(date_str, 0),
                "songs_added": added_by_date.get(date_str, 0),
            })

        return {"activity": activity, "days": days}

    def get_recently_added(self, days: int = 30, limit: int = 50) -> dict[str, Any]:
        """
        Get recently added songs grouped by date.

        Args:
            days: Number of days to look back
            limit: Maximum songs to return

        Returns:
            Recently added songs grouped by date with metadata.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        s.sha_id,
                        s.title,
                        s.album,
                        s.duration_sec,
                        s.release_year,
                        DATE(s.created_at) as added_date,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE s.created_at >= CURRENT_DATE - INTERVAL '%s days'
                    ORDER BY s.created_at DESC
                    LIMIT %s
                    """,
                    (days, limit),
                )
                rows = cur.fetchall()

        # Group by date
        by_date: dict[str, list] = {}
        for row in rows:
            date_str = str(row[5])
            if date_str not in by_date:
                by_date[date_str] = []
            by_date[date_str].append({
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "release_year": row[4],
                "artist": row[6],
                "artist_id": row[7],
            })

        # Convert to list sorted by date
        grouped = [
            {"date": date, "songs": songs}
            for date, songs in sorted(by_date.items(), reverse=True)
        ]

        return {
            "days": days,
            "total_added": len(rows),
            "grouped_by_date": grouped,
        }

    def get_new_artists(self, period: str = "month", limit: int = 20) -> dict[str, Any]:
        """
        Get artists discovered (first played) in this period.

        Args:
            period: Time period
            limit: Maximum artists to return

        Returns:
            New artists with first song played from each.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Find artists whose first play was in this period
                cur.execute(
                    """
                    WITH artist_first_plays AS (
                        SELECT
                            a.artist_id,
                            a.name,
                            MIN(ps.started_at) as first_play
                        FROM play_sessions ps
                        JOIN metadata.song_artists sa ON ps.sha_id = sa.sha_id
                        JOIN metadata.artists a ON sa.artist_id = a.artist_id
                        GROUP BY a.artist_id, a.name
                        HAVING MIN(ps.started_at) >= %s AND MIN(ps.started_at) < %s
                    ),
                    first_songs AS (
                        SELECT DISTINCT ON (afp.artist_id)
                            afp.artist_id,
                            afp.name as artist_name,
                            afp.first_play,
                            s.sha_id,
                            s.title as song_title,
                            s.album
                        FROM artist_first_plays afp
                        JOIN metadata.song_artists sa ON afp.artist_id = sa.artist_id
                        JOIN metadata.songs s ON sa.sha_id = s.sha_id
                        JOIN play_sessions ps ON s.sha_id = ps.sha_id
                        WHERE ps.started_at = afp.first_play
                        ORDER BY afp.artist_id, ps.started_at
                    )
                    SELECT
                        fs.artist_id,
                        fs.artist_name,
                        fs.first_play,
                        fs.sha_id,
                        fs.song_title,
                        fs.album,
                        (SELECT COUNT(*) FROM play_sessions ps2
                         JOIN metadata.song_artists sa2 ON ps2.sha_id = sa2.sha_id
                         WHERE sa2.artist_id = fs.artist_id
                         AND ps2.started_at >= %s AND ps2.started_at < %s) as total_plays,
                        (SELECT COUNT(DISTINCT ps3.sha_id) FROM play_sessions ps3
                         JOIN metadata.song_artists sa3 ON ps3.sha_id = sa3.sha_id
                         WHERE sa3.artist_id = fs.artist_id
                         AND ps3.started_at >= %s AND ps3.started_at < %s) as unique_songs
                    FROM first_songs fs
                    ORDER BY fs.first_play DESC
                    LIMIT %s
                    """,
                    (start, end, start, end, start, end, limit),
                )
                rows = cur.fetchall()

        artists = [
            {
                "artist_id": row[0],
                "name": row[1],
                "discovered_at": row[2].isoformat() if row[2] else None,
                "first_song": {
                    "sha_id": row[3],
                    "title": row[4],
                    "album": row[5],
                },
                "total_plays": row[6],
                "unique_songs": row[7],
            }
            for row in rows
        ]

        return {
            "period": period,
            "total_new_artists": len(artists),
            "artists": artists,
        }

    def get_genre_exploration(self, period: str = "year") -> dict[str, Any]:
        """
        Get genre listening evolution over time.

        Args:
            period: Time period

        Returns:
            Genre trends showing new discoveries and listening evolution.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Genre plays by month
                cur.execute(
                    """
                    SELECT
                        DATE_TRUNC('month', ps.started_at) as month,
                        g.name as genre,
                        COUNT(*) as plays
                    FROM play_sessions ps
                    JOIN metadata.song_genres sg ON ps.sha_id = sg.sha_id
                    JOIN metadata.genres g ON sg.genre_id = g.genre_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY month, g.name
                    ORDER BY month, plays DESC
                    """,
                    (start, end),
                )
                rows = cur.fetchall()

                # Build monthly breakdown
                by_month: dict[str, dict[str, int]] = {}
                all_genres: set[str] = set()
                for row in rows:
                    month = row[0].isoformat() if row[0] else "unknown"
                    genre = row[1]
                    plays = row[2]
                    if month not in by_month:
                        by_month[month] = {}
                    by_month[month][genre] = plays
                    all_genres.add(genre)

                # Find new genres (first played in period but not before)
                cur.execute(
                    """
                    WITH genre_first_plays AS (
                        SELECT
                            g.name as genre,
                            MIN(ps.started_at) as first_play
                        FROM play_sessions ps
                        JOIN metadata.song_genres sg ON ps.sha_id = sg.sha_id
                        JOIN metadata.genres g ON sg.genre_id = g.genre_id
                        GROUP BY g.name
                        HAVING MIN(ps.started_at) >= %s AND MIN(ps.started_at) < %s
                    )
                    SELECT genre, first_play
                    FROM genre_first_plays
                    ORDER BY first_play DESC
                    """,
                    (start, end),
                )
                new_genres = [
                    {"genre": row[0], "first_played": row[1].isoformat() if row[1] else None}
                    for row in cur.fetchall()
                ]

        # Convert to timeline format
        timeline = [
            {"month": month, "genres": genres}
            for month, genres in sorted(by_month.items())
        ]

        return {
            "period": period,
            "timeline": timeline,
            "all_genres": sorted(all_genres),
            "new_genres": new_genres,
        }

    def get_unplayed_songs(self, limit: int = 50) -> dict[str, Any]:
        """
        Get songs in library that have never been played.

        Args:
            limit: Maximum songs to return

        Returns:
            Unplayed songs with metadata and library percentage.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total library count
                cur.execute("SELECT COUNT(*) FROM metadata.songs")
                total_songs = cur.fetchone()[0] or 1

                # Unplayed count
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM metadata.songs s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM play_sessions ps WHERE ps.sha_id = s.sha_id
                    )
                    """
                )
                unplayed_count = cur.fetchone()[0] or 0

                # Get unplayed songs
                cur.execute(
                    """
                    SELECT
                        s.sha_id,
                        s.title,
                        s.album,
                        s.duration_sec,
                        s.release_year,
                        s.created_at,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id
                    FROM metadata.songs s
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE NOT EXISTS (
                        SELECT 1 FROM play_sessions ps WHERE ps.sha_id = s.sha_id
                    )
                    ORDER BY s.created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()

        songs = [
            {
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "release_year": row[4],
                "added_at": row[5].isoformat() if row[5] else None,
                "artist": row[6],
                "artist_id": row[7],
            }
            for row in rows
        ]

        return {
            "total_unplayed": unplayed_count,
            "total_library": total_songs,
            "unplayed_percentage": round((unplayed_count / total_songs) * 100, 1),
            "songs": songs,
        }

    def get_one_hit_wonders(self, period: str = "all", limit: int = 30) -> dict[str, Any]:
        """
        Get songs played exactly once.

        Args:
            period: Time period to consider
            limit: Maximum songs to return

        Returns:
            Songs with exactly one play, encouraging re-listening.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        ps.sha_id,
                        s.title,
                        s.album,
                        s.duration_sec,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id,
                        MIN(ps.started_at) as played_at,
                        MAX(ps.completed) as was_completed,
                        MAX(ps.completion_percent) as completion_pct
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    GROUP BY ps.sha_id, s.title, s.album, s.duration_sec, a.name, a.artist_id
                    HAVING COUNT(*) = 1
                    ORDER BY MIN(ps.started_at) DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                )
                rows = cur.fetchall()

        songs = [
            {
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "artist": row[4],
                "artist_id": row[5],
                "played_at": row[6].isoformat() if row[6] else None,
                "was_completed": row[7],
                "completion_percent": float(row[8]) if row[8] else 0,
            }
            for row in rows
        ]

        return {
            "period": period,
            "total_one_plays": len(songs),
            "songs": songs,
        }

    def get_hidden_gems(self, limit: int = 20) -> dict[str, Any]:
        """
        Get songs with low play count but high completion rate.

        These are songs that might deserve more attention.

        Args:
            limit: Maximum songs to return

        Returns:
            Hidden gem songs ranked by completion rate with low plays.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Songs with 2-5 plays and high completion rate (>70%)
                cur.execute(
                    """
                    SELECT
                        ps.sha_id,
                        s.title,
                        s.album,
                        s.duration_sec,
                        COALESCE(a.name, 'Unknown Artist') as artist,
                        a.artist_id,
                        COUNT(*) as play_count,
                        ROUND(AVG(ps.completion_percent)::numeric, 1) as avg_completion,
                        COUNT(*) FILTER (WHERE ps.completed) as completed_count,
                        MAX(ps.started_at) as last_played
                    FROM play_sessions ps
                    JOIN metadata.songs s ON ps.sha_id = s.sha_id
                    LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                    LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                    GROUP BY ps.sha_id, s.title, s.album, s.duration_sec, a.name, a.artist_id
                    HAVING COUNT(*) BETWEEN 2 AND 5
                       AND AVG(ps.completion_percent) >= 70
                    ORDER BY AVG(ps.completion_percent) DESC, COUNT(*) ASC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()

        songs = [
            {
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "artist": row[4],
                "artist_id": row[5],
                "play_count": row[6],
                "avg_completion": float(row[7]) if row[7] else 0,
                "completed_count": row[8],
                "last_played": row[9].isoformat() if row[9] else None,
            }
            for row in rows
        ]

        return {
            "total_gems": len(songs),
            "criteria": "2-5 plays with 70%+ completion rate",
            "songs": songs,
        }

    def get_discovery_summary(self, period: str = "month") -> dict[str, Any]:
        """
        Get a summary of discovery metrics for the period.

        Args:
            period: Time period

        Returns:
            Summary stats for discoveries.
        """
        start, end = parse_period(period)

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Songs added this period
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM metadata.songs
                    WHERE created_at >= %s AND created_at < %s
                    """,
                    (start, end),
                )
                songs_added = cur.fetchone()[0] or 0

                # New artists discovered (first play in period)
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT a.artist_id)
                    FROM metadata.artists a
                    JOIN metadata.song_artists sa ON a.artist_id = sa.artist_id
                    JOIN play_sessions ps ON sa.sha_id = ps.sha_id
                    WHERE a.artist_id IN (
                        SELECT sa2.artist_id
                        FROM play_sessions ps2
                        JOIN metadata.song_artists sa2 ON ps2.sha_id = sa2.sha_id
                        GROUP BY sa2.artist_id
                        HAVING MIN(ps2.started_at) >= %s AND MIN(ps2.started_at) < %s
                    )
                    """,
                    (start, end),
                )
                new_artists = cur.fetchone()[0] or 0

                # New genres discovered
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT g.genre_id)
                    FROM metadata.genres g
                    JOIN metadata.song_genres sg ON g.genre_id = sg.genre_id
                    JOIN play_sessions ps ON sg.sha_id = ps.sha_id
                    WHERE g.genre_id IN (
                        SELECT sg2.genre_id
                        FROM play_sessions ps2
                        JOIN metadata.song_genres sg2 ON ps2.sha_id = sg2.sha_id
                        GROUP BY sg2.genre_id
                        HAVING MIN(ps2.started_at) >= %s AND MIN(ps2.started_at) < %s
                    )
                    """,
                    (start, end),
                )
                new_genres = cur.fetchone()[0] or 0

                # First-time plays (songs played for first time ever in this period)
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT ps.sha_id)
                    FROM play_sessions ps
                    WHERE ps.started_at >= %s AND ps.started_at < %s
                    AND ps.sha_id IN (
                        SELECT sha_id
                        FROM play_sessions
                        GROUP BY sha_id
                        HAVING MIN(started_at) >= %s AND MIN(started_at) < %s
                    )
                    """,
                    (start, end, start, end),
                )
                first_listens = cur.fetchone()[0] or 0

        return {
            "period": period,
            "songs_added": songs_added,
            "new_artists": new_artists,
            "new_genres": new_genres,
            "first_listens": first_listens,
        }


# Singleton instance
_aggregator: StatsAggregator | None = None


def get_stats_aggregator() -> StatsAggregator:
    """Get the singleton StatsAggregator instance."""
    global _aggregator
    if _aggregator is None:
        _aggregator = StatsAggregator()
    return _aggregator
