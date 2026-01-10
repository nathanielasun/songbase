"""
Discogs API client for metadata and image fetching.

Discogs provides comprehensive music database information including:
- Release details (albums, singles, EPs)
- Track listings with durations
- Artist information
- Genre and style tags
- High-quality cover images

API Documentation: https://www.discogs.com/developers
Rate Limits: 60/min authenticated, 25/min unauthenticated
"""

from __future__ import annotations

import difflib
import json
import logging
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from . import config

logger = logging.getLogger(__name__)

# User agent required by Discogs API
USER_AGENT = f"Songbase/{config.MUSICBRAINZ_APP_VERSION} +{config.MUSICBRAINZ_CONTACT_EMAIL}"


@dataclass(frozen=True)
class DiscogsTrack:
    """Represents a track from a Discogs release."""
    position: str
    title: str
    duration_sec: int | None


@dataclass(frozen=True)
class DiscogsMatch:
    """
    Represents a matched release from Discogs.

    Similar to MusicBrainz RecordingMatch but with Discogs-specific fields.
    """
    release_id: int
    master_id: int | None
    title: str  # Track title
    artists: list[str]
    album: str  # Release title
    release_year: int | None
    track_number: str | None
    duration_sec: int | None
    genres: list[str]
    styles: list[str]
    score: int  # Matching confidence score (0-100)
    cover_image_url: str | None
    thumb_image_url: str | None
    country: str | None
    label: str | None
    catalog_number: str | None
    format: str | None  # CD, Vinyl, Digital, etc.


def is_discogs_configured() -> bool:
    """Check if Discogs API credentials are configured."""
    return bool(config.DISCOGS_USER_TOKEN) or (
        bool(config.DISCOGS_CONSUMER_KEY) and bool(config.DISCOGS_CONSUMER_SECRET)
    )


def _get_auth_header() -> dict[str, str]:
    """Get authentication header for Discogs API."""
    if config.DISCOGS_USER_TOKEN:
        return {"Authorization": f"Discogs token={config.DISCOGS_USER_TOKEN}"}
    elif config.DISCOGS_CONSUMER_KEY and config.DISCOGS_CONSUMER_SECRET:
        return {
            "Authorization": f"Discogs key={config.DISCOGS_CONSUMER_KEY}, secret={config.DISCOGS_CONSUMER_SECRET}"
        }
    return {}


def _build_headers() -> dict[str, str]:
    """Build request headers including auth and user agent."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    headers.update(_get_auth_header())
    return headers


def _sleep(rate_limit_seconds: float | None = None) -> None:
    """Sleep for rate limiting."""
    delay = rate_limit_seconds or config.DISCOGS_RATE_LIMIT_SECONDS
    if delay > 0:
        time.sleep(delay)


def _is_retryable_error(exc: Exception) -> bool:
    """Check if an error is retryable."""
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, ssl.SSLError):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, ConnectionResetError):
        return True
    if isinstance(exc, urllib.error.HTTPError):
        # Rate limit (429) and server errors (5xx) are retryable
        return exc.code in (429, 500, 502, 503, 504)
    return False


def _retry_delay(attempt: int) -> float:
    """Calculate exponential backoff delay."""
    base = 1.0
    maximum = 16.0
    return min(maximum, base * (2 ** attempt))


def _request(
    url: str,
    rate_limit_seconds: float | None = None,
) -> dict[str, Any] | None:
    """
    Make a request to the Discogs API with retries and rate limiting.

    Args:
        url: Full URL to request
        rate_limit_seconds: Optional rate limit override

    Returns:
        JSON response as dict, or None on failure
    """
    headers = _build_headers()
    request = urllib.request.Request(url, headers=headers)

    last_exc: Exception | None = None
    for attempt in range(config.DISCOGS_REQUEST_RETRIES + 1):
        try:
            with urllib.request.urlopen(
                request,
                timeout=config.DISCOGS_REQUEST_TIMEOUT_SEC,
            ) as response:
                data = response.read().decode("utf-8")
                _sleep(rate_limit_seconds)
                return json.loads(data)
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code == 404:
                return None
            if exc.code == 429:
                # Rate limited - wait longer
                retry_after = exc.headers.get("Retry-After", "60")
                try:
                    wait_time = int(retry_after)
                except ValueError:
                    wait_time = 60
                logger.warning(f"Discogs rate limited, waiting {wait_time}s")
                time.sleep(wait_time)
                continue
            if attempt >= config.DISCOGS_REQUEST_RETRIES or not _is_retryable_error(exc):
                logger.error(f"Discogs API error: {exc.code} - {exc.reason}")
                return None
            time.sleep(_retry_delay(attempt))
        except Exception as exc:
            last_exc = exc
            if attempt >= config.DISCOGS_REQUEST_RETRIES or not _is_retryable_error(exc):
                logger.error(f"Discogs request failed: {exc}")
                return None
            time.sleep(_retry_delay(attempt))

    if last_exc:
        logger.error(f"Discogs request failed after retries: {last_exc}")
    return None


def _normalize_text(value: str | None) -> str:
    """Normalize text for comparison."""
    if not value:
        return ""
    lowered = value.lower()
    # Remove parenthetical/bracketed content
    lowered = re.sub(r"\([^)]*\)", " ", lowered)
    lowered = re.sub(r"\[[^\]]*\]", " ", lowered)
    lowered = re.sub(r"\{[^}]*\}", " ", lowered)
    # Remove featuring artists
    lowered = re.sub(r"\b(feat|featuring|ft)\.?\b.*", " ", lowered)
    # Remove special characters
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    return " ".join(lowered.split()).strip()


def _normalize_title_for_matching(value: str | None) -> str:
    """
    Normalize title for matching, removing common suffixes that don't affect song identity.
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

    # Remove common audio qualifiers
    qualifiers = [
        r"\b(?:official\s+)?(?:music\s+)?video\b",
        r"\b(?:official\s+)?visualizer\b",
        r"\b(?:official\s+)?audio\b",
        r"\blyric(?:s)?\s*(?:video)?\b",
        r"\b(?:live|acoustic|unplugged)\b",
        r"\bremaster(?:ed)?\b",
        r"\bremix\b",
        r"\b(?:album|single|radio)\s*(?:version|edit)\b",
    ]
    for pattern in qualifiers:
        lowered = re.sub(pattern, " ", lowered, flags=re.IGNORECASE)

    # Remove special characters
    lowered = re.sub(r"[^\w\s]", " ", lowered)

    return " ".join(lowered.split()).strip()


def _normalize_artist_for_matching(value: str | None) -> str:
    """Normalize artist name for matching."""
    if not value:
        return ""

    lowered = value.lower()

    # Remove "the " prefix
    lowered = re.sub(r"^the\s+", "", lowered)

    # Remove featuring and anything after
    lowered = re.sub(r"\s+(feat|featuring|ft|with|&|and|x)\b.*$", "", lowered)

    # Remove special characters
    lowered = re.sub(r"[^\w\s]", " ", lowered)

    return " ".join(lowered.split()).strip()


def _similarity(a: str | None, b: str | None) -> float:
    """Calculate string similarity ratio."""
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _title_similarity(input_title: str, candidate_title: str) -> float:
    """Calculate title similarity with normalization."""
    norm_input = _normalize_title_for_matching(input_title)
    norm_candidate = _normalize_title_for_matching(candidate_title)
    base_sim = _similarity(norm_input, norm_candidate)

    # Also try simple normalization
    simple_input = _normalize_text(input_title)
    simple_candidate = _normalize_text(candidate_title)
    simple_sim = _similarity(simple_input, simple_candidate)

    return max(base_sim, simple_sim)


def _artist_similarity(input_artist: str, candidate_artist: str) -> float:
    """Calculate artist similarity with normalization."""
    norm_input = _normalize_artist_for_matching(input_artist)
    norm_candidate = _normalize_artist_for_matching(candidate_artist)
    return _similarity(norm_input, norm_candidate)


def _best_artist_similarity(
    input_artists: list[str],
    candidate_artists: list[str],
) -> float:
    """Find best artist similarity between two artist lists."""
    if not input_artists or not candidate_artists:
        return 0.0
    best = 0.0
    for left in input_artists:
        for right in candidate_artists:
            sim = _artist_similarity(left, right)
            best = max(best, sim)
            # Also try basic normalization
            left_norm = _normalize_text(left)
            right_norm = _normalize_text(right)
            best = max(best, _similarity(left_norm, right_norm))
    return best


def _parse_duration(duration_str: str | None) -> int | None:
    """
    Parse Discogs duration string (MM:SS or H:MM:SS) to seconds.
    """
    if not duration_str:
        return None

    parts = duration_str.strip().split(":")
    try:
        if len(parts) == 2:
            minutes, seconds = int(parts[0]), int(parts[1])
            return minutes * 60 + seconds
        elif len(parts) == 3:
            hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
            return hours * 3600 + minutes * 60 + seconds
    except ValueError:
        pass
    return None


def _duration_matches(expected: int | None, actual: int | None) -> bool:
    """Check if durations match within tolerance."""
    if expected is None or actual is None:
        return True
    tolerance = max(5, int(expected * 0.05))  # 5 seconds or 5%
    return abs(expected - actual) <= tolerance


def _parse_year(value: str | int | None) -> int | None:
    """Parse year from string or int."""
    if value is None:
        return None
    if isinstance(value, int):
        return value if 1900 <= value <= 2100 else None
    match = re.search(r"\d{4}", str(value))
    if match:
        year = int(match.group(0))
        return year if 1900 <= year <= 2100 else None
    return None


def _extract_artists_from_release(release: dict) -> list[str]:
    """Extract artist names from a Discogs release object."""
    artists = []
    for artist_entry in release.get("artists", []):
        name = artist_entry.get("name", "")
        # Discogs uses numbered suffixes for disambiguation, e.g., "Nirvana (2)"
        # Remove these for matching
        clean_name = re.sub(r"\s*\(\d+\)\s*$", "", name)
        if clean_name and clean_name.lower() != "various":
            artists.append(clean_name)
    return artists


def _extract_cover_images(release: dict) -> tuple[str | None, str | None]:
    """Extract cover image URLs from release."""
    images = release.get("images", [])
    cover_url = None
    thumb_url = None

    for img in images:
        img_type = img.get("type", "").lower()
        if img_type == "primary":
            cover_url = img.get("uri") or img.get("resource_url")
            thumb_url = img.get("uri150")
            break

    # Fallback to first image if no primary
    if not cover_url and images:
        first_img = images[0]
        cover_url = first_img.get("uri") or first_img.get("resource_url")
        thumb_url = first_img.get("uri150")

    return cover_url, thumb_url


def _format_to_string(formats: list[dict]) -> str | None:
    """Extract format string from formats list."""
    if not formats:
        return None
    # Take the first format
    fmt = formats[0]
    name = fmt.get("name", "")
    descriptions = fmt.get("descriptions", [])
    if descriptions:
        return f"{name} ({', '.join(descriptions)})"
    return name


def _release_type_score(release: dict) -> float:
    """
    Score release by type preference.
    Albums > EPs > Singles > Compilations
    Official > Promotional > Bootleg
    """
    score = 0.0

    formats = release.get("format", [])
    if isinstance(formats, str):
        formats = [formats]
    formats_lower = [f.lower() for f in formats]

    # Format scoring
    if any("album" in f for f in formats_lower):
        score += 10.0
    elif any("lp" in f for f in formats_lower):
        score += 10.0
    elif any("ep" in f for f in formats_lower):
        score += 5.0
    elif any("single" in f for f in formats_lower):
        score += 2.0
    elif any("compilation" in f for f in formats_lower):
        score -= 5.0

    # CD and Vinyl are generally more reliable than digital
    if any("cd" in f for f in formats_lower):
        score += 2.0
    elif any("vinyl" in f for f in formats_lower):
        score += 1.0

    return score


def search_releases(
    query: str,
    artist: str | None = None,
    release_title: str | None = None,
    search_type: str = "release",
    limit: int | None = None,
    rate_limit_seconds: float | None = None,
) -> list[dict]:
    """
    Search Discogs database for releases.

    Args:
        query: General search query (usually track title)
        artist: Artist name to filter by
        release_title: Album/release title to filter by
        search_type: Type of search ("release", "master", "artist")
        limit: Maximum results to return
        rate_limit_seconds: Rate limit override

    Returns:
        List of search results
    """
    params = {
        "q": query,
        "type": search_type,
        "per_page": limit or config.DISCOGS_SEARCH_LIMIT,
    }

    if artist:
        params["artist"] = artist
    if release_title:
        params["release_title"] = release_title

    url = f"{config.DISCOGS_API_URL}/database/search?{urllib.parse.urlencode(params)}"

    response = _request(url, rate_limit_seconds)
    if not response:
        return []

    return response.get("results", [])


def fetch_release(
    release_id: int,
    rate_limit_seconds: float | None = None,
) -> dict | None:
    """
    Fetch full release details from Discogs.

    Args:
        release_id: Discogs release ID
        rate_limit_seconds: Rate limit override

    Returns:
        Release details dict or None
    """
    url = f"{config.DISCOGS_API_URL}/releases/{release_id}"
    return _request(url, rate_limit_seconds)


def fetch_master(
    master_id: int,
    rate_limit_seconds: float | None = None,
) -> dict | None:
    """
    Fetch master release details from Discogs.

    Args:
        master_id: Discogs master release ID
        rate_limit_seconds: Rate limit override

    Returns:
        Master release details dict or None
    """
    url = f"{config.DISCOGS_API_URL}/masters/{master_id}"
    return _request(url, rate_limit_seconds)


def fetch_artist(
    artist_id: int,
    rate_limit_seconds: float | None = None,
) -> dict | None:
    """
    Fetch artist details from Discogs.

    Args:
        artist_id: Discogs artist ID
        rate_limit_seconds: Rate limit override

    Returns:
        Artist details dict or None
    """
    url = f"{config.DISCOGS_API_URL}/artists/{artist_id}"
    return _request(url, rate_limit_seconds)


def _find_matching_track(
    release: dict,
    title: str,
    duration_sec: int | None = None,
) -> tuple[DiscogsTrack | None, float]:
    """
    Find the best matching track in a release's tracklist.

    Returns:
        Tuple of (matched track, similarity score)
    """
    tracklist = release.get("tracklist", [])
    if not tracklist:
        return None, 0.0

    best_track = None
    best_score = 0.0

    for track in tracklist:
        track_title = track.get("title", "")
        track_type = track.get("type_", "").lower()

        # Skip non-track entries (headings, etc.)
        if track_type and track_type != "track":
            continue

        title_sim = _title_similarity(title, track_title)

        # Duration bonus
        track_duration = _parse_duration(track.get("duration"))
        duration_bonus = 0.0
        if duration_sec and track_duration:
            if _duration_matches(duration_sec, track_duration):
                duration_bonus = 0.1
            else:
                # Duration mismatch penalty
                duration_bonus = -0.2

        score = title_sim + duration_bonus

        if score > best_score:
            best_score = score
            best_track = DiscogsTrack(
                position=track.get("position", ""),
                title=track_title,
                duration_sec=track_duration,
            )

    return best_track, best_score


def resolve_match(
    title: str,
    artist: str | None = None,
    *,
    artists: list[str] | None = None,
    album: str | None = None,
    duration_sec: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
) -> DiscogsMatch | None:
    """
    Resolve a track to a Discogs release.

    This is the main entry point, matching the interface of MusicBrainz resolve_match.

    Args:
        title: Track title to search for
        artist: Primary artist name
        artists: List of artist names (alternative to artist)
        album: Album/release title hint
        duration_sec: Expected track duration in seconds
        min_score: Minimum score threshold (0-100)
        rate_limit_seconds: Rate limit override

    Returns:
        DiscogsMatch if found, None otherwise
    """
    if not is_discogs_configured():
        logger.debug("Discogs not configured, skipping")
        return None

    artist_list = artists or ([artist] if artist else [])
    artist_norms = [a for a in artist_list if a]
    has_artist = bool(artist_norms)
    primary_artist = artist_norms[0] if artist_norms else None

    threshold = min_score if min_score is not None else config.DISCOGS_MIN_SCORE

    # Build search query - Discogs works best with combined artist + title
    search_query = title
    if primary_artist:
        search_query = f"{primary_artist} {title}"

    # Try searching with album first if provided
    candidates = []
    if album:
        candidates = search_releases(
            query=search_query,
            artist=primary_artist,
            release_title=album,
            rate_limit_seconds=rate_limit_seconds,
        )

    # Fallback to search without album
    if not candidates:
        candidates = search_releases(
            query=search_query,
            artist=primary_artist,
            rate_limit_seconds=rate_limit_seconds,
        )

    # If still no results and we have an artist, try just the title
    if not candidates and has_artist:
        candidates = search_releases(
            query=title,
            rate_limit_seconds=rate_limit_seconds,
        )

    if not candidates:
        logger.debug(f"No Discogs results for: {title} - {primary_artist}")
        return None

    best_match: DiscogsMatch | None = None
    best_score = -1.0

    for candidate in candidates[:config.DISCOGS_SEARCH_LIMIT]:
        release_id = candidate.get("id")
        if not release_id:
            continue

        # Extract basic info from search result
        candidate_title = candidate.get("title", "")
        candidate_year = _parse_year(candidate.get("year"))

        # Parse artist - title format common in Discogs
        # Format: "Artist Name - Release Title" or "Artist Name - Release Title (Qualifier)"
        candidate_artists = []
        candidate_album = candidate_title

        if " - " in candidate_title:
            parts = candidate_title.split(" - ", 1)
            candidate_artists = [parts[0].strip()]
            candidate_album = parts[1].strip()

        # Artist similarity check
        artist_sim = 0.0
        if has_artist and candidate_artists:
            artist_sim = _best_artist_similarity(artist_norms, candidate_artists)
            if artist_sim < config.DISCOGS_MIN_ARTIST_SIMILARITY:
                continue

        # Release type scoring
        type_score = _release_type_score(candidate)

        # For accurate track matching, we need to fetch the full release
        release = fetch_release(release_id, rate_limit_seconds)
        if not release:
            continue

        # Get proper artist list from release
        release_artists = _extract_artists_from_release(release)
        if release_artists:
            artist_sim = _best_artist_similarity(artist_norms, release_artists)
            if has_artist and artist_sim < config.DISCOGS_MIN_ARTIST_SIMILARITY:
                continue

        # Find matching track in the release
        matched_track, track_score = _find_matching_track(release, title, duration_sec)
        if not matched_track:
            continue

        title_sim = _title_similarity(title, matched_track.title)
        if title_sim < config.DISCOGS_MIN_TITLE_SIMILARITY:
            continue

        # Album similarity if provided
        album_sim = 0.0
        release_title = release.get("title", "")
        if album:
            album_sim = _title_similarity(album, release_title)

        # Calculate total score (0-100 scale)
        if has_artist:
            # Weight artist match heavily when artist is provided
            total_score = (
                title_sim * 35 +
                artist_sim * 40 +
                album_sim * 10 +
                type_score +
                (track_score * 5)
            )
        else:
            # Without artist, rely more on title
            total_score = (
                title_sim * 50 +
                artist_sim * 15 +
                album_sim * 15 +
                type_score +
                (track_score * 10)
            )

        if total_score < threshold:
            continue

        if total_score > best_score:
            best_score = total_score

            cover_url, thumb_url = _extract_cover_images(release)
            genres = release.get("genres", [])
            styles = release.get("styles", [])

            # Get label info
            labels = release.get("labels", [])
            label_name = labels[0].get("name") if labels else None
            catalog_num = labels[0].get("catno") if labels else None

            best_match = DiscogsMatch(
                release_id=release_id,
                master_id=release.get("master_id"),
                title=matched_track.title,
                artists=release_artists or candidate_artists,
                album=release_title,
                release_year=_parse_year(release.get("year")) or candidate_year,
                track_number=matched_track.position,
                duration_sec=matched_track.duration_sec,
                genres=genres,
                styles=styles,
                score=int(total_score),
                cover_image_url=cover_url,
                thumb_image_url=thumb_url,
                country=release.get("country"),
                label=label_name,
                catalog_number=catalog_num,
                format=_format_to_string(release.get("formats", [])),
            )

    if best_match:
        logger.info(
            f"Discogs match: '{best_match.title}' by {best_match.artists} "
            f"from '{best_match.album}' (score: {best_match.score})"
        )

    return best_match


def fetch_release_cover(
    release_id: int,
    rate_limit_seconds: float | None = None,
) -> tuple[bytes | None, str | None, str | None]:
    """
    Fetch album cover image from a Discogs release.

    Args:
        release_id: Discogs release ID
        rate_limit_seconds: Rate limit override

    Returns:
        Tuple of (image_bytes, mime_type, source_url) or (None, None, None)
    """
    release = fetch_release(release_id, rate_limit_seconds)
    if not release:
        return None, None, None

    cover_url, _ = _extract_cover_images(release)
    if not cover_url:
        return None, None, None

    # Download the image
    try:
        headers = _build_headers()
        request = urllib.request.Request(cover_url, headers=headers)
        with urllib.request.urlopen(
            request,
            timeout=config.IMAGE_REQUEST_TIMEOUT_SEC,
        ) as response:
            content_type = response.headers.get("Content-Type", "image/jpeg")
            image_bytes = response.read()

            if len(image_bytes) > config.IMAGE_MAX_BYTES:
                logger.warning(f"Discogs image too large: {len(image_bytes)} bytes")
                return None, None, None

            return image_bytes, content_type, cover_url
    except Exception as exc:
        logger.error(f"Failed to fetch Discogs cover: {exc}")
        return None, None, None


def fetch_artist_image(
    artist_name: str,
    rate_limit_seconds: float | None = None,
) -> tuple[bytes | None, str | None, str | None]:
    """
    Search for an artist and fetch their image.

    Args:
        artist_name: Artist name to search for
        rate_limit_seconds: Rate limit override

    Returns:
        Tuple of (image_bytes, mime_type, source_url) or (None, None, None)
    """
    if not is_discogs_configured():
        return None, None, None

    # Search for artist
    params = {
        "q": artist_name,
        "type": "artist",
        "per_page": 5,
    }
    url = f"{config.DISCOGS_API_URL}/database/search?{urllib.parse.urlencode(params)}"

    response = _request(url, rate_limit_seconds)
    if not response:
        return None, None, None

    results = response.get("results", [])
    if not results:
        return None, None, None

    # Find best matching artist
    best_artist = None
    best_sim = 0.0

    for result in results:
        result_title = result.get("title", "")
        sim = _artist_similarity(artist_name, result_title)
        if sim > best_sim:
            best_sim = sim
            best_artist = result

    if not best_artist or best_sim < 0.7:
        return None, None, None

    # Get cover image from search result
    cover_url = best_artist.get("cover_image")
    if not cover_url:
        # Fetch full artist details
        artist_id = best_artist.get("id")
        if artist_id:
            artist_details = fetch_artist(artist_id, rate_limit_seconds)
            if artist_details:
                images = artist_details.get("images", [])
                if images:
                    cover_url = images[0].get("uri") or images[0].get("resource_url")

    if not cover_url:
        return None, None, None

    # Download the image
    try:
        headers = _build_headers()
        request = urllib.request.Request(cover_url, headers=headers)
        with urllib.request.urlopen(
            request,
            timeout=config.IMAGE_REQUEST_TIMEOUT_SEC,
        ) as response:
            content_type = response.headers.get("Content-Type", "image/jpeg")
            image_bytes = response.read()

            if len(image_bytes) > config.IMAGE_MAX_BYTES:
                return None, None, None

            return image_bytes, content_type, cover_url
    except Exception as exc:
        logger.error(f"Failed to fetch Discogs artist image: {exc}")
        return None, None, None
