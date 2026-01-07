#!/bin/bash
set -euo pipefail

# Development startup script for Songbase
# Starts both frontend (Next.js) and backend (FastAPI) servers

echo "Starting Songbase development servers..."

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_RUN="${ROOT_DIR}/scripts/use_local_python.sh"

cd "${ROOT_DIR}"

"${PY_RUN}" -m backend.bootstrap

if [ -z "${SONGBASE_DATABASE_URL:-}" ] || [ -z "${SONGBASE_IMAGE_DATABASE_URL:-}" ]; then
  "${PY_RUN}" -m backend.db.local_postgres ensure
  eval "$("${PY_RUN}" -m backend.db.local_postgres env)"
fi

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
