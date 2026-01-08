from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import config


@dataclass(frozen=True)
class ConversionResult:
    success: bool
    input_path: Path
    output_path: Path | None
    error: str | None


def _resolve_ffmpeg_path() -> str | None:
    """Resolve ffmpeg path from the system or bundled binary."""
    try:
        from backend.processing.mp3_to_pcm import resolve_ffmpeg_path
        return resolve_ffmpeg_path()
    except ImportError:
        return None


def needs_conversion(file_path: Path) -> bool:
    """Check if a file needs conversion to MP3.

    Returns True if the file is not already an MP3 or if it's a video file.
    """
    suffix = file_path.suffix.lower()

    # Already MP3, no conversion needed
    if suffix == ".mp3":
        return False

    # Check if it's a supported format
    return suffix in config.ALL_SUPPORTED_FORMATS


def convert_to_mp3(
    input_path: Path,
    output_path: Path,
    ffmpeg_path: str | None = None,
    overwrite: bool = False,
) -> ConversionResult:
    """Convert audio/video file to MP3 format.

    Args:
        input_path: Path to input file (audio or video)
        output_path: Path to output MP3 file
        ffmpeg_path: Optional path to ffmpeg binary
        overwrite: Whether to overwrite existing output file

    Returns:
        ConversionResult with success status and any errors
    """
    if not input_path.exists():
        return ConversionResult(
            success=False,
            input_path=input_path,
            output_path=None,
            error=f"Input file not found: {input_path}",
        )

    # Check if conversion is needed
    if not needs_conversion(input_path):
        return ConversionResult(
            success=True,
            input_path=input_path,
            output_path=input_path,
            error=None,
        )

    # Check if output already exists
    if output_path.exists() and not overwrite:
        return ConversionResult(
            success=True,
            input_path=input_path,
            output_path=output_path,
            error=None,
        )

    # Resolve ffmpeg
    ffmpeg_cmd = ffmpeg_path or _resolve_ffmpeg_path() or "ffmpeg"

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build ffmpeg command
    cmd = [
        ffmpeg_cmd,
        "-i", str(input_path),
        "-vn",  # No video
        "-acodec", config.FFMPEG_AUDIO_CODEC,
        "-b:a", config.FFMPEG_AUDIO_BITRATE,
        "-ar", str(config.FFMPEG_AUDIO_SAMPLE_RATE),
        "-y" if overwrite else "-n",  # Overwrite or skip if exists
        str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            check=False,
        )

        if result.returncode != 0:
            error_msg = result.stderr or "Unknown ffmpeg error"
            return ConversionResult(
                success=False,
                input_path=input_path,
                output_path=None,
                error=f"FFmpeg conversion failed: {error_msg}",
            )

        # Verify output was created
        if not output_path.exists():
            return ConversionResult(
                success=False,
                input_path=input_path,
                output_path=None,
                error="Output file was not created",
            )

        return ConversionResult(
            success=True,
            input_path=input_path,
            output_path=output_path,
            error=None,
        )

    except subprocess.TimeoutExpired:
        return ConversionResult(
            success=False,
            input_path=input_path,
            output_path=None,
            error="Conversion timed out after 5 minutes",
        )
    except Exception as e:
        return ConversionResult(
            success=False,
            input_path=input_path,
            output_path=None,
            error=f"Conversion error: {str(e)}",
        )


def convert_batch(
    input_files: list[Path],
    output_dir: Path,
    ffmpeg_path: str | None = None,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Convert a batch of files to MP3.

    Args:
        input_files: List of input file paths
        output_dir: Directory for output MP3 files
        ffmpeg_path: Optional path to ffmpeg binary
        overwrite: Whether to overwrite existing output files

    Returns:
        Dictionary with conversion statistics
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {
        "total": len(input_files),
        "converted": 0,
        "skipped": 0,
        "failed": 0,
        "errors": [],
    }

    for input_path in input_files:
        # Generate output path
        output_path = output_dir / f"{input_path.stem}.mp3"

        result = convert_to_mp3(
            input_path=input_path,
            output_path=output_path,
            ffmpeg_path=ffmpeg_path,
            overwrite=overwrite,
        )

        if result.success:
            if result.output_path == input_path:
                results["skipped"] += 1
            else:
                results["converted"] += 1
        else:
            results["failed"] += 1
            if result.error:
                results["errors"].append({
                    "file": str(input_path),
                    "error": result.error,
                })

    return results
