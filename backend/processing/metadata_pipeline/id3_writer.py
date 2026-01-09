"""Write metadata to MP3 ID3 tags using mutagen."""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

from mutagen.id3 import (
    APIC,
    ID3,
    TALB,
    TCON,
    TIT2,
    TPE1,
    TPE2,
    TRCK,
    TYER,
    ID3NoHeaderError,
)
from mutagen.mp3 import MP3


def write_id3_tags(
    source_path: Path,
    output_path: Path | None = None,
    *,
    title: str | None = None,
    artist: str | None = None,
    album_artist: str | None = None,
    album: str | None = None,
    year: int | None = None,
    track_number: int | None = None,
    track_total: int | None = None,
    genres: list[str] | None = None,
    cover_art: bytes | None = None,
    cover_art_mime: str = "image/jpeg",
) -> Path:
    """Write ID3 tags to an MP3 file.

    If output_path is None, modifies the file in place.
    Otherwise, copies to output_path and modifies there.

    Args:
        source_path: Path to the source MP3 file
        output_path: Path to write the tagged file (None = modify in place)
        title: Song title (TIT2)
        artist: Artist name (TPE1)
        album_artist: Album artist (TPE2)
        album: Album name (TALB)
        year: Release year (TYER)
        track_number: Track number (TRCK)
        track_total: Total tracks in album (for TRCK "n/total" format)
        genres: List of genres (TCON)
        cover_art: Cover art image bytes (APIC)
        cover_art_mime: MIME type for cover art

    Returns:
        Path to the output file
    """
    # Determine output path
    if output_path is None:
        output_path = source_path
    elif output_path != source_path:
        shutil.copy2(source_path, output_path)

    # Load or create ID3 tags
    try:
        audio = MP3(output_path, ID3=ID3)
        if audio.tags is None:
            audio.add_tags()
    except ID3NoHeaderError:
        audio = MP3(output_path)
        audio.add_tags()

    tags = audio.tags

    # Write metadata tags
    if title is not None:
        tags.delall("TIT2")
        tags.add(TIT2(encoding=3, text=title))

    if artist is not None:
        tags.delall("TPE1")
        tags.add(TPE1(encoding=3, text=artist))

    if album_artist is not None:
        tags.delall("TPE2")
        tags.add(TPE2(encoding=3, text=album_artist))

    if album is not None:
        tags.delall("TALB")
        tags.add(TALB(encoding=3, text=album))

    if year is not None:
        tags.delall("TYER")
        tags.add(TYER(encoding=3, text=str(year)))

    if track_number is not None:
        tags.delall("TRCK")
        if track_total is not None:
            track_str = f"{track_number}/{track_total}"
        else:
            track_str = str(track_number)
        tags.add(TRCK(encoding=3, text=track_str))

    if genres is not None and genres:
        tags.delall("TCON")
        tags.add(TCON(encoding=3, text=genres))

    if cover_art is not None:
        # Remove existing cover art
        tags.delall("APIC")
        tags.add(
            APIC(
                encoding=3,
                mime=cover_art_mime,
                type=3,  # Cover (front)
                desc="Cover",
                data=cover_art,
            )
        )

    # Save tags
    audio.save()

    return output_path


def create_tagged_mp3(
    source_path: Path,
    metadata: dict[str, Any],
    cover_art: bytes | None = None,
    cover_art_mime: str = "image/jpeg",
) -> Path:
    """Create a temporary MP3 file with ID3 tags from metadata dict.

    Args:
        source_path: Path to the source MP3 file
        metadata: Dictionary with keys: title, artist, album, year, track_number, genres
        cover_art: Optional cover art bytes
        cover_art_mime: MIME type for cover art

    Returns:
        Path to temporary tagged MP3 file (caller must delete)
    """
    # Create temp file
    temp_dir = tempfile.mkdtemp(prefix="songbase_download_")
    temp_path = Path(temp_dir) / "song.mp3"

    # Copy source to temp
    shutil.copy2(source_path, temp_path)

    # Write tags
    write_id3_tags(
        temp_path,
        title=metadata.get("title"),
        artist=metadata.get("artist"),
        album_artist=metadata.get("album_artist"),
        album=metadata.get("album"),
        year=metadata.get("year"),
        track_number=metadata.get("track_number"),
        track_total=metadata.get("track_total"),
        genres=metadata.get("genres"),
        cover_art=cover_art,
        cover_art_mime=cover_art_mime,
    )

    return temp_path
