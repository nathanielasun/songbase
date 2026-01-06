#!/usr/bin/env python3
"""
Read song names from songs.txt and download each one via yt-dlp into ./songs.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def load_song_queries(songs_path: Path) -> list[str]:
    lines = songs_path.read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip()]


def main() -> int:
    base_dir = Path(__file__).resolve().parent
    songs_path = base_dir / "songs.txt"
    songs_dir = base_dir / "songs"

    if not songs_path.exists():
        print("Missing songs.txt next to this script.", file=sys.stderr)
        return 1

    if not shutil.which("yt-dlp"):
        print(
            "yt-dlp is not installed or not on PATH. Install it first, e.g.\n"
            "  python -m pip install -U yt-dlp",
            file=sys.stderr,
        )
        return 1

    queries = load_song_queries(songs_path)
    if not queries:
        print("songs.txt is empty. Add one song per line.", file=sys.stderr)
        return 1

    songs_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(songs_dir / "%(title)s.%(ext)s")

    base_cmd = [
        "yt-dlp",
        "--no-playlist",
        "--newline",
        "--progress",
        "--restrict-filenames",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "-o",
        output_template,
    ]
    attempts = [
        ("default", []),
        ("android", ["--extractor-args", "youtube:player_client=android"]),
    ]

    failures = 0
    total = len(queries)
    for idx, query in enumerate(queries, start=1):
        print(f"[{idx}/{total}] Downloading: {query}")

        success = False
        for attempt_name, extra_args in attempts:
            cmd = base_cmd + extra_args + [f"ytsearch1:{query}"]
            result = subprocess.run(cmd)
            if result.returncode == 0:
                success = True
                break
            print(
                f"Attempt {attempt_name} failed for: {query}",
                file=sys.stderr,
            )

        if not success:
            failures += 1
            print(
                f"Failed: {query}",
                file=sys.stderr,
            )
        else:
            print(f"Completed: {query}")

    if failures:
        print(f"{failures} download(s) failed.", file=sys.stderr)
        return 1

    print("All downloads completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
