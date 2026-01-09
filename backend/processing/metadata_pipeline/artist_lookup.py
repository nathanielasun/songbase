"""
Hybrid artist name lookup using database-backed fuzzy matching.

Combines three strategies for efficient and scalable artist matching:
1. Exact match via normalized variants table (fastest, O(1) lookup)
2. Trigram fuzzy match via pg_trgm (scalable, uses GIN index)
3. Popular artists filter (reduces search space for fuzzy matching)
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Callable

from backend.db.connection import get_connection


@dataclass
class ArtistMatch:
    """Result of an artist name lookup."""
    canonical_name: str
    artist_id: int
    similarity: float
    match_type: str  # 'exact', 'trigram', 'popular'


# Minimum similarity threshold for trigram matching
TRIGRAM_SIMILARITY_THRESHOLD = 0.3

# Minimum song count for "popular" artist filtering
POPULAR_ARTIST_MIN_SONGS = 2

# Maximum artists to consider in trigram search
TRIGRAM_SEARCH_LIMIT = 10


def normalize_for_lookup(name: str | None) -> str:
    """
    Normalize a name for database lookup.
    Must match the PostgreSQL normalize_artist_name() function.
    """
    if not name:
        return ""
    # Normalize unicode
    normalized = unicodedata.normalize("NFKD", name)
    # Remove special characters, keep alphanumeric and spaces
    cleaned = re.sub(r"[^\w\s]", "", normalized.lower())
    # Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def lookup_artist_exact(name: str) -> ArtistMatch | None:
    """
    Look up artist by exact normalized name match.
    Uses the pre-computed variants table for O(1) lookup.

    Args:
        name: Artist name to look up (will be normalized)

    Returns:
        ArtistMatch if found, None otherwise
    """
    normalized = normalize_for_lookup(name)
    if not normalized:
        return None

    query = """
        SELECT v.canonical_name, v.artist_id
        FROM metadata.artist_name_variants v
        WHERE v.normalized_name = %s
        LIMIT 1
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (normalized,))
            row = cur.fetchone()

    if row:
        return ArtistMatch(
            canonical_name=row[0],
            artist_id=row[1],
            similarity=1.0,
            match_type='exact',
        )

    return None


def lookup_artist_trigram(
    name: str,
    min_similarity: float = TRIGRAM_SIMILARITY_THRESHOLD,
    limit: int = TRIGRAM_SEARCH_LIMIT,
    popular_only: bool = True,
) -> ArtistMatch | None:
    """
    Look up artist using trigram fuzzy matching.
    Uses pg_trgm extension with GIN index for efficient fuzzy search.

    Args:
        name: Artist name to look up
        min_similarity: Minimum trigram similarity (0.0 to 1.0)
        limit: Maximum candidates to consider
        popular_only: If True, only search artists with 2+ songs

    Returns:
        Best ArtistMatch if found above threshold, None otherwise
    """
    if not name or len(name) < 2:
        return None

    # Build query with optional popularity filter
    if popular_only:
        query = """
            SELECT a.name, a.artist_id, similarity(a.name, %s) AS sim
            FROM metadata.artists a
            WHERE a.song_count >= %s
              AND similarity(a.name, %s) > %s
            ORDER BY sim DESC
            LIMIT %s
        """
        params = (name, POPULAR_ARTIST_MIN_SONGS, name, min_similarity, limit)
    else:
        query = """
            SELECT a.name, a.artist_id, similarity(a.name, %s) AS sim
            FROM metadata.artists a
            WHERE similarity(a.name, %s) > %s
            ORDER BY sim DESC
            LIMIT %s
        """
        params = (name, name, min_similarity, limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()

    if row:
        return ArtistMatch(
            canonical_name=row[0],
            artist_id=row[1],
            similarity=float(row[2]),
            match_type='popular' if popular_only else 'trigram',
        )

    return None


def lookup_artist(
    name: str,
    min_similarity: float = TRIGRAM_SIMILARITY_THRESHOLD,
) -> ArtistMatch | None:
    """
    Hybrid artist lookup combining all strategies.

    Strategy order (fastest to slowest):
    1. Exact match via normalized variants table
    2. Trigram match against popular artists (song_count >= 2)
    3. Trigram match against all artists (fallback)

    Args:
        name: Artist name to look up
        min_similarity: Minimum similarity for trigram matching

    Returns:
        Best ArtistMatch if found, None otherwise
    """
    if not name:
        return None

    # Strategy 1: Exact match (fastest)
    result = lookup_artist_exact(name)
    if result:
        return result

    # Strategy 2: Trigram match against popular artists
    result = lookup_artist_trigram(
        name,
        min_similarity=min_similarity,
        popular_only=True,
    )
    if result:
        return result

    # Strategy 3: Trigram match against all artists (fallback)
    result = lookup_artist_trigram(
        name,
        min_similarity=min_similarity,
        popular_only=False,
    )
    if result:
        return result

    return None


def create_artist_lookup_fn() -> Callable[[str], tuple[str, float] | None]:
    """
    Create a lookup function compatible with filename_parser.

    Returns a function that takes an artist name and returns
    (canonical_name, similarity) or None.

    This is the bridge between the database lookup and the parser.
    """
    def lookup_fn(name: str) -> tuple[str, float] | None:
        result = lookup_artist(name)
        if result:
            return (result.canonical_name, result.similarity)
        return None

    return lookup_fn


def batch_lookup_artists(names: list[str]) -> dict[str, ArtistMatch]:
    """
    Look up multiple artist names efficiently.

    Uses a single query for exact matches, then fills in gaps with trigram.

    Args:
        names: List of artist names to look up

    Returns:
        Dict mapping input names to ArtistMatch results (only for matches found)
    """
    if not names:
        return {}

    results: dict[str, ArtistMatch] = {}
    normalized_map = {normalize_for_lookup(n): n for n in names if n}
    normalized_names = list(normalized_map.keys())

    if not normalized_names:
        return {}

    # Batch exact lookup
    query = """
        SELECT v.normalized_name, v.canonical_name, v.artist_id
        FROM metadata.artist_name_variants v
        WHERE v.normalized_name = ANY(%s)
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (normalized_names,))
            rows = cur.fetchall()

    for row in rows:
        normalized, canonical, artist_id = row
        original_name = normalized_map.get(normalized)
        if original_name:
            results[original_name] = ArtistMatch(
                canonical_name=canonical,
                artist_id=artist_id,
                similarity=1.0,
                match_type='exact',
            )

    # For names not found via exact match, try trigram
    missing_names = [n for n in names if n and n not in results]
    for name in missing_names:
        result = lookup_artist_trigram(name)
        if result:
            results[name] = result

    return results
