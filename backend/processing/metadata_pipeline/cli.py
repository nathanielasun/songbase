from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.processing.metadata_pipeline import config
from backend.processing.metadata_pipeline.pipeline import verify_unverified_songs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify and enrich unverified songs with MusicBrainz.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of songs to verify.",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=config.MUSICBRAINZ_MIN_SCORE,
        help="Minimum MusicBrainz match score to accept.",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=config.MUSICBRAINZ_RATE_LIMIT_SECONDS,
        help="Seconds to wait between MusicBrainz requests.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch matches but do not update the database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        print("--limit must be >= 1", file=sys.stderr)
        return 2

    result = verify_unverified_songs(
        limit=args.limit,
        min_score=args.min_score,
        rate_limit_seconds=args.rate_limit,
        dry_run=args.dry_run,
    )

    print(
        "Verification complete. "
        f"Processed: {result.processed}, "
        f"Verified: {result.verified}, "
        f"Skipped: {result.skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
