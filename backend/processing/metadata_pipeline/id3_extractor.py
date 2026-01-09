"""Extract metadata from MP3 ID3 tags using mutagen."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from mutagen import File as MutagenFile
from mutagen.id3 import ID3
from mutagen.mp3 import MP3

from backend.db.connection import get_connection


def get_song_file_path(sha_id: str) -> Path | None:
    """Get the file path for a song from the database.

    Args:
        sha_id: Song SHA ID

    Returns:
        Path to the audio file, or None if not found
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT file_path
                FROM metadata.song_files
                WHERE sha_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (sha_id,),
            )
            row = cur.fetchone()
            if row and row[0]:
                return Path(row[0])
    return None


def extract_id3_metadata(file_path: Path) -> dict[str, Any]:
    """Extract metadata from an MP3 file's ID3 tags.

    Args:
        file_path: Path to the MP3 file

    Returns:
        Dictionary containing extracted metadata:
        - genre: list of genre strings
        - title: song title
        - artist: artist name
        - album: album name
        - year: release year
        - track_number: track number
    """
    result: dict[str, Any] = {
        "genres": [],
        "title": None,
        "artist": None,
        "album": None,
        "year": None,
        "track_number": None,
    }

    if not file_path.exists():
        return result

    try:
        audio = MutagenFile(file_path, easy=True)
        if audio is None:
            return result

        # Extract genre - can be a list
        if "genre" in audio:
            genres = audio["genre"]
            if isinstance(genres, list):
                # Flatten and clean genre strings
                for g in genres:
                    # Some genres are comma-separated or have multiple values
                    for genre_part in str(g).split(","):
                        genre_part = genre_part.strip()
                        if genre_part:
                            result["genres"].append(genre_part)
            elif genres:
                result["genres"].append(str(genres).strip())

        # Extract other metadata
        if "title" in audio:
            result["title"] = str(audio["title"][0]) if audio["title"] else None

        if "artist" in audio:
            result["artist"] = str(audio["artist"][0]) if audio["artist"] else None

        if "album" in audio:
            result["album"] = str(audio["album"][0]) if audio["album"] else None

        if "date" in audio:
            try:
                year_str = str(audio["date"][0])[:4]
                result["year"] = int(year_str)
            except (ValueError, IndexError):
                pass

        if "tracknumber" in audio:
            try:
                track_str = str(audio["tracknumber"][0]).split("/")[0]
                result["track_number"] = int(track_str)
            except (ValueError, IndexError):
                pass

    except Exception:
        # Silently fail - ID3 extraction is best-effort
        pass

    return result


def extract_id3_genres(file_path: Path) -> list[str]:
    """Extract just the genres from an MP3 file's ID3 tags.

    Args:
        file_path: Path to the MP3 file

    Returns:
        List of genre strings
    """
    metadata = extract_id3_metadata(file_path)
    return metadata.get("genres", [])


def extract_genres_for_song(sha_id: str) -> list[str]:
    """Extract genres from a song's audio file by SHA ID.

    Args:
        sha_id: Song SHA ID

    Returns:
        List of genre strings, empty if file not found or no genres
    """
    file_path = get_song_file_path(sha_id)
    if file_path is None:
        return []
    return extract_id3_genres(file_path)
