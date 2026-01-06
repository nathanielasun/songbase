from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import musicbrainzngs

from backend.db.connection import get_connection

from . import config, musicbrainz_client
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
    artist_profiles: int
    artist_images: int
    skipped: int
    failed: int


def _sleep(rate_limit_seconds: float | None) -> None:
    delay = rate_limit_seconds or config.MUSICBRAINZ_RATE_LIMIT_SECONDS
    if delay > 0:
        time.sleep(delay)


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
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
    return json.loads(payload.decode("utf-8"))


def _download_binary(url: str, timeout: int, max_bytes: int) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _user_agent()},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        mime = response.headers.get("Content-Type", "application/octet-stream")
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("Image exceeds maximum allowed size.")
    return data, mime.split(";")[0].strip()


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

    best = musicbrainz_client.search_recording(
        song.title,
        song.artist,
        rate_limit_seconds=rate_limit_seconds,
    )
    if not best or not best.get("id"):
        return None
    return musicbrainz_client.fetch_recording(
        best["id"],
        rate_limit_seconds=rate_limit_seconds,
    )


def _extract_release(recording: dict) -> tuple[str | None, str | None]:
    releases = recording.get("release-list") or []
    if not releases:
        return None, None
    release = releases[0]
    return release.get("id"), release.get("title")


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
    except (urllib.error.URLError, ValueError):
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
    except (urllib.error.URLError, ValueError):
        return None

    return data, (mime or fallback_mime), image_url


def _search_artist_by_name(
    name: str,
    rate_limit_seconds: float | None,
) -> dict | None:
    result = musicbrainzngs.search_artists(artist=name, limit=5)
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


def _fetch_artist_profile(
    artist_name: str,
    rate_limit_seconds: float | None,
) -> tuple[dict[str, Any], str | None]:
    best = _search_artist_by_name(artist_name, rate_limit_seconds)
    if not best or not best.get("id"):
        return {}, None

    result = musicbrainzngs.get_artist_by_id(
        best["id"],
        includes=["url-rels", "tags", "aliases"],
    )
    _sleep(rate_limit_seconds)

    artist = result.get("artist") or {}
    profile = {
        "artist": artist,
        "fetched_at": time.time(),
        "source": config.IMAGE_SOURCE_MUSICBRAINZ,
    }

    image_url = None
    for relation in artist.get("url-relation-list") or []:
        if relation.get("type") == "image" and relation.get("target"):
            image_url = relation["target"]
            break

    return profile, image_url


def _store_cover_art(
    cur,
    song: SongCandidate,
    recording: dict,
    rate_limit_seconds: float | None,
    dry_run: bool,
) -> tuple[int, int]:
    release_id, release_title = _extract_release(recording)
    artist_name, _artist_id = _extract_primary_artist(recording)
    if not release_id:
        return 0, 0

    cover = _fetch_cover_art(release_id, rate_limit_seconds)
    if not cover:
        return 0, 0

    image_bytes, mime_type, image_url = cover

    if dry_run:
        return 1, 1 if release_title or song.album else 0

    image_id, _sha = get_or_create_image(
        cur,
        image_bytes,
        mime_type,
        source_name=config.IMAGE_SOURCE_COVER_ART,
        source_url=image_url,
    )

    upsert_song_image(cur, song.sha_id, image_id, config.IMAGE_TYPE_COVER)

    album_title = release_title or song.album
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
    profile, image_url = _fetch_artist_profile(artist.name, rate_limit_seconds)
    if not profile:
        return 0, 0

    image_id = None
    if image_url:
        try:
            image_bytes, mime_type = _download_binary(
                image_url,
                config.IMAGE_REQUEST_TIMEOUT_SEC,
                config.IMAGE_MAX_BYTES,
            )
            _sleep(rate_limit_seconds)
        except (urllib.error.URLError, ValueError):
            image_bytes = None
            mime_type = None
        if image_bytes and mime_type and not dry_run:
            image_id, _sha = get_or_create_image(
                cur,
                image_bytes,
                mime_type,
                source_name=config.IMAGE_SOURCE_MUSICBRAINZ,
                source_url=image_url,
            )

    if dry_run:
        return 1, 1 if image_id else 0

    upsert_artist_profile(
        cur,
        artist.name,
        profile,
        image_id,
        source_name=config.IMAGE_SOURCE_MUSICBRAINZ,
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
    artist_profiles = 0
    artist_images = 0
    skipped = 0
    failed = 0

    with with_image_connection() as image_conn:
        with image_conn.cursor() as image_cur:
            for song in songs:
                songs_processed += 1

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
                    skipped += 1
                    continue

                try:
                    recording = _resolve_recording(song, rate_limit_seconds)
                    if not recording:
                        skipped += 1
                        continue
                    song_delta, album_delta = _store_cover_art(
                        image_cur,
                        song,
                        recording,
                        rate_limit_seconds,
                        dry_run,
                    )
                    song_images += song_delta
                    album_images += album_delta
                    if not dry_run:
                        image_conn.commit()
                except Exception:  # noqa: BLE001
                    failed += 1
                    image_conn.rollback()

            for artist in artists:
                if artist_profile_exists(image_cur, artist.name):
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
                    if not dry_run:
                        image_conn.commit()
                except Exception:  # noqa: BLE001
                    failed += 1
                    image_conn.rollback()

    return ImagePipelineResult(
        songs_processed=songs_processed,
        song_images=song_images,
        album_images=album_images,
        artist_profiles=artist_profiles,
        artist_images=artist_images,
        skipped=skipped,
        failed=failed,
    )
