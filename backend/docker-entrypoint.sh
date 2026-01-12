#!/bin/bash
set -e

echo "==================================="
echo "Songbase Backend - Docker Startup"
echo "==================================="

# Wait for database to be ready
echo "Waiting for database connection..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if python -c "import psycopg; psycopg.connect('$SONGBASE_DATABASE_URL')" 2>/dev/null; then
        echo "Database is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    exit 1
fi

# Create data directories if they don't exist
echo "Ensuring data directories exist..."
mkdir -p /data/songs /data/song_cache /data/embeddings /data/preprocessed_cache /data/metadata

# Run database migrations
echo "Running database migrations..."
python -m backend.db.migrate || {
    echo "Warning: Metadata migrations failed or already applied"
}

python -m backend.db.migrate_images || {
    echo "Warning: Image migrations failed or already applied"
}

echo "Migrations complete!"

# Start the FastAPI server
echo "Starting Songbase API server..."
echo "==================================="
exec python -m backend.api.server --host 0.0.0.0 --port 8000 "$@"
