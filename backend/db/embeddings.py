from __future__ import annotations

from pathlib import Path

import numpy as np
from pgvector import Vector

from backend.processing.audio_pipeline import config as vggish_config


def default_preprocess_version() -> str:
    return (
        f"sr={vggish_config.TARGET_SAMPLE_RATE}"
        f";frame={vggish_config.VGGISH_FRAME_SEC}"
        f";hop={vggish_config.VGGISH_HOP_SEC}"
    )


def load_vggish_embeddings(npz_path: Path) -> np.ndarray:
    data = np.load(npz_path)
    if "embedding" in data:
        embeddings = data["embedding"]
    elif "postprocessed" in data:
        embeddings = data["postprocessed"]
    else:
        raise ValueError("Embedding file missing 'embedding' or 'postprocessed' arrays")

    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)
    if embeddings.shape[1] != vggish_config.VGGISH_EMBEDDING_SIZE:
        raise ValueError("Embedding dimension mismatch")

    return embeddings.astype(np.float32)


def insert_vggish_embeddings(
    cur,
    sha_id: str,
    npz_path: Path,
    model_name: str | None = None,
    model_version: str | None = None,
    preprocess_version: str | None = None,
) -> int:
    embeddings = load_vggish_embeddings(npz_path)
    hop = float(vggish_config.VGGISH_HOP_SEC)
    frame = float(vggish_config.VGGISH_FRAME_SEC)

    rows = []
    for idx, vector in enumerate(embeddings):
        start = idx * hop
        end = start + frame
        rows.append(
            (
                sha_id,
                model_name or "vggish",
                model_version or vggish_config.VGGISH_CHECKPOINT_VERSION,
                preprocess_version or default_preprocess_version(),
                Vector(vector),
                start,
                end,
            )
        )

    cur.executemany(
        """
        INSERT INTO embeddings.vggish_embeddings (
            sha_id,
            model_name,
            model_version,
            preprocess_version,
            vector,
            segment_start_sec,
            segment_end_sec
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        rows,
    )

    return len(rows)
