"""Database integration for audio feature extraction pipeline."""

import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Optional

from .config import FeatureConfig
from .pipeline import FeaturePipeline
from .utils.aggregation import AggregatedFeatures

logger = logging.getLogger(__name__)

ANALYZER_VERSION = "1.0.0"


def get_song_cache_path(sha_id: str) -> Path:
    """Get path to cached audio file in .song_cache."""
    prefix = sha_id[:2]
    return Path(f".song_cache/{prefix}/{sha_id}.mp3")


async def get_songs_needing_analysis(
    limit: int = 100,
    force: bool = False,
) -> list[dict]:
    """
    Get songs that need audio feature analysis.

    Args:
        limit: Maximum number of songs to return
        force: If True, return all songs (for re-analysis)

    Returns:
        List of song records with sha_id
    """
    from backend.db.connection import get_connection

    with get_connection() as conn:
        if force:
            query = """
                SELECT s.sha_id, s.title, s.duration_sec
                FROM metadata.songs s
                ORDER BY s.created_at DESC
                LIMIT %s
            """
            rows = conn.execute(query, (limit,)).fetchall()
        else:
            query = """
                SELECT s.sha_id, s.title, s.duration_sec
                FROM metadata.songs s
                LEFT JOIN metadata.audio_features af ON af.sha_id = s.sha_id
                WHERE af.sha_id IS NULL
                ORDER BY s.created_at DESC
                LIMIT %s
            """
            rows = conn.execute(query, (limit,)).fetchall()

        return [{"sha_id": r[0], "title": r[1], "duration_sec": r[2]} for r in rows]


async def get_feature_stats() -> dict:
    """Get statistics about audio feature analysis."""
    from backend.db.connection import get_connection

    with get_connection() as conn:
        # Total songs
        total = conn.execute(
            "SELECT COUNT(*) FROM metadata.songs"
        ).fetchone()[0]

        # Analyzed songs
        analyzed = conn.execute(
            "SELECT COUNT(*) FROM metadata.audio_features WHERE error_message IS NULL"
        ).fetchone()[0]

        # Failed songs
        failed = conn.execute(
            "SELECT COUNT(*) FROM metadata.audio_features WHERE error_message IS NOT NULL"
        ).fetchone()[0]

        # Average analysis time
        avg_time = conn.execute(
            "SELECT AVG(analysis_duration_ms) FROM metadata.audio_features WHERE analysis_duration_ms IS NOT NULL"
        ).fetchone()[0]

        # Last analysis time
        last_analysis = conn.execute(
            "SELECT MAX(updated_at) FROM metadata.audio_features"
        ).fetchone()[0]

        return {
            "total_songs": total,
            "analyzed": analyzed,
            "pending": total - analyzed - failed,
            "failed": failed,
            "avg_analysis_time_ms": int(avg_time) if avg_time else None,
            "last_analysis": last_analysis.isoformat() if last_analysis else None,
        }


async def get_features_for_song(sha_id: str) -> Optional[dict]:
    """Get audio features for a specific song."""
    from backend.db.connection import get_connection

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                sha_id, bpm, bpm_confidence, key, key_mode, key_camelot, key_confidence,
                energy, mood_primary, mood_secondary, mood_scores,
                danceability, acousticness, instrumentalness,
                beat_strength, tempo_stability,
                analyzer_version, analysis_duration_ms, error_message,
                created_at, updated_at
            FROM metadata.audio_features
            WHERE sha_id = %s
            """,
            (sha_id,)
        ).fetchone()

        if not row:
            return None

        return {
            "sha_id": row[0],
            "bpm": float(row[1]) if row[1] else None,
            "bpm_confidence": float(row[2]) if row[2] else None,
            "key": row[3],
            "key_mode": row[4],
            "key_camelot": row[5],
            "key_confidence": float(row[6]) if row[6] else None,
            "energy": int(row[7]) if row[7] else None,
            "mood_primary": row[8],
            "mood_secondary": row[9],
            "mood_scores": row[10],
            "danceability": int(row[11]) if row[11] else None,
            "acousticness": int(row[12]) if row[12] else None,
            "instrumentalness": int(row[13]) if row[13] else None,
            "beat_strength": float(row[14]) if row[14] else None,
            "tempo_stability": float(row[15]) if row[15] else None,
            "analyzer_version": row[16],
            "analysis_duration_ms": row[17],
            "error_message": row[18],
            "created_at": row[19].isoformat() if row[19] else None,
            "analyzed_at": row[20].isoformat() if row[20] else None,
        }


async def save_features(
    sha_id: str,
    features: AggregatedFeatures,
    analysis_duration_ms: int,
) -> None:
    """Save extracted features to database."""
    from backend.db.connection import get_connection

    # Prepare mood_scores as JSON
    mood_scores = None
    if features.metadata and "mood" in features.metadata:
        mood_meta = features.metadata.get("mood", {})
        if "scores" in mood_meta:
            mood_scores = json.dumps(mood_meta["scores"])

    # Prepare error message
    error_message = "; ".join(features.errors) if features.errors else None

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO metadata.audio_features (
                sha_id, bpm, bpm_confidence, key, key_mode, key_camelot, key_confidence,
                energy, mood_primary, mood_secondary, mood_scores,
                danceability, acousticness, instrumentalness,
                analyzer_version, analysis_duration_ms, error_message,
                updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
            )
            ON CONFLICT (sha_id) DO UPDATE SET
                bpm = EXCLUDED.bpm,
                bpm_confidence = EXCLUDED.bpm_confidence,
                key = EXCLUDED.key,
                key_mode = EXCLUDED.key_mode,
                key_camelot = EXCLUDED.key_camelot,
                key_confidence = EXCLUDED.key_confidence,
                energy = EXCLUDED.energy,
                mood_primary = EXCLUDED.mood_primary,
                mood_secondary = EXCLUDED.mood_secondary,
                mood_scores = EXCLUDED.mood_scores,
                danceability = EXCLUDED.danceability,
                acousticness = EXCLUDED.acousticness,
                instrumentalness = EXCLUDED.instrumentalness,
                analyzer_version = EXCLUDED.analyzer_version,
                analysis_duration_ms = EXCLUDED.analysis_duration_ms,
                error_message = EXCLUDED.error_message,
                updated_at = NOW()
            """,
            (
                sha_id,
                features.bpm,
                features.confidence.get("bpm"),
                features.key,
                features.mode,
                features.camelot,
                features.confidence.get("key"),
                features.energy,
                features.primary_mood,
                features.secondary_mood,
                mood_scores,
                features.danceability,
                features.acousticness,
                features.instrumentalness,
                ANALYZER_VERSION,
                analysis_duration_ms,
                error_message,
            )
        )
        conn.commit()


async def process_batch(
    limit: int = 100,
    force: bool = False,
    config: Optional[FeatureConfig] = None,
    progress_callback: Optional[Callable[[dict], None]] = None,
    stop_check: Optional[Callable[[], bool]] = None,
) -> dict:
    """
    Process a batch of songs, extracting features and saving to database.

    Args:
        limit: Maximum songs to process
        force: Re-analyze even if already analyzed
        config: Feature extraction configuration
        progress_callback: Called with progress updates
        stop_check: Function that returns True to stop processing

    Returns:
        Dictionary with processing results
    """
    import time

    pipeline = FeaturePipeline(config=config)
    songs = await get_songs_needing_analysis(limit=limit, force=force)

    results = {
        "processed": 0,
        "failed": 0,
        "skipped": 0,
        "errors": [],
    }

    total = len(songs)
    logger.info(f"Processing {total} songs for audio features")

    for i, song in enumerate(songs):
        # Check for stop request
        if stop_check and stop_check():
            logger.info("Stop requested, halting feature extraction")
            break

        sha_id = song["sha_id"]
        title = song.get("title", sha_id[:8])

        # Get audio path
        audio_path = get_song_cache_path(sha_id)

        if not audio_path.exists():
            results["skipped"] += 1
            results["errors"].append(f"{sha_id}: Audio file not found")
            if progress_callback:
                progress_callback({
                    "current": i + 1,
                    "total": total,
                    "sha_id": sha_id,
                    "title": title,
                    "status": "skipped",
                    "message": "Audio file not found",
                })
            continue

        # Extract features - run in thread pool to avoid blocking event loop
        start_time = time.time()

        try:
            # Run blocking extraction in a thread pool
            import asyncio
            features = await asyncio.to_thread(pipeline.extract_from_file, audio_path)
            analysis_duration_ms = int((time.time() - start_time) * 1000)

            # Save to database
            await save_features(sha_id, features, analysis_duration_ms)

            if features.success:
                results["processed"] += 1
                status = "success"
                message = f"BPM: {features.bpm}, Key: {features.key} {features.mode}"
            else:
                results["failed"] += 1
                status = "error"
                message = "; ".join(features.errors)
                results["errors"].append(f"{sha_id}: {message}")

        except Exception as e:
            analysis_duration_ms = int((time.time() - start_time) * 1000)
            results["failed"] += 1
            status = "error"
            message = str(e)
            results["errors"].append(f"{sha_id}: {message}")

            # Save error to database
            error_features = AggregatedFeatures(success=False, errors=[str(e)])
            await save_features(sha_id, error_features, analysis_duration_ms)

        if progress_callback:
            progress_callback({
                "current": i + 1,
                "total": total,
                "sha_id": sha_id,
                "title": title,
                "status": status,
                "message": message,
                "duration_ms": analysis_duration_ms,
            })

        logger.debug(f"[{i + 1}/{total}] {sha_id[:8]}: {status} ({analysis_duration_ms}ms)")

    return results
