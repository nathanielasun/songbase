from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.processing.metadata_pipeline import config
from backend.processing.metadata_pipeline.image_pipeline import sync_images_and_profiles


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Source cover art and artist profiles into the image database.",
    )
    parser.add_argument(
        "--limit-songs",
        type=int,
        default=None,
        help="Maximum number of verified songs to inspect.",
    )
    parser.add_argument(
        "--limit-artists",
        type=int,
        default=None,
        help="Maximum number of artists to inspect.",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=config.MUSICBRAINZ_RATE_LIMIT_SECONDS,
        help="Seconds to wait between external requests.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch metadata without writing to the image database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit_songs is not None and args.limit_songs < 1:
        print("--limit-songs must be >= 1", file=sys.stderr)
        return 2
    if args.limit_artists is not None and args.limit_artists < 1:
        print("--limit-artists must be >= 1", file=sys.stderr)
        return 2

    result = sync_images_and_profiles(
        limit_songs=args.limit_songs,
        limit_artists=args.limit_artists,
        rate_limit_seconds=args.rate_limit,
        dry_run=args.dry_run,
    )

    print(
        "Image sync complete. "
        f"Songs processed: {result.songs_processed}, "
        f"Song images: {result.song_images}, "
        f"Album images: {result.album_images}, "
        f"Artist profiles: {result.artist_profiles}, "
        f"Artist images: {result.artist_images}, "
        f"Skipped: {result.skipped}, "
        f"Failed: {result.failed}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
