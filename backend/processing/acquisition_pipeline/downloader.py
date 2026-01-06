from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yt_dlp

from . import config
from .db import QueueItem


@dataclass(frozen=True)
class DownloadResult:
    item: QueueItem
    success: bool
    output_path: Path | None
    info: dict[str, Any] | None
    error: str | None


def _resolve_ffmpeg_path() -> str | None:
    try:
        from backend.processing.mp3_to_pcm import resolve_ffmpeg_path
    except ImportError:
        return None

    return resolve_ffmpeg_path()


def _build_query(item: QueueItem) -> str:
    if item.search_query:
        return item.search_query
    if item.artist:
        return f"{item.artist} - {item.title}"
    return item.title


def _select_info(info: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "id",
        "title",
        "artist",
        "album",
        "track",
        "genre",
        "uploader",
        "channel",
        "duration",
        "webpage_url",
    ]
    return {key: info.get(key) for key in keys if info.get(key) is not None}


def _extract_entry(info: dict[str, Any]) -> dict[str, Any]:
    if info.get("_type") == "playlist" and info.get("entries"):
        return info["entries"][0]
    return info


def download_item(item: QueueItem, output_dir: Path) -> DownloadResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{item.queue_id}.{config.YTDLP_AUDIO_FORMAT}"

    ffmpeg_path = _resolve_ffmpeg_path()

    ydl_opts = {
        "format": config.YTDLP_FORMAT,
        "outtmpl": {"default": str(output_dir / f"{item.queue_id}.%(ext)s")},
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": config.YTDLP_RETRIES,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": config.YTDLP_AUDIO_FORMAT,
                "preferredquality": config.YTDLP_AUDIO_QUALITY,
            }
        ],
    }
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path

    target = item.source_url or f"ytsearch1:{_build_query(item)}"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target, download=True)
        info = _extract_entry(info)
    except Exception as exc:  # noqa: BLE001
        return DownloadResult(
            item=item,
            success=False,
            output_path=None,
            info=None,
            error=str(exc),
        )

    if not output_path.exists():
        return DownloadResult(
            item=item,
            success=False,
            output_path=None,
            info=_select_info(info),
            error="yt-dlp completed but output file was not found",
        )

    return DownloadResult(
        item=item,
        success=True,
        output_path=output_path,
        info=_select_info(info),
        error=None,
    )


def serialize_info(info: dict[str, Any]) -> str:
    return json.dumps(info, ensure_ascii=True)
