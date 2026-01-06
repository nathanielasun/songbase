from __future__ import annotations

import csv
import json
import time
import urllib.request
from typing import Iterable

import musicbrainzngs

from . import config
from .sources import SourceItem

try:
    from ..metadata_pipeline import musicbrainz_client
except ImportError:  # pragma: no cover
    from backend.processing.metadata_pipeline import musicbrainz_client


def _configure_musicbrainz(rate_limit_seconds: float | None) -> None:
    musicbrainz_client.configure_client(rate_limit_seconds=rate_limit_seconds)


def _sleep(rate_limit_seconds: float | None) -> None:
    delay = (
        rate_limit_seconds
        if rate_limit_seconds is not None
        else config.DISCOVERY_RATE_LIMIT_SECONDS
    )
    if delay > 0:
        time.sleep(delay)


def _extract_artist(recording: dict) -> str | None:
    credits = recording.get("artist-credit") or []
    for credit in credits:
        if isinstance(credit, str):
            continue
        if credit.get("name"):
            return credit["name"]
        artist = credit.get("artist")
        if artist and artist.get("name"):
            return artist["name"]
    return None


def _extract_album(recording: dict) -> str | None:
    releases = recording.get("release-list") or []
    if not releases:
        return None
    title = releases[0].get("title")
    return title or None


def _recording_to_source(
    recording: dict,
    genre: str | None = None,
) -> SourceItem | None:
    title = recording.get("title")
    if not title:
        return None
    artist = _extract_artist(recording)
    album = _extract_album(recording)
    return SourceItem(
        title=str(title),
        artist=str(artist) if artist else None,
        album=str(album) if album else None,
        genre=genre,
    )


def _search_recordings(
    params: dict,
    rate_limit_seconds: float | None,
) -> list[dict]:
    try:
        result = musicbrainzngs.search_recordings(**params)
    except Exception:  # noqa: BLE001
        return []
    _sleep(rate_limit_seconds)
    return result.get("recording-list") or []


def discover_by_genre(
    genres: Iterable[str],
    limit_per_genre: int,
    rate_limit_seconds: float | None = None,
) -> list[SourceItem]:
    _configure_musicbrainz(rate_limit_seconds)
    results: list[SourceItem] = []

    for genre in genres:
        query = f'tag:"{genre}"'
        recordings = _search_recordings(
            {"query": query, "limit": limit_per_genre},
            rate_limit_seconds,
        )
        for recording in recordings:
            item = _recording_to_source(recording, genre=genre)
            if item:
                results.append(item)

    return results


def discover_by_artist(
    artists: Iterable[str],
    limit_per_artist: int,
    rate_limit_seconds: float | None = None,
) -> list[SourceItem]:
    _configure_musicbrainz(rate_limit_seconds)
    results: list[SourceItem] = []

    for artist in artists:
        recordings = _search_recordings(
            {"artist": artist, "limit": limit_per_artist},
            rate_limit_seconds,
        )
        for recording in recordings:
            item = _recording_to_source(recording)
            if item:
                results.append(item)

    return results


def discover_by_album(
    albums: Iterable[tuple[str, str | None]],
    limit_per_album: int,
    rate_limit_seconds: float | None = None,
) -> list[SourceItem]:
    _configure_musicbrainz(rate_limit_seconds)
    results: list[SourceItem] = []

    for album, artist in albums:
        params = {"release": album, "limit": limit_per_album}
        if artist:
            params["artist"] = artist
        recordings = _search_recordings(params, rate_limit_seconds)
        for recording in recordings:
            item = _recording_to_source(recording)
            if item:
                results.append(item)

    return results


def discover_hotlists(
    urls: Iterable[str],
    limit: int | None = None,
    timeout_seconds: float | None = None,
) -> list[SourceItem]:
    results: list[SourceItem] = []
    timeout = timeout_seconds or config.HOTLIST_TIMEOUT_SECONDS

    for url in urls:
        results.extend(_fetch_hotlist_url(url, timeout))
        if limit is not None and len(results) >= limit:
            return results[:limit]

    return results


def _fetch_hotlist_url(url: str, timeout: float) -> list[SourceItem]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Songbase/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except Exception:  # noqa: BLE001
        return []

    text = payload.decode("utf-8", errors="replace").strip()
    if not text:
        return []

    if _looks_like_json(text) or url.lower().endswith(".json"):
        return _parse_hotlist_json(text)
    if url.lower().endswith(".csv"):
        return _parse_hotlist_csv(text)

    return []


def _looks_like_json(text: str) -> bool:
    return text[:1] in {"[", "{"}


def _parse_hotlist_json(text: str) -> list[SourceItem]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return []

    items = _normalize_hotlist_payload(payload)
    return _items_to_sources(items)


def _parse_hotlist_csv(text: str) -> list[SourceItem]:
    reader = csv.DictReader(text.splitlines())
    items = [row for row in reader if row]
    return _items_to_sources(items)


def _normalize_hotlist_payload(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("songs", "items", "tracks", "data"):
            items = payload.get(key)
            if isinstance(items, list):
                return [item for item in items if isinstance(item, dict)]
    return []


def _items_to_sources(items: Iterable[dict]) -> list[SourceItem]:
    results: list[SourceItem] = []
    for item in items:
        title = item.get("title") or item.get("name")
        if not title:
            continue

        artist = item.get("artist") or item.get("artists")
        if isinstance(artist, list):
            artist = artist[0] if artist else None

        album = item.get("album") or item.get("release")
        genre = item.get("genre")
        search_query = item.get("search_query")
        source_url = item.get("source_url") or item.get("url")

        results.append(
            SourceItem(
                title=str(title),
                artist=str(artist) if artist else None,
                album=str(album) if album else None,
                genre=str(genre) if genre else None,
                search_query=str(search_query) if search_query else None,
                source_url=str(source_url) if source_url else None,
            )
        )

    return results
