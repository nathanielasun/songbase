"""Intelligent filename parser for extracting artist and song information."""

from __future__ import annotations

import re
import unicodedata
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

    # Label/series tags often appended to titles
    r"\b(?:monstercat|dubstep)\b",

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


STOP_WORDS = {
    "all", "and", "are", "ask", "but", "for", "from", "how", "if", "in", 
    "is", "it", "of", "on", "or", "that", "the", "to", "what", "when", 
    "where", "who", "why", "with", "you", "your", "unknown", "artist"
}


PLACEHOLDER_ARTISTS = {
    "unknown artist",
    "unknown",
    "various artists",
    "various",
    "n/a",
    "na",
}


def is_placeholder_artist(name: str | None) -> bool:
    """Return True if the artist value is a placeholder or non-informative."""
    if not name:
        return True
    cleaned = _clean_text(name).lower()
    if not cleaned:
        return True
    if cleaned in PLACEHOLDER_ARTISTS:
        return True
    if cleaned.isdigit():
        return True
    tokens = [token for token in re.split(r"\s+", cleaned) if token]
    if tokens and len(tokens) == 1 and tokens[0] in STOP_WORDS:
        return True
    return False
def _clean_text(text: str) -> str:
    """Clean and normalize text by removing common artifacts."""
    # Normalize unicode (e.g. half-width/full-width, accents)
    text = unicodedata.normalize("NFKD", text)

    # Remove file extensions
    text = re.sub(r"\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$", "", text, flags=re.IGNORECASE)

    # Clean up multiple spaces
    text = re.sub(r"\s+", " ", text).strip()

    # iteratively remove suffixes until no change
    while True:
        original = text

        # Remove YouTube IDs (11 chars in brackets at end)
        # e.g. [dQw4w9WgXcQ]
        text = re.sub(r"\s*\[[a-zA-Z0-9_-]{11}\]\s*$", "", text)

        # Remove common video suffixes at the end
        # Handle variants with leading underscores or spaces
        # e.g. " _Official_Visualizer", " Official Video"
        # We explicitly match separators (space, underscore, dash, brackets) to handle cases where \b fails with underscores.
        
        tags_list = [
            r"M[\s_]*V", r"MV", 
            r"Music[\s_]*Video", r"Official[\s_]*Video", 
            r"Official", r"Audio", r"Visualizer", r"Viewer", 
            r"Lyric[\s_]*Video", r"Lyrics", r"Live", 
            r"HD", r"HQ", r"4K", r"1080p", r"720p", 
            r"Remaster(?:ed)?", r"Album[\s_]*Version"
        ]
        tags = "|".join(tags_list)
        
        # Pattern: (Separator)(TAG)(End or Separator)
        # Note: We include the preceding separator in the replacement to remove it.
        pattern = r"(?:[\s_\-\(\[]+)(" + tags + r")(?:[\s_\-\)\]]*)$"
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        # Remove brackets and their content at the end (often quality/format tags)
        text = re.sub(r"\s*[\[\(]([^\]\)]*(?:kbps|hz|bit|320|256|192|128|quality|rip|official|audio|video|visualizer|viewer|lyric|live|hd|hq|4k|1080p|720p|remaster))[\]\)]\s*$", "", text, flags=re.IGNORECASE)

        # Remove year patterns (4 digits in parentheses/brackets) at the end
        text = re.sub(r"\s*[\[\(]\d{4}[\]\)]\s*$", "", text)

        # Remove featuring artists for title cleaning (often at end)
        text = re.sub(r"\s*[\[\(]?\s*(?:feat|featuring|ft)\.?\s+[^\]\)]*[\]\)]?\s*$", "", text, flags=re.IGNORECASE)
        
        text = text.strip()
        # Clean leading/trailing underscores that might be left
        text = text.strip("_")
        
        if text == original:
            break

    return text.strip()


def _split_by_separator(text: str, separator: str) -> tuple[str, str] | None:
    """Split text by separator, returning (left, right) if valid."""
    if separator not in text:
        return None

    parts = text.split(separator, 1)
    if len(parts) != 2:
        return None

    left = parts[0].strip()
    right = parts[1].strip()
    
    # Clean leading/trailing underscores from parts (common in "Artist_ - _Title" patterns)
    left = left.strip("_")
    right = right.strip("_")

    # Validate both parts exist and aren't too short
    if not left or not right or len(left) < 1 or len(right) < 1:
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

    if text.isdigit():
        return False
        
    # If text is a single stop word (case insensitive), it's likely not an artist (e.g. "The", "All")
    # But "The Who", "All Time Low" are valid. "All" (band) exists but causes issues.
    if text.lower() in STOP_WORDS:
        # We allow it, but we might flag it elsewhere or it will be penalized in confidence
        pass

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
            
        # Replace underscores in artist/title if they exist (e.g. "Arctic_Monkeys")
        artist = artist.replace("_", " ")
        title = title.replace("_", " ")

        # Higher confidence for space-separated dashes
        confidence = 0.9 if separator.startswith(" ") else 0.7
        
        # Penalize if artist is a stop word or number
        if artist.lower() in STOP_WORDS or artist.isdigit():
            confidence = 0.4
            
        yield ParsedMetadata(artist=artist, title=title, confidence=confidence)


def _extract_underscore_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract artist and title from "Artist_Title" pattern.

    Iterates through possible split points for underscores.
    Example: "Wonder_girls_tellme" ->
      1. Artist="Wonder", Title="girls tellme"
      2. Artist="Wonder girls", Title="tellme"
    """
    cleaned = _clean_text(filename)

    if "_" not in cleaned:
        return

    # Split by underscore
    parts = cleaned.split("_")
    
    # Needs at least 2 parts to split into Artist + Title
    if len(parts) < 2:
        return

    # Iterate through split points
    # We allow the artist to be up to N-1 parts (leaving at least 1 part for title)
    # We limit to first 3 splits to avoid excessive combinations for very long filenames
    max_splits = min(len(parts), 4)
    
    for i in range(1, max_splits):
        artist_parts = parts[:i]
        title_parts = parts[i:]
        
        artist = " ".join(artist_parts).strip()
        title = " ".join(title_parts).strip()
        
        if not artist or not title:
            continue

        if not _is_likely_artist_name(artist):
            continue

        # Determine confidence
        # Heuristic: 
        # - Capitalized artist preferred? 
        # - Earlier splits preferred?
        
        is_capitalized = artist[0].isupper() if artist else False
        
        # Base confidence
        confidence = 0.55
        
        # Boost slightly if capitalized
        if is_capitalized:
            confidence += 0.05
            
        # Penalize if split index is deeper? (e.g. Artist is very long)
        if i > 2:
            confidence -= 0.05

        yield ParsedMetadata(artist=artist, title=title, confidence=confidence)


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

    This is the lowest confidence option, but updated to handle snake_case.
    """
    cleaned = _clean_text(filename)
    
    # Replace underscores with spaces for the title-only fallback
    cleaned = cleaned.replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if cleaned and len(cleaned) > 2:
        # Increase confidence slightly to compete with weak splits
        yield ParsedMetadata(
            artist=None,
            title=cleaned,
            confidence=0.5
        )


def _extract_first_word_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract using the first word as the artist.
    Useful for space-separated "Artist Title" patterns with no clear separator.
    
    Example: "aespa Next Level" -> Artist="aespa", Title="Next Level"
    """
    cleaned = _clean_text(filename)
    
    # If there's already a separator like " - ", this pattern isn't needed (dash pattern covers it)
    if " - " in cleaned or " – " in cleaned or " — " in cleaned:
        return
        
    parts = cleaned.split(" ", 1)
    if len(parts) != 2:
        return
        
    artist = parts[0]
    title = parts[1]
    
    if len(artist) < 2 or not _is_likely_artist_name(artist):
        return
        
    # Low confidence because splitting by space is risky
    # But if the artist is capitalized and not a stop word, maybe higher?
    confidence = 0.35
    
    if artist[0].isupper() and artist.lower() not in STOP_WORDS:
        confidence = 0.45
        
    yield ParsedMetadata(artist=artist, title=title, confidence=confidence)


def _extract_swap_pattern(filename: str) -> Iterator[ParsedMetadata]:
    """
    Extract as "Title - Artist" (swapped).
    Useful for files named like "Song Title - ArtistName.mp3".
    """
    cleaned = _clean_text(filename)
    
    # Only try swapped if there's a dash separator
    separators = [" - ", " – ", " — "]
    
    for separator in separators:
        result = _split_by_separator(cleaned, separator)
        if not result:
            continue
            
        title, artist = result
        
        # Clean parts
        artist = _clean_text(artist)
        title = _clean_text(title)
        
        if not artist or not title:
            continue
            
        # If the 'artist' part looks like a real artist, yield it
        if _is_likely_artist_name(artist) and artist.lower() not in STOP_WORDS:
            # Lower confidence than standard "Artist - Title"
            yield ParsedMetadata(artist=artist, title=title, confidence=0.45)


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
    results.extend(_extract_swap_pattern(filename))
    results.extend(_extract_track_number_pattern(filename))
    results.extend(_extract_underscore_pattern(filename))
    results.extend(_extract_parentheses_pattern(filename))
    results.extend(_extract_camelcase_pattern(filename))
    results.extend(_extract_first_word_pattern(filename))
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


def generate_artist_variants(artist: str) -> list[str]:
    """
    Generate variants of the artist name.
    
    Examples:
        "The Beatles" -> ["The Beatles", "Beatles"]
        "Jay-Z" -> ["Jay-Z", "Jay Z"]
    """
    if not artist:
        return []
        
    variants = [artist]
    seen = {artist.lower()}
    
    # Remove "The " prefix
    if artist.lower().startswith("the "):
        no_the = artist[4:]
        if no_the.lower() not in seen:
            variants.append(no_the)
            seen.add(no_the.lower())
            
    # Replace special chars with spaces
    cleaned = re.sub(r"[^\w\s]", " ", artist)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if cleaned.lower() not in seen and len(cleaned) > 1:
        variants.append(cleaned)
        seen.add(cleaned.lower())
        
    return variants



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
    if existing_artist and not is_placeholder_artist(existing_artist):
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
    if any(indicators):
        return True

    word_count = len([word for word in title.split() if word])
    return word_count >= 2
