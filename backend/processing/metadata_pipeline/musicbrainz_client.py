from __future__ import annotations

import difflib
import re
import ssl
import time
from dataclasses import dataclass
from typing import Iterable
from urllib import error as urllib_error

import musicbrainzngs

from . import config


@dataclass(frozen=True)
class RecordingMatch:
    mbid: str
    score: int
    title: str
    artists: list[str]
    album: str | None
    release_id: str | None
    release_group_id: str | None
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


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, musicbrainzngs.NetworkError):
        return True
    if isinstance(exc, urllib_error.URLError):
        return True
    if isinstance(exc, ssl.SSLError):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, ConnectionResetError):
        return True
    return False


def _retry_delay(attempt: int) -> float:
    base = config.MUSICBRAINZ_RETRY_BACKOFF_SEC
    maximum = config.MUSICBRAINZ_RETRY_MAX_BACKOFF_SEC
    return min(maximum, base * (2**attempt))


def _with_retries(operation):
    attempts = max(0, config.MUSICBRAINZ_REQUEST_RETRIES)
    last_exc: Exception | None = None
    for attempt in range(attempts + 1):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= attempts or not _is_retryable_error(exc):
                raise
            time.sleep(_retry_delay(attempt))
    if last_exc:
        raise last_exc


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


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = value.lower()
    lowered = re.sub(r"\([^)]*\)", " ", lowered)
    lowered = re.sub(r"\[[^\]]*\]", " ", lowered)
    lowered = re.sub(r"\{[^}]*\}", " ", lowered)
    lowered = re.sub(r"\b(feat|featuring|ft)\.?\b.*", " ", lowered)
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    return " ".join(lowered.split()).strip()


def _normalize_title_for_matching(value: str | None) -> str:
    """
    Normalize title for matching, removing common suffixes that don't affect song identity.
    This is more aggressive than _normalize_text for title-specific cleaning.
    """
    if not value:
        return ""

    lowered = value.lower()

    # Remove parenthetical/bracketed content
    lowered = re.sub(r"\([^)]*\)", " ", lowered)
    lowered = re.sub(r"\[[^\]]*\]", " ", lowered)
    lowered = re.sub(r"\{[^}]*\}", " ", lowered)

    # Remove featuring artists
    lowered = re.sub(r"\b(feat|featuring|ft|with)\.?\s+.*$", " ", lowered)

    # Remove common video/audio qualifiers
    qualifiers = [
        r"\b(?:official\s+)?(?:music\s+)?video\b",
        r"\b(?:official\s+)?visualizer\b",
        r"\b(?:official\s+)?audio\b",
        r"\blyric(?:s)?\s*(?:video)?\b",
        r"\b(?:4k|hd|hq|uhd|1080p|720p|480p)\b",
        r"\b(?:live|acoustic|unplugged)\b",
        r"\bremaster(?:ed)?\b",
        r"\b(?:\d{4}\s*)?(?:remaster(?:ed)?)\b",
        r"\bremix\b",
        r"\b(?:album|single|radio)\s*(?:version|edit)\b",
        r"\bm\s*v\b",
    ]
    for pattern in qualifiers:
        lowered = re.sub(pattern, " ", lowered, flags=re.IGNORECASE)

    # Remove special characters
    lowered = re.sub(r"[^\w\s]", " ", lowered)

    # Remove trailing year patterns (e.g., "2017", "1984")
    lowered = re.sub(r"\s+\d{4}\s*$", "", lowered)

    return " ".join(lowered.split()).strip()


def _normalize_artist_for_matching(value: str | None) -> str:
    """
    Normalize artist name for matching with common variations.
    """
    if not value:
        return ""

    lowered = value.lower()

    # Remove "the " prefix for matching
    lowered = re.sub(r"^the\s+", "", lowered)

    # Remove featuring and anything after
    lowered = re.sub(r"\s+(feat|featuring|ft|with|&|and|x)\b.*$", "", lowered)

    # Remove special characters
    lowered = re.sub(r"[^\w\s]", " ", lowered)

    return " ".join(lowered.split()).strip()


def _title_similarity(input_title: str, candidate_title: str) -> float:
    """
    Calculate title similarity with normalization for common variations.
    """
    norm_input = _normalize_title_for_matching(input_title)
    norm_candidate = _normalize_title_for_matching(candidate_title)

    # Direct normalized comparison
    base_sim = _similarity(norm_input, norm_candidate)

    # Also try without the original normalization for edge cases
    simple_input = _normalize_text(input_title)
    simple_candidate = _normalize_text(candidate_title)
    simple_sim = _similarity(simple_input, simple_candidate)

    return max(base_sim, simple_sim)


def _artist_similarity(input_artist: str, candidate_artist: str) -> float:
    """
    Calculate artist similarity with normalization.
    """
    norm_input = _normalize_artist_for_matching(input_artist)
    norm_candidate = _normalize_artist_for_matching(candidate_artist)

    return _similarity(norm_input, norm_candidate)


def _similarity(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _best_artist_similarity(
    input_artists: list[str],
    candidate_artists: list[str],
) -> float:
    if not input_artists or not candidate_artists:
        return 0.0
    best = 0.0
    for left in input_artists:
        for right in candidate_artists:
            # Use the new artist-specific normalization
            sim = _artist_similarity(left, right)
            best = max(best, sim)
            # Also try basic normalization for edge cases
            left_norm = _normalize_text(left)
            right_norm = _normalize_text(right)
            best = max(best, _similarity(left_norm, right_norm))
    return best


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


def _duration_matches(expected: int | None, actual: int | None) -> bool:
    if expected is None or actual is None:
        return True
    tolerance = max(
        config.MUSICBRAINZ_DURATION_TOLERANCE_SEC,
        int(expected * config.MUSICBRAINZ_DURATION_TOLERANCE_PCT),
    )
    return abs(expected - actual) <= tolerance


def _extract_release_info(recording: dict) -> tuple[str | None, int | None]:
    release_title = None
    release_year = _parse_year(recording.get("first-release-date"))

    release_list = recording.get("release-list") or []
    if release_list:
        release_title = release_list[0].get("title")
        if release_year is None:
            release_year = _parse_year(release_list[0].get("date"))

    return release_title, release_year


def _release_score(release: dict, album_hint: str | None) -> float:
    score = 0.0
    title = release.get("title") or ""
    if album_hint:
        score += _similarity(_normalize_text(album_hint), _normalize_text(title)) * 100

    status = (release.get("status") or "").lower()
    if status == "official":
        score += 10.0

    release_group = release.get("release-group") or {}
    primary_type = (release_group.get("primary-type") or "").lower()
    if primary_type == "album":
        score += 5.0
    elif primary_type == "ep":
        score += 3.0
    elif primary_type == "single":
        score -= 2.0

    return score


def select_best_release(recording: dict, album_hint: str | None = None) -> dict | None:
    release_list = recording.get("release-list") or []
    if not release_list:
        return None

    best = None
    best_score = -1.0
    for release in release_list:
        score = _release_score(release, album_hint)
        if score > best_score:
            best = release
            best_score = score

    return best or release_list[0]


def extract_release_details(
    recording: dict,
    album_hint: str | None = None,
) -> tuple[str | None, int | None, str | None, str | None]:
    release_year = _parse_year(recording.get("first-release-date"))
    release = select_best_release(recording, album_hint)
    if not release:
        return None, release_year, None, None

    release_title = release.get("title")
    if release_year is None:
        release_year = _parse_year(release.get("date"))

    release_group = release.get("release-group") or {}
    release_group_id = release_group.get("id")

    return release_title, release_year, release.get("id"), release_group_id


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


def search_recordings(
    title: str,
    artist: str | None,
    album: str | None = None,
    limit: int | None = None,
    rate_limit_seconds: float | None = None,
) -> list[dict]:
    params = {
        "recording": title,
        "limit": limit or config.MUSICBRAINZ_SEARCH_LIMIT,
    }
    if artist:
        params["artist"] = artist
    if album:
        params["release"] = album

    result = _with_retries(lambda: musicbrainzngs.search_recordings(**params))
    _sleep(rate_limit_seconds)

    return result.get("recording-list") or []


def search_recording(
    title: str,
    artist: str | None,
    limit: int = 5,
    rate_limit_seconds: float | None = None,
) -> dict | None:
    recordings = search_recordings(
        title,
        artist,
        limit=limit,
        rate_limit_seconds=rate_limit_seconds,
    )
    if not recordings:
        return None
    return max(recordings, key=_recording_score)


def fetch_recording(mbid: str, rate_limit_seconds: float | None = None) -> dict:
    result = _with_retries(
        lambda: musicbrainzngs.get_recording_by_id(
            mbid,
            includes=["artists", "releases", "tags"],
        )
    )
    _sleep(rate_limit_seconds)
    return result.get("recording", {})


def fetch_release(release_id: str, rate_limit_seconds: float | None = None) -> dict:
    result = _with_retries(
        lambda: musicbrainzngs.get_release_by_id(
            release_id,
            includes=["recordings", "artist-credits", "release-groups", "labels", "tags"],
        )
    )
    _sleep(rate_limit_seconds)
    return result.get("release", {})


def resolve_match(
    title: str,
    artist: str | None,
    *,
    artists: list[str] | None = None,
    album: str | None = None,
    duration_sec: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
) -> RecordingMatch | None:
    album_for_validation = album
    artist_list = artists or ([artist] if artist else [])
    artist_norms = [value for value in artist_list if value]
    has_artist = bool(artist_norms)

    # Search with all provided info first
    candidates = search_recordings(
        title,
        artist,
        album=album,
        rate_limit_seconds=rate_limit_seconds,
    )

    # If no results with album, try without album (but keep artist)
    if not candidates and album:
        candidates = search_recordings(
            title,
            artist,
            album=None,
            rate_limit_seconds=rate_limit_seconds,
        )
        album_for_validation = None

    # CRITICAL: Do NOT fall back to no-artist search when artist is provided.
    # This causes wrong matches like "Ed Sheeran - Bad Habits" -> "Thin Lizzy - Bad Habits".
    # Only search without artist if no artist was provided in the first place.
    if not candidates and not has_artist:
        candidates = search_recordings(
            title,
            None,
            album=None,
            rate_limit_seconds=rate_limit_seconds,
        )

    if not candidates:
        return None

    title_norm = _normalize_text(title)

    threshold = min_score if min_score is not None else config.MUSICBRAINZ_MIN_SCORE
    title_threshold = (
        config.MUSICBRAINZ_MIN_TITLE_SIMILARITY_NO_ARTIST
        if not artist_norms
        else config.MUSICBRAINZ_MIN_TITLE_SIMILARITY
    )
    best_candidate = None
    best_score = -1.0

    for candidate in candidates:
        score = _recording_score(candidate)
        if score < threshold:
            continue

        candidate_title = candidate.get("title") or ""
        # Use the enhanced title similarity with aggressive normalization
        title_sim = _title_similarity(title, candidate_title)
        # Also check basic similarity for safety
        basic_title_sim = _similarity(title_norm, _normalize_text(candidate_title))
        title_similarity = max(title_sim, basic_title_sim)

        if title_similarity < title_threshold:
            continue

        candidate_artists = _extract_artists(candidate.get("artist-credit") or [])
        artist_similarity = _best_artist_similarity(artist_norms, candidate_artists)

        # When artist is provided, REQUIRE a reasonable artist match
        # This is the key fix for preventing wrong artist matches
        if has_artist:
            if artist_similarity < config.MUSICBRAINZ_MIN_ARTIST_SIMILARITY:
                continue

        candidate_duration = _duration_sec(candidate.get("length"))
        if not _duration_matches(duration_sec, candidate_duration):
            continue

        # Scoring: heavily weight artist match when artist is provided
        # Old: score * 0.6 + title_similarity * 30 + artist_similarity * 10
        # New: prioritize artist match much more heavily
        if has_artist:
            # When we have artist info, artist match is critical
            total = score * 0.3 + title_similarity * 25 + artist_similarity * 45
        else:
            # Without artist, rely more on title and MusicBrainz score
            total = score * 0.5 + title_similarity * 40 + artist_similarity * 10

        if candidate_duration is not None and duration_sec is not None:
            total += 5.0

        if total > best_score:
            best_score = total
            best_candidate = candidate

    if not best_candidate:
        return None

    mbid = best_candidate.get("id")
    if not mbid:
        return None

    recording = fetch_recording(mbid, rate_limit_seconds=rate_limit_seconds)
    if not recording:
        return None

    release_title, release_year, release_id, release_group_id = extract_release_details(
        recording,
        album_for_validation,
    )
    artist_credit = recording.get("artist-credit") or []
    matched_artists = _extract_artists(artist_credit)

    recording_title = recording.get("title") or title
    # Use enhanced title similarity for final validation
    final_title_sim = max(
        _title_similarity(title, recording_title),
        _similarity(title_norm, _normalize_text(recording_title)),
    )
    if final_title_sim < title_threshold:
        return None

    # When artist is provided, always require artist match (not just when config flag is set)
    if has_artist:
        final_artist_sim = _best_artist_similarity(artist_norms, matched_artists)
        if final_artist_sim < config.MUSICBRAINZ_MIN_ARTIST_SIMILARITY:
            return None
    if album_for_validation and config.MUSICBRAINZ_REQUIRE_ALBUM_MATCH:
        if not release_title:
            return None
        album_similarity = _similarity(
            _normalize_text(album_for_validation),
            _normalize_text(release_title),
        )
        if album_similarity < config.MUSICBRAINZ_MIN_ALBUM_SIMILARITY:
            return None

    length_ms = recording.get("length")
    resolved_duration = _duration_sec(length_ms)
    if not _duration_matches(duration_sec, resolved_duration):
        return None

    return RecordingMatch(
        mbid=mbid,
        score=_recording_score(best_candidate),
        title=recording_title,
        artists=matched_artists,
        album=release_title,
        release_id=release_id,
        release_group_id=release_group_id,
        release_year=release_year,
        track_number=None,
        duration_sec=resolved_duration,
        tags=_extract_tags(recording),
    )
