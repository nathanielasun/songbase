from fastapi import APIRouter, HTTPException
from typing import List
import os
from pathlib import Path

router = APIRouter()

@router.get("/", response_model=List[dict])
async def list_songs():
    songs_dir = Path("songs")
    if not songs_dir.exists():
        return []

    songs = []
    for file in songs_dir.glob("*.mp3"):
        songs.append({
            "id": file.stem,
            "filename": file.name,
            "path": str(file)
        })

    return songs

@router.get("/{song_id}")
async def get_song(song_id: str):
    song_path = Path(f"songs/{song_id}.mp3")
    if not song_path.exists():
        raise HTTPException(status_code=404, detail="Song not found")

    return {
        "id": song_id,
        "filename": song_path.name,
        "path": str(song_path)
    }
