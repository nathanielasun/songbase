from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.processing import dependencies
from backend.processing.acquisition_pipeline import config
from backend.processing.acquisition_pipeline.pipeline import download_pending


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download pending songs into the preprocessed cache.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of songs to download.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=config.DEFAULT_WORKERS,
        help="Number of parallel downloads to run.",
    )
    parser.add_argument(
        "--sources-file",
        default=str(config.SOURCES_PATH),
        help="Optional JSONL file to seed the download queue.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(config.PREPROCESSED_CACHE_DIR),
        help="Directory to write downloaded MP3s + JSON metadata.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dependencies.ensure_first_run_dependencies()
    if args.limit is not None and args.limit < 1:
        print("--limit must be >= 1", file=sys.stderr)
        return 2
    if args.workers < 1:
        print("--workers must be >= 1", file=sys.stderr)
        return 2

    results = download_pending(
        limit=args.limit,
        workers=args.workers,
        sources_file=Path(args.sources_file).expanduser().resolve()
        if args.sources_file
        else None,
        output_dir=Path(args.output_dir).expanduser().resolve(),
    )

    print(
        "Download complete. "
        f"Requested: {results['requested']}, "
        f"Downloaded: {results['downloaded']}, "
        f"Failed: {results['failed']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
