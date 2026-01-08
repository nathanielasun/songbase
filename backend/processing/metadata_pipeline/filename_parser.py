"""Intelligent filename parser for extracting artist and song information."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterator

# Common qualifiers to progressively strip from titles
# Ordered from most specific to least specific
TITLE_QUALIFIERS = [
    # Official designations
    r"\b(?:official\s+)?(?:music\s+)?video\b",
    r"\b(?:official\s+)?visualizer\b",
    r"\b(?:official\s+)?audio\b",
    r"\blyric\s+video\b",
    r"\blyrics?\b",

    # Video quality indicators
    r"\b(?:4K|HD|HQ|UHD|1080p|720p|480p)\b",

    # Performance types
    r"\b(?:live|acoustic|unplugged)\b",
    r"\b(?:live\s+(?:at|from|in|@))\s+[^\[\(]+",

    # Version types
    r"\b(?:remaster(?:ed)?|remastered\s+\d{4})\b",
    r"\b(?:remix|extended|radio\s+edit|album\s+version|single\s+version)\b",
    r"\b(?:explicit|clean)\s+version\b",

    # Common abbreviations
    r"\bM\s*V\b",
    r"\bMV\b",

    # Parenthetical/bracketed qualifiers
    r"\s*[\[\(]\s*(?:official|audio|video|visualizer|lyric|lyrics|hd|hq|4k|mv)\s*[\]\)]",
    r"\s*[\[\(]\s*(?:official\s+)?(?:music\s+)?video\s*[\]\)]",
    r"\s*[\[\(]\s*(?:official\s+)?visualizer\s*[\]\)]",
    r"\s*[\[\(]\s*(?:lyric\s+)?video\s*[\]\)]",
]


@dataclass(frozen=True)
class ParsedMetadata:
    """Extracted metadata from a filename."""

    artist: str | None
    title: str
    confidence: float  # 0.0 to 1.0


def _clean_text(text: str) -> str:
    """Clean and normalize text by removing common artifacts."""
    # Remove file extensions
    text = re.sub(r"\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$", "", text, flags=re.IGNORECASE)

    # Remove common video suffixes
    text = re.sub(r"\s*\b(M\s*V|MV|Music\s*Video|Official\s*Video|Official|Audio|Lyric\s*Video|HD|HQ|4K)\b\s*$", "", text, flags=re.IGNORECASE)

    # Remove brackets and their content at the end (often quality/format tags)
    text = re.sub(r"\s*[\[\(]([^\]\)]*(?:kbps|hz|bit|320|256|192|128|quality|rip|official|audio|video|lyric))[\]\)]\s*$", "", text, flags=re.IGNORECASE)

    # Remove year patterns (4 digits in parentheses/brackets)
    text = re.sub(r"\s*[\[\(]\d{4}[\]\)]\s*", " ", text)

    # Remove featuring artists for title cleaning
    text = re.sub(r"\s*[\[\(]?\s*(?:feat|featuring|ft)\.?\s+[^\]\)]*[\]\)]?\s*$", "", text, flags=re.IGNORECASE)

    # Clean up multiple spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text


def _split_by_separator(text: str, separator: str) -> tuple[str, str] | None:
    """Split text by separator, returning (left, right) if valid."""
    if separator not in text:
        return None

    parts = text.split(separator, 1)
    if len(parts) != 2:
        return None

    left = parts[0].strip()
    right = parts[1].strip()

    # Validate both parts exist and aren't too short
    if not left or not right or len(left) < 2 or len(right) < 2:
        return None

    # Reject if either part is suspiciously long (likely not artist - title)
    if len(left) > 100 or len(right) > 150:
        return None

    return left, right


def _is_likely_artist_name(text: str) -> bool:
    """Heuristic check if text looks like an artist name."""
    # Artist names are typically:
    # - Not too long (< 50 chars)
    # - Don't contain common title words at the start
    # - May contain letters and some special chars

    if len(text) > 50:
        return False

    # Check for patterns that suggest it's a title, not an artist
    title_patterns = [
        r"^\d+\.",  # Starts with track number
        r"^(?:the\s+)?(?:best|top|greatest|ultimate)",  # Compilation-style titles
    ]

    for pattern in title_patterns:
        if re.match(pattern, text, re.IGNORECASE):
            return False

    return True


def _extract_dash_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract artist and title from "Artist - Title" pattern.

    Examples:
        "AOA - Miniskirt M V" -> artist="AOA", title="Miniskirt M V"
        "ALLEYCVT - Throw it down" -> artist="ALLEYCVT", title="Throw it down"
    """
    cleaned = _clean_text(filename)

    # Try different dash separators (em dash, en dash, hyphen-minus)
    separators = [" - ", " – ", " — ", "-"]

    for separator in separators:
        result = _split_by_separator(cleaned, separator)
        if not result:
            continue

        artist, title = result

        # Clean the extracted parts
        artist = _clean_text(artist)
        title = _clean_text(title)

        if not artist or not title:
            continue

        # Check if artist looks reasonable
        if not _is_likely_artist_name(artist):
            continue

        # Higher confidence for space-separated dashes
        confidence = 0.9 if separator.startswith(" ") else 0.7

        yield ParsedMetadata(artist=artist, title=title, confidence=confidence)


def _extract_underscore_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract artist and title from "Artist_Title" pattern.

    Some files use underscores instead of dashes.
    """
    cleaned = _clean_text(filename)

    if "_" not in cleaned:
        return

    result = _split_by_separator(cleaned, "_")
    if not result:
        return

    artist, title = result
    artist = _clean_text(artist)
    title = _clean_text(title)

    if not artist or not title:
        return

    if not _is_likely_artist_name(artist):
        return

    yield ParsedMetadata(artist=artist, title=title, confidence=0.6)


def _extract_parentheses_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract from "Title (Artist)" or "(Artist) Title" patterns.

    Less common but sometimes used.
    """
    cleaned = _clean_text(filename)

    # Pattern: "Title (Artist)"
    match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", cleaned)
    if match:
        title_part = match.group(1).strip()
        paren_part = match.group(2).strip()

        # Check if parentheses part looks like an artist
        if _is_likely_artist_name(paren_part) and len(paren_part) > 2:
            yield ParsedMetadata(
                artist=paren_part,
                title=title_part,
                confidence=0.5
            )

    # Pattern: "(Artist) Title"
    match = re.match(r"^\(([^)]+)\)\s*(.+)$", cleaned)
    if match:
        paren_part = match.group(1).strip()
        title_part = match.group(2).strip()

        if _is_likely_artist_name(paren_part) and len(paren_part) > 2:
            yield ParsedMetadata(
                artist=paren_part,
                title=title_part,
                confidence=0.5
            )


def _extract_camelcase_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract from camelCase or PascalCase patterns where capitalization indicates word boundaries.

    Examples:
        "ALLEYCVTBack2Life" -> might split if clear case transition
        "ArtistNameSongTitle" -> look for case transitions
    """
    cleaned = _clean_text(filename)

    # Look for transition from all-caps to mixed case (common pattern)
    # Example: "ALLEYCVTBack2Life" or "JAMIROQUAISeven"
    match = re.match(r"^([A-Z]{2,}[A-Z])([A-Z][a-z].+)$", cleaned)
    if match:
        artist_part = match.group(1).strip()
        title_part = match.group(2).strip()

        if len(artist_part) >= 2 and len(title_part) >= 2:
            yield ParsedMetadata(
                artist=artist_part,
                title=title_part,
                confidence=0.4
            )

    # Look for clear capitalization boundaries (e.g., "ArtistName SongTitle")
    # Split on transitions from lowercase to uppercase
    parts = re.split(r'(?<=[a-z])(?=[A-Z])', cleaned)
    if len(parts) >= 2:
        # Try splitting at the first major boundary
        artist_candidate = parts[0].strip()
        title_candidate = ' '.join(parts[1:]).strip()

        if (len(artist_candidate) >= 2 and len(title_candidate) >= 2 and
            _is_likely_artist_name(artist_candidate)):
            yield ParsedMetadata(
                artist=artist_candidate,
                title=title_candidate,
                confidence=0.3
            )


def _extract_track_number_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract from filenames with track numbers like "01 Artist - Title" or "Track 01 - Artist - Title".

    Examples:
        "01 AOA - Miniskirt" -> artist="AOA", title="Miniskirt"
        "01. JAMIROQUAI - Seven Days" -> artist="JAMIROQUAI", title="Seven Days"
    """
    cleaned = _clean_text(filename)

    # Remove leading track numbers (various formats)
    # Patterns: "01 ", "01. ", "Track 01 ", "01 - ", etc.
    without_track = re.sub(r"^(?:track\s*)?\d{1,3}[\s.\-:]+", "", cleaned, flags=re.IGNORECASE)

    if without_track != cleaned and len(without_track) >= 5:
        # Now try to parse the rest with dash pattern
        for result in _extract_dash_pattern(without_track):
            # Slightly reduce confidence since we had to strip track number
            yield ParsedMetadata(
                artist=result.artist,
                title=result.title,
                confidence=result.confidence * 0.95
            )


def _extract_no_artist_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Fall back to treating entire filename as title (no artist).

    This is the lowest confidence option.
    """
    cleaned = _clean_text(filename)

    if cleaned and len(cleaned) > 2:
        yield ParsedMetadata(
            artist=None,
            title=cleaned,
            confidence=0.2
        )


def parse_filename(filename: str) -> list[ParsedMetadata]:
    """
    Parse a filename and return possible metadata extractions.

    Returns a list of ParsedMetadata ordered by confidence (highest first).
    The list may contain multiple interpretations to try.

    Args:
        filename: The song filename (with or without extension)

    Returns:
        List of ParsedMetadata, sorted by confidence descending

    Examples:
        >>> parse_filename("AOA - Miniskirt M V")
        [ParsedMetadata(artist="AOA", title="Miniskirt", confidence=0.9)]

        >>> parse_filename("ALLEYCVT - Throw it down.mp3")
        [ParsedMetadata(artist="ALLEYCVT", title="Throw it down", confidence=0.9)]
    """
    results: list[ParsedMetadata] = []

    # Try each extraction pattern (ordered by reliability)
    results.extend(_extract_dash_pattern(filename))
    results.extend(_extract_track_number_pattern(filename))
    results.extend(_extract_underscore_pattern(filename))
    results.extend(_extract_parentheses_pattern(filename))
    results.extend(_extract_camelcase_pattern(filename))
    results.extend(_extract_no_artist_pattern(filename))

    # Sort by confidence descending
    results.sort(key=lambda x: x.confidence, reverse=True)

    # Deduplicate while preserving order
    seen = set()
    unique_results = []
    for result in results:
        key = (result.artist, result.title)
        if key not in seen:
            seen.add(key)
            unique_results.append(result)

    return unique_results


def generate_title_variants(title: str) -> list[str]:
    """
    Generate progressive title variants by stripping common qualifiers.

    This function creates multiple versions of a title by progressively removing
    common video/audio qualifiers like "Official Video", "Visualizer", etc.

    Args:
        title: The original title to generate variants from

    Returns:
        List of title variants, from most specific to most stripped
        Always includes the original title as the first variant

    Examples:
        >>> generate_title_variants("Firemen Official Visualizer")
        ['Firemen Official Visualizer', 'Firemen Visualizer', 'Firemen']

        >>> generate_title_variants("Back2Life (Official Music Video)")
        ['Back2Life (Official Music Video)', 'Back2Life Music Video', 'Back2Life']

        >>> generate_title_variants("Seven Days In Sunny June Lyric Video HD")
        ['Seven Days In Sunny June Lyric Video HD', 'Seven Days In Sunny June Lyric Video', ...]
    """
    variants = []
    current_title = title.strip()

    # Always try the original title first
    variants.append(current_title)

    # Keep track of what we've already tried to avoid duplicates
    seen = {current_title.lower()}

    # Progressively strip qualifiers
    for qualifier_pattern in TITLE_QUALIFIERS:
        # Try removing this qualifier (case-insensitive)
        stripped = re.sub(qualifier_pattern, "", current_title, flags=re.IGNORECASE)

        # Clean up multiple spaces and trim
        stripped = re.sub(r"\s+", " ", stripped).strip()

        # Remove trailing punctuation that might be left behind
        stripped = re.sub(r"[,\-\s]+$", "", stripped).strip()

        # Only add if it's different, non-empty, and not too short
        if stripped and len(stripped) >= 2 and stripped.lower() not in seen:
            variants.append(stripped)
            seen.add(stripped.lower())
            current_title = stripped  # Continue stripping from this version

    # Also try removing everything in parentheses/brackets at the end
    base_title = re.sub(r"\s*[\[\(][^\]\)]*[\]\)]\s*$", "", title).strip()
    if base_title and base_title.lower() not in seen and len(base_title) >= 2:
        variants.append(base_title)
        seen.add(base_title.lower())

    # Clean up empty parentheses/brackets and trailing punctuation
    cleaned_variants = []
    for variant in variants:
        # Remove empty parentheses/brackets
        cleaned = re.sub(r"\s*[\[\(]\s*[\]\)]\s*", " ", variant)
        # Remove trailing dashes/hyphens
        cleaned = re.sub(r"[\-–—]+\s*$", "", cleaned).strip()
        # Clean up multiple spaces
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        if cleaned and len(cleaned) >= 2:
            cleaned_variants.append(cleaned)

    return cleaned_variants


def should_parse_filename(title: str, existing_artist: str | None) -> bool:
    """
    Determine if we should attempt filename parsing.

    Returns True if the title looks like it contains unparsed metadata
    and we don't already have good artist information.

    Args:
        title: The song title from database
        existing_artist: Current artist (if any)

    Returns:
        True if filename parsing should be attempted
    """
    # If we already have an artist, check if title looks like "Artist - Title"
    # which might indicate the artist in DB is wrong
    if existing_artist:
        # Check if title contains a dash pattern that might override existing artist
        if " - " in title or " – " in title or " — " in title:
            # Parse and see if we get a different artist
            parsed = parse_filename(title)
            if parsed and parsed[0].artist and parsed[0].confidence > 0.7:
                # Only parse if the parsed artist is different from existing
                return parsed[0].artist.lower() != existing_artist.lower()
        return False

    # No existing artist - check if title looks like it contains artist info
    # Common indicators:
    # - Contains dash separator
    # - Contains underscore separator
    # - Has parentheses that might contain artist

    indicators = [
        " - " in title,
        " – " in title,
        " — " in title,
        "_" in title and " " not in title,  # Underscore-separated
        bool(re.search(r"\([^)]{2,30}\)", title)),  # Parentheses with reasonable content
    ]

    return any(indicators)
