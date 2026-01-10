#!/bin/bash
set -euo pipefail

# Development startup script for Songbase
# Starts both frontend (Next.js) and backend (FastAPI) servers

echo "Starting Songbase development servers..."

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create .env file with template if it doesn't exist
if [ ! -f "${ROOT_DIR}/.env" ]; then
  echo "Creating .env file with default template..."
  cat > "${ROOT_DIR}/.env" << 'ENVEOF'
# Songbase Environment Configuration
# Fill in your API credentials below to enable additional metadata sources

# =============================================================================
# Discogs API (https://www.discogs.com/settings/developers)
# =============================================================================
# Option 1: Personal Access Token (simpler, recommended for personal use)
DISCOGS_USER_TOKEN=

# Option 2: OAuth Consumer Key/Secret (for applications)
# DISCOGS_CONSUMER_KEY=
# DISCOGS_CONSUMER_SECRET=

# =============================================================================
# Spotify API (https://developer.spotify.com/dashboard)
# =============================================================================
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# =============================================================================
# Database Configuration (optional - auto-configured if not set)
# =============================================================================
# SONGBASE_DATABASE_URL=postgresql://user:pass@host:port/dbname
# SONGBASE_IMAGE_DATABASE_URL=postgresql://user:pass@host:port/dbname

# =============================================================================
# MusicBrainz Configuration (optional - uses defaults if not set)
# =============================================================================
# SONGBASE_MUSICBRAINZ_RETRIES=2
# SONGBASE_MUSICBRAINZ_SEARCH_LIMIT=10
# SONGBASE_MUSICBRAINZ_MIN_TITLE_SIMILARITY=0.72
# SONGBASE_MUSICBRAINZ_MIN_ARTIST_SIMILARITY=0.6
ENVEOF
  echo "Created .env file at ${ROOT_DIR}/.env"
  echo "Edit this file to add your API credentials for enhanced metadata fetching."
  echo ""
fi

# Load environment variables from .env
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi
PY_RUN="${ROOT_DIR}/scripts/use_local_python.sh"

cd "${ROOT_DIR}"

"${PY_RUN}" -m backend.bootstrap

if [ -z "${SONGBASE_DATABASE_URL:-}" ] || [ -z "${SONGBASE_IMAGE_DATABASE_URL:-}" ]; then
  "${PY_RUN}" -m backend.db.local_postgres ensure
  eval "$("${PY_RUN}" -m backend.db.local_postgres env)"
fi
export SONGBASE_SKIP_DB_BOOTSTRAP=1

# Kill any existing processes on ports 8000 and 3000
echo "Checking for existing processes on ports 8000 and 3000..."
for port in 8000 3000; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing existing processes on port $port (PIDs: $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
done

# Start backend API server
echo "Starting FastAPI backend on http://localhost:8000"
"${PY_RUN}" -m backend.api.server --reload --port 8000 &
BACKEND_PID=$!

# Start frontend Next.js server
echo "Starting Next.js frontend on http://localhost:3000"
cd frontend
npm run dev &
FRONTEND_PID=$!

# Handle cleanup on exit
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo ""
echo "=================================="
echo "Songbase Development Servers Running"
echo "=================================="
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "=================================="

# Wait for both processes
wait
