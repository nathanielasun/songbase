# Backend documentation

## Directory structure
backend/
  processing/
    bin/
      .gitkeep      - Placeholder for bundled ffmpeg binary (place ffmpeg here).
    mp3_to_pcm.py   - Bulk converts .mp3 files to PCM .wav using ffmpeg with multithreaded workers.
scripts/
  build_unix.sh     - Builds a standalone binary (macOS/Linux) with bundled ffmpeg.

## Components
- backend/processing/
  - Purpose: batch/offline processing utilities that operate on existing media.
- backend/processing/mp3_to_pcm.py
  - Purpose: bulk MP3 to PCM WAV conversion.
  - Requires: ffmpeg bundled at backend/processing/bin/ffmpeg or available on PATH.
  - Usage:
    - python backend/processing/mp3_to_pcm.py /path/to/mp3s /path/to/output --threads=8
    - Optional: add --overwrite to replace existing .wav files.
- scripts/build_unix.sh
  - Purpose: build a one-file binary with PyInstaller for macOS/Linux.
  - Requires: python, pyinstaller, and a platform-appropriate ffmpeg at backend/processing/bin/ffmpeg.
  - Output: dist/mp3-to-pcm
