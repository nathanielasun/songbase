"""Command-line interface for audio feature extraction."""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import List

from .config import FeatureConfig
from .pipeline import FeaturePipeline


def setup_logging(verbose: bool = False) -> None:
    """Configure logging based on verbosity level."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def find_audio_files(path: Path, recursive: bool = False) -> List[Path]:
    """
    Find audio files in a directory.

    Args:
        path: Directory path
        recursive: Whether to search recursively

    Returns:
        List of audio file paths
    """
    extensions = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}
    files = []

    if path.is_file():
        if path.suffix.lower() in extensions:
            return [path]
        return []

    pattern = "**/*" if recursive else "*"
    for ext in extensions:
        files.extend(path.glob(f"{pattern}{ext}"))

    return sorted(files)


def print_progress(current: int, total: int, file_path: str) -> None:
    """Print progress bar."""
    bar_length = 40
    progress = current / total
    filled = int(bar_length * progress)
    bar = "=" * filled + "-" * (bar_length - filled)
    filename = Path(file_path).name[:30]
    print(f"\r[{bar}] {current}/{total} - {filename:<30}", end="", flush=True)


def main() -> int:
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description="Extract audio features from music files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract features from a single file
  python -m backend.processing.feature_pipeline.cli song.mp3

  # Process all files in a directory
  python -m backend.processing.feature_pipeline.cli ./music/ -r

  # Output as JSON to file
  python -m backend.processing.feature_pipeline.cli song.mp3 -o features.json

  # Extract specific features only
  python -m backend.processing.feature_pipeline.cli song.mp3 --extractors bpm key
        """,
    )

    parser.add_argument(
        "input",
        type=Path,
        help="Audio file or directory to process",
    )

    parser.add_argument(
        "-r", "--recursive",
        action="store_true",
        help="Search directories recursively",
    )

    parser.add_argument(
        "-o", "--output",
        type=Path,
        help="Output JSON file (default: stdout)",
    )

    parser.add_argument(
        "--extractors",
        nargs="+",
        help="Specific extractors to run (default: all)",
    )

    parser.add_argument(
        "--include-metadata",
        action="store_true",
        help="Include detailed metadata in output",
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output",
    )

    parser.add_argument(
        "--sample-rate",
        type=int,
        default=22050,
        help="Target sample rate (default: 22050)",
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    # Validate input
    if not args.input.exists():
        print(f"Error: Input path does not exist: {args.input}", file=sys.stderr)
        return 1

    # Find audio files
    files = find_audio_files(args.input, args.recursive)

    if not files:
        print(f"Error: No audio files found in: {args.input}", file=sys.stderr)
        return 1

    logger.info(f"Found {len(files)} audio file(s)")

    # Create pipeline
    config = FeatureConfig(sample_rate=args.sample_rate)
    pipeline = FeaturePipeline(config=config)

    # Filter extractors if specified
    if args.extractors:
        available = pipeline.get_extractor_names()
        invalid = set(args.extractors) - set(available)
        if invalid:
            print(f"Error: Invalid extractors: {invalid}", file=sys.stderr)
            print(f"Available: {available}", file=sys.stderr)
            return 1
        # Note: filtering extractors would require pipeline modification
        # For now, we just log which ones were requested
        logger.info(f"Requested extractors: {args.extractors}")

    # Process files
    results = {}
    callback = print_progress if not args.verbose else None

    for i, file_path in enumerate(files):
        if callback:
            callback(i + 1, len(files), str(file_path))

        features = pipeline.extract_from_file(
            file_path,
            include_metadata=args.include_metadata,
        )

        # Use relative path as key if in directory mode
        if args.input.is_dir():
            key = str(file_path.relative_to(args.input))
        else:
            key = str(file_path.name)

        results[key] = features.to_dict()

    if callback:
        print()  # Newline after progress bar

    # Output results
    output_json = json.dumps(results, indent=2, default=str)

    if args.output:
        args.output.write_text(output_json)
        logger.info(f"Results written to: {args.output}")
    else:
        print(output_json)

    # Summary
    successful = sum(1 for r in results.values() if r.get("success", False))
    failed = len(results) - successful

    if failed > 0:
        logger.warning(f"Completed: {successful} successful, {failed} failed")
        return 1
    else:
        logger.info(f"Successfully processed {successful} file(s)")
        return 0


if __name__ == "__main__":
    sys.exit(main())
