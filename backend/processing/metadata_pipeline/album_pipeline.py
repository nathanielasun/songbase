from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from backend.db.connection import get_connection

from . import config, musicbrainz_client


@dataclass(frozen=True)
class AlbumTrack:
    track_number: int | None
    title: str
    duration_sec: int | None
    musicbrainz_recording_id: str | None


@dataclass(frozen=True)
class AlbumMetadata:
    album_id: str
    album_key: str
    title: str
    artist_name: str | None
    artist_id: int | None
    release_year: int | None
    release_date: str | None
    track_count: int | None
    total_duration_sec: int | None
    musicbrainz_release_id: str | None
    musicbrainz_release_group_id: str | None
    source: str
    payload: dict[str, Any]
    tracks: list[AlbumTrack]


def _parse_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d{4}", value)
    if not match:
        return None
    return int(match.group(0))


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


def _album_id(title: str | None, artist: str | None) -> str:
    base = f"{(title or '').lower()}::{(artist or '').lower()}"
    return hashlib.md5(base.encode("utf-8")).hexdigest()


def _ensure_artist(cur, name: str | None) -> int | None:
    if not name:
        return None
    cur.execute(
        """
        INSERT INTO metadata.artists (name)
        VALUES (%s)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING artist_id
        """,
        (name,),
    )
    return cur.fetchone()[0]


def _extract_release_artist(release: dict) -> str | None:
    credits = release.get("artist-credit") or []
    for credit in credits:
        if isinstance(credit, str):
            continue
        artist = credit.get("artist") or {}
        name = artist.get("name") or credit.get("name")
        if name:
            return name
    return None


def _duration_sec(value: object) -> int | None:
    if value is None:
        return None
    try:
        length_ms = int(value)
    except (TypeError, ValueError):
        return None
    if length_ms <= 0:
        return None
    return int(round(length_ms / 1000.0))


def _extract_tracks(release: dict) -> list[AlbumTrack]:
    tracks: list[AlbumTrack] = []
    for medium in release.get("medium-list") or []:
        for track in medium.get("track-list") or []:
            recording = track.get("recording") or {}
            title = recording.get("title") or track.get("title")
            if not title:
                continue
            position = track.get("position") or track.get("number")
            track_number = None
            if position:
                try:
                    track_number = int(str(position).split("/", 1)[0])
                except (TypeError, ValueError):
                    track_number = None
            duration = _duration_sec(recording.get("length") or track.get("length"))
            tracks.append(
                AlbumTrack(
                    track_number=track_number,
                    title=title,
                    duration_sec=duration,
                    musicbrainz_recording_id=recording.get("id"),
                )
            )
    return tracks


def _build_album_metadata(release: dict, source: str) -> AlbumMetadata | None:
    title = release.get("title")
    if not title:
        return None
    artist_name = _extract_release_artist(release)
    album_key = _album_key(title, artist_name)
    if not album_key:
        return None

    release_date = release.get("date")
    release_year = _parse_year(release_date)
    release_group = release.get("release-group") or {}

    tracks = _extract_tracks(release)
    durations = [track.duration_sec for track in tracks if track.duration_sec]
    total_duration = sum(durations) if durations else None

    album_id = _album_id(title, artist_name)

    return AlbumMetadata(
        album_id=album_id,
        album_key=album_key,
        title=title,
        artist_name=artist_name,
        artist_id=None,
        release_year=release_year,
        release_date=release_date,
        track_count=len(tracks) if tracks else None,
        total_duration_sec=total_duration,
        musicbrainz_release_id=release.get("id"),
        musicbrainz_release_group_id=release_group.get("id"),
        source=source,
        payload=release,
        tracks=tracks,
    )


def _store_album_metadata(cur, album: AlbumMetadata, dry_run: bool) -> tuple[int, int]:
    if dry_run:
        return 1, len(album.tracks)

    artist_id = _ensure_artist(cur, album.artist_name)
    payload = json.dumps(album.payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    cur.execute(
        """
        INSERT INTO metadata.albums (
            album_id,
            album_key,
            title,
            artist_name,
            artist_id,
            release_year,
            release_date,
            track_count,
            total_duration_sec,
            musicbrainz_release_id,
            musicbrainz_release_group_id,
            source,
            payload,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
        ON CONFLICT (album_id)
        DO UPDATE SET
            album_key = EXCLUDED.album_key,
            title = EXCLUDED.title,
            artist_name = EXCLUDED.artist_name,
            artist_id = EXCLUDED.artist_id,
            release_year = EXCLUDED.release_year,
            release_date = EXCLUDED.release_date,
            track_count = EXCLUDED.track_count,
            total_duration_sec = EXCLUDED.total_duration_sec,
            musicbrainz_release_id = EXCLUDED.musicbrainz_release_id,
            musicbrainz_release_group_id = EXCLUDED.musicbrainz_release_group_id,
            source = EXCLUDED.source,
            payload = EXCLUDED.payload,
            updated_at = NOW()
        """,
        (
            album.album_id,
            album.album_key,
            album.title,
            album.artist_name,
            artist_id,
            album.release_year,
            album.release_date,
            album.track_count,
            album.total_duration_sec,
            album.musicbrainz_release_id,
            album.musicbrainz_release_group_id,
            album.source,
            payload,
        ),
    )

    cur.execute("DELETE FROM metadata.album_tracks WHERE album_id = %s", (album.album_id,))
    for track in album.tracks:
        cur.execute(
            """
            INSERT INTO metadata.album_tracks (
                album_id,
                track_number,
                title,
                duration_sec,
                musicbrainz_recording_id
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                album.album_id,
                track.track_number,
                track.title,
                track.duration_sec,
                track.musicbrainz_recording_id,
            ),
        )

    return 1, len(album.tracks)


def sync_release_metadata(
    release_id: str,
    *,
    rate_limit_seconds: float | None = None,
    dry_run: bool = False,
) -> tuple[int, int]:
    musicbrainz_client.configure_client(rate_limit_seconds=rate_limit_seconds)

    print(f"Fetching release metadata for MusicBrainz ID: {release_id}")

    release = musicbrainz_client.fetch_release(
        release_id,
        rate_limit_seconds=rate_limit_seconds,
    )
    album = _build_album_metadata(release, config.VERIFICATION_SOURCE)
    if not album:
        print(f"  ✗ Failed to build album metadata")
        return 0, 0

    artist_display = album.artist_name or "Unknown Artist"
    print(f"  → Album: {artist_display} - {album.title}")
    print(f"  → Tracks: {len(album.tracks)}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            album_count, track_count = _store_album_metadata(cur, album, dry_run)
        if not dry_run:
            conn.commit()

    if dry_run:
        print(f"  ✓ Would store {album_count} album(s) with {track_count} track(s) (dry run)")
    else:
        print(f"  ✓ Stored {album_count} album(s) with {track_count} track(s)")

    return album_count, track_count
