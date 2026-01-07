from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from backend import app_settings

router = APIRouter()


class SettingsPatch(BaseModel):
    pipeline: dict[str, Any] | None = None
    paths: dict[str, Any] | None = None


@router.get("")
async def get_settings() -> dict[str, Any]:
    return app_settings.load_settings()


@router.put("")
async def update_settings(payload: SettingsPatch) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if payload.pipeline is not None:
        patch["pipeline"] = payload.pipeline
    if payload.paths is not None:
        patch["paths"] = payload.paths
    return app_settings.update_settings(patch)
