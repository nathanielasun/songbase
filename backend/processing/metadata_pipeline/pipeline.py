from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

from backend.db.connection import get_connection

from . import config
from .multi_source_resolver import MetadataMatch, resolve_with_parsing
from .musicbrainz_client import configure_client
from .image_pipeline import (
    _album_key,
    _download_binary,
    _fetch_album_cover_multi_source,
    _fetch_artist_image_multi_source,
    _search_artist_by_name,
)
from .image_db import (
    album_image_exists,
    artist_image_exists,
    get_or_create_image,
    song_image_exists,
    upsert_album_image,
    upsert_artist_profile,
    upsert_song_image,
    with_image_connection,
)


@dataclass
class VerificationResult:
    processed: int
    verified: int
    skipped: int
    album_images_fetched: int = 0
    artist_images_fetched: int = 0


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




def _apply_match(cur, sha_id: str, match: MetadataMatch) -> None:
    """Apply metadata match to song record."""
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
            match.source,  # Use the actual source instead of hardcoded config
            match.score,
            match.mbid,
            match.release_id,
            match.release_group_id,
            sha_id,
        ),
    )


def _fetch_images_for_song(
    sha_id: str,
    match: MetadataMatch,
    rate_limit_seconds: float | None,
    log_callback: Callable[[str], None] | None = None,
) -> tuple[int, int]:
    """
    Fetch album cover and artist image for a verified song.
    Returns (album_images_fetched, artist_images_fetched) tuple.
    """
    def log(message: str) -> None:
        """Log message to console and optionally to callback."""
        if log_callback:
            log_callback(message)

    album_images = 0
    artist_images = 0

    # Use separate image database connection
    with with_image_connection() as image_conn:
        with image_conn.cursor() as image_cur:
            # Check if song already has cover art
            has_song_image = song_image_exists(image_cur, sha_id, config.IMAGE_TYPE_COVER)

            album_key = _album_key(match.album, match.artists[0] if match.artists else None)
            has_album_image = album_image_exists(image_cur, album_key, config.IMAGE_TYPE_COVER) if album_key else False

            # Fetch album cover if missing
            if not has_song_image or not has_album_image:
                log(f"    → Fetching album cover art...")
                try:
                    image_bytes, mime_type, image_url, source_name = _fetch_album_cover_multi_source(
                        match.title,
                        match.artists[0] if match.artists else None,
                        match.release_id,
                        rate_limit_seconds,
                        log_callback,
                    )

                    if image_bytes and mime_type:
                        # Store the image
                        image_id, _sha = get_or_create_image(
                            image_cur,
                            image_bytes,
                            mime_type,
                            source_name=source_name or config.IMAGE_SOURCE_COVER_ART,
                            source_url=image_url,
                        )

                        # Link to song
                        if not has_song_image:
                            upsert_song_image(image_cur, sha_id, image_id, config.IMAGE_TYPE_COVER)

                        # Link to album
                        if match.album and album_key and not has_album_image:
                            upsert_album_image(
                                image_cur,
                                album_key,
                                match.album,
                                match.artists[0] if match.artists else None,
                                image_id,
                                config.IMAGE_TYPE_COVER,
                            )
                            album_images = 1

                        log(f"    ✓ Album cover fetched from {source_name}")
                    else:
                        log(f"    → No album cover found")
                except Exception as e:  # noqa: BLE001
                    log(f"    ✗ Failed to fetch album cover: {str(e)}")

            # Fetch artist image if missing
            if match.artists:
                artist_name = match.artists[0]
                has_artist_image = artist_image_exists(image_cur, artist_name)

                if not has_artist_image:
                    log(f"    → Fetching artist image for {artist_name}...")
                    try:
                        # Get MusicBrainz artist info if available
                        musicbrainz_artist = None
                        try:
                            musicbrainz_artist = _search_artist_by_name(artist_name, rate_limit_seconds)
                        except Exception:  # noqa: BLE001
                            pass

                        # Fetch image from multiple sources
                        image_url, image_source = _fetch_artist_image_multi_source(
                            artist_name,
                            musicbrainz_artist,
                            rate_limit_seconds,
                            log_callback,
                        )

                        if image_url:
                            # Download the image
                            image_bytes, mime_type = _download_binary(
                                image_url,
                                config.IMAGE_REQUEST_TIMEOUT_SEC,
                                config.IMAGE_MAX_BYTES,
                            )

                            if image_bytes and mime_type:
                                # Store the image
                                image_id, _sha = get_or_create_image(
                                    image_cur,
                                    image_bytes,
                                    mime_type,
                                    source_name=image_source or config.IMAGE_SOURCE_MUSICBRAINZ,
                                    source_url=image_url,
                                )

                                # Create artist profile
                                profile = {
                                    "artist": musicbrainz_artist or {},
                                    "fetched_at": __import__('time').time(),
                                    "source": image_source or config.IMAGE_SOURCE_MUSICBRAINZ,
                                }

                                upsert_artist_profile(
                                    image_cur,
                                    artist_name,
                                    profile,
                                    image_id,
                                    source_name=image_source,
                                    source_url=image_url,
                                )

                                artist_images = 1
                                log(f"    ✓ Artist image fetched from {image_source}")
                            else:
                                log(f"    → No artist image found")
                        else:
                            log(f"    → No artist image found")
                    except Exception as e:  # noqa: BLE001
                        log(f"    ✗ Failed to fetch artist image: {str(e)}")

            # Commit image database changes
            image_conn.commit()

    return (album_images, artist_images)


def verify_unverified_songs(
    limit: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
    dry_run: bool = False,
    status_callback: Callable[[str], None] | None = None,
) -> VerificationResult:
    """
    Verify unverified songs using multi-source metadata resolution.

    Args:
        limit: Maximum number of songs to verify
        min_score: Minimum match score to accept
        rate_limit_seconds: Rate limit for API requests
        dry_run: If True, don't actually update the database
        status_callback: Optional callback for status updates (receives status messages)

    Returns:
        VerificationResult with counts of processed, verified, and skipped songs
    """
    configure_client(rate_limit_seconds=rate_limit_seconds)

    songs = _fetch_unverified_songs(limit)
    processed = 0
    verified = 0
    skipped = 0
    album_images_fetched = 0
    artist_images_fetched = 0
    total = len(songs)

    def log(message: str) -> None:
        """Log message to console and optionally to status callback."""
        print(message)
        if status_callback:
            status_callback(message)

    log(f"\nStarting metadata verification for {total} song(s)...\n")

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
                log(f"[{processed}/{total}] Verifying: {artist_display} - {title}")

                # Create a status callback for this specific song
                def song_status(msg: str) -> None:
                    log(f"  {msg}")

                try:
                    # Use multi-source resolver with intelligent parsing
                    match = resolve_with_parsing(
                        title,
                        artist,
                        artists=artists,
                        album=album,
                        duration_sec=duration_sec,
                        min_score=min_score,
                        rate_limit_seconds=rate_limit_seconds,
                        status_callback=song_status,
                    )
                except Exception as e:  # noqa: BLE001
                    log(f"  ✗ Error: {str(e)}")
                    skipped += 1
                    continue

                if not match:
                    log(f"  ✗ No match found from any source")
                    skipped += 1
                    continue

                if dry_run:
                    match_artist = match.artists[0] if match.artists else "Unknown"
                    log(f"  ✓ Match found (dry run): {match_artist} - {match.title} (source: {match.source}, score: {match.score})")
                    verified += 1
                    continue

                # Apply the match to the database
                _apply_match(cur, song["sha_id"], match)
                if match.artists:
                    _replace_song_artists(cur, song["sha_id"], match.artists)
                if match.tags:
                    _replace_song_genres(cur, song["sha_id"], match.tags)

                match_artist = match.artists[0] if match.artists else "Unknown"
                log(f"  ✓ Verified: {match_artist} - {match.title} (source: {match.source}, score: {match.score})")
                verified += 1

                # Fetch images for the verified song
                try:
                    album_delta, artist_delta = _fetch_images_for_song(
                        song["sha_id"],
                        match,
                        rate_limit_seconds,
                        song_status,
                    )
                    album_images_fetched += album_delta
                    artist_images_fetched += artist_delta
                except Exception as e:  # noqa: BLE001
                    log(f"  ⚠ Image fetching failed: {str(e)}")

            if not dry_run:
                conn.commit()

    log(f"\nVerification complete: {verified}/{processed} verified, {skipped} skipped")
    log(f"Images fetched: {album_images_fetched} album covers, {artist_images_fetched} artist images")
    return VerificationResult(
        processed=processed,
        verified=verified,
        skipped=skipped,
        album_images_fetched=album_images_fetched,
        artist_images_fetched=artist_images_fetched,
    )
