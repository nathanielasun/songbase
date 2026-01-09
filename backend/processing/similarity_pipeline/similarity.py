"""Core similarity computation using vector embeddings."""
from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from . import config


def cosine_similarity(embedding1: NDArray[np.float32], embedding2: NDArray[np.float32]) -> float:
    """Calculate cosine similarity between two embeddings.

    Returns a value between -1 and 1, where 1 is most similar.
    """
    dot_product = np.dot(embedding1, embedding2)
    norm1 = np.linalg.norm(embedding1)
    norm2 = np.linalg.norm(embedding2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return float(dot_product / (norm1 * norm2))


def euclidean_distance(embedding1: NDArray[np.float32], embedding2: NDArray[np.float32]) -> float:
    """Calculate Euclidean distance between two embeddings.

    Returns a value >= 0, where 0 is most similar (identical).
    Normalized to 0-1 range by dividing by max possible distance.
    """
    distance = np.linalg.norm(embedding1 - embedding2)
    # Normalize to 0-1 range (assuming embeddings are normalized to unit length)
    max_distance = 2.0  # Max distance between two unit vectors
    return float(1.0 - min(distance / max_distance, 1.0))


def dot_product_similarity(embedding1: NDArray[np.float32], embedding2: NDArray[np.float32]) -> float:
    """Calculate dot product similarity between two embeddings.

    Assumes embeddings are already normalized. Returns value between 0 and 1.
    """
    return float(max(0.0, np.dot(embedding1, embedding2)))


def compute_similarity(
    embedding1: NDArray[np.float32],
    embedding2: NDArray[np.float32],
    metric: str | None = None,
) -> float:
    """Compute similarity between two embeddings using specified metric.

    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector
        metric: Similarity metric to use (cosine, euclidean, dot). Defaults to config.SIMILARITY_METRIC

    Returns:
        Similarity score between 0 and 1, where 1 is most similar
    """
    if metric is None:
        metric = config.SIMILARITY_METRIC

    if metric == "cosine":
        # Convert cosine similarity from [-1, 1] to [0, 1]
        return (cosine_similarity(embedding1, embedding2) + 1.0) / 2.0
    elif metric == "euclidean":
        return euclidean_distance(embedding1, embedding2)
    elif metric == "dot":
        return dot_product_similarity(embedding1, embedding2)
    else:
        raise ValueError(f"Unknown similarity metric: {metric}")


def find_similar_songs_numpy(
    query_embedding: NDArray[np.float32],
    candidate_embeddings: list[tuple[str, NDArray[np.float32]]],
    limit: int = 50,
    metric: str | None = None,
    exclude_ids: set[str] | None = None,
) -> list[tuple[str, float]]:
    """Find most similar songs using numpy operations.

    Args:
        query_embedding: Query embedding vector
        candidate_embeddings: List of (song_id, embedding) tuples
        limit: Maximum number of results to return
        metric: Similarity metric to use
        exclude_ids: Set of song IDs to exclude from results

    Returns:
        List of (song_id, similarity_score) tuples, sorted by similarity (highest first)
    """
    if exclude_ids is None:
        exclude_ids = set()

    similarities: list[tuple[str, float]] = []

    for song_id, embedding in candidate_embeddings:
        if song_id in exclude_ids:
            continue

        similarity = compute_similarity(query_embedding, embedding, metric)

        if similarity >= config.MIN_SIMILARITY_THRESHOLD:
            similarities.append((song_id, similarity))

    # Sort by similarity (descending)
    similarities.sort(key=lambda x: x[1], reverse=True)

    return similarities[:limit]


def build_pgvector_similarity_query(
    metric: str | None = None,
    limit: int = 50,
    exclude_sha_ids: list[str] | None = None,
) -> tuple[str, str]:
    """Build a pgvector similarity query.

    Args:
        metric: Similarity metric (cosine, euclidean, dot)
        limit: Number of results to return
        exclude_sha_ids: List of SHA IDs to exclude

    Returns:
        Tuple of (distance_operator, query_sql)
    """
    if metric is None:
        metric = config.SIMILARITY_METRIC

    # Map metric to pgvector operator
    if metric == "cosine":
        operator = "<=>"  # Cosine distance
    elif metric == "euclidean":
        operator = "<->"  # Euclidean distance (L2)
    elif metric == "dot":
        operator = "<#>"  # Negative inner product (for max dot product)
    else:
        raise ValueError(f"Unknown similarity metric: {metric}")

    # Build exclusion clause
    exclude_clause = ""
    if exclude_sha_ids:
        placeholders = ", ".join(["%s"] * len(exclude_sha_ids))
        exclude_clause = f"AND sha_id NOT IN ({placeholders})"

    query = f"""
        SELECT sha_id, vector {operator} %s AS distance
        FROM embeddings.vggish_embeddings
        WHERE vector IS NOT NULL
        {exclude_clause}
        ORDER BY vector {operator} %s
        LIMIT %s
    """

    return operator, query
