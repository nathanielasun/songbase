from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Iterable

import musicbrainzngs

from . import config


@dataclass(frozen=True)
class RecordingMatch:
    mbid: str
    score: int
    title: str
    artists: list[str]
    album: str | None
    release_year: int | None
    track_number: int | None
    duration_sec: int | None
    tags: list[str]


def configure_client(rate_limit_seconds: float | None = None) -> None:
    musicbrainzngs.set_useragent(
        config.MUSICBRAINZ_APP_NAME,
        config.MUSICBRAINZ_APP_VERSION,
        config.MUSICBRAINZ_CONTACT_EMAIL,
    )
    musicbrainzngs.set_rate_limit(
        limit_or_interval=rate_limit_seconds or config.MUSICBRAINZ_RATE_LIMIT_SECONDS
    )


def _sleep(rate_limit_seconds: float | None) -> None:
    delay = rate_limit_seconds or config.MUSICBRAINZ_RATE_LIMIT_SECONDS
    if delay > 0:
        time.sleep(delay)


def _parse_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d{4}", value)
    if not match:
        return None
    return int(match.group(0))


def _extract_artists(artist_credit: Iterable) -> list[str]:
    artists = []
    for credit in artist_credit:
        if isinstance(credit, str):
            continue
        name = credit.get("name")
        artist = credit.get("artist")
        if name:
            artists.append(name)
        elif artist and artist.get("name"):
            artists.append(artist["name"])
    return [artist for artist in artists if artist]


def _extract_release_info(recording: dict) -> tuple[str | None, int | None]:
    release_title = None
    release_year = _parse_year(recording.get("first-release-date"))

    release_list = recording.get("release-list") or []
    if release_list:
        release_title = release_list[0].get("title")
        if release_year is None:
            release_year = _parse_year(release_list[0].get("date"))

    return release_title, release_year


def _extract_tags(recording: dict) -> list[str]:
    tag_list = recording.get("tag-list") or []
    tags = []
    for tag in tag_list:
        name = tag.get("name")
        if name:
            tags.append(name)
        if len(tags) >= config.MUSICBRAINZ_MAX_TAGS:
            break
    return tags


def _recording_score(recording: dict) -> int:
    score = recording.get("ext:score") or recording.get("score") or 0
    try:
        return int(score)
    except (TypeError, ValueError):
        return 0


def search_recording(
    title: str,
    artist: str | None,
    limit: int = 5,
    rate_limit_seconds: float | None = None,
) -> dict | None:
    params = {"recording": title, "limit": limit}
    if artist:
        params["artist"] = artist

    result = musicbrainzngs.search_recordings(**params)
    _sleep(rate_limit_seconds)

    recordings = result.get("recording-list") or []
    if not recordings:
        return None

    best = max(recordings, key=_recording_score)
    return best


def fetch_recording(mbid: str, rate_limit_seconds: float | None = None) -> dict:
    result = musicbrainzngs.get_recording_by_id(
        mbid,
        includes=["artists", "releases", "tags"],
    )
    _sleep(rate_limit_seconds)
    return result.get("recording", {})


def resolve_match(
    title: str,
    artist: str | None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
) -> RecordingMatch | None:
    best = search_recording(title, artist, rate_limit_seconds=rate_limit_seconds)
    if not best:
        return None

    score = _recording_score(best)
    threshold = min_score if min_score is not None else config.MUSICBRAINZ_MIN_SCORE
    if score < threshold:
        return None

    mbid = best.get("id")
    if not mbid:
        return None

    recording = fetch_recording(mbid, rate_limit_seconds=rate_limit_seconds)
    if not recording:
        return None

    release_title, release_year = _extract_release_info(recording)
    artist_credit = recording.get("artist-credit") or []
    artists = _extract_artists(artist_credit)

    length_ms = recording.get("length")
    duration_sec = None
    if length_ms:
        duration_sec = int(round(float(length_ms) / 1000.0))

    return RecordingMatch(
        mbid=mbid,
        score=score,
        title=recording.get("title") or title,
        artists=artists,
        album=release_title,
        release_year=release_year,
        track_number=None,
        duration_sec=duration_sec,
        tags=_extract_tags(recording),
    )
