from __future__ import annotations

from dataclasses import dataclass

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


def mark_status(
    queue_id: int,
    status: str,
    download_path: str | None = None,
    error: str | None = None,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE metadata.download_queue
                SET
                    status = %s,
                    download_path = COALESCE(%s, download_path),
                    downloaded_at = CASE
                        WHEN %s = %s THEN NOW()
                        ELSE downloaded_at
                    END,
                    last_error = %s,
                    updated_at = NOW()
                WHERE queue_id = %s
                """,
                (
                    status,
                    download_path,
                    status,
                    config.DOWNLOAD_STATUS_DOWNLOADED,
                    error,
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
