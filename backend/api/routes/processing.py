from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from backend.processing.config import AUDIO_SAMPLE_RATE, FFMPEG_THREADS

router = APIRouter()

class ProcessingStatus(BaseModel):
    status: str
    message: str

@router.get("/config")
async def get_processing_config():
    return {
        "audio_sample_rate": AUDIO_SAMPLE_RATE,
        "ffmpeg_threads": FFMPEG_THREADS
    }

@router.post("/convert")
async def convert_mp3_to_pcm(input_path: str, output_path: str, threads: Optional[int] = None):
    try:
        from backend.processing.mp3_to_pcm import convert_directory

        convert_directory(input_path, output_path, threads or FFMPEG_THREADS)

        return ProcessingStatus(
            status="success",
            message=f"Converted MP3 files from {input_path} to {output_path}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
