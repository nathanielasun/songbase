#!/usr/bin/env python3
"""
Bulk-convert MP3 files to PCM WAV using ffmpeg.

Capabilities:
- Recursively scans an input directory for .mp3 files.
- Converts each file to 16-bit PCM WAV using ffmpeg.
- Preserves the input directory structure under the output directory.
- Runs conversions in parallel with a configurable thread count.
- Skips existing outputs unless --overwrite is provided.
- Ensures ffmpeg + VGGish assets are available locally on first run.
- Auto-downloads ffmpeg to backend/processing/bin/ffmpeg when missing.
- Prefers a bundled ffmpeg at backend/processing/bin/ffmpeg (or in a frozen bundle).
- Allows overriding ffmpeg discovery via the FFMPEG_PATH environment variable.
- Allows overriding the download source via FFMPEG_DOWNLOAD_URL.

Limitations:
- First run may require network access to fetch ffmpeg unless it is already local.
- ffmpeg download can be disabled with SONGBASE_ALLOW_DOWNLOAD=0.
- Input must be .mp3 files (other formats are ignored).
- Always outputs WAV (PCM 16-bit); no sample rate or channel overrides.
- Uses a thread pool (I/O and CPU mixed); not a separate process pool.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import dependencies
else:
    from . import dependencies

_FFMPEG_READY = False
DEFAULT_THREADS = os.cpu_count() or 4


def find_mp3_files(input_dir: Path) -> list[Path]:
    return [
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() == ".mp3"
    ]


def build_output_path(input_dir: Path, output_dir: Path, input_path: Path) -> Path:
    relative_path = input_path.relative_to(input_dir)
    return (output_dir / relative_path).with_suffix(".wav")


def ensure_ffmpeg_available() -> None:
    global _FFMPEG_READY
    if _FFMPEG_READY:
        return
    dependencies.ensure_dependencies(["ffmpeg"])
    _FFMPEG_READY = True


def resolve_ffmpeg_path() -> Optional[str]:
    env_override = os.environ.get("FFMPEG_PATH")
    if env_override:
        candidate = Path(env_override).expanduser()
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)

    candidates: list[Path] = []
    bundle_base = getattr(sys, "_MEIPASS", None)
    if bundle_base:
        candidates.append(Path(bundle_base) / "bin" / "ffmpeg")

    script_dir = Path(__file__).resolve().parent
    candidates.append(script_dir / "bin" / "ffmpeg")

    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)

    return shutil.which("ffmpeg")


def convert_directory(
    input_dir: str | Path,
    output_dir: str | Path,
    threads: int | None = None,
    overwrite: bool = False,
    verbose: bool = True,
) -> dict[str, int]:
    input_dir = Path(input_dir).expanduser().resolve()
    output_dir = Path(output_dir).expanduser().resolve()

    if threads is None:
        threads = DEFAULT_THREADS

    if threads < 1:
        raise ValueError("--threads must be >= 1")

    if not input_dir.is_dir():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    dependencies.ensure_first_run_dependencies()
    ffmpeg_path = resolve_ffmpeg_path()
    if not ffmpeg_path:
        bundled_hint = Path(__file__).resolve().parent / "bin" / "ffmpeg"
        raise RuntimeError(
            "ffmpeg is required but was not found. "
            "Bundle it or install it on PATH. "
            f"Bundled path: {bundled_hint}. "
            "You can also set FFMPEG_PATH."
        )

    mp3_files = find_mp3_files(input_dir)
    if not mp3_files:
        return {"total": 0, "converted": 0, "failed": 0, "skipped": 0}

    total = len(mp3_files)
    max_workers = min(threads, total)
    failures = 0
    skipped = 0
    completed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                convert_one,
                ffmpeg_path,
                input_path,
                build_output_path(input_dir, output_dir, input_path),
                overwrite,
            )
            for input_path in mp3_files
        ]
        for future in as_completed(futures):
            input_path, output_path, success, message = future.result()
            completed += 1
            if not success:
                failures += 1
                if verbose:
                    print(
                        f"[{completed}/{total}] failed: {input_path.name} ({message})",
                        file=sys.stderr,
                    )
            else:
                if message.startswith("skipped"):
                    skipped += 1
                if verbose:
                    print(f"[{completed}/{total}] {message}: {output_path}")

    converted = total - failures - skipped
    return {
        "total": total,
        "converted": converted,
        "failed": failures,
        "skipped": skipped,
    }


def convert_one(
    ffmpeg_path: str,
    input_path: Path,
    output_path: Path,
    overwrite: bool,
) -> tuple[Path, Path, bool, str]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not overwrite:
        return input_path, output_path, True, "skipped (exists)"

    cmd = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y" if overwrite else "-n",
        "-i",
        str(input_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        message = result.stderr.strip() or "ffmpeg failed"
        return input_path, output_path, False, message

    return input_path, output_path, True, "converted"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert MP3 files to PCM WAV in bulk using ffmpeg.",
    )
    parser.add_argument("input_dir", help="Directory containing .mp3 files.")
    parser.add_argument("output_dir", help="Directory to write .wav files.")
    parser.add_argument(
        "--threads",
        type=int,
        default=DEFAULT_THREADS,
        help="Number of CPU threads to use.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing .wav files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        results = convert_directory(
            args.input_dir,
            args.output_dir,
            threads=args.threads,
            overwrite=args.overwrite,
            verbose=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 2

    if results["total"] == 0:
        print("No .mp3 files found to convert.", file=sys.stderr)
        return 1

    if results["failed"]:
        print(f"{results['failed']} file(s) failed.", file=sys.stderr)
        return 1

    if results["skipped"]:
        print(f"{results['skipped']} file(s) skipped because output exists.")

    print("Conversion complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
