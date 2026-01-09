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
            if row is not None and row[0] is not None:
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
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        WHEN MAX(a_primary.name) IS NULL THEN NULL
                        ELSE md5(
                            lower(coalesce(s.album, ''))
                            || '::'
                            || lower(MAX(a_primary.name))
                        )
                    END AS album_id,
                    s.duration_sec,
                    s.release_year,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                WHERE s.sha_id IN ({placeholders})
                GROUP BY s.sha_id, s.title, s.album, s.duration_sec, s.release_year
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
            "artists": list(row[6]) if row[6] else [],
            "artist_ids": list(row[7]) if row[7] else [],
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
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        WHEN MAX(a_primary.name) IS NULL THEN NULL
                        ELSE md5(
                            lower(coalesce(s.album, ''))
                            || '::'
                            || lower(MAX(a_primary.name))
                        )
                    END AS album_id,
                    s.duration_sec,
                    s.release_year,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                WHERE s.sha_id IN ({placeholders})
                GROUP BY s.sha_id, s.title, s.album, s.duration_sec, s.release_year
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
            "artists": list(row[6]) if row[6] else [],
            "artist_ids": list(row[7]) if row[7] else [],
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


def generate_preference_playlist(
    liked_sha_ids: list[str],
    disliked_sha_ids: list[str] | None = None,
    limit: int = 50,
    metric: str | None = None,
    apply_diversity: bool = True,
    dislike_weight: float = 0.5,
) -> dict[str, Any]:
    """Generate a playlist based on user preferences using embeddings.

    Uses liked songs to find similar songs while avoiding songs similar to disliked ones.

    Algorithm:
    1. Compute average embedding of liked songs (attraction point)
    2. Compute average embedding of disliked songs (repulsion point)
    3. For each candidate song, compute:
       - similarity to liked centroid (positive factor)
       - dissimilarity to disliked centroid (negative factor)
       - final score = like_similarity - (dislike_weight * dislike_similarity)
    4. Rank by final score and return top songs

    Args:
        liked_sha_ids: List of SHA IDs of liked songs
        disliked_sha_ids: List of SHA IDs of disliked songs (optional)
        limit: Number of songs to return
        metric: Similarity metric to use (default: cosine)
        apply_diversity: Whether to apply diversity constraints
        dislike_weight: Weight for dislike penalty (0-1, default 0.5)

    Returns:
        Dict with playlist metadata and songs
    """
    if not liked_sha_ids:
        return {
            "playlist_type": "preferences",
            "liked_count": 0,
            "disliked_count": 0,
            "songs": [],
        }

    disliked_sha_ids = disliked_sha_ids or []

    # Get embeddings for liked songs
    liked_embeddings = []
    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            for sha_id in liked_sha_ids:
                cur.execute(
                    "SELECT vector FROM embeddings.vggish_embeddings WHERE sha_id = %s",
                    (sha_id,),
                )
                row = cur.fetchone()
                if row is not None and row[0] is not None:
                    liked_embeddings.append(np.array(row[0], dtype=np.float32))

    if not liked_embeddings:
        return {
            "playlist_type": "preferences",
            "liked_count": len(liked_sha_ids),
            "disliked_count": len(disliked_sha_ids),
            "songs": [],
            "error": "No embeddings found for liked songs",
        }

    # Compute liked centroid
    liked_centroid = np.mean(liked_embeddings, axis=0)

    # Get embeddings for disliked songs and compute centroid
    disliked_centroid = None
    if disliked_sha_ids:
        disliked_embeddings = []
        with connection.get_connection() as conn:
            with conn.cursor() as cur:
                for sha_id in disliked_sha_ids:
                    cur.execute(
                        "SELECT vector FROM embeddings.vggish_embeddings WHERE sha_id = %s",
                        (sha_id,),
                    )
                    row = cur.fetchone()
                    if row is not None and row[0] is not None:
                        disliked_embeddings.append(np.array(row[0], dtype=np.float32))

        if disliked_embeddings:
            disliked_centroid = np.mean(disliked_embeddings, axis=0)

    # Exclude liked and disliked songs from results
    exclude_sha_ids = list(set(liked_sha_ids + disliked_sha_ids))

    # Query songs similar to liked centroid
    fetch_limit = limit * 5 if apply_diversity else limit * 2  # Get extra for scoring
    operator, query = similarity.build_pgvector_similarity_query(
        metric=metric,
        limit=fetch_limit,
        exclude_sha_ids=exclude_sha_ids,
    )

    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            params = [liked_centroid.tolist()] + exclude_sha_ids + [liked_centroid.tolist(), fetch_limit]
            cur.execute(query, params)
            results = cur.fetchall()

    if not results:
        return {
            "playlist_type": "preferences",
            "liked_count": len(liked_sha_ids),
            "disliked_count": len(disliked_sha_ids),
            "songs": [],
        }

    # Collect candidate songs with their distances
    sha_ids = [row[0] for row in results]
    liked_distances = {row[0]: row[1] for row in results}

    # If we have disliked centroid, compute distance to it for each candidate
    disliked_distances: dict[str, float] = {}
    if disliked_centroid is not None:
        with connection.get_connection() as conn:
            with conn.cursor() as cur:
                for sha_id in sha_ids:
                    cur.execute(
                        "SELECT vector FROM embeddings.vggish_embeddings WHERE sha_id = %s",
                        (sha_id,),
                    )
                    row = cur.fetchone()
                    if row is not None and row[0] is not None:
                        candidate_embedding = np.array(row[0], dtype=np.float32)
                        # Compute cosine distance to disliked centroid
                        disliked_dist = 1.0 - np.dot(candidate_embedding, disliked_centroid) / (
                            np.linalg.norm(candidate_embedding) * np.linalg.norm(disliked_centroid)
                        )
                        disliked_distances[sha_id] = float(disliked_dist)

    # Fetch full song details
    with connection.get_connection() as conn:
        with conn.cursor() as cur:
            placeholders = ", ".join(["%s"] * len(sha_ids))
            cur.execute(
                f"""
                SELECT
                    s.sha_id,
                    s.title,
                    s.album,
                    CASE
                        WHEN s.album IS NULL OR s.album = '' THEN NULL
                        WHEN MAX(a_primary.name) IS NULL THEN NULL
                        ELSE md5(
                            lower(coalesce(s.album, ''))
                            || '::'
                            || lower(MAX(a_primary.name))
                        )
                    END AS album_id,
                    s.duration_sec,
                    s.release_year,
                    COALESCE(
                        (SELECT array_agg(sub_a.name ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::TEXT[]
                    ) AS artists,
                    COALESCE(
                        (SELECT array_agg(sub_a.artist_id ORDER BY sub_sa.role DESC, sub_a.artist_id)
                         FROM metadata.song_artists sub_sa
                         JOIN metadata.artists sub_a ON sub_a.artist_id = sub_sa.artist_id
                         WHERE sub_sa.sha_id = s.sha_id),
                        ARRAY[]::BIGINT[]
                    ) AS artist_ids
                FROM metadata.songs s
                LEFT JOIN metadata.song_artists sa_primary
                    ON sa_primary.sha_id = s.sha_id AND sa_primary.role = 'primary'
                LEFT JOIN metadata.artists a_primary
                    ON a_primary.artist_id = sa_primary.artist_id
                WHERE s.sha_id IN ({placeholders})
                GROUP BY s.sha_id, s.title, s.album, s.duration_sec, s.release_year
                """,
                sha_ids,
            )
            song_rows = cur.fetchall()

    # Build song list with preference-aware scores
    songs = []
    for row in song_rows:
        sha_id_result = row[0]
        liked_distance = liked_distances[sha_id_result]

        # Convert distance to similarity (0-1, where 1 is most similar)
        if operator == "<=>":  # Cosine distance
            like_similarity = 1.0 - liked_distance
        elif operator == "<->":  # Euclidean distance
            like_similarity = 1.0 / (1.0 + liked_distance)
        elif operator == "<#>":  # Negative dot product
            like_similarity = 1.0 / (1.0 + abs(liked_distance))
        else:
            like_similarity = 1.0 - liked_distance

        # Apply dislike penalty if we have disliked centroid
        final_score = like_similarity
        dislike_similarity = 0.0
        if disliked_centroid is not None and sha_id_result in disliked_distances:
            dislike_dist = disliked_distances[sha_id_result]
            dislike_similarity = 1.0 - dislike_dist
            # Penalize songs similar to disliked songs
            final_score = like_similarity - (dislike_weight * dislike_similarity)

        songs.append({
            "sha_id": sha_id_result,
            "title": row[1],
            "album": row[2],
            "album_id": row[3],
            "duration_sec": row[4],
            "release_year": row[5],
            "artists": list(row[6]) if row[6] else [],
            "artist_ids": list(row[7]) if row[7] else [],
            "like_similarity": float(like_similarity),
            "dislike_similarity": float(dislike_similarity),
            "score": float(final_score),
        })

    # Sort by final score (highest first)
    songs.sort(key=lambda x: x["score"], reverse=True)

    # Apply diversity constraints if requested
    if apply_diversity:
        songs = _apply_diversity_constraints(songs, limit)
    else:
        songs = songs[:limit]

    return {
        "playlist_type": "preferences",
        "liked_count": len(liked_sha_ids),
        "disliked_count": len(disliked_sha_ids),
        "liked_embeddings_found": len(liked_embeddings),
        "dislike_weight": dislike_weight,
        "songs": songs,
    }
