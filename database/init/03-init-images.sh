#!/bin/bash
set -e

# Initialize image database schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "songbase_images" <<-EOSQL
    -- Create media schema
    CREATE SCHEMA IF NOT EXISTS media;

    -- Image assets table (stores binary image data)
    CREATE TABLE IF NOT EXISTS media.image_assets (
        image_id BIGSERIAL PRIMARY KEY,
        sha256 CHAR(64) UNIQUE NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size BIGINT NOT NULL,
        image_bytes BYTEA NOT NULL,
        source_url TEXT,
        source_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Song-Image relationship
    CREATE TABLE IF NOT EXISTS media.song_images (
        song_sha_id CHAR(64) NOT NULL,
        image_id BIGINT REFERENCES media.image_assets(image_id) ON DELETE CASCADE,
        image_type TEXT NOT NULL DEFAULT 'cover',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (song_sha_id, image_type)
    );

    -- Album-Image relationship
    CREATE TABLE IF NOT EXISTS media.album_images (
        album_image_id BIGSERIAL PRIMARY KEY,
        album_key TEXT NOT NULL,
        album_title TEXT NOT NULL,
        album_artist TEXT,
        image_id BIGINT REFERENCES media.image_assets(image_id) ON DELETE CASCADE,
        image_type TEXT NOT NULL DEFAULT 'cover',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (album_key, image_type)
    );

    -- Artist profile images and data
    CREATE TABLE IF NOT EXISTS media.artist_profiles (
        profile_id BIGSERIAL PRIMARY KEY,
        artist_name TEXT NOT NULL,
        profile_sha256 CHAR(64) NOT NULL,
        profile_json JSONB NOT NULL,
        image_id BIGINT REFERENCES media.image_assets(image_id) ON DELETE SET NULL,
        source_name TEXT,
        source_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (artist_name)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_song_images_sha_id ON media.song_images (song_sha_id);
    CREATE INDEX IF NOT EXISTS idx_album_images_key ON media.album_images (album_key);
    CREATE INDEX IF NOT EXISTS idx_artist_profiles_sha ON media.artist_profiles (profile_sha256);

    -- Migrations tracking table
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Mark migration as applied
    INSERT INTO schema_migrations (version) VALUES ('001_init.sql')
    ON CONFLICT (version) DO NOTHING;
EOSQL

echo "Image database initialized successfully"
