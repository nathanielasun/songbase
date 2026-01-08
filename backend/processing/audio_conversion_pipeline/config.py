from __future__ import annotations

import os

# Status for conversion stage
CONVERSION_STATUS_CONVERTING = "converting"
CONVERSION_STATUS_CONVERTED = "downloaded"  # Transitions to downloaded status after conversion

# Supported input formats (audio and video)
SUPPORTED_AUDIO_FORMATS = {".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".wma"}
SUPPORTED_VIDEO_FORMATS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".m4v"}
ALL_SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS

# Output format
OUTPUT_FORMAT = "mp3"
OUTPUT_AUDIO_QUALITY = "0"  # 0 = best quality for VBR

# FFmpeg conversion settings
FFMPEG_AUDIO_CODEC = "libmp3lame"
FFMPEG_AUDIO_BITRATE = "320k"  # High quality
FFMPEG_AUDIO_SAMPLE_RATE = 44100

# Worker settings
DEFAULT_CONVERSION_WORKERS = max(1, min(4, os.cpu_count() or 2))
