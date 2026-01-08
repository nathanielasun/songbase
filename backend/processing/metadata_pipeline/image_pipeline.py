from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import musicbrainzngs

from backend.db.connection import get_connection

from . import config, musicbrainz_client, spotify_client, wikidata_client
from .album_pipeline import sync_release_metadata
from .image_db import (
    album_image_exists,
    artist_profile_exists,
    get_or_create_image,
    song_image_exists,
    upsert_album_image,
    upsert_artist_profile,
    upsert_song_image,
    with_image_connection,
)


@dataclass(frozen=True)
class SongCandidate:
    sha_id: str
    title: str
    album: str | None
    artist: str | None
    recording_id: str | None


@dataclass(frozen=True)
class ArtistCandidate:
    name: str


@dataclass(frozen=True)
class ImagePipelineResult:
    songs_processed: int
    song_images: int
    album_images: int
    album_metadata: int
    album_tracks: int
    artist_profiles: int
    artist_images: int
    skipped: int
    failed: int


def _sleep(rate_limit_seconds: float | None) -> None:
    delay = rate_limit_seconds or config.MUSICBRAINZ_RATE_LIMIT_SECONDS
    if delay > 0:
        time.sleep(delay)


def _retry_delay(attempt: int) -> float:
    base = config.IMAGE_RETRY_BACKOFF_SEC
    maximum = config.IMAGE_RETRY_MAX_BACKOFF_SEC
    return min(maximum, base * (2**attempt))


def _should_retry(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in {429, 500, 502, 503, 504}
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, ssl.SSLError):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, ConnectionResetError):
        return True
    return False


def _with_retries(
    operation,
    *,
    retry_on_json_error: bool,
):
    attempts = max(0, config.IMAGE_REQUEST_RETRIES)
    last_exc: Exception | None = None
    for attempt in range(attempts + 1):
        try:
            return operation()
        except json.JSONDecodeError as exc:
            last_exc = exc
            if not retry_on_json_error or attempt >= attempts:
                raise
            time.sleep(_retry_delay(attempt))
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= attempts or not _should_retry(exc):
                raise
            time.sleep(_retry_delay(attempt))
    if last_exc:
        raise last_exc


def _mb_retry_delay(attempt: int) -> float:
    base = config.MUSICBRAINZ_RETRY_BACKOFF_SEC
    maximum = config.MUSICBRAINZ_RETRY_MAX_BACKOFF_SEC
    return min(maximum, base * (2**attempt))


def _mb_with_retries(operation):
    attempts = max(0, config.MUSICBRAINZ_REQUEST_RETRIES)
    last_exc: Exception | None = None
    for attempt in range(attempts + 1):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= attempts:
                raise
            if not isinstance(
                exc,
                (
                    musicbrainzngs.NetworkError,
                    urllib.error.URLError,
                    ssl.SSLError,
                    TimeoutError,
                    ConnectionResetError,
                ),
            ):
                raise
            time.sleep(_mb_retry_delay(attempt))
    if last_exc:
        raise last_exc


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip().lower()


def _album_key(title: str | None, artist: str | None) -> str:
    title_key = _normalize_key(title)
    if not title_key:
        return ""
    artist_key = _normalize_key(artist)
    return f"{title_key}::{artist_key}"


def _fetch_song_candidates(limit: int | None) -> list[SongCandidate]:
    query = """
        SELECT
            s.sha_id,
            s.title,
            s.album,
            s.musicbrainz_recording_id,
            COALESCE(
                MAX(a.name) FILTER (WHERE sa.role = 'primary'),
                MAX(a.name)
            ) AS artist_name
        FROM metadata.songs s
        LEFT JOIN metadata.song_artists sa ON sa.sha_id = s.sha_id
        LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
        WHERE s.verified = TRUE
        GROUP BY s.sha_id
        ORDER BY s.updated_at ASC
    """
    params: list[Any] = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [
        SongCandidate(
            sha_id=row[0],
            title=row[1],
            album=row[2],
            recording_id=row[3],
            artist=row[4],
        )
        for row in rows
    ]


def _fetch_artist_candidates(limit: int | None) -> list[ArtistCandidate]:
    query = "SELECT name FROM metadata.artists ORDER BY name ASC"
    params: list[Any] = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [ArtistCandidate(name=row[0]) for row in rows if row[0]]


def _request_json(url: str, timeout: int) -> dict:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _user_agent()},
    )

    def _operation() -> dict:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
        return json.loads(payload.decode("utf-8"))

    return _with_retries(_operation, retry_on_json_error=True)


def _download_binary(url: str, timeout: int, max_bytes: int) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _user_agent()},
    )

    def _operation() -> tuple[bytes, str]:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            mime = response.headers.get("Content-Type", "application/octet-stream")
            data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Image exceeds maximum allowed size.")
        return data, mime.split(";")[0].strip()

    return _with_retries(_operation, retry_on_json_error=False)


def _user_agent() -> str:
    return (
        f"{config.MUSICBRAINZ_APP_NAME}/{config.MUSICBRAINZ_APP_VERSION} "
        f"({config.MUSICBRAINZ_CONTACT_EMAIL})"
    )


def _resolve_recording(
    song: SongCandidate,
    rate_limit_seconds: float | None,
) -> dict | None:
    if song.recording_id:
        return musicbrainz_client.fetch_recording(
            song.recording_id,
            rate_limit_seconds=rate_limit_seconds,
        )

    match = musicbrainz_client.resolve_match(
        song.title,
        song.artist,
        artists=[song.artist] if song.artist else None,
        album=song.album or None,
        duration_sec=None,
        rate_limit_seconds=rate_limit_seconds,
    )
    if not match:
        return None
    return musicbrainz_client.fetch_recording(
        match.mbid,
        rate_limit_seconds=rate_limit_seconds,
    )


def _extract_release(
    recording: dict,
    album_hint: str | None,
) -> tuple[str | None, str | None]:
    release_title, _year, release_id, _group_id = musicbrainz_client.extract_release_details(
        recording,
        album_hint,
    )
    return release_id, release_title


def _extract_primary_artist(recording: dict) -> tuple[str | None, str | None]:
    credits = recording.get("artist-credit") or []
    for credit in credits:
        if isinstance(credit, str):
            continue
        artist = credit.get("artist") or {}
        name = artist.get("name") or credit.get("name")
        artist_id = artist.get("id")
        if name:
            return name, artist_id
    return None, None


def _fetch_cover_art(
    release_id: str,
    rate_limit_seconds: float | None,
) -> tuple[bytes, str, str] | None:
    metadata_url = f"{config.COVER_ART_ARCHIVE_BASE_URL}/release/{release_id}"
    try:
        payload = _request_json(metadata_url, config.IMAGE_REQUEST_TIMEOUT_SEC)
        _sleep(rate_limit_seconds)
    except (urllib.error.URLError, ValueError, json.JSONDecodeError, ssl.SSLError, TimeoutError, ConnectionResetError):
        return None

    images = payload.get("images") or []
    if not images:
        return None

    chosen = None
    for image in images:
        if image.get("front"):
            chosen = image
            break
    if chosen is None:
        chosen = images[0]

    image_url = chosen.get("image")
    if not image_url:
        return None

    mime = chosen.get("mime-type") or "application/octet-stream"
    try:
        data, fallback_mime = _download_binary(
            image_url,
            config.IMAGE_REQUEST_TIMEOUT_SEC,
            config.IMAGE_MAX_BYTES,
        )
        _sleep(rate_limit_seconds)
    except (urllib.error.URLError, ValueError, ssl.SSLError, TimeoutError, ConnectionResetError):
        return None

    return data, (mime or fallback_mime), image_url


def _search_artist_by_name(
    name: str,
    rate_limit_seconds: float | None,
) -> dict | None:
    result = _mb_with_retries(
        lambda: musicbrainzngs.search_artists(artist=name, limit=5)
    )
    _sleep(rate_limit_seconds)

    artists = result.get("artist-list") or []
    if not artists:
        return None

    def _score(value: dict) -> int:
        score = value.get("ext:score") or value.get("score") or 0
        try:
            return int(score)
        except (TypeError, ValueError):
            return 0

    return max(artists, key=_score)


def _fetch_artist_image_multi_source(
    artist_name: str,
    musicbrainz_artist: dict | None,
    rate_limit_seconds: float | None,
) -> tuple[str | None, str | None]:
    """
    Try multiple sources to fetch artist image.
    Returns (image_url, source_name) tuple.
    """
    # 1. Try MusicBrainz URL relations first
    if musicbrainz_artist:
        print(f"    → Trying MusicBrainz URL relations...")
        for relation in musicbrainz_artist.get("url-relation-list") or []:
            if relation.get("type") == "image" and relation.get("target"):
                print(f"    ✓ Found image from MusicBrainz")
                return relation["target"], config.IMAGE_SOURCE_MUSICBRAINZ

            # Check for Wikidata link
            if relation.get("type") == "wikidata" and relation.get("target"):
                wikidata_url = relation["target"]
                wikidata_id = wikidata_client.get_wikidata_id_from_url(wikidata_url)
                if wikidata_id:
                    print(f"    → Trying Wikidata (ID: {wikidata_id})...")
                    _sleep(rate_limit_seconds)
                    try:
                        image_url = wikidata_client.fetch_artist_image_by_wikidata_id(wikidata_id)
                        if image_url:
                            print(f"    ✓ Found image from Wikidata")
                            return image_url, config.IMAGE_SOURCE_WIKIDATA
                    except Exception as e:
                        print(f"    ✗ Wikidata fetch failed: {e}")

    # 2. Try Wikidata search
    print(f"    → Trying Wikidata search...")
    _sleep(rate_limit_seconds)
    try:
        image_url = wikidata_client.fetch_artist_image_by_name(artist_name)
        if image_url:
            print(f"    ✓ Found image from Wikidata search")
            return image_url, config.IMAGE_SOURCE_WIKIDATA
    except Exception as e:
        print(f"    ✗ Wikidata search failed: {e}")

    # 3. Try Spotify if configured
    if spotify_client.is_spotify_configured():
        print(f"    → Trying Spotify...")
        _sleep(rate_limit_seconds)
        try:
            spotify = spotify_client.get_spotify_client()
            artist_data = spotify.search_artist(artist_name)
            if artist_data and artist_data.get("images"):
                images = artist_data["images"]
                # Get the highest quality image (first one)
                if images:
                    image_url = images[0]["url"]
                    print(f"    ✓ Found image from Spotify")
                    return image_url, config.IMAGE_SOURCE_SPOTIFY
        except Exception as e:
            print(f"    ✗ Spotify fetch failed: {e}")
    else:
        print(f"    → Spotify not configured (skipping)")

    print(f"    ✗ No image found from any source")
    return None, None


def _fetch_artist_profile(
    artist_name: str,
    rate_limit_seconds: float | None,
) -> tuple[dict[str, Any], str | None, str | None]:
    """
    Fetch artist profile and image from multiple sources.
    Returns (profile, image_url, image_source) tuple.
    """
    print(f"  → Fetching MusicBrainz profile...")
    best = _search_artist_by_name(artist_name, rate_limit_seconds)
    if not best or not best.get("id"):
        print(f"    ✗ Not found in MusicBrainz")
        # Still try to get image from other sources
        image_url, image_source = _fetch_artist_image_multi_source(artist_name, None, rate_limit_seconds)
        return {}, image_url, image_source

    result = _mb_with_retries(
        lambda: musicbrainzngs.get_artist_by_id(
            best["id"],
            includes=["url-rels", "tags", "aliases"],
        )
    )
    _sleep(rate_limit_seconds)

    artist = result.get("artist") or {}
    profile = {
        "artist": artist,
        "fetched_at": time.time(),
        "source": config.IMAGE_SOURCE_MUSICBRAINZ,
    }
    print(f"    ✓ MusicBrainz profile found")

    # Fetch image from multiple sources
    image_url, image_source = _fetch_artist_image_multi_source(artist_name, artist, rate_limit_seconds)

    return profile, image_url, image_source


def _fetch_album_cover_multi_source(
    title: str,
    artist: str | None,
    release_id: str | None,
    rate_limit_seconds: float | None,
) -> tuple[bytes | None, str | None, str | None, str | None]:
    """
    Try multiple sources to fetch album cover art.
    Returns (image_bytes, mime_type, image_url, source_name) tuple.
    """
    # 1. Try Cover Art Archive first (via MusicBrainz release ID)
    if release_id:
        print(f"      → Trying Cover Art Archive...")
        cover = _fetch_cover_art(release_id, rate_limit_seconds)
        if cover:
            image_bytes, mime_type, image_url = cover
            print(f"      ✓ Found cover from Cover Art Archive")
            return image_bytes, mime_type, image_url, config.IMAGE_SOURCE_COVER_ART

    # 2. Try Spotify if configured
    if spotify_client.is_spotify_configured() and title and artist:
        print(f"      → Trying Spotify...")
        _sleep(rate_limit_seconds)
        try:
            spotify = spotify_client.get_spotify_client()
            # Search for the track/album
            track_data = spotify.search_track(title, artist)
            if track_data and track_data.get("album"):
                album_data = track_data["album"]
                images = album_data.get("images", [])
                if images:
                    # Get the highest quality image (first one)
                    image_url = images[0]["url"]
                    print(f"      ✓ Found cover from Spotify")

                    # Download the image
                    try:
                        image_bytes, mime_type = _download_binary(
                            image_url,
                            config.IMAGE_REQUEST_TIMEOUT_SEC,
                            config.IMAGE_MAX_BYTES,
                        )
                        return image_bytes, mime_type, image_url, config.IMAGE_SOURCE_SPOTIFY
                    except Exception as e:
                        print(f"      ✗ Failed to download Spotify image: {e}")
        except Exception as e:
            print(f"      ✗ Spotify search failed: {e}")

    print(f"      ✗ No cover art found from any source")
    return None, None, None, None


def _store_cover_art(
    cur,
    song: SongCandidate,
    release_id: str | None,
    release_title: str | None,
    artist_name: str | None,
    rate_limit_seconds: float | None,
    dry_run: bool,
) -> tuple[int, int]:
    album_title = release_title or song.album
    image_bytes, mime_type, image_url, source_name = _fetch_album_cover_multi_source(
        album_title or song.title,
        artist_name or song.artist,
        release_id,
        rate_limit_seconds,
    )

    if not image_bytes:
        return 0, 0

    if dry_run:
        return 1, 1 if album_title else 0

    image_id, _sha = get_or_create_image(
        cur,
        image_bytes,
        mime_type,
        source_name=source_name or config.IMAGE_SOURCE_COVER_ART,
        source_url=image_url,
    )

    upsert_song_image(cur, song.sha_id, image_id, config.IMAGE_TYPE_COVER)

    if album_title:
        album_key = _album_key(album_title, artist_name or song.artist)
        if album_key:
            upsert_album_image(
                cur,
                album_key,
                album_title,
                artist_name or song.artist,
                image_id,
                config.IMAGE_TYPE_COVER,
            )
            return 1, 1

    return 1, 0


def _store_artist_profile(
    cur,
    artist: ArtistCandidate,
    rate_limit_seconds: float | None,
    dry_run: bool,
) -> tuple[int, int]:
    profile, image_url, image_source = _fetch_artist_profile(artist.name, rate_limit_seconds)

    # If we don't have a profile or image, return early
    if not profile and not image_url:
        return 0, 0

    # Use the actual image source or fall back to MusicBrainz
    actual_source = image_source or config.IMAGE_SOURCE_MUSICBRAINZ

    image_id = None
    if image_url:
        print(f"    → Downloading image from {actual_source}...")
        try:
            image_bytes, mime_type = _download_binary(
                image_url,
                config.IMAGE_REQUEST_TIMEOUT_SEC,
                config.IMAGE_MAX_BYTES,
            )
            _sleep(rate_limit_seconds)
            print(f"    ✓ Image downloaded successfully")
        except (urllib.error.URLError, ValueError, ssl.SSLError, TimeoutError, ConnectionResetError) as e:
            print(f"    ✗ Image download failed: {e}")
            image_bytes = None
            mime_type = None

        if image_bytes and mime_type and not dry_run:
            image_id, _sha = get_or_create_image(
                cur,
                image_bytes,
                mime_type,
                source_name=actual_source,
                source_url=image_url,
            )

    if dry_run:
        return 1, 1 if image_url else 0

    # Only store profile if we have one
    if profile:
        upsert_artist_profile(
            cur,
            artist.name,
            profile,
            image_id,
            source_name=actual_source,
            source_url=image_url,
        )

    return 1, 1 if image_id else 0


def sync_images_and_profiles(
    limit_songs: int | None = None,
    limit_artists: int | None = None,
    rate_limit_seconds: float | None = None,
    dry_run: bool = False,
) -> ImagePipelineResult:
    musicbrainz_client.configure_client(rate_limit_seconds=rate_limit_seconds)

    songs = _fetch_song_candidates(limit_songs)
    artists = _fetch_artist_candidates(limit_artists)

    songs_processed = 0
    song_images = 0
    album_images = 0
    album_metadata = 0
    album_tracks = 0
    artist_profiles = 0
    artist_images = 0
    skipped = 0
    failed = 0

    total_songs = len(songs)
    total_artists = len(artists)

    print(f"\nStarting image sync for {total_songs} song(s) and {total_artists} artist(s)...\n")

    synced_releases: set[str] = set()

    with with_image_connection() as image_conn:
        with image_conn.cursor() as image_cur:
            for song in songs:
                songs_processed += 1

                artist_display = song.artist or "Unknown Artist"
                print(f"[Songs {songs_processed}/{total_songs}] Processing: {artist_display} - {song.title}")

                has_song_image = song_image_exists(
                    image_cur,
                    song.sha_id,
                    config.IMAGE_TYPE_COVER,
                )
                album_key = _album_key(song.album, song.artist)
                has_album_image = (
                    album_image_exists(
                        image_cur,
                        album_key,
                        config.IMAGE_TYPE_COVER,
                    )
                    if album_key
                    else False
                )
                if has_song_image and has_album_image:
                    print(f"  → Already has cover art, skipping")
                    skipped += 1
                    continue

                try:
                    recording = _resolve_recording(song, rate_limit_seconds)
                    if not recording:
                        print(f"  ✗ No recording found")
                        skipped += 1
                        continue

                    release_id, release_title = _extract_release(
                        recording,
                        song.album,
                    )
                    artist_name, _artist_id = _extract_primary_artist(recording)

                    if release_id and release_id not in synced_releases:
                        synced_releases.add(release_id)
                        print(f"  → Syncing album metadata: {release_title or song.album or 'Unknown Album'}")
                        try:
                            album_delta, track_delta = sync_release_metadata(
                                release_id,
                                rate_limit_seconds=rate_limit_seconds,
                                dry_run=dry_run,
                            )
                            album_metadata += album_delta
                            album_tracks += track_delta
                        except Exception as e:  # noqa: BLE001
                            print(f"    ✗ Album metadata failed: {str(e)}")
                            failed += 1

                    song_delta, album_delta = _store_cover_art(
                        image_cur,
                        song,
                        release_id,
                        release_title,
                        artist_name,
                        rate_limit_seconds,
                        dry_run,
                    )
                    song_images += song_delta
                    album_images += album_delta
                    if song_delta > 0 or album_delta > 0:
                        print(f"  ✓ Cover art stored (song: {song_delta}, album: {album_delta})")
                    else:
                        print(f"  → No cover art available")
                    if not dry_run:
                        image_conn.commit()
                except Exception as e:  # noqa: BLE001
                    print(f"  ✗ Failed: {str(e)}")
                    failed += 1
                    image_conn.rollback()

            artist_count = 0
            if total_artists > 0:
                print(f"\nProcessing artist profiles...\n")

            for artist in artists:
                artist_count += 1
                print(f"[Artists {artist_count}/{total_artists}] Processing: {artist.name}")

                if artist_profile_exists(image_cur, artist.name):
                    print(f"  → Already has profile, skipping")
                    skipped += 1
                    continue

                try:
                    profile_delta, image_delta = _store_artist_profile(
                        image_cur,
                        artist,
                        rate_limit_seconds,
                        dry_run,
                    )
                    artist_profiles += profile_delta
                    artist_images += image_delta
                    if profile_delta > 0:
                        if image_delta > 0:
                            print(f"  ✓ Profile and image stored")
                        else:
                            print(f"  ✓ Profile stored (no image available)")
                    else:
                        print(f"  ✗ No profile found")
                    if not dry_run:
                        image_conn.commit()
                except Exception as e:  # noqa: BLE001
                    print(f"  ✗ Failed: {str(e)}")
                    failed += 1
                    image_conn.rollback()

    return ImagePipelineResult(
        songs_processed=songs_processed,
        song_images=song_images,
        album_images=album_images,
        album_metadata=album_metadata,
        album_tracks=album_tracks,
        artist_profiles=artist_profiles,
        artist_images=artist_images,
        skipped=skipped,
        failed=failed,
    )
