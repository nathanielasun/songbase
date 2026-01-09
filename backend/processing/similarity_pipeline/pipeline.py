"""Pipeline for generating song radios and similarity-based playlists."""
from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from backend.db import connection

from . import config, similarity


def get_song_embedding(sha_id: str) -> NDArray[np.float32] | None:
    """Fetch embedding for a specific song.

    Args:
        sha_id: Song SHA ID

    Returns:
        Embedding vector or None if not found
    """
    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vector
                FROM embeddings.vggish_embeddings
                WHERE sha_id = %s
                """,
                (sha_id,),
            )
            row = cur.fetchone()
            if row and row[0]:
                return np.array(row[0], dtype=np.float32)
    return None


def get_artist_songs(artist_id: int) -> list[str]:
    """Get all song IDs for a specific artist.

    Args:
        artist_id: Artist ID

    Returns:
        List of song SHA IDs
    """
    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.sha_id
                FROM metadata.songs s
                JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id
                WHERE sa.artist_id = %s
                """,
                (artist_id,),
            )
            return [row[0] for row in cur.fetchall()]


def generate_song_radio(
    sha_id: str,
    limit: int | None = None,
    metric: str | None = None,
    apply_diversity: bool = True,
) -> list[dict[str, Any]]:
    """Generate a song radio playlist based on similarity.

    Args:
        sha_id: Seed song SHA ID
        limit: Number of songs to return (defaults to config.SONG_RADIO_SIZE)
        metric: Similarity metric to use
        apply_diversity: Whether to apply diversity constraints

    Returns:
        List of song dictionaries with similarity scores
    """
    if limit is None:
        limit = config.SONG_RADIO_SIZE

    # Get the seed song's embedding
    seed_embedding = get_song_embedding(sha_id)
    if seed_embedding is None:
        return []

    # Build and execute similarity query
    operator, query = similarity.build_pgvector_similarity_query(
        metric=metric,
        limit=limit * 3 if apply_diversity else limit,  # Get more results for diversity filtering
        exclude_sha_ids=[sha_id],  # Exclude the seed song itself
    )

    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            # Pass embedding twice (once for distance calculation, once for ORDER BY)
            params = [seed_embedding.tolist(), sha_id] + [seed_embedding.tolist(), limit * 3 if apply_diversity else limit]
            cur.execute(query, params)
            results = cur.fetchall()

    if not results:
        return []

    # Fetch full song details
    sha_ids = [row[0] for row in results]
    distances = {row[0]: row[1] for row in results}

    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            placeholders = ", ".join(["%s"] * len(sha_ids))
            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.album_id,
                    s.duration_sec,
                    s.release_year,
                    array_agg(a.name ORDER BY sa.is_primary DESC, a.name) AS artists,
                    array_agg(a.artist_id ORDER BY sa.is_primary DESC, a.name) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id
                LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                WHERE s.sha_id IN ({placeholders})
                GROUP BY s.sha_id, s.title, s.album, s.album_id, s.duration_sec, s.release_year
                """,
                sha_ids,
            )
            song_rows = cur.fetchall()

    # Build song list with similarity scores
    songs = []
    for row in song_rows:
        sha_id_result = row[0]
        distance = distances[sha_id_result]

        # Convert distance to similarity score (0-1, where 1 is most similar)
        if operator == "<=>":  # Cosine distance
            similarity_score = 1.0 - distance
        elif operator == "<->":  # Euclidean distance
            similarity_score = 1.0 / (1.0 + distance)
        elif operator == "<#>":  # Negative dot product
            similarity_score = 1.0 / (1.0 + abs(distance))
        else:
            similarity_score = 1.0 - distance

        songs.append({
            "sha_id": sha_id_result,
            "title": row[1],
            "album": row[2],
            "album_id": row[3],
            "duration_sec": row[4],
            "release_year": row[5],
            "artists": row[6] if row[6] else [],
            "artist_ids": row[7] if row[7] else [],
            "similarity": float(similarity_score),
        })

    # Apply diversity constraints if requested
    if apply_diversity:
        songs = _apply_diversity_constraints(songs, limit)
    else:
        songs = songs[:limit]

    return songs


def generate_artist_radio(
    artist_id: int,
    limit: int | None = None,
    metric: str | None = None,
    apply_diversity: bool = True,
) -> list[dict[str, Any]]:
    """Generate an artist radio playlist based on all artist songs.

    Args:
        artist_id: Artist ID
        limit: Number of songs to return (defaults to config.ARTIST_RADIO_SIZE)
        metric: Similarity metric to use
        apply_diversity: Whether to apply diversity constraints

    Returns:
        List of song dictionaries with similarity scores
    """
    if limit is None:
        limit = config.ARTIST_RADIO_SIZE

    # Get all songs by this artist
    artist_song_ids = get_artist_songs(artist_id)
    if not artist_song_ids:
        return []

    # Get embeddings for all artist songs
    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            placeholders = ", ".join(["%s"] * len(artist_song_ids))
            cur.execute(
                f"""
                SELECT sha_id, vector
                FROM embeddings.vggish_embeddings
                WHERE sha_id IN ({placeholders})
                """,
                artist_song_ids,
            )
            embeddings_data = cur.fetchall()

    if not embeddings_data:
        return []

    # Compute average embedding for the artist
    embeddings = [np.array(row[1], dtype=np.float32) for row in embeddings_data]
    avg_embedding = np.mean(embeddings, axis=0)

    # Build and execute similarity query (excluding artist's own songs)
    operator, query = similarity.build_pgvector_similarity_query(
        metric=metric,
        limit=limit * 3 if apply_diversity else limit,
        exclude_sha_ids=artist_song_ids,
    )

    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            params = [avg_embedding.tolist()] + artist_song_ids + [avg_embedding.tolist(), limit * 3 if apply_diversity else limit]
            cur.execute(query, params)
            results = cur.fetchall()

    if not results:
        return []

    # Fetch full song details
    sha_ids = [row[0] for row in results]
    distances = {row[0]: row[1] for row in results}

    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            placeholders = ", ".join(["%s"] * len(sha_ids))
            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    s.album_id,
                    s.duration_sec,
                    s.release_year,
                    array_agg(a.name ORDER BY sa.is_primary DESC, a.name) AS artists,
                    array_agg(a.artist_id ORDER BY sa.is_primary DESC, a.name) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id
                LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                WHERE s.sha_id IN ({placeholders})
                GROUP BY s.sha_id, s.title, s.album, s.album_id, s.duration_sec, s.release_year
                """,
                sha_ids,
            )
            song_rows = cur.fetchall()

    # Build song list with similarity scores
    songs = []
    for row in song_rows:
        sha_id_result = row[0]
        distance = distances[sha_id_result]

        # Convert distance to similarity score
        if operator == "<=>":
            similarity_score = 1.0 - distance
        elif operator == "<->":
            similarity_score = 1.0 / (1.0 + distance)
        elif operator == "<#>":
            similarity_score = 1.0 / (1.0 + abs(distance))
        else:
            similarity_score = 1.0 - distance

        songs.append({
            "sha_id": sha_id_result,
            "title": row[1],
            "album": row[2],
            "album_id": row[3],
            "duration_sec": row[4],
            "release_year": row[5],
            "artists": row[6] if row[6] else [],
            "artist_ids": row[7] if row[7] else [],
            "similarity": float(similarity_score),
        })

    # Apply diversity constraints if requested
    if apply_diversity:
        songs = _apply_diversity_constraints(songs, limit)
    else:
        songs = songs[:limit]

    return songs


def _apply_diversity_constraints(
    songs: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    """Apply diversity constraints to song list.

    Ensures no more than MAX_SONGS_PER_ALBUM from same album
    and no more than MAX_SONGS_PER_ARTIST from same artist.

    Args:
        songs: List of song dictionaries
        limit: Maximum number of songs to return

    Returns:
        Filtered list of songs
    """
    result = []
    album_counts: dict[str | None, int] = {}
    artist_counts: dict[int, int] = {}

    for song in songs:
        if len(result) >= limit:
            break

        # Check album constraint
        album_id = song.get("album_id")
        if album_id:
            if album_counts.get(album_id, 0) >= config.MAX_SONGS_PER_ALBUM:
                continue

        # Check artist constraint
        artist_ids = song.get("artist_ids", [])
        if artist_ids:
            primary_artist_id = artist_ids[0]
            if artist_counts.get(primary_artist_id, 0) >= config.MAX_SONGS_PER_ARTIST:
                continue

        # Add song and update counts
        result.append(song)

        if album_id:
            album_counts[album_id] = album_counts.get(album_id, 0) + 1

        if artist_ids:
            primary_artist_id = artist_ids[0]
            artist_counts[primary_artist_id] = artist_counts.get(primary_artist_id, 0) + 1

    return result


def find_similar_songs(
    sha_id: str,
    limit: int = 10,
    metric: str | None = None,
) -> list[dict[str, Any]]:
    """Find songs similar to a given song.

    Similar to song radio but returns fewer results and no diversity constraints.

    Args:
        sha_id: Seed song SHA ID
        limit: Number of similar songs to return
        metric: Similarity metric to use

    Returns:
        List of similar song dictionaries with similarity scores
    """
    return generate_song_radio(
        sha_id=sha_id,
        limit=limit,
        metric=metric,
        apply_diversity=False,
    )
