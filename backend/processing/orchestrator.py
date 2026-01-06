from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import threading
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
from pgvector import Vector

from backend.db.connection import get_connection
from backend.processing import dependencies, mp3_to_pcm
from backend.processing.acquisition_pipeline import config as acquisition_config
from backend.processing.acquisition_pipeline import db as acquisition_db
from backend.processing.acquisition_pipeline import io as acquisition_io
from backend.processing.acquisition_pipeline import pipeline as acquisition_pipeline
from backend.processing.audio_pipeline import config as audio_config
from backend.processing.audio_pipeline import io as audio_io
from backend.processing.audio_pipeline.pipeline import embed_wav_file
from backend.processing.hash_pipeline.pipeline import save_normalized_wav
from backend.processing.metadata_pipeline.pipeline import verify_unverified_songs

STATUS_PCM_READY = "pcm_raw_ready"
STATUS_HASHED = "hashed"
STATUS_EMBEDDED = "embedded"
STATUS_STORED = "stored"
STATUS_DUPLICATE = "duplicate"
STATUS_FAILED = "failed"


@dataclass(frozen=True)
class PipelinePaths:
    repo_root: Path
    preprocessed_cache_dir: Path
    pcm_raw_dir: Path
    pcm_norm_dir: Path
    embedding_dir: Path
    song_cache_dir: Path
    pipeline_state_path: Path

    @classmethod
    def default(cls) -> "PipelinePaths":
        repo_root = acquisition_config.REPO_ROOT
        preprocessed = acquisition_config.PREPROCESSED_CACHE_DIR
        return cls(
            repo_root=repo_root,
            preprocessed_cache_dir=preprocessed,
            pcm_raw_dir=preprocessed / "pcm_raw",
            pcm_norm_dir=preprocessed / "pcm_norm",
            embedding_dir=preprocessed / "embeddings",
            song_cache_dir=repo_root / ".song_cache",
            pipeline_state_path=preprocessed / "pipeline_state.jsonl",
        )


@dataclass(frozen=True)
class ProcessingItem:
    queue_id: int
    title: str
    artist: str | None
    download_path: Path
    status: str

    @property
    def metadata_path(self) -> Path:
        return acquisition_io.metadata_path_for_mp3(self.download_path)


@dataclass(frozen=True)
class PcmResult:
    raw_pcm_path: Path


@dataclass(frozen=True)
class HashResult:
    queue_id: int
    normalized_path: Path
    sha_id: str


@dataclass(frozen=True)
class EmbeddingResult:
    queue_id: int
    embedding_path: Path


@dataclass(frozen=True)
class OrchestratorConfig:
    seed_sources: bool
    download: bool
    download_limit: int | None
    process_limit: int | None
    download_workers: int | None
    pcm_workers: int
    hash_workers: int
    embed_workers: int
    overwrite: bool
    dry_run: bool
    verify: bool
    sources_file: Path | None


class StateWriter:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def append(self, payload: dict) -> None:
        line = json.dumps(payload, sort_keys=True)
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")


def _utc_now() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ensure_directories(paths: PipelinePaths) -> None:
    paths.preprocessed_cache_dir.mkdir(parents=True, exist_ok=True)
    paths.pcm_raw_dir.mkdir(parents=True, exist_ok=True)
    paths.pcm_norm_dir.mkdir(parents=True, exist_ok=True)
    paths.embedding_dir.mkdir(parents=True, exist_ok=True)
    paths.song_cache_dir.mkdir(parents=True, exist_ok=True)


def _raw_pcm_path(paths: PipelinePaths, queue_id: int) -> Path:
    return paths.pcm_raw_dir / f"{queue_id}.wav"


def _normalized_pcm_path(paths: PipelinePaths, queue_id: int) -> Path:
    return paths.pcm_norm_dir / f"{queue_id}.wav"


def _embedding_temp_path(paths: PipelinePaths, queue_id: int) -> Path:
    return paths.embedding_dir / f"{queue_id}.npz"


def _embedding_final_path(paths: PipelinePaths, sha_id: str) -> Path:
    return paths.embedding_dir / f"{sha_id}.npz"


def _song_cache_path(paths: PipelinePaths, sha_id: str) -> Path:
    return paths.song_cache_dir / sha_id[:2] / f"{sha_id}.mp3"


def _load_sidecar_metadata(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _parse_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_duration(metadata: dict) -> int | None:
    if "duration_sec" in metadata:
        return _parse_int(metadata.get("duration_sec"))
    yt_dlp = metadata.get("yt_dlp") or {}
    return _parse_int(yt_dlp.get("duration"))


def _ensure_named_entity(cur, table: str, name: str) -> int:
    id_column = {
        "artists": "artist_id",
        "genres": "genre_id",
    }[table]
    cur.execute(
        f"""
        INSERT INTO metadata.{table} (name)
        VALUES (%s)
        ON CONFLICT (name)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING {id_column}
        """,
        (name,),
    )
    return cur.fetchone()[0]


def _insert_song(cur, sha_id: str, metadata: dict) -> None:
    cur.execute(
        """
        INSERT INTO metadata.songs (
            sha_id,
            title,
            album,
            duration_sec,
            release_year,
            track_number
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (sha_id)
        DO UPDATE SET
            title = COALESCE(EXCLUDED.title, metadata.songs.title),
            album = COALESCE(EXCLUDED.album, metadata.songs.album),
            duration_sec = COALESCE(EXCLUDED.duration_sec, metadata.songs.duration_sec),
            release_year = COALESCE(EXCLUDED.release_year, metadata.songs.release_year),
            track_number = COALESCE(EXCLUDED.track_number, metadata.songs.track_number),
            updated_at = NOW()
        """,
        (
            sha_id,
            metadata.get("title"),
            metadata.get("album"),
            _extract_duration(metadata),
            _parse_int(metadata.get("release_year")),
            _parse_int(metadata.get("track_number")),
        ),
    )


def _insert_song_file(cur, sha_id: str, path: Path, ingestion_source: str) -> None:
    cur.execute(
        """
        INSERT INTO metadata.song_files (
            sha_id,
            file_path,
            file_size,
            mime_type,
            ingestion_source
        )
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (sha_id, file_path)
        DO NOTHING
        """,
        (
            sha_id,
            str(path),
            path.stat().st_size if path.exists() else None,
            "audio/mpeg",
            ingestion_source,
        ),
    )


def _insert_relations(cur, sha_id: str, metadata: dict) -> None:
    artists = []
    if metadata.get("artist"):
        artists.append(metadata["artist"])
    for artist in artists:
        artist_id = _ensure_named_entity(cur, "artists", artist)
        cur.execute(
            """
            INSERT INTO metadata.song_artists (sha_id, artist_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, artist_id, "primary"),
        )

    genres = []
    if metadata.get("genre"):
        genres.append(metadata["genre"])
    for genre in genres:
        genre_id = _ensure_named_entity(cur, "genres", genre)
        cur.execute(
            """
            INSERT INTO metadata.song_genres (sha_id, genre_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, genre_id),
        )


def _load_embeddings(npz_path: Path) -> np.ndarray:
    data = np.load(npz_path)
    if "embedding" in data:
        embeddings = data["embedding"]
    elif "postprocessed" in data:
        embeddings = data["postprocessed"]
    else:
        raise ValueError("Embedding file missing 'embedding' or 'postprocessed' arrays")

    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)
    if embeddings.shape[1] != audio_config.VGGISH_EMBEDDING_SIZE:
        raise ValueError("Embedding dimension mismatch")

    return embeddings.astype(np.float32)


def _insert_embeddings(cur, sha_id: str, npz_path: Path) -> int:
    embeddings = _load_embeddings(npz_path)
    hop = float(audio_config.VGGISH_HOP_SEC)
    frame = float(audio_config.VGGISH_FRAME_SEC)
    model_name = "vggish"
    model_version = audio_config.VGGISH_CHECKPOINT_VERSION
    preprocess_version = (
        f"sr={audio_config.TARGET_SAMPLE_RATE}"
        f";frame={audio_config.VGGISH_FRAME_SEC}"
        f";hop={audio_config.VGGISH_HOP_SEC}"
    )

    rows = []
    for idx, vector in enumerate(embeddings):
        start = idx * hop
        end = start + frame
        rows.append(
            (
                sha_id,
                model_name,
                model_version,
                preprocess_version,
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


def _fetch_processing_items(
    statuses: Iterable[str],
    limit: int | None,
) -> list[ProcessingItem]:
    query = """
        SELECT queue_id, title, artist, download_path, status
        FROM metadata.download_queue
        WHERE status = ANY(%s) AND download_path IS NOT NULL
        ORDER BY downloaded_at ASC
    """
    params = [list(statuses)]
    if limit:
        query += " LIMIT %s"
        params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    items: list[ProcessingItem] = []
    for row in rows:
        download_path = Path(row[3])
        if not download_path.exists():
            acquisition_db.mark_status(row[0], STATUS_FAILED, error="missing download")
            continue
        items.append(
            ProcessingItem(
                queue_id=row[0],
                title=row[1],
                artist=row[2],
                download_path=download_path,
                status=row[4],
            )
        )
    return items


def _convert_mp3_to_pcm(
    mp3_path: Path,
    output_path: Path,
    overwrite: bool,
) -> PcmResult:
    if output_path.exists() and not overwrite:
        return PcmResult(raw_pcm_path=output_path)

    dependencies.ensure_first_run_dependencies()
    ffmpeg_path = mp3_to_pcm.resolve_ffmpeg_path()
    if not ffmpeg_path:
        raise RuntimeError("ffmpeg not available for MP3 conversion.")

    _, _, success, message = mp3_to_pcm.convert_one(
        ffmpeg_path,
        mp3_path,
        output_path,
        overwrite,
    )
    if not success:
        raise RuntimeError(message)
    return PcmResult(raw_pcm_path=output_path)


def _hash_pcm(
    queue_id: int,
    raw_pcm_path: Path,
    normalized_path: Path,
    overwrite: bool,
) -> HashResult:
    if not normalized_path.exists() or overwrite:
        save_normalized_wav(raw_pcm_path, normalized_path, write_metadata=False)
    sha_id = _sha256_file(normalized_path)
    return HashResult(queue_id=queue_id, normalized_path=normalized_path, sha_id=sha_id)


def _embed_pcm(
    queue_id: int,
    raw_pcm_path: Path,
    embedding_path: Path,
    overwrite: bool,
) -> EmbeddingResult:
    if embedding_path.exists() and not overwrite:
        return EmbeddingResult(queue_id=queue_id, embedding_path=embedding_path)
    embeddings = embed_wav_file(raw_pcm_path)
    audio_io.save_embedding(embedding_path, embeddings)
    return EmbeddingResult(queue_id=queue_id, embedding_path=embedding_path)


def _move_mp3(mp3_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    os.replace(mp3_path, target_path)


def _rename_embedding(source: Path, target: Path) -> Path:
    if source == target:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    os.replace(source, target)
    return target


def _update_database(
    sha_id: str,
    metadata: dict,
    mp3_path: Path,
    embedding_path: Path | None,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            _insert_song(cur, sha_id, metadata)
            _insert_relations(cur, sha_id, metadata)
            _insert_song_file(cur, sha_id, mp3_path, ingestion_source="orchestrator")
            if embedding_path and embedding_path.exists():
                _insert_embeddings(cur, sha_id, embedding_path)
        conn.commit()


def _handle_failure(
    item: ProcessingItem,
    state: StateWriter,
    stage: str,
    error: Exception,
) -> None:
    acquisition_db.mark_status(item.queue_id, STATUS_FAILED, error=str(error))
    state.append(
        {
            "download_id": item.queue_id,
            "stage": stage,
            "error": str(error),
            "ts": _utc_now(),
        }
    )


def _process_items(
    items: list[ProcessingItem],
    paths: PipelinePaths,
    state: StateWriter,
    config: OrchestratorConfig,
) -> None:
    if not items:
        print("No downloaded items ready for processing.")
        return

    pcm_workers = max(1, config.pcm_workers)
    hash_workers = max(1, config.hash_workers)
    embed_workers = max(1, config.embed_workers)

    pcm_futures = {}
    hash_futures = {}
    embed_futures = {}

    with ThreadPoolExecutor(max_workers=pcm_workers) as pcm_pool, ProcessPoolExecutor(
        max_workers=hash_workers
    ) as hash_pool, ProcessPoolExecutor(
        max_workers=embed_workers
    ) as embed_pool:
        for item in items:
            raw_pcm = _raw_pcm_path(paths, item.queue_id)
            future = pcm_pool.submit(
                _convert_mp3_to_pcm,
                item.download_path,
                raw_pcm,
                config.overwrite,
            )
            pcm_futures[future] = item

        for future in as_completed(pcm_futures):
            item = pcm_futures[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                _handle_failure(item, state, "pcm_raw_failed", exc)
                continue

            state.append(
                {
                    "download_id": item.queue_id,
                    "stage": STATUS_PCM_READY,
                    "path": str(result.raw_pcm_path),
                    "ts": _utc_now(),
                }
            )
            acquisition_db.mark_status(item.queue_id, STATUS_PCM_READY)

            normalized_pcm = _normalized_pcm_path(paths, item.queue_id)
            hash_futures[
                hash_pool.submit(
                    _hash_pcm,
                    item.queue_id,
                    result.raw_pcm_path,
                    normalized_pcm,
                    config.overwrite,
                )
            ] = item

            embed_path = _embedding_temp_path(paths, item.queue_id)
            embed_futures[
                embed_pool.submit(
                    _embed_pcm,
                    item.queue_id,
                    result.raw_pcm_path,
                    embed_path,
                    config.overwrite,
                )
            ] = item

        hash_results: dict[int, HashResult] = {}
        for future in as_completed(hash_futures):
            item = hash_futures[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                _handle_failure(item, state, "hash_failed", exc)
                continue
            hash_results[item.queue_id] = result
            state.append(
                {
                    "download_id": item.queue_id,
                    "stage": STATUS_HASHED,
                    "sha_id": result.sha_id,
                    "ts": _utc_now(),
                }
            )
            acquisition_db.mark_status(item.queue_id, STATUS_HASHED)

        embed_results: dict[int, EmbeddingResult] = {}
        for future in as_completed(embed_futures):
            item = embed_futures[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                _handle_failure(item, state, "embedding_failed", exc)
                continue
            embed_results[item.queue_id] = result
            state.append(
                {
                    "download_id": item.queue_id,
                    "stage": STATUS_EMBEDDED,
                    "path": str(result.embedding_path),
                    "ts": _utc_now(),
                }
            )
            acquisition_db.mark_status(item.queue_id, STATUS_EMBEDDED)

        for item in items:
            hash_result = hash_results.get(item.queue_id)
            embed_result = embed_results.get(item.queue_id)
            if not hash_result or not embed_result:
                continue

            sha_id = hash_result.sha_id
            target_mp3 = _song_cache_path(paths, sha_id)
            if target_mp3.exists():
                acquisition_db.mark_status(item.queue_id, STATUS_DUPLICATE)
                state.append(
                    {
                        "download_id": item.queue_id,
                        "stage": STATUS_DUPLICATE,
                        "sha_id": sha_id,
                        "ts": _utc_now(),
                    }
                )
                continue

            if config.dry_run:
                continue

            try:
                _move_mp3(item.download_path, target_mp3)
                embedding_final = _rename_embedding(
                    embed_result.embedding_path,
                    _embedding_final_path(paths, sha_id),
                )
                metadata = _load_sidecar_metadata(item.metadata_path)
                if not metadata.get("title"):
                    metadata["title"] = item.title or item.download_path.stem
                if not metadata.get("artist") and item.artist:
                    metadata["artist"] = item.artist
                _update_database(sha_id, metadata, target_mp3, embedding_final)
            except Exception as exc:  # noqa: BLE001
                _handle_failure(item, state, "finalize_failed", exc)
                continue

            acquisition_db.mark_status(item.queue_id, STATUS_STORED)
            state.append(
                {
                    "download_id": item.queue_id,
                    "stage": STATUS_STORED,
                    "sha_id": sha_id,
                    "path": str(target_mp3),
                    "ts": _utc_now(),
                }
            )


def _parse_args() -> OrchestratorConfig:
    parser = argparse.ArgumentParser(
        description="Orchestrate the song processing pipeline.",
    )
    parser.add_argument(
        "--seed-sources",
        action="store_true",
        help="Insert sources.jsonl into the download queue.",
    )
    parser.add_argument(
        "--sources-file",
        default=None,
        help="Override sources.jsonl path.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download pending songs before processing.",
    )
    parser.add_argument(
        "--download-limit",
        type=int,
        default=None,
        help="Maximum number of songs to download.",
    )
    parser.add_argument(
        "--process-limit",
        type=int,
        default=None,
        help="Maximum number of downloaded songs to process.",
    )
    parser.add_argument(
        "--download-workers",
        type=int,
        default=None,
        help="Number of download workers.",
    )
    parser.add_argument(
        "--pcm-workers",
        type=int,
        default=2,
        help="Number of MP3->PCM workers.",
    )
    parser.add_argument(
        "--hash-workers",
        type=int,
        default=2,
        help="Number of hash workers.",
    )
    parser.add_argument(
        "--embed-workers",
        type=int,
        default=1,
        help="Number of embedding workers.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing PCM/embedding files.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip DB writes and final moves.",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Run MusicBrainz verification after storage.",
    )

    args = parser.parse_args()
    sources_file = Path(args.sources_file).expanduser().resolve() if args.sources_file else None

    return OrchestratorConfig(
        seed_sources=args.seed_sources,
        download=args.download,
        download_limit=args.download_limit,
        process_limit=args.process_limit,
        download_workers=args.download_workers,
        pcm_workers=args.pcm_workers,
        hash_workers=args.hash_workers,
        embed_workers=args.embed_workers,
        overwrite=args.overwrite,
        dry_run=args.dry_run,
        verify=args.verify,
        sources_file=sources_file,
    )


def run_orchestrator(config: OrchestratorConfig) -> None:
    dependencies.ensure_first_run_dependencies()
    paths = PipelinePaths.default()
    _ensure_directories(paths)

    state = StateWriter(paths.pipeline_state_path)
    state.append({"stage": "start", "ts": _utc_now()})

    if config.seed_sources:
        inserted = acquisition_pipeline.ensure_sources(config.sources_file)
        print(f"Seeded download queue with {inserted} item(s).")

    if config.download:
        results = acquisition_pipeline.download_pending(
            limit=config.download_limit,
            workers=config.download_workers,
            sources_file=config.sources_file,
            output_dir=paths.preprocessed_cache_dir,
        )
        print(
            "Download results: "
            f"{results['downloaded']} downloaded, {results['failed']} failed."
        )

    process_statuses = {
        acquisition_config.DOWNLOAD_STATUS_DOWNLOADED,
        STATUS_PCM_READY,
        STATUS_HASHED,
        STATUS_EMBEDDED,
    }
    items = _fetch_processing_items(process_statuses, config.process_limit)
    _process_items(items, paths, state, config)

    if config.verify and not config.dry_run:
        result = verify_unverified_songs()
        print(
            "Verification complete. "
            f"{result.verified} verified, {result.skipped} skipped."
        )

    state.append({"stage": "finished", "ts": _utc_now()})


def main() -> int:
    try:
        config = _parse_args()
        run_orchestrator(config)
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
