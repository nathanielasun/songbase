from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from backend.processing import mp3_to_pcm
from backend.processing.audio_pipeline import config as audio_config

router = APIRouter()

class ProcessingStatus(BaseModel):
    status: str
    message: str

@router.get("/config")
async def get_processing_config():
    return {
        "audio_sample_rate": audio_config.TARGET_SAMPLE_RATE,
        "ffmpeg_threads": mp3_to_pcm.DEFAULT_THREADS
    }

@router.post("/convert")
async def convert_mp3_to_pcm(input_path: str, output_path: str, threads: Optional[int] = None):
    try:
        results = mp3_to_pcm.convert_directory(
            input_path,
            output_path,
            threads=threads or mp3_to_pcm.DEFAULT_THREADS,
            verbose=False,
        )

        if results["total"] == 0:
            message = f"No .mp3 files found under {input_path}"
        else:
            message = (
                f"Converted {results['converted']} of {results['total']} file(s) "
                f"from {input_path} to {output_path}"
            )

        return ProcessingStatus(
            status="success",
            message=message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
