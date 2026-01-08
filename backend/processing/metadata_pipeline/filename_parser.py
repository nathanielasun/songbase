"""Intelligent filename parser for extracting artist and song information."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterator


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

    # Try each extraction pattern
    results.extend(_extract_dash_pattern(filename))
    results.extend(_extract_underscore_pattern(filename))
    results.extend(_extract_parentheses_pattern(filename))
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
