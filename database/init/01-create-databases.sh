#!/bin/bash
set -e

echo "Creating Songbase databases..."

# Create metadata database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE DATABASE songbase_metadata;
    CREATE DATABASE songbase_images;
EOSQL

echo "Databases created successfully"
