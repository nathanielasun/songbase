"""Multi-source metadata resolver for comprehensive song verification."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

from . import config
from . import spotify_client
from .filename_parser import (
    STOP_WORDS,
    _clean_text,
    generate_artist_variants,
    generate_title_variants,
    is_placeholder_artist,
    parse_filename,
    should_parse_filename,
)
from .musicbrainz_client import RecordingMatch, resolve_match as musicbrainz_resolve


@dataclass
class MetadataMatch:
    """Enhanced metadata match with source tracking."""
    title: str
    artists: list[str]
    album: str | None
    duration_sec: int | None
    release_year: int | None
    track_number: int | None
    tags: list[str]
    score: int
    source: str
    # MusicBrainz IDs (if available)
    mbid: str | None = None
    release_id: str | None = None
    release_group_id: str | None = None
    # Spotify IDs (if available)
    spotify_track_id: str | None = None
    spotify_album_id: str | None = None
    # Wikidata IDs (if available)
    wikidata_id: str | None = None


StatusCallback = Callable[[str], None]


def _normalize_for_query(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = _clean_text(value)
    cleaned = cleaned.replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _normalize_artist_list(artists: list[str] | None) -> list[str]:
    if not artists:
        return []
    normalized: list[str] = []
    for artist in artists:
        cleaned = _normalize_for_query(artist)
        if not cleaned or is_placeholder_artist(cleaned):
            continue
        normalized.append(cleaned)
    return _dedupe(normalized)


def _title_variants(title: str | None) -> list[str]:
    if not title:
        return []
    raw_title = title.replace("_", " ")
    raw_title = re.sub(r"\s+", " ", raw_title).strip()
    cleaned_title = _normalize_for_query(title) or raw_title
    variants: list[str] = []
    for base in [raw_title, cleaned_title]:
        if not base:
            continue
        variants.extend(generate_title_variants(base))
    variants = [variant for variant in variants if variant and len(variant) >= 2]
    return _dedupe(variants)[:6]


def _artist_variants(artist: str | None, artists: list[str] | None) -> list[str]:
    normalized_artists = _normalize_artist_list(artists)
    cleaned_artist = _normalize_for_query(artist)
    if cleaned_artist and not is_placeholder_artist(cleaned_artist):
        variants = generate_artist_variants(cleaned_artist)
    else:
        variants = []
    variants.extend(normalized_artists)
    return _dedupe([value for value in variants if value])


def _is_weak_title(value: str | None) -> bool:
    if not value:
        return True
    cleaned = value.strip()
    if not cleaned:
        return True
    if cleaned.isdigit():
        return True
    tokens = [token for token in re.split(r"\s+", cleaned.lower()) if token]
    if not tokens:
        return True
    if all(token in STOP_WORDS for token in tokens):
        return True
    return False


def _parse_release_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d{4}", value)
    if not match:
        return None
    return int(match.group(0))


def _match_from_musicbrainz(match: RecordingMatch) -> MetadataMatch:
    return MetadataMatch(
        title=match.title,
        artists=match.artists,
        album=match.album,
        duration_sec=match.duration_sec,
        release_year=match.release_year,
        track_number=match.track_number,
        tags=match.tags,
        score=match.score,
        source=config.VERIFICATION_SOURCE,
        mbid=match.mbid,
        release_id=match.release_id,
        release_group_id=match.release_group_id,
    )


def _match_from_spotify(track: dict[str, Any]) -> MetadataMatch | None:
    title = track.get("name")
    if not title:
        return None
    artist_names = [
        artist.get("name")
        for artist in track.get("artists", [])
        if artist.get("name")
    ]
    album_data = track.get("album") or {}
    release_year = _parse_release_year(album_data.get("release_date"))
    duration_ms = track.get("duration_ms")
    duration_sec = int(round(duration_ms / 1000.0)) if duration_ms else None
    return MetadataMatch(
        title=title,
        artists=artist_names,
        album=album_data.get("name"),
        duration_sec=duration_sec,
        release_year=release_year,
        track_number=track.get("track_number"),
        tags=[],
        score=95,
        source="spotify",
        spotify_track_id=track.get("id"),
        spotify_album_id=album_data.get("id"),
    )


def resolve_multi_source(
    title: str,
    artist: str | None,
    artists: list[str] | None,
    album: str | None,
    duration_sec: int | None,
    min_score: int | None,
    rate_limit_seconds: float | None,
    status_callback: StatusCallback | None = None,
) -> MetadataMatch | None:
    title_variants = _title_variants(title)
    if not title_variants:
        return None
    artist_variants = _artist_variants(artist, artists)
    artist_candidates = artist_variants if artist_variants else [None]
    album_candidate = _normalize_for_query(album)

    if status_callback:
        status_callback("→ Trying MusicBrainz...")

    for index, title_variant in enumerate(title_variants):
        if status_callback and index > 0:
            status_callback(f"→ Trying simplified title: '{title_variant}'...")
        for artist_variant in artist_candidates:
            match = musicbrainz_resolve(
                title_variant,
                artist_variant,
                artists=artist_variants or artists,
                album=album_candidate,
                duration_sec=duration_sec,
                min_score=min_score,
                rate_limit_seconds=rate_limit_seconds,
            )
            if match:
                return _match_from_musicbrainz(match)

    if spotify_client.is_spotify_configured():
        if status_callback:
            status_callback("→ Trying Spotify...")
        spotify = spotify_client.get_spotify_client()
        for title_variant in title_variants:
            for artist_variant in artist_candidates:
                track = spotify.search_track(title_variant, artist_variant, album_candidate)
                if track:
                    spotify_match = _match_from_spotify(track)
                    if spotify_match:
                        return spotify_match
    elif status_callback:
        status_callback("⚠ Spotify not configured (skipping)")

    return None


def _try_musicbrainz(
    title: str,
    artist: str | None,
    artists: list[str] | None = None,
    album: str | None = None,
    duration_sec: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
    status_callback: StatusCallback | None = None,
) -> MetadataMatch | None:
    """
    Resolve metadata with intelligent filename parsing and multi-source fallback.

    Strategy:
    0. Clean input metadata (remove underscores, handle stop words)
    1. Try with existing (cleaned) metadata
    2. Parse filename to extract artist/title
    3. Try title-only search (including "Artist Title" merged)
    """
    
    # Step 0: Clean inputs
    cleaned_title = _clean_text(title)
    cleaned_artist = _clean_text(artist) if artist else None
    
    # If artist is just a stop word, treat as None/Unknown
    if cleaned_artist and cleaned_artist.lower() in STOP_WORDS:
        if status_callback:
            status_callback(f"  ⚠ Artist '{artist}' is a stop word, ignoring.")
        cleaned_artist = None
        artists = None

    artist_list = artists or ([cleaned_artist] if cleaned_artist else [])
    
    # If we cleaned the artist (e.g. AOA_ -> AOA), use the cleaned version
    if cleaned_artist and cleaned_artist != artist:
        artist_list = [cleaned_artist]

    # Strategy 1: Try with existing metadata (if valid)
    if cleaned_artist or artist_list:
        if status_callback:
            artist_display = cleaned_artist or artist_list[0]
            status_callback(f"Attempting with existing metadata: {artist_display} - {cleaned_title}")

        match = resolve_multi_source(
            cleaned_title,
            cleaned_artist,
            artist_list,
            album,
            duration_sec,
            min_score,
            rate_limit_seconds,
            status_callback,
        )
        if match:
            return match

    # Strategy 2: Parse filename if appropriate
    # Pass the ORIGINAL title/filename to parser, as it needs the structure
    if should_parse_filename(title, cleaned_artist):
        if status_callback:
            status_callback(f"Parsing filename for additional metadata...")

        parsed_options = parse_filename(title)
        best_match = None
        best_weighted_score = -1.0

        # Consider top candidates with reasonable confidence
        candidates = [p for p in parsed_options if p.confidence >= 0.3]
        # Limit to top 4
        candidates = candidates[:4]

        for parsed in candidates:
            if status_callback:
                if parsed.artist:
                    status_callback(f"Trying parsed metadata: {parsed.artist} - {parsed.title} (confidence: {parsed.confidence:.2f})")
                else:
                    status_callback(f"Trying parsed title: {parsed.title} (confidence: {parsed.confidence:.2f})")

            # Build artist list for this attempt
            attempt_artists = []
            if parsed.artist:
                attempt_artists.append(parsed.artist)
            if artist_list:
                attempt_artists.extend(artist_list)

            # Try multi-source resolution with parsed metadata
            match = resolve_multi_source(
                parsed.title,
                parsed.artist,
                attempt_artists if attempt_artists else None,
                album,
                duration_sec,
                min_score,
                rate_limit_seconds,
                status_callback,
            )

            if match:
                # Validate match consistency if we had a parsed artist
                if parsed.artist:
                    from .musicbrainz_client import _best_artist_similarity, _normalize_text

                    parsed_artist_similarity = _best_artist_similarity(
                        [parsed.artist],
                        match.artists,
                    )
                    
                    # If similarity is low, we penalize score heavily but don't reject outright
                    # unless it's very low.
                    if parsed_artist_similarity < 0.4:
                         if status_callback:
                            status_callback(f"  ⚠ Artist mismatch (similarity: {parsed_artist_similarity:.2f}), skipping...")
                         continue

                # Calculate weighted score
                # match.score is 0-100
                # parsed.confidence is 0.0-1.0
                weighted_score = match.score * parsed.confidence
                
                if status_callback:
                    status_callback(f"  ✓ Match found (score: {match.score}, conf: {parsed.confidence}, weighted: {weighted_score:.1f})")

                if weighted_score > best_weighted_score:
                    best_match = match
                    best_weighted_score = weighted_score
        
        if best_match:
            if status_callback:
                status_callback(f"Selected best match: {best_match.artists[0]} - {best_match.title} (weighted score: {best_weighted_score:.1f})")
            return best_match

    # Strategy 3: Fall back to title-only search
    # We try:
    # A. The cleaned title (if no artist)
    # B. The merged "Artist Title" (if we had an artist but it failed)
    
    searches = []
    if cleaned_title:
        searches.append(cleaned_title)
        
    # If we have an "Artist" that failed, maybe it's part of the title?
    if cleaned_artist and cleaned_title:
        merged = f"{cleaned_artist} {cleaned_title}"
        searches.append(merged)
    
    # Also add the raw title with underscores replaced by spaces
    raw_spaced = title.replace("_", " ").strip()
    if raw_spaced not in searches:
        searches.append(raw_spaced)

    for search_term in searches:
        if not search_term or len(search_term) < 2:
            continue
            
        if status_callback:
            status_callback(f"Attempting title-only search: {search_term}")

        match = resolve_multi_source(
            search_term,
            None,
            None,
            album,
            duration_sec,
            min_score,
            rate_limit_seconds,
            status_callback,
        )
        if match:
            return match

def resolve_with_parsing(
    title: str,
    artist: str | None,
    artists: list[str] | None = None,
    album: str | None = None,
    duration_sec: int | None = None,
    min_score: int | None = None,
    rate_limit_seconds: float | None = None,
    status_callback: StatusCallback | None = None,
) -> MetadataMatch | None:
    """
    Resolve metadata with intelligent filename parsing and multi-source fallback.

    Strategy:
    0. Clean input metadata (remove underscores, handle stop words)
    1. Try with existing (cleaned) metadata
    2. Parse filename to extract artist/title
    3. Try title-only search (including "Artist Title" merged)
    """
    
    # Step 0: Clean inputs
    cleaned_title = _normalize_for_query(title)
    cleaned_artist = _normalize_for_query(artist) if artist else None
    placeholder_artist = None
    
    # If artist is just a stop word or placeholder, treat as None/Unknown
    if cleaned_artist and is_placeholder_artist(cleaned_artist):
        if status_callback:
            status_callback(f"  ⚠ Artist '{artist}' looks like a placeholder, ignoring.")
        placeholder_artist = cleaned_artist
        cleaned_artist = None

    artist_list = _normalize_artist_list(artists)
    
    # If we cleaned the artist (e.g. AOA_ -> AOA), use the cleaned version
    if cleaned_artist and cleaned_artist not in artist_list:
        artist_list = [cleaned_artist, *artist_list]

    # Strategy 1: Try with existing metadata (if valid)
    if cleaned_title and (cleaned_artist or artist_list):
        if status_callback:
            artist_display = cleaned_artist or artist_list[0]
            status_callback(f"Attempting with existing metadata: {artist_display} - {cleaned_title}")

        match = resolve_multi_source(
            cleaned_title,
            cleaned_artist,
            artist_list,
            album,
            duration_sec,
            min_score,
            rate_limit_seconds,
            status_callback,
        )
        if match:
            return match

    # Strategy 2: Parse filename if appropriate
    # Pass the ORIGINAL title/filename to parser, as it needs the structure
    if should_parse_filename(title, cleaned_artist):
        if status_callback:
            status_callback(f"Parsing filename for additional metadata...")

        parsed_options = parse_filename(title)
        best_match = None
        best_weighted_score = -1.0

        # Consider top candidates with reasonable confidence
        candidates = [p for p in parsed_options if p.confidence >= 0.3]
        # Limit to top 4
        candidates = candidates[:4]

        for parsed in candidates:
            if status_callback:
                if parsed.artist:
                    status_callback(f"Trying parsed metadata: {parsed.artist} - {parsed.title} (confidence: {parsed.confidence:.2f})")
                else:
                    status_callback(f"Trying parsed title: {parsed.title} (confidence: {parsed.confidence:.2f})")

            # Build artist list for this attempt
            attempt_artists: list[str] = []
            parsed_artist = _normalize_for_query(parsed.artist) if parsed.artist else None
            if parsed_artist and not is_placeholder_artist(parsed_artist):
                attempt_artists.append(parsed_artist)
            if artist_list:
                attempt_artists.extend(artist_list)
            attempt_artists = _dedupe(attempt_artists)

            # Try multi-source resolution with parsed metadata
            match = resolve_multi_source(
                parsed.title,
                parsed_artist,
                attempt_artists if attempt_artists else None,
                album,
                duration_sec,
                min_score,
                rate_limit_seconds,
                status_callback,
            )

            if not match and parsed_artist and is_placeholder_artist(parsed_artist):
                merged_title = f"{parsed_artist} {parsed.title}".strip()
                match = resolve_multi_source(
                    merged_title,
                    None,
                    None,
                    album,
                    duration_sec,
                    min_score,
                    rate_limit_seconds,
                    status_callback,
                )

            if match:
                # Validate match consistency if we had a parsed artist
                if parsed_artist:
                    from .musicbrainz_client import _best_artist_similarity, _normalize_text

                    parsed_artist_similarity = _best_artist_similarity(
                        [parsed_artist],
                        match.artists,
                    )
                    
                    # If similarity is low, we penalize score heavily but don't reject outright
                    # unless it's very low.
                    if parsed_artist_similarity < 0.4:
                         if status_callback:
                            status_callback(f"  ⚠ Artist mismatch (similarity: {parsed_artist_similarity:.2f}), skipping...")
                         continue

                # Calculate weighted score
                # match.score is 0-100
                # parsed.confidence is 0.0-1.0
                weighted_score = match.score * parsed.confidence
                
                if status_callback:
                    status_callback(f"  ✓ Match found (score: {match.score}, conf: {parsed.confidence}, weighted: {weighted_score:.1f})")

                if weighted_score > best_weighted_score:
                    best_match = match
                    best_weighted_score = weighted_score
        
        if best_match:
            if status_callback:
                status_callback(f"Selected best match: {best_match.artists[0]} - {best_match.title} (weighted score: {best_weighted_score:.1f})")
            return best_match

    # Strategy 3: Fall back to title-only search
    # We try:
    # A. The cleaned title (if no artist)
    # B. The merged "Artist Title" (if we had an artist but it failed)
    
    searches = []
    if cleaned_title:
        searches.append(cleaned_title)
        
    # If we have an "Artist" that failed, maybe it's part of the title?
    if cleaned_artist and cleaned_title:
        merged = f"{cleaned_artist} {cleaned_title}"
        searches.append(merged)

    if placeholder_artist and cleaned_title:
        merged = f"{placeholder_artist} {cleaned_title}"
        searches.append(merged)

    if cleaned_artist and _is_weak_title(cleaned_title):
        searches.append(cleaned_artist)
    
    # Also add the raw title with underscores replaced by spaces
    raw_spaced = title.replace("_", " ").strip()
    if raw_spaced not in searches:
        searches.append(raw_spaced)

    for search_term in searches:
        if not search_term or len(search_term) < 2:
            continue
            
        if status_callback:
            status_callback(f"Attempting title-only search: {search_term}")

        match = resolve_multi_source(
            search_term,
            None,
            None,
            album,
            duration_sec,
            min_score,
            rate_limit_seconds,
            status_callback,
        )
        if match:
            return match

    if status_callback:
        status_callback("✗ All sources exhausted - no match found")

    return None
