from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import app_settings

router = APIRouter()


class AcquisitionBackend(BaseModel):
    backend_type: str  # "yt-dlp", future: "spotify", "soundcloud", etc.
    enabled: bool = True
    auth_method: str | None = None  # "cookies", "oauth", "username_password", None
    cookies_file: str | None = None  # Path to cookies file
    username: str | None = None
    # Note: passwords should be stored securely, not in plain text
    # For now we'll store path to cookies file which is the recommended yt-dlp approach


class AcquisitionSettings(BaseModel):
    active_backend: str = "yt-dlp"  # Currently active backend
    backends: dict[str, AcquisitionBackend] = {}


def _get_acquisition_settings_path() -> Path:
    """Get the path to the acquisition settings file."""
    settings = app_settings.load_settings()
    paths = app_settings.resolve_paths(settings)
    metadata_dir = paths["metadata_dir"]
    return metadata_dir / "acquisition_settings.json"


def _load_acquisition_settings() -> AcquisitionSettings:
    """Load acquisition settings from file."""
    settings_path = _get_acquisition_settings_path()
    if not settings_path.exists():
        # Return defaults
        return AcquisitionSettings(
            active_backend="yt-dlp",
            backends={
                "yt-dlp": AcquisitionBackend(
                    backend_type="yt-dlp",
                    enabled=True,
                    auth_method=None,
                    cookies_file=None,
                )
            },
        )

    try:
        with settings_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return AcquisitionSettings(**data)
    except (json.JSONDecodeError, TypeError, ValueError):
        # If file is corrupted, return defaults
        return AcquisitionSettings(
            active_backend="yt-dlp",
            backends={
                "yt-dlp": AcquisitionBackend(
                    backend_type="yt-dlp",
                    enabled=True,
                    auth_method=None,
                    cookies_file=None,
                )
            },
        )


def _save_acquisition_settings(settings: AcquisitionSettings) -> None:
    """Save acquisition settings to file."""
    settings_path = _get_acquisition_settings_path()
    settings_path.parent.mkdir(parents=True, exist_ok=True)

    with settings_path.open("w", encoding="utf-8") as f:
        json.dump(settings.model_dump(), f, indent=2)


@router.get("/backends")
async def get_acquisition_backends() -> AcquisitionSettings:
    """Get all configured acquisition backends."""
    return _load_acquisition_settings()


@router.post("/backends/{backend_id}")
async def update_acquisition_backend(
    backend_id: str,
    backend: AcquisitionBackend,
) -> dict[str, Any]:
    """Update or create an acquisition backend configuration."""
    settings = _load_acquisition_settings()
    settings.backends[backend_id] = backend
    _save_acquisition_settings(settings)
    return {"status": "success", "backend_id": backend_id}


@router.post("/backends/{backend_id}/set-active")
async def set_active_backend(backend_id: str) -> dict[str, Any]:
    """Set the active acquisition backend."""
    settings = _load_acquisition_settings()

    if backend_id not in settings.backends:
        raise HTTPException(status_code=404, detail=f"Backend '{backend_id}' not found")

    if not settings.backends[backend_id].enabled:
        raise HTTPException(
            status_code=400,
            detail=f"Backend '{backend_id}' is disabled. Enable it first."
        )

    settings.active_backend = backend_id
    _save_acquisition_settings(settings)
    return {"status": "success", "active_backend": backend_id}


@router.delete("/backends/{backend_id}")
async def delete_acquisition_backend(backend_id: str) -> dict[str, Any]:
    """Delete an acquisition backend configuration."""
    settings = _load_acquisition_settings()

    if backend_id not in settings.backends:
        raise HTTPException(status_code=404, detail=f"Backend '{backend_id}' not found")

    if settings.active_backend == backend_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the active backend. Set another backend as active first."
        )

    del settings.backends[backend_id]
    _save_acquisition_settings(settings)
    return {"status": "success", "deleted": backend_id}


@router.post("/backends/{backend_id}/test")
async def test_acquisition_backend(backend_id: str) -> dict[str, Any]:
    """Test if an acquisition backend is properly configured and authenticated."""
    settings = _load_acquisition_settings()

    if backend_id not in settings.backends:
        raise HTTPException(status_code=404, detail=f"Backend '{backend_id}' not found")

    backend = settings.backends[backend_id]

    if backend.backend_type == "yt-dlp":
        # Test yt-dlp configuration
        try:
            import yt_dlp

            ydl_opts: dict[str, Any] = {
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "extract_flat": True,
            }

            if backend.cookies_file:
                cookies_path = Path(backend.cookies_file).expanduser().resolve()
                if not cookies_path.exists():
                    return {
                        "status": "error",
                        "message": f"Cookies file not found: {backend.cookies_file}"
                    }
                ydl_opts["cookiefile"] = str(cookies_path)

            # Try a simple search to test authentication
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Test with a simple query
                result = ydl.extract_info("ytsearch1:test", download=False)
                if result and isinstance(result, dict):
                    authenticated = backend.cookies_file is not None
                    return {
                        "status": "success",
                        "message": "Backend is working correctly",
                        "authenticated": authenticated,
                    }
                return {
                    "status": "error",
                    "message": "Failed to extract info from yt-dlp"
                }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Test failed: {str(e)}"
            }

    return {
        "status": "error",
        "message": f"Unsupported backend type: {backend.backend_type}"
    }
