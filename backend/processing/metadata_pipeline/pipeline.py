from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from backend.db.connection import get_connection

from . import config
from .musicbrainz_client import RecordingMatch, configure_client, resolve_match


@dataclass
class VerificationResult:
    processed: int
    verified: int
    skipped: int


def _fetch_unverified_songs(limit: int | None) -> list[dict]:
    query = """
        SELECT
            s.sha_id,
            s.title,
            COALESCE(
                ARRAY_AGG(DISTINCT a.name)
                FILTER (WHERE a.name IS NOT NULL),
                ARRAY[]::TEXT[]
            ) AS artists
        FROM metadata.songs s
        LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
        LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
        WHERE s.verified = FALSE
        GROUP BY s.sha_id
        ORDER BY s.created_at ASC
    """
    if limit:
        query += " LIMIT %s"

    with get_connection() as conn:
        with conn.cursor() as cur:
            if limit:
                cur.execute(query, (limit,))
            else:
                cur.execute(query)
            rows = cur.fetchall()

    return [
        {"sha_id": row[0], "title": row[1], "artists": list(row[2])}
        for row in rows
    ]


def _ensure_named_entity(cur, table: str, name: str) -> int:
    id_column = {
        "artists": "artist_id",
        "genres": "genre_id",
    }[table]

    cur.execute(
        f"""
        INSERT INTO metadata.{table} (name)
        VALUES (%s)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING {id_column}
        """,
        (name,),
    )
    return cur.fetchone()[0]


def _replace_song_artists(cur, sha_id: str, artists: Iterable[str]) -> None:
    cur.execute("DELETE FROM metadata.song_artists WHERE sha_id = %s", (sha_id,))
    for artist in artists:
        artist_id = _ensure_named_entity(cur, "artists", artist)
        cur.execute(
            """
            INSERT INTO metadata.song_artists (sha_id, artist_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, artist_id, "primary"),
        )


def _replace_song_genres(cur, sha_id: str, genres: Iterable[str]) -> None:
    cur.execute("DELETE FROM metadata.song_genres WHERE sha_id = %s", (sha_id,))
    for genre in genres:
        genre_id = _ensure_named_entity(cur, "genres", genre)
        cur.execute(
            """
            INSERT INTO metadata.song_genres (sha_id, genre_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, genre_id),
        )


def _apply_match(cur, sha_id: str, match: RecordingMatch) -> None:
    cur.execute(
        """
        UPDATE metadata.songs
        SET
            title = %s,
            album = %s,
            duration_sec = COALESCE(%s, duration_sec),
            release_year = COALESCE(%s, release_year),
            track_number = COALESCE(%s, track_number),
            verified = TRUE,
            verified_at = NOW(),
            verification_source = %s,
            verification_score = %s,
            musicbrainz_recording_id = %s,
            updated_at = NOW()
        WHERE sha_id = %s
        """,
        (
            match.title,
            match.album,
            match.duration_sec,
            match.release_year,
            match.track_number,
            config.VERIFICATION_SOURCE,
            match.score,
            match.mbid,
            sha_id,
        ),
    )


def verify_unverified_songs(
    limit: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
    dry_run: bool = False,
) -> VerificationResult:
    configure_client(rate_limit_seconds=rate_limit_seconds)

    songs = _fetch_unverified_songs(limit)
    processed = 0
    verified = 0
    skipped = 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            for song in songs:
                processed += 1
                title = song["title"]
                artists = song["artists"]
                artist = artists[0] if artists else None

                match = resolve_match(
                    title,
                    artist,
                    min_score=min_score,
                    rate_limit_seconds=rate_limit_seconds,
                )
                if not match:
                    skipped += 1
                    continue

                if dry_run:
                    verified += 1
                    continue

                _apply_match(cur, song["sha_id"], match)
                if match.artists:
                    _replace_song_artists(cur, song["sha_id"], match.artists)
                if match.tags:
                    _replace_song_genres(cur, song["sha_id"], match.tags)
                verified += 1

            conn.commit()

    return VerificationResult(processed=processed, verified=verified, skipped=skipped)
