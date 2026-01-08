from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from backend.db.connection import get_connection

from . import config
from .filename_parser import parse_filename, should_parse_filename
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
            s.album,
            s.duration_sec,
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
        {
            "sha_id": row[0],
            "title": row[1],
            "album": row[2],
            "duration_sec": row[3],
            "artists": list(row[4]),
        }
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


def _resolve_with_parsing_strategies(
    title: str,
    artist: str | None,
    artists: list[str],
    album: str | None,
    duration_sec: int | None,
    min_score: int | None,
    rate_limit_seconds: float | None,
) -> RecordingMatch | None:
    """
    Attempt to resolve metadata using intelligent filename parsing.

    Tries multiple strategies in order:
    1. Use existing metadata (if available)
    2. Parse filename to extract artist/title and search with parsed data
    3. Fall back to original title-only search

    Returns the best match found, or None if no valid match exists.
    """
    # Strategy 1: Try with existing metadata first (if we have artist info)
    if artist or artists:
        match = resolve_match(
            title,
            artist,
            artists=artists,
            album=album,
            duration_sec=duration_sec,
            min_score=min_score,
            rate_limit_seconds=rate_limit_seconds,
        )
        if match:
            return match

    # Strategy 2: Check if we should parse the filename for additional metadata
    if should_parse_filename(title, artist):
        parsed_options = parse_filename(title)

        # Try each parsed option in order of confidence
        for parsed in parsed_options:
            if parsed.confidence < 0.5:
                # Skip low-confidence parses unless we have nothing else
                break

            # Build artist list for this attempt
            attempt_artists = []
            if parsed.artist:
                attempt_artists.append(parsed.artist)
            # Add existing artists as fallback
            if artists:
                attempt_artists.extend(artists)

            # Attempt resolution with parsed metadata
            match = resolve_match(
                parsed.title,
                parsed.artist,
                artists=attempt_artists if attempt_artists else None,
                album=album,
                duration_sec=duration_sec,
                min_score=min_score,
                rate_limit_seconds=rate_limit_seconds,
            )

            if match:
                # Validate that the match reasonably corresponds to our parsed data
                # Check if matched artist is similar to parsed artist
                if parsed.artist:
                    from .musicbrainz_client import _best_artist_similarity, _normalize_text

                    parsed_artist_similarity = _best_artist_similarity(
                        [parsed.artist],
                        match.artists,
                    )
                    # Require decent artist match when we parsed an artist
                    if parsed_artist_similarity < 0.6:
                        continue

                    # Also check title similarity
                    from .musicbrainz_client import _similarity

                    title_similarity = _similarity(
                        _normalize_text(parsed.title),
                        _normalize_text(match.title),
                    )
                    if title_similarity < 0.7:
                        continue

                return match

    # Strategy 3: Fall back to original title search (no artist)
    # This is already attempted within resolve_match when artist searches fail,
    # but we can try it explicitly with lower thresholds
    if not artist and not artists:
        match = resolve_match(
            title,
            None,
            artists=None,
            album=album,
            duration_sec=duration_sec,
            min_score=min_score,
            rate_limit_seconds=rate_limit_seconds,
        )
        if match:
            return match

    return None


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
            musicbrainz_release_id = %s,
            musicbrainz_release_group_id = %s,
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
            match.release_id,
            match.release_group_id,
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
    total = len(songs)

    print(f"\nStarting metadata verification for {total} song(s)...\n")

    with get_connection() as conn:
        with conn.cursor() as cur:
            for song in songs:
                processed += 1
                title = song["title"]
                artists = song["artists"]
                artist = artists[0] if artists else None
                album = song.get("album") or None
                duration_sec = song.get("duration_sec")

                # Display current status
                artist_display = artist or "Unknown Artist"
                print(f"[{processed}/{total}] Verifying: {artist_display} - {title}")

                try:
                    # Use intelligent parsing strategies for better metadata resolution
                    match = _resolve_with_parsing_strategies(
                        title,
                        artist,
                        artists=artists,
                        album=album,
                        duration_sec=duration_sec,
                        min_score=min_score,
                        rate_limit_seconds=rate_limit_seconds,
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"  ✗ Error: {str(e)}")
                    skipped += 1
                    continue
                if not match:
                    print(f"  ✗ No match found")
                    skipped += 1
                    continue

                if dry_run:
                    print(f"  ✓ Match found (dry run): {match.artists[0] if match.artists else 'Unknown'} - {match.title} (score: {match.score})")
                    verified += 1
                    continue

                _apply_match(cur, song["sha_id"], match)
                if match.artists:
                    _replace_song_artists(cur, song["sha_id"], match.artists)
                if match.tags:
                    _replace_song_genres(cur, song["sha_id"], match.tags)
                print(f"  ✓ Verified: {match.artists[0] if match.artists else 'Unknown'} - {match.title} (score: {match.score})")
                verified += 1

            conn.commit()

    return VerificationResult(processed=processed, verified=verified, skipped=skipped)
