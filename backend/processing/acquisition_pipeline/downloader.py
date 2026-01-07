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


def _should_skip_entry(entry: dict[str, Any]) -> bool:
    if entry.get("is_live") or entry.get("live_status") == "is_live":
        return True
    duration = entry.get("duration")
    if duration is not None and duration < config.YTDLP_MIN_DURATION:
        return True
    return False


def _search_entries(query: str, ffmpeg_path: str | None) -> list[dict[str, Any]]:
    search_target = f"ytsearch{config.YTDLP_SEARCH_COUNT}:{query}"
    search_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "noplaylist": True,
        "retries": config.YTDLP_RETRIES,
    }
    if ffmpeg_path:
        search_opts["ffmpeg_location"] = ffmpeg_path
    try:
        with yt_dlp.YoutubeDL(search_opts) as ydl:
            info = ydl.extract_info(search_target, download=False)
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(info, dict):
        return []
    entries = info.get("entries") or []
    return [entry for entry in entries if entry]


def _candidate_targets(
    item: QueueItem,
    ffmpeg_path: str | None,
) -> list[tuple[str, dict[str, Any] | None]]:
    if item.source_url:
        return [(item.source_url, None)]

    query = _build_query(item)
    entries = _search_entries(query, ffmpeg_path)
    targets: list[tuple[str, dict[str, Any] | None]] = []
    for entry in entries:
        if _should_skip_entry(entry):
            continue
        url = entry.get("webpage_url") or entry.get("url") or entry.get("id")
        if url:
            targets.append((str(url), entry))
    if targets:
        return targets
    return [(f"ytsearch1:{query}", None)]


def _cleanup_attempt_files(output_dir: Path, queue_id: int) -> None:
    for candidate in output_dir.glob(f"{queue_id}.*"):
        if candidate.suffix == ".json":
            continue
        try:
            candidate.unlink()
        except OSError:
            continue


def _format_error(error: str, target: str | None) -> str:
    if not target:
        return error
    return f"{error} (target={target})"


class _YtDlpLogger:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def debug(self, msg: str) -> None:
        if config.YTDLP_DEBUG:
            self._append("DEBUG", msg)

    def warning(self, msg: str) -> None:
        self._append("WARN", msg)

    def error(self, msg: str) -> None:
        self._append("ERROR", msg)

    def _append(self, level: str, msg: str) -> None:
        line = msg.strip()
        if not line:
            return
        self.lines.append(f"{level}: {line}")
        if len(self.lines) > 50:
            self.lines = self.lines[-50:]

    def summary(self, limit: int = 8) -> str | None:
        if not self.lines:
            return None
        return " | ".join(self.lines[-limit:])


def download_item(item: QueueItem, output_dir: Path) -> DownloadResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{item.queue_id}.{config.YTDLP_AUDIO_FORMAT}"

    ffmpeg_path = _resolve_ffmpeg_path()

    ydl_opts = {
        "format": config.YTDLP_FORMAT,
        "outtmpl": {"default": str(output_dir / f"{item.queue_id}.%(ext)s")},
        "noplaylist": True,
        "quiet": not config.YTDLP_DEBUG,
        "no_warnings": not config.YTDLP_DEBUG,
        "retries": config.YTDLP_RETRIES,
        "fragment_retries": config.YTDLP_FRAGMENT_RETRIES,
        "extractor_retries": config.YTDLP_EXTRACTOR_RETRIES,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": config.YTDLP_AUDIO_FORMAT,
                "preferredquality": config.YTDLP_AUDIO_QUALITY,
            }
        ],
    }
    if config.YTDLP_SLEEP_INTERVAL > 0:
        ydl_opts["sleep_interval"] = config.YTDLP_SLEEP_INTERVAL
    if config.YTDLP_MAX_SLEEP_INTERVAL > 0:
        ydl_opts["max_sleep_interval"] = config.YTDLP_MAX_SLEEP_INTERVAL
    if config.YTDLP_FORCE_IPV4:
        ydl_opts["force_ipv4"] = True
    if config.YTDLP_COOKIES_FILE:
        ydl_opts["cookiefile"] = config.YTDLP_COOKIES_FILE
    if ffmpeg_path:
        ydl_opts["ffmpeg_location"] = ffmpeg_path

    targets = _candidate_targets(item, ffmpeg_path)
    last_error: str | None = None

    for index, (target, entry) in enumerate(targets):
        _cleanup_attempt_files(output_dir, item.queue_id)
        logger = _YtDlpLogger()
        ydl_opts["logger"] = logger
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(target, download=True)
            info = _extract_entry(info)
        except Exception as exc:  # noqa: BLE001
            log_summary = logger.summary()
            raw_error = str(exc)
            if log_summary:
                raw_error = f"{raw_error}; log={log_summary}"
            last_error = _format_error(raw_error, target)
            if "downloaded file is empty" in last_error.lower():
                if index + 1 < len(targets):
                    continue
            return DownloadResult(
                item=item,
                success=False,
                output_path=None,
                info=_select_info(entry) if entry else None,
                error=last_error,
            )

        if not output_path.exists():
            last_error = _format_error(
                "yt-dlp completed but output file was not found",
                target,
            )
            if index + 1 < len(targets):
                continue
            return DownloadResult(
                item=item,
                success=False,
                output_path=None,
                info=_select_info(info),
                error=last_error,
            )

        if output_path.stat().st_size == 0:
            try:
                output_path.unlink()
            except OSError:
                pass
            last_error = _format_error("yt-dlp produced empty output", target)
            if index + 1 < len(targets):
                continue
            return DownloadResult(
                item=item,
                success=False,
                output_path=None,
                info=_select_info(info),
                error=last_error,
            )

        return DownloadResult(
            item=item,
            success=True,
            output_path=output_path,
            info=_select_info(info),
            error=None,
        )

    return DownloadResult(
        item=item,
        success=False,
        output_path=None,
        info=None,
        error=last_error or "yt-dlp failed to download any candidates",
    )


def serialize_info(info: dict[str, Any]) -> str:
    return json.dumps(info, ensure_ascii=True)
