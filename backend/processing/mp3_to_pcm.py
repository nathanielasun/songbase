#!/usr/bin/env python3
"""
Bulk-convert MP3 files to PCM WAV using ffmpeg.

Capabilities:
- Recursively scans an input directory for .mp3 files.
- Converts each file to 16-bit PCM WAV using ffmpeg.
- Preserves the input directory structure under the output directory.
- Runs conversions in parallel with a configurable thread count.
- Skips existing outputs unless --overwrite is provided.
- Prefers a bundled ffmpeg at backend/processing/bin/ffmpeg (or in a frozen bundle).
- Allows overriding ffmpeg discovery via the FFMPEG_PATH environment variable.

Limitations:
- Requires ffmpeg bundled alongside the script or available on PATH.
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


def find_mp3_files(input_dir: Path) -> list[Path]:
    return [
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() == ".mp3"
    ]


def build_output_path(input_dir: Path, output_dir: Path, input_path: Path) -> Path:
    relative_path = input_path.relative_to(input_dir)
    return (output_dir / relative_path).with_suffix(".wav")


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
        default=os.cpu_count() or 4,
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

    if args.threads < 1:
        print("--threads must be >= 1", file=sys.stderr)
        return 2

    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 2

    ffmpeg_path = resolve_ffmpeg_path()
    if not ffmpeg_path:
        bundled_hint = Path(__file__).resolve().parent / "bin" / "ffmpeg"
        print(
            "ffmpeg is required but was not found. "
            "Bundle it or install it on PATH.\n"
            f"Bundled path: {bundled_hint}\n"
            "You can also set FFMPEG_PATH.",
            file=sys.stderr,
        )
        return 2

    mp3_files = find_mp3_files(input_dir)
    if not mp3_files:
        print("No .mp3 files found to convert.", file=sys.stderr)
        return 1

    total = len(mp3_files)
    max_workers = min(args.threads, total)
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
                args.overwrite,
            )
            for input_path in mp3_files
        ]
        for future in as_completed(futures):
            input_path, output_path, success, message = future.result()
            completed += 1
            if not success:
                failures += 1
                print(
                    f"[{completed}/{total}] failed: {input_path.name} ({message})",
                    file=sys.stderr,
                )
            else:
                if message.startswith("skipped"):
                    skipped += 1
                print(f"[{completed}/{total}] {message}: {output_path}")

    if failures:
        print(f"{failures} file(s) failed.", file=sys.stderr)
        return 1

    if skipped:
        print(f"{skipped} file(s) skipped because output exists.")

    print("Conversion complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
