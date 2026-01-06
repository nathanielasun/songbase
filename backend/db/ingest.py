from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Iterable

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
from pgvector import Vector

from backend.db.connection import get_connection
from backend.processing.audio_pipeline import config as vggish_config


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"\d{4}", value)
    if not match:
        return None
    return int(match.group(0))


def _parse_track_number(value: str | None) -> int | None:
    if not value:
        return None
    parts = value.split("/")
    if not parts:
        return None
    try:
        return int(parts[0])
    except ValueError:
        return None


def _extract_metadata(path: Path) -> dict:
    metadata = {
        "title": path.stem,
        "album": None,
        "duration_sec": None,
        "release_year": None,
        "track_number": None,
        "artists": [],
        "genres": [],
        "labels": [],
        "producers": [],
    }

    try:
        import mutagen
    except ImportError:
        return metadata

    audio = mutagen.File(str(path), easy=True)
    if not audio:
        return metadata

    tags = audio.tags or {}

    def _get_first(keys: Iterable[str]) -> str | None:
        for key in keys:
            value = tags.get(key)
            if not value:
                continue
            if isinstance(value, list):
                return value[0]
            return str(value)
        return None

    def _get_list(keys: Iterable[str]) -> list[str]:
        for key in keys:
            value = tags.get(key)
            if not value:
                continue
            if isinstance(value, list):
                return [str(item) for item in value if item]
            return [str(value)]
        return []

    metadata["title"] = _get_first(["title"]) or metadata["title"]
    metadata["album"] = _get_first(["album"])
    metadata["artists"] = _get_list(["artist", "albumartist"])
    metadata["genres"] = _get_list(["genre"])
    metadata["labels"] = _get_list(["label", "organization", "publisher"])
    metadata["producers"] = _get_list(["producer"])

    if audio.info and getattr(audio.info, "length", None) is not None:
        metadata["duration_sec"] = int(round(audio.info.length))

    metadata["release_year"] = _parse_year(_get_first(["date", "year"]))
    metadata["track_number"] = _parse_track_number(_get_first(["tracknumber"]))

    return metadata


def _ensure_named_entity(cur, table: str, name: str) -> int:
    id_column = {
        "artists": "artist_id",
        "genres": "genre_id",
        "labels": "label_id",
        "producers": "producer_id",
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
            metadata.get("duration_sec"),
            metadata.get("release_year"),
            metadata.get("track_number"),
        ),
    )


def _insert_song_file(cur, sha_id: str, path: Path, ingestion_source: str | None) -> None:
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
            path.stat().st_size,
            "audio/mpeg",
            ingestion_source,
        ),
    )


def _insert_relations(cur, sha_id: str, metadata: dict) -> None:
    for artist in metadata.get("artists", []):
        artist_id = _ensure_named_entity(cur, "artists", artist)
        cur.execute(
            """
            INSERT INTO metadata.song_artists (sha_id, artist_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, artist_id, "primary"),
        )

    for genre in metadata.get("genres", []):
        genre_id = _ensure_named_entity(cur, "genres", genre)
        cur.execute(
            """
            INSERT INTO metadata.song_genres (sha_id, genre_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, genre_id),
        )

    for label in metadata.get("labels", []):
        label_id = _ensure_named_entity(cur, "labels", label)
        cur.execute(
            """
            INSERT INTO metadata.song_labels (sha_id, label_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, label_id),
        )

    for producer in metadata.get("producers", []):
        producer_id = _ensure_named_entity(cur, "producers", producer)
        cur.execute(
            """
            INSERT INTO metadata.song_producers (sha_id, producer_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (sha_id, producer_id),
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
    if embeddings.shape[1] != vggish_config.VGGISH_EMBEDDING_SIZE:
        raise ValueError("Embedding dimension mismatch")

    return embeddings.astype(np.float32)


def _insert_embeddings(
    cur,
    sha_id: str,
    npz_path: Path,
    model_name: str,
    model_version: str,
    preprocess_version: str,
) -> int:
    embeddings = _load_embeddings(npz_path)
    hop = float(vggish_config.VGGISH_HOP_SEC)
    frame = float(vggish_config.VGGISH_FRAME_SEC)

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


def ingest_paths(
    paths: Iterable[Path],
    embedding_dir: Path | None,
    ingestion_source: str | None,
    model_name: str,
    model_version: str,
    preprocess_version: str,
) -> dict:
    counts = {"songs": 0, "embeddings": 0}

    with get_connection() as conn:
        with conn.cursor() as cur:
            for path in paths:
                sha_id = _sha256_file(path)
                metadata = _extract_metadata(path)
                _insert_song(cur, sha_id, metadata)
                _insert_relations(cur, sha_id, metadata)
                _insert_song_file(cur, sha_id, path, ingestion_source)
                counts["songs"] += 1

                if embedding_dir:
                    embedding_path = embedding_dir / f"{sha_id}.npz"
                    if embedding_path.exists():
                        counts["embeddings"] += _insert_embeddings(
                            cur,
                            sha_id,
                            embedding_path,
                            model_name,
                            model_version,
                            preprocess_version,
                        )

        conn.commit()

    return counts


def collect_mp3_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted(
        path for path in input_path.rglob("*.mp3") if path.is_file()
    )


def _default_preprocess_version() -> str:
    return (
        f"sr={vggish_config.TARGET_SAMPLE_RATE}"
        f";frame={vggish_config.VGGISH_FRAME_SEC}"
        f";hop={vggish_config.VGGISH_HOP_SEC}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest MP3 metadata and embeddings into Postgres.",
    )
    parser.add_argument("input", help="MP3 file or directory.")
    parser.add_argument(
        "--embedding-dir",
        default=None,
        help="Directory containing SHA-named embedding .npz files.",
    )
    parser.add_argument(
        "--ingestion-source",
        default=None,
        help="Tag describing the ingestion source.",
    )
    parser.add_argument(
        "--model-name",
        default="vggish",
        help="Embedding model name.",
    )
    parser.add_argument(
        "--model-version",
        default=vggish_config.VGGISH_CHECKPOINT_VERSION,
        help="Embedding model version.",
    )
    parser.add_argument(
        "--preprocess-version",
        default=_default_preprocess_version(),
        help="Embedding preprocessing version string.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of files to process.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        print(f"Input path not found: {input_path}", file=sys.stderr)
        return 2

    mp3_files = collect_mp3_files(input_path)
    if args.limit is not None:
        if args.limit < 1:
            print("--limit must be >= 1", file=sys.stderr)
            return 2
        mp3_files = mp3_files[: args.limit]

    if not mp3_files:
        print("No MP3 files found.", file=sys.stderr)
        return 1

    embedding_dir = (
        Path(args.embedding_dir).expanduser().resolve()
        if args.embedding_dir
        else None
    )
    if embedding_dir and not embedding_dir.is_dir():
        print(f"Embedding directory not found: {embedding_dir}", file=sys.stderr)
        return 2

    counts = ingest_paths(
        mp3_files,
        embedding_dir=embedding_dir,
        ingestion_source=args.ingestion_source,
        model_name=args.model_name,
        model_version=args.model_version,
        preprocess_version=args.preprocess_version,
    )

    print(
        "Ingestion complete. "
        f"Songs: {counts['songs']}, embeddings: {counts['embeddings']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
