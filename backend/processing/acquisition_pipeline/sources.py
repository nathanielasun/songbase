from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from backend.db.connection import get_connection

from . import config


@dataclass(frozen=True)
class SourceItem:
    title: str
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    search_query: str | None = None
    source_url: str | None = None


def load_sources_file(path: Path) -> list[SourceItem]:
    if not path.exists():
        return []

    items: list[SourceItem] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if "title" not in payload or not payload["title"]:
            raise ValueError("Each source must include a non-empty title.")
        items.append(
            SourceItem(
                title=str(payload["title"]),
                artist=payload.get("artist"),
                album=payload.get("album"),
                genre=payload.get("genre"),
                search_query=payload.get("search_query"),
                source_url=payload.get("source_url"),
            )
        )

    return items


def insert_sources(items: Iterable[SourceItem]) -> int:
    rows = [
        (
            item.title,
            item.artist,
            item.album,
            item.genre,
            item.search_query,
            item.source_url,
            config.DOWNLOAD_STATUS_PENDING,
        )
        for item in items
    ]
    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
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
                ON CONFLICT DO NOTHING
                """,
                rows,
            )
        conn.commit()

    return len(rows)


def ensure_sources(path: Path | None = None) -> int:
    sources_path = path or config.SOURCES_PATH
    items = load_sources_file(sources_path)
    return insert_sources(items)
