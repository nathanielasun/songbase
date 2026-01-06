#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FFMPEG_PATH="${ROOT_DIR}/backend/processing/bin/ffmpeg"

if [[ ! -x "${FFMPEG_PATH}" ]]; then
  echo "Expected a bundled ffmpeg at ${FFMPEG_PATH} (executable)." >&2
  exit 1
fi

cd "${ROOT_DIR}"
python -m PyInstaller \
  --clean \
  --noconfirm \
  --onefile \
  --name mp3-to-pcm \
  --add-binary "backend/processing/bin/ffmpeg:bin" \
  "backend/processing/mp3_to_pcm.py"
