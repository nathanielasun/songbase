"""
Playlist Refresher Service

Executes smart playlist rules and updates the cached song membership.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from backend.db.connection import get_connection
from backend.services.performance import get_query_cache
from backend.services.rule_engine import (
    Condition,
    ConditionGroup,
    RuleEngine,
    get_rule_engine,
)

logger = logging.getLogger(__name__)

# Query timeout in milliseconds
QUERY_TIMEOUT_MS = 30000
PREVIEW_CACHE_TTL_SEC = 15


class PlaylistRefresherError(Exception):
    """Exception raised for playlist refresh errors."""

    pass


class PlaylistRefresher:
    """
    Service for refreshing smart playlist contents.

    Executes compiled rules against the database and updates
    the smart_playlist_songs table with matching songs.
    """

    def __init__(self, rule_engine: RuleEngine | None = None):
        self.rule_engine = rule_engine or get_rule_engine()

    def refresh_single(
        self,
        playlist_id: str,
        liked_song_ids: set[str] | None = None,
        disliked_song_ids: set[str] | None = None,
    ) -> dict[str, Any]:
        """
        Refresh a single smart playlist.

        Args:
            playlist_id: UUID of the playlist to refresh
            liked_song_ids: Set of liked song IDs for is_liked rules
            disliked_song_ids: Set of disliked song IDs for is_disliked rules

        Returns:
            Dict with playlist_id, song_count, refreshed_at

        Raises:
            PlaylistRefresherError: If refresh fails
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Set query timeout
                cur.execute(f"SET statement_timeout = {QUERY_TIMEOUT_MS}")

                # Get playlist definition
                cur.execute(
                    """
                    SELECT playlist_id, name, rules, sort_by, sort_order, limit_count, is_template
                    FROM smart_playlists
                    WHERE playlist_id = %s
                    """,
                    (playlist_id,),
                )
                row = cur.fetchone()

                if not row:
                    raise PlaylistRefresherError(f"Playlist not found: {playlist_id}")

                playlist = {
                    "playlist_id": row[0],
                    "name": row[1],
                    "rules": row[2],
                    "sort_by": row[3],
                    "sort_order": row[4],
                    "limit_count": row[5],
                    "is_template": row[6],
                }

                if playlist["is_template"]:
                    raise PlaylistRefresherError(
                        "Cannot refresh template playlists directly. "
                        "Create a playlist from the template first."
                    )

                # Parse and compile rules
                try:
                    parsed_rules = self.rule_engine.parse(playlist["rules"])
                    same_as_values = self._resolve_same_as_values(parsed_rules)
                    similarity_values = self._resolve_similarity_values(parsed_rules)
                    where_clause, params = self.rule_engine.compile_to_sql(
                        parsed_rules,
                        liked_song_ids=liked_song_ids,
                        disliked_song_ids=disliked_song_ids,
                        same_as_values=same_as_values,
                        similarity_values=similarity_values,
                    )
                except Exception as e:
                    raise PlaylistRefresherError(f"Failed to compile rules: {e}")

                # Build and execute the full query
                query, query_params = self._build_query(
                    where_clause,
                    params,
                    playlist["sort_by"],
                    playlist["sort_order"],
                    playlist["limit_count"],
                )

                try:
                    cur.execute(query, query_params)
                    songs = cur.fetchall()
                except Exception as e:
                    raise PlaylistRefresherError(f"Query execution failed: {e}")

                # Clear existing songs
                cur.execute(
                    "DELETE FROM smart_playlist_songs WHERE playlist_id = %s",
                    (playlist_id,),
                )

                # Insert new songs with positions
                if songs:
                    values = [
                        (playlist_id, song[0], i)
                        for i, song in enumerate(songs)
                    ]
                    cur.executemany(
                        """
                        INSERT INTO smart_playlist_songs (playlist_id, sha_id, position)
                        VALUES (%s, %s, %s)
                        """,
                        values,
                    )

                # Update playlist stats
                cur.execute(
                    "SELECT update_smart_playlist_stats(%s)",
                    (playlist_id,),
                )

            conn.commit()

        logger.info(
            f"Refreshed smart playlist '{playlist['name']}' with {len(songs)} songs"
        )

        return {
            "playlist_id": playlist_id,
            "song_count": len(songs),
            "refreshed_at": datetime.now(timezone.utc).isoformat(),
        }

    def refresh_all(
        self,
        liked_song_ids: set[str] | None = None,
        disliked_song_ids: set[str] | None = None,
    ) -> dict[str, Any]:
        """
        Refresh all smart playlists with auto_refresh=True.

        Args:
            liked_song_ids: Set of liked song IDs
            disliked_song_ids: Set of disliked song IDs

        Returns:
            Dict with refreshed count, failed count, and individual results
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT playlist_id
                    FROM smart_playlists
                    WHERE auto_refresh = TRUE AND is_template = FALSE
                    """
                )
                playlists = cur.fetchall()

        results = []
        for (playlist_id,) in playlists:
            try:
                result = self.refresh_single(
                    str(playlist_id),
                    liked_song_ids,
                    disliked_song_ids,
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to refresh playlist {playlist_id}: {e}")
                results.append({
                    "playlist_id": str(playlist_id),
                    "error": str(e),
                })

        refreshed = len([r for r in results if "error" not in r])
        failed = len([r for r in results if "error" in r])

        logger.info(f"Refreshed {refreshed} playlists, {failed} failed")

        return {
            "refreshed": refreshed,
            "failed": failed,
            "results": results,
        }

    def preview_rules(
        self,
        rules: dict,
        sort_by: str = "added_at",
        sort_order: str = "desc",
        limit: int = 20,
        liked_song_ids: set[str] | None = None,
        disliked_song_ids: set[str] | None = None,
    ) -> dict[str, Any]:
        """
        Preview rule results without saving.

        Args:
            rules: Raw JSON rules to preview
            sort_by: Field to sort by
            sort_order: 'asc' or 'desc'
            limit: Maximum songs to return in preview
            liked_song_ids: Set of liked song IDs
            disliked_song_ids: Set of disliked song IDs

        Returns:
            Dict with songs list and total_matches count
        """
        cache_key = self._preview_cache_key(
            rules,
            sort_by,
            sort_order,
            limit,
            liked_song_ids or set(),
            disliked_song_ids or set(),
        )
        cache = get_query_cache()
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return cached_result

        # Parse and compile rules
        try:
            parsed_rules = self.rule_engine.parse(rules)
            same_as_values = self._resolve_same_as_values(parsed_rules)
            similarity_values = self._resolve_similarity_values(parsed_rules)
            where_clause, params = self.rule_engine.compile_to_sql(
                parsed_rules,
                liked_song_ids=liked_song_ids,
                disliked_song_ids=disliked_song_ids,
                same_as_values=same_as_values,
                similarity_values=similarity_values,
            )
        except Exception as e:
            raise PlaylistRefresherError(f"Failed to compile rules: {e}")

        # Build query for preview
        query, query_params = self._build_query(
            where_clause,
            params,
            sort_by,
            sort_order,
            limit,
        )

        # Also get total count
        count_query = self._build_count_query(where_clause, params)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {QUERY_TIMEOUT_MS}")

                # Get songs
                cur.execute(query, query_params)
                rows = cur.fetchall()

                # Get total count
                cur.execute(count_query, params)
                total_matches = cur.fetchone()[0]

        songs = [
            {
                "sha_id": row[0],
                "title": row[1],
                "album": row[2],
                "duration_sec": row[3],
                "release_year": row[4],
                "artist": row[5],
                "play_count": row[6],
            }
            for row in rows
        ]

        result = {
            "songs": songs,
            "total_matches": total_matches,
        }
        cache.set(cache_key, result, ttl=PREVIEW_CACHE_TTL_SEC)
        return result

    def explain_rules(
        self,
        rules: dict,
        sort_by: str = "added_at",
        sort_order: str = "desc",
        limit: int | None = 100,
        liked_song_ids: set[str] | None = None,
        disliked_song_ids: set[str] | None = None,
    ) -> dict[str, Any]:
        """Return an EXPLAIN plan for a rules query."""
        try:
            parsed_rules = self.rule_engine.parse(rules)
            same_as_values = self._resolve_same_as_values(parsed_rules)
            similarity_values = self._resolve_similarity_values(parsed_rules)
            where_clause, params = self.rule_engine.compile_to_sql(
                parsed_rules,
                liked_song_ids=liked_song_ids,
                disliked_song_ids=disliked_song_ids,
                same_as_values=same_as_values,
                similarity_values=similarity_values,
            )
        except Exception as e:
            raise PlaylistRefresherError(f"Failed to compile rules: {e}")

        query, query_params = self._build_query(
            where_clause,
            params,
            sort_by,
            sort_order,
            limit,
        )

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {QUERY_TIMEOUT_MS}")
                cur.execute("EXPLAIN (FORMAT JSON) " + query, query_params)
                plan = cur.fetchone()[0]

        return {
            "plan": plan,
            "query": query,
            "params_count": len(query_params),
        }

    def _build_query(
        self,
        where_clause: str,
        params: list,
        sort_by: str,
        sort_order: str,
        limit: int | None,
    ) -> tuple[str, list]:
        """
        Build the complete SQL query with CTEs, joins, and sorting.

        Returns:
            Tuple of (SQL query, parameters)
        """
        # Validate sort_order
        sort_order = sort_order.upper()
        if sort_order not in ("ASC", "DESC"):
            sort_order = "DESC"

        # Map sort_by to column (must match SELECT aliases for DISTINCT compatibility)
        sort_column = {
            "title": "s.title",
            "artist": "artist",
            "album": "s.album",
            "release_year": "COALESCE(s.release_year, 0)",
            "duration_sec": "COALESCE(s.duration_sec, 0)",
            "added_at": "s.created_at",
            "play_count": "play_count",
            "last_played": "last_played",
            "skip_count": "skip_count",
            "completion_rate": "avg_completion",
            "last_week_plays": "last_week_plays",
            "bpm": "bpm",
            "energy": "energy",
            "danceability": "danceability",
            "random": "RANDOM()",
        }.get(sort_by, "s.created_at")

        query = f"""
            WITH play_stats AS (
                SELECT
                    sha_id,
                    COUNT(*) as play_count,
                    MAX(started_at) as last_played,
                    COUNT(*) FILTER (WHERE skipped = TRUE) as skip_count,
                    AVG(completion_percent) as avg_completion,
                    COUNT(*) FILTER (
                        WHERE started_at >= NOW() - INTERVAL '7 days'
                    ) as last_week_plays,
                    COUNT(*) FILTER (
                        WHERE started_at < NOW() - INTERVAL '7 days'
                        AND started_at >= NOW() - INTERVAL '14 days'
                    ) as prev_week_plays
                FROM play_sessions
                GROUP BY sha_id
            ),
            trend_stats AS (
                SELECT
                    sha_id,
                    play_count,
                    last_played,
                    skip_count,
                    avg_completion,
                    last_week_plays,
                    CASE
                        WHEN last_week_plays > prev_week_plays THEN TRUE
                        ELSE FALSE
                    END as trending,
                    CASE
                        WHEN last_week_plays < prev_week_plays AND prev_week_plays > 0 THEN TRUE
                        ELSE FALSE
                    END as declining
                FROM play_stats
            )
            SELECT DISTINCT
                s.sha_id,
                s.title,
                s.album,
                s.duration_sec,
                s.release_year,
                s.created_at,
                (
                    SELECT STRING_AGG(DISTINCT a.name, ', ')
                    FROM metadata.song_artists sa
                    JOIN metadata.artists a ON a.artist_id = sa.artist_id
                    WHERE sa.sha_id = s.sha_id
                ) as artist,
                COALESCE(ps.play_count, 0) as play_count,
                ps.last_played,
                COALESCE(ps.skip_count, 0) as skip_count,
                COALESCE(ps.avg_completion, 0) as avg_completion,
                COALESCE(ps.last_week_plays, 0) as last_week_plays,
                COALESCE(ps.trending, FALSE) as trending,
                COALESCE(ps.declining, FALSE) as declining,
                COALESCE(af.bpm, 0) as bpm,
                COALESCE(af.energy, 0) as energy,
                COALESCE(af.danceability, 0) as danceability
            FROM metadata.songs s
            LEFT JOIN trend_stats ps ON ps.sha_id = s.sha_id
            LEFT JOIN metadata.audio_features af ON af.sha_id = s.sha_id
            WHERE {where_clause}
            ORDER BY {sort_column} {sort_order} NULLS LAST
        """

        if limit:
            query += f"\nLIMIT {int(limit)}"

        return query, params

    def _preview_cache_key(
        self,
        rules: dict,
        sort_by: str,
        sort_order: str,
        limit: int,
        liked_song_ids: set[str],
        disliked_song_ids: set[str],
    ) -> str:
        payload = {
            "rules": rules,
            "sort_by": sort_by,
            "sort_order": sort_order,
            "limit": limit,
            "liked_song_ids": sorted(liked_song_ids),
            "disliked_song_ids": sorted(disliked_song_ids),
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode("utf-8")
        ).hexdigest()
        return f"smart_playlist_preview:{digest}"

    def _resolve_same_as_values(
        self, rules: ConditionGroup
    ) -> dict[tuple[str, str], list[str]]:
        references: dict[tuple[str, str], list[str]] = {}
        for cond in self._iter_conditions(rules):
            if cond.operator.value != "same_as":
                continue
            if not isinstance(cond.value, str):
                continue
            playlist_id = self._parse_playlist_reference(cond.value)
            if not playlist_id:
                continue
            key = (cond.field, playlist_id)
            if key not in references:
                references[key] = self._fetch_playlist_values(cond.field, playlist_id)
        return references

    def _resolve_similarity_values(
        self, rules: ConditionGroup
    ) -> dict[tuple[str, int], list[str]]:
        references: dict[tuple[str, int], list[str]] = {}
        for cond in self._iter_conditions(rules):
            if cond.field != "similar_to":
                continue
            value = cond.value or {}
            sha_id = value.get("sha_id")
            count = int(value.get("count", 0) or 0)
            if not sha_id or count <= 0:
                continue
            key = (sha_id, count)
            if key in references:
                continue

            try:
                from backend.processing.similarity_pipeline import pipeline as similarity_pipeline

                results = similarity_pipeline.generate_song_radio(
                    sha_id=sha_id,
                    limit=count,
                    apply_diversity=False,
                )
                references[key] = [song["sha_id"] for song in results]
            except Exception as exc:  # noqa: BLE001
                raise PlaylistRefresherError(
                    f"Failed to resolve similar songs for {sha_id}: {exc}"
                ) from exc
        return references

    def _iter_conditions(
        self, group: ConditionGroup
    ) -> list[Condition]:
        conditions: list[Condition] = []
        for cond in group.conditions:
            if isinstance(cond, ConditionGroup):
                conditions.extend(self._iter_conditions(cond))
            else:
                conditions.append(cond)
        return conditions

    def _parse_playlist_reference(self, value: str) -> str | None:
        if ":" in value:
            prefix, playlist_id = value.split(":", 1)
            if prefix in {"playlist", "smart"} and playlist_id:
                return playlist_id
            return None
        return value or None

    def _fetch_playlist_values(self, field: str, playlist_id: str) -> list[str]:
        field_def = self.rule_engine.FIELD_DEFINITIONS.get(field)
        if not field_def:
            return []

        if field == "artist":
            query = """
                SELECT DISTINCT a.name
                FROM smart_playlist_songs sps
                JOIN metadata.song_artists sa ON sps.sha_id = sa.sha_id
                JOIN metadata.artists a ON a.artist_id = sa.artist_id
                WHERE sps.playlist_id = %s
            """
            params = (playlist_id,)
        elif field == "genre":
            query = """
                SELECT DISTINCT g.name
                FROM smart_playlist_songs sps
                JOIN metadata.song_genres sg ON sps.sha_id = sg.sha_id
                JOIN metadata.genres g ON g.genre_id = sg.genre_id
                WHERE sps.playlist_id = %s
            """
            params = (playlist_id,)
        else:
            table = field_def.get("table")
            column = field_def.get("column")
            if table == "s":
                query = f"""
                    SELECT DISTINCT s.{column}
                    FROM smart_playlist_songs sps
                    JOIN metadata.songs s ON s.sha_id = sps.sha_id
                    WHERE sps.playlist_id = %s AND s.{column} IS NOT NULL
                """
                params = (playlist_id,)
            elif table == "af":
                query = f"""
                    SELECT DISTINCT af.{column}
                    FROM smart_playlist_songs sps
                    JOIN metadata.audio_features af ON af.sha_id = sps.sha_id
                    WHERE sps.playlist_id = %s AND af.{column} IS NOT NULL
                """
                params = (playlist_id,)
            else:
                return []

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                rows = cur.fetchall()

        return [row[0] for row in rows if row[0] is not None]

    def _build_count_query(self, where_clause: str, params: list) -> str:
        """Build a count query for the same conditions."""
        return f"""
            WITH play_stats AS (
                SELECT
                    sha_id,
                    COUNT(*) as play_count,
                    MAX(started_at) as last_played,
                    COUNT(*) FILTER (WHERE skipped = TRUE) as skip_count,
                    AVG(completion_percent) as avg_completion,
                    COUNT(*) FILTER (
                        WHERE started_at >= NOW() - INTERVAL '7 days'
                    ) as last_week_plays,
                    COUNT(*) FILTER (
                        WHERE started_at < NOW() - INTERVAL '7 days'
                        AND started_at >= NOW() - INTERVAL '14 days'
                    ) as prev_week_plays
                FROM play_sessions
                GROUP BY sha_id
            ),
            trend_stats AS (
                SELECT
                    sha_id,
                    play_count,
                    last_played,
                    skip_count,
                    avg_completion,
                    last_week_plays,
                    CASE
                        WHEN last_week_plays > prev_week_plays THEN TRUE
                        ELSE FALSE
                    END as trending,
                    CASE
                        WHEN last_week_plays < prev_week_plays AND prev_week_plays > 0 THEN TRUE
                        ELSE FALSE
                    END as declining
                FROM play_stats
            )
            SELECT COUNT(DISTINCT s.sha_id)
            FROM metadata.songs s
            LEFT JOIN trend_stats ps ON ps.sha_id = s.sha_id
            LEFT JOIN metadata.audio_features af ON af.sha_id = s.sha_id
            WHERE {where_clause}
        """


# Singleton instance
_refresher: PlaylistRefresher | None = None


def get_playlist_refresher() -> PlaylistRefresher:
    """Get the singleton PlaylistRefresher instance."""
    global _refresher
    if _refresher is None:
        _refresher = PlaylistRefresher()
    return _refresher
