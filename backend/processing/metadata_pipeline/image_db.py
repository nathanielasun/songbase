from __future__ import annotations

import hashlib
import json
from typing import Any

from backend.db.image_connection import get_image_connection


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _profile_payload(profile: dict[str, Any]) -> str:
    return json.dumps(profile, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def get_or_create_image(
    cur,
    image_bytes: bytes,
    mime_type: str,
    source_name: str | None = None,
    source_url: str | None = None,
) -> tuple[int, str]:
    sha256 = _sha256_bytes(image_bytes)
    cur.execute(
        "SELECT image_id FROM media.image_assets WHERE sha256 = %s",
        (sha256,),
    )
    row = cur.fetchone()
    if row:
        return row[0], sha256

    cur.execute(
        """
        INSERT INTO media.image_assets (
            sha256,
            mime_type,
            byte_size,
            image_bytes,
            source_url,
            source_name
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING image_id
        """,
        (sha256, mime_type, len(image_bytes), image_bytes, source_url, source_name),
    )
    return cur.fetchone()[0], sha256


def upsert_song_image(
    cur,
    song_sha_id: str,
    image_id: int,
    image_type: str,
) -> None:
    cur.execute(
        """
        INSERT INTO media.song_images (song_sha_id, image_id, image_type)
        VALUES (%s, %s, %s)
        ON CONFLICT (song_sha_id, image_type)
        DO UPDATE SET image_id = EXCLUDED.image_id
        """,
        (song_sha_id, image_id, image_type),
    )


def upsert_album_image(
    cur,
    album_key: str,
    album_title: str,
    album_artist: str | None,
    image_id: int,
    image_type: str,
) -> None:
    cur.execute(
        """
        INSERT INTO media.album_images (
            album_key,
            album_title,
            album_artist,
            image_id,
            image_type
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (album_key, image_type)
        DO UPDATE SET
            album_title = EXCLUDED.album_title,
            album_artist = EXCLUDED.album_artist,
            image_id = EXCLUDED.image_id
        """,
        (album_key, album_title, album_artist, image_id, image_type),
    )


def upsert_artist_profile(
    cur,
    artist_name: str,
    profile: dict[str, Any],
    image_id: int | None,
    source_name: str | None,
    source_url: str | None,
) -> str:
    payload = _profile_payload(profile)
    profile_sha = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    cur.execute(
        """
        INSERT INTO media.artist_profiles (
            artist_name,
            profile_sha256,
            profile_json,
            image_id,
            source_name,
            source_url
        )
        VALUES (%s, %s, %s::jsonb, %s, %s, %s)
        ON CONFLICT (artist_name)
        DO UPDATE SET
            profile_sha256 = EXCLUDED.profile_sha256,
            profile_json = EXCLUDED.profile_json,
            image_id = COALESCE(EXCLUDED.image_id, media.artist_profiles.image_id),
            source_name = EXCLUDED.source_name,
            source_url = EXCLUDED.source_url
        """,
        (artist_name, profile_sha, payload, image_id, source_name, source_url),
    )
    return profile_sha


def song_image_exists(cur, song_sha_id: str, image_type: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM media.song_images
        WHERE song_sha_id = %s AND image_type = %s
        """,
        (song_sha_id, image_type),
    )
    return cur.fetchone() is not None


def album_image_exists(cur, album_key: str, image_type: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM media.album_images
        WHERE album_key = %s AND image_type = %s
        """,
        (album_key, image_type),
    )
    return cur.fetchone() is not None


def artist_profile_exists(cur, artist_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM media.artist_profiles WHERE artist_name = %s",
        (artist_name,),
    )
    return cur.fetchone() is not None


def artist_image_exists(cur, artist_name: str) -> bool:
    """Check if artist profile exists AND has an image."""
    cur.execute(
        "SELECT 1 FROM media.artist_profiles WHERE artist_name = %s AND image_id IS NOT NULL",
        (artist_name,),
    )
    return cur.fetchone() is not None


def with_image_connection():
    return get_image_connection()
