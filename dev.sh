#!/bin/bash

# Development startup script for Songbase
# Starts both frontend (Next.js) and backend (FastAPI) servers

echo "Starting Songbase development servers..."

cd "$(dirname "$0")"

if [ -z "$SONGBASE_DATABASE_URL" ] || [ -z "$SONGBASE_IMAGE_DATABASE_URL" ]; then
  eval "$(python3 backend/db/local_postgres.py env)"
fi
python3 backend/db/local_postgres.py ensure

# Start backend API server
echo "Starting FastAPI backend on http://localhost:8000"
uvicorn backend.api.app:app --reload --port 8000 &
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
