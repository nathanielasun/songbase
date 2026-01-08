"""Multi-source metadata resolver for comprehensive song verification."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import config
from . import spotify_client
from . import wikidata_client
from .filename_parser import generate_title_variants, parse_filename, should_parse_filename
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


def _try_musicbrainz(
    title: str,
    artist: str | None,
    artists: list[str] | None,
    album: str | None,
    duration_sec: int | None,
    min_score: int | None,
    rate_limit_seconds: float | None,
    status_callback: StatusCallback | None = None,
) -> MetadataMatch | None:
    """Try to resolve metadata using MusicBrainz."""
    if status_callback:
        status_callback("  → Trying MusicBrainz...")

    try:
        mb_match = musicbrainz_resolve(
            title,
            artist,
            artists=artists,
            album=album,
            duration_sec=duration_sec,
            min_score=min_score,
            rate_limit_seconds=rate_limit_seconds,
        )

        if mb_match:
            if status_callback:
                status_callback(f"  ✓ Found match from MusicBrainz (score: {mb_match.score})")
            return MetadataMatch(
                title=mb_match.title,
                artists=mb_match.artists,
                album=mb_match.album,
                duration_sec=mb_match.duration_sec,
                release_year=mb_match.release_year,
                track_number=mb_match.track_number,
                tags=mb_match.tags,
                score=mb_match.score,
                source="musicbrainz",
                mbid=mb_match.mbid,
                release_id=mb_match.release_id,
                release_group_id=mb_match.release_group_id,
            )
        else:
            if status_callback:
                status_callback("  ✗ No match from MusicBrainz")
    except Exception as e:
        if status_callback:
            status_callback(f"  ✗ MusicBrainz error: {str(e)}")

    return None


def _try_spotify(
    title: str,
    artist: str | None,
    album: str | None,
    status_callback: StatusCallback | None = None,
) -> MetadataMatch | None:
    """Try to resolve metadata using Spotify."""
    if not spotify_client.is_spotify_configured():
        if status_callback:
            status_callback("  ⚠ Spotify not configured (skipping)")
        return None

    if status_callback:
        status_callback("  → Trying Spotify...")

    try:
        spotify = spotify_client.get_spotify_client()
        track_data = spotify.search_track(title, artist, album)

        if track_data:
            # Extract metadata from Spotify response
            track_title = track_data.get("name", title)
            track_artists = [a.get("name") for a in track_data.get("artists", []) if a.get("name")]
            track_album = track_data.get("album", {}).get("name")
            track_duration_ms = track_data.get("duration_ms")
            track_duration_sec = int(track_duration_ms / 1000) if track_duration_ms else None
            track_number = track_data.get("track_number")

            # Get release year from album
            release_year = None
            release_date = track_data.get("album", {}).get("release_date")
            if release_date:
                try:
                    release_year = int(release_date.split("-")[0])
                except (ValueError, IndexError):
                    pass

            # Calculate a confidence score (0-100)
            # Spotify doesn't provide a score, so we estimate based on match quality
            score = 85  # Base score for Spotify match

            if status_callback:
                artist_display = track_artists[0] if track_artists else "Unknown"
                status_callback(f"  ✓ Found match from Spotify: {artist_display} - {track_title}")

            return MetadataMatch(
                title=track_title,
                artists=track_artists,
                album=track_album,
                duration_sec=track_duration_sec,
                release_year=release_year,
                track_number=track_number,
                tags=[],  # Spotify doesn't provide genre tags in search
                score=score,
                source="spotify",
                spotify_track_id=track_data.get("id"),
                spotify_album_id=track_data.get("album", {}).get("id"),
            )
        else:
            if status_callback:
                status_callback("  ✗ No match from Spotify")
    except Exception as e:
        if status_callback:
            status_callback(f"  ✗ Spotify error: {str(e)}")

    return None


def _try_wikidata_artist(
    artist_name: str,
    status_callback: StatusCallback | None = None,
) -> str | None:
    """Try to get artist information from Wikidata."""
    if status_callback:
        status_callback(f"  → Trying Wikidata for artist: {artist_name}...")

    try:
        # Search for the artist entity
        results = wikidata_client.search_entity(artist_name, entity_type="item", limit=3)

        if results:
            wikidata_id = results[0].get("id")
            if status_callback:
                status_callback(f"  ✓ Found artist on Wikidata: {wikidata_id}")
            return wikidata_id
        else:
            if status_callback:
                status_callback("  ✗ No artist found on Wikidata")
    except Exception as e:
        if status_callback:
            status_callback(f"  ✗ Wikidata error: {str(e)}")

    return None


def resolve_multi_source(
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
    Resolve metadata using multiple sources in order of preference.

    Order of attempts:
    1. MusicBrainz (most reliable for music metadata)
    2. Spotify (good for modern commercial music)
    3. Wikidata (for additional artist information)

    If all sources fail with the original title, progressively tries
    stripped variants (e.g., "Firemen Official Visualizer" → "Firemen").

    Returns the first successful match, or None if all sources fail.
    """
    # Generate title variants (original + progressively stripped versions)
    title_variants = generate_title_variants(title)

    # Try each title variant
    for variant_idx, title_variant in enumerate(title_variants):
        # Only show variant info if we're trying something other than the original
        if variant_idx > 0 and status_callback:
            status_callback(f"  → Trying simplified title: '{title_variant}'...")

        # Try MusicBrainz first
        match = _try_musicbrainz(
            title_variant,
            artist,
            artists,
            album,
            duration_sec,
            min_score,
            rate_limit_seconds,
            # Only show detailed status for first variant to avoid spam
            status_callback if variant_idx == 0 else None,
        )
        if match:
            if variant_idx > 0 and status_callback:
                status_callback(f"  ✓ Match found with simplified title!")
            return match

        # Try Spotify if MusicBrainz failed
        match_spotify = _try_spotify(
            title_variant,
            artist,
            album,
            # Only show detailed status for first variant
            status_callback if variant_idx == 0 else None,
        )
        if match_spotify:
            if variant_idx > 0 and status_callback:
                status_callback(f"  ✓ Match found with simplified title!")
            return match_spotify

    # If we have an artist name, try to get additional info from Wikidata
    if artist and status_callback:
        _try_wikidata_artist(artist, status_callback)

    return None


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
    1. Try with existing metadata (all sources)
    2. Parse filename to extract artist/title
    3. Try with parsed metadata (all sources)
    4. Try title-only search (all sources)
    """
    artist_list = artists or ([artist] if artist else [])

    # Strategy 1: Try with existing metadata
    if artist or artist_list:
        if status_callback:
            artist_display = artist or artist_list[0]
            status_callback(f"Attempting with existing metadata: {artist_display} - {title}")

        match = resolve_multi_source(
            title,
            artist,
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
    if should_parse_filename(title, artist):
        if status_callback:
            status_callback(f"Parsing filename for additional metadata...")

        parsed_options = parse_filename(title)

        for parsed in parsed_options:
            if parsed.confidence < 0.5:
                break

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
                # Validate that the match corresponds to our parsed data
                if parsed.artist:
                    from .musicbrainz_client import _best_artist_similarity, _normalize_text

                    parsed_artist_similarity = _best_artist_similarity(
                        [parsed.artist],
                        match.artists,
                    )
                    if parsed_artist_similarity < 0.6:
                        if status_callback:
                            status_callback(f"  ⚠ Artist mismatch (similarity: {parsed_artist_similarity:.2f}), trying next option...")
                        continue

                    from .musicbrainz_client import _similarity
                    title_similarity = _similarity(
                        _normalize_text(parsed.title),
                        _normalize_text(match.title),
                    )
                    if title_similarity < 0.7:
                        if status_callback:
                            status_callback(f"  ⚠ Title mismatch (similarity: {title_similarity:.2f}), trying next option...")
                        continue

                return match

    # Strategy 3: Fall back to title-only search
    if not artist and not artist_list:
        if status_callback:
            status_callback(f"Attempting title-only search: {title}")

        match = resolve_multi_source(
            title,
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
