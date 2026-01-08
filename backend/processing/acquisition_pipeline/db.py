from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from backend.db.connection import get_connection

from . import config


@dataclass(frozen=True)
class QueueItem:
    queue_id: int
    title: str
    artist: str | None
    album: str | None
    genre: str | None
    search_query: str | None
    source_url: str | None


@dataclass(frozen=True)
class AlbumSeed:
    album: str
    artist: str | None


def fetch_pending(limit: int | None) -> list[QueueItem]:
    query = """
        SELECT queue_id, title, artist, album, genre, search_query, source_url
        FROM metadata.download_queue
        WHERE status = %s
        ORDER BY created_at ASC
    """
    params = [config.DOWNLOAD_STATUS_PENDING]
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [
        QueueItem(
            queue_id=row[0],
            title=row[1],
            artist=row[2],
            album=row[3],
            genre=row[4],
            search_query=row[5],
            source_url=row[6],
        )
        for row in rows
    ]


def fetch_seed_genres(limit: int | None) -> list[str]:
    query = """
        SELECT g.name, COUNT(*) AS total
        FROM metadata.genres g
        JOIN metadata.song_genres sg ON sg.genre_id = g.genre_id
        GROUP BY g.name
        ORDER BY total DESC, g.name ASC
    """
    params: list[object] = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [row[0] for row in rows]


def fetch_seed_artists(limit: int | None) -> list[str]:
    query = """
        SELECT a.name, COUNT(*) AS total
        FROM metadata.artists a
        JOIN metadata.song_artists sa ON sa.artist_id = a.artist_id
        GROUP BY a.name
        ORDER BY total DESC, a.name ASC
    """
    params: list[object] = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [row[0] for row in rows]


def fetch_seed_albums(limit: int | None) -> list[AlbumSeed]:
    query = """
        SELECT s.album, a.name, COUNT(*) AS total
        FROM metadata.songs s
        LEFT JOIN metadata.song_artists sa
            ON sa.sha_id = s.sha_id AND sa.role = 'primary'
        LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
        WHERE s.album IS NOT NULL AND s.album <> ''
        GROUP BY s.album, a.name
        ORDER BY total DESC, s.album ASC
    """
    params: list[object] = []
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [AlbumSeed(album=row[0], artist=row[1]) for row in rows]


def fetch_existing_song_keys(
    titles: Iterable[str],
) -> list[tuple[str, str | None]]:
    title_list = sorted({title for title in titles if title})
    if not title_list:
        return []

    query = """
        SELECT s.title, a.name
        FROM metadata.songs s
        LEFT JOIN metadata.song_artists sa
            ON sa.sha_id = s.sha_id AND sa.role = 'primary'
        LEFT JOIN metadata.artists a ON a.artist_id = sa.artist_id
        WHERE LOWER(s.title) = ANY(%s)
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (title_list,))
            rows = cur.fetchall()

    return [(row[0], row[1]) for row in rows]


def fetch_existing_queue_keys(
    titles: Iterable[str],
) -> list[tuple[str, str | None]]:
    title_list = sorted({title for title in titles if title})
    if not title_list:
        return []

    query = """
        SELECT title, artist
        FROM metadata.download_queue
        WHERE LOWER(title) = ANY(%s)
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (title_list,))
            rows = cur.fetchall()

    return [(row[0], row[1]) for row in rows]


def mark_status(
    queue_id: int,
    status: str,
    download_path: str | None = None,
    error: str | None = None,
    sha_id: str | None = None,
    stored_path: str | None = None,
    increment_attempts: bool = False,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            # If status is 'stored' or 'duplicate', delete the queue item to avoid duplication
            # Both indicate the song has been successfully processed and stored
            if status in ('stored', 'duplicate'):
                cur.execute(
                    """
                    DELETE FROM metadata.download_queue
                    WHERE queue_id = %s
                    """,
                    (queue_id,),
                )
            else:
                cur.execute(
                    """
                    UPDATE metadata.download_queue
                    SET
                        status = %s,
                        download_path = COALESCE(%s, download_path),
                        sha_id = COALESCE(%s, sha_id),
                        stored_path = COALESCE(%s, stored_path),
                        downloaded_at = CASE
                            WHEN %s = %s THEN NOW()
                            ELSE downloaded_at
                        END,
                        processed_at = CASE
                            WHEN %s = 'pcm_raw_ready' THEN NOW()
                            ELSE processed_at
                        END,
                        hashed_at = CASE
                            WHEN %s = 'hashed' THEN NOW()
                            ELSE hashed_at
                        END,
                        embedded_at = CASE
                            WHEN %s = 'embedded' THEN NOW()
                            ELSE embedded_at
                        END,
                        stored_at = CASE
                            WHEN %s = 'stored' THEN NOW()
                            ELSE stored_at
                        END,
                        last_error = %s,
                        attempts = attempts + CASE WHEN %s THEN 1 ELSE 0 END,
                        updated_at = NOW()
                    WHERE queue_id = %s
                    """,
                    (
                        status,
                        download_path,
                        sha_id,
                        stored_path,
                        status,
                        config.DOWNLOAD_STATUS_DOWNLOADED,
                        status,
                        status,
                        status,
                        status,
                        error,
                        increment_attempts,
                        queue_id,
                    ),
                )
        conn.commit()


def mark_batch(queue_ids: list[int], status: str) -> None:
    if not queue_ids:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE metadata.download_queue
                SET status = %s, updated_at = NOW()
                WHERE queue_id = ANY(%s)
                """,
                (status, queue_ids),
            )
        conn.commit()


def insert_import_item(
    title: str,
    artist: str | None,
    album: str | None,
    genre: str | None,
    search_query: str | None,
    source_url: str | None,
    status: str,
) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO metadata.download_queue (
                    title,
                    artist,
                    album,
                    genre,
                    search_query,
                    source_url,
                    status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING queue_id
                """,
                (
                    title,
                    artist,
                    album,
                    genre,
                    search_query,
                    source_url,
                    status,
                ),
            )
            queue_id = cur.fetchone()[0]
        conn.commit()
    return queue_id
