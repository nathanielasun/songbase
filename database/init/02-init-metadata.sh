#!/bin/bash
set -e

# Initialize metadata database schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "songbase_metadata" <<-EOSQL
    -- Enable pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- Create schemas
    CREATE SCHEMA IF NOT EXISTS metadata;
    CREATE SCHEMA IF NOT EXISTS embeddings;

    -- Songs table
    CREATE TABLE IF NOT EXISTS metadata.songs (
        sha_id CHAR(64) PRIMARY KEY,
        title TEXT,
        album TEXT,
        duration_sec INTEGER,
        release_year INTEGER,
        track_number INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Artists table
    CREATE TABLE IF NOT EXISTS metadata.artists (
        artist_id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    );

    -- Genres table
    CREATE TABLE IF NOT EXISTS metadata.genres (
        genre_id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    );

    -- Labels table
    CREATE TABLE IF NOT EXISTS metadata.labels (
        label_id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    );

    -- Producers table
    CREATE TABLE IF NOT EXISTS metadata.producers (
        producer_id BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
    );

    -- Song-Artist relationship
    CREATE TABLE IF NOT EXISTS metadata.song_artists (
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        artist_id BIGINT REFERENCES metadata.artists(artist_id) ON DELETE CASCADE,
        role TEXT DEFAULT 'primary',
        PRIMARY KEY (sha_id, artist_id, role)
    );

    -- Song-Genre relationship
    CREATE TABLE IF NOT EXISTS metadata.song_genres (
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        genre_id BIGINT REFERENCES metadata.genres(genre_id) ON DELETE CASCADE,
        PRIMARY KEY (sha_id, genre_id)
    );

    -- Song-Label relationship
    CREATE TABLE IF NOT EXISTS metadata.song_labels (
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        label_id BIGINT REFERENCES metadata.labels(label_id) ON DELETE CASCADE,
        PRIMARY KEY (sha_id, label_id)
    );

    -- Song-Producer relationship
    CREATE TABLE IF NOT EXISTS metadata.song_producers (
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        producer_id BIGINT REFERENCES metadata.producers(producer_id) ON DELETE CASCADE,
        PRIMARY KEY (sha_id, producer_id)
    );

    -- Song files table
    CREATE TABLE IF NOT EXISTS metadata.song_files (
        file_id BIGSERIAL PRIMARY KEY,
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        file_path TEXT,
        file_size BIGINT,
        mime_type TEXT,
        ingestion_source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sha_id, file_path)
    );

    -- Processing runs table
    CREATE TABLE IF NOT EXISTS metadata.processing_runs (
        run_id BIGSERIAL PRIMARY KEY,
        pipeline TEXT NOT NULL,
        version TEXT,
        config_json TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
    );

    -- VGGish embeddings table
    CREATE TABLE IF NOT EXISTS embeddings.vggish_embeddings (
        embedding_id BIGSERIAL PRIMARY KEY,
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        model_name TEXT NOT NULL,
        model_version TEXT NOT NULL,
        preprocess_version TEXT,
        vector VECTOR(128) NOT NULL,
        segment_start_sec DOUBLE PRECISION,
        segment_end_sec DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sha_id, model_name, model_version, segment_start_sec, segment_end_sec)
    );

    -- Add metadata verification columns
    ALTER TABLE metadata.songs ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified';
    ALTER TABLE metadata.songs ADD COLUMN IF NOT EXISTS verification_source TEXT;
    ALTER TABLE metadata.songs ADD COLUMN IF NOT EXISTS musicbrainz_recording_id TEXT;
    ALTER TABLE metadata.songs ADD COLUMN IF NOT EXISTS musicbrainz_release_id TEXT;

    -- Download queue table
    CREATE TABLE IF NOT EXISTS metadata.download_queue (
        queue_id BIGSERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT,
        title TEXT,
        artist TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        local_path TEXT,
        sha_id CHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add additional queue columns
    ALTER TABLE metadata.download_queue ADD COLUMN IF NOT EXISTS video_id TEXT;
    ALTER TABLE metadata.download_queue ADD COLUMN IF NOT EXISTS duration_sec INTEGER;
    ALTER TABLE metadata.download_queue ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

    -- Album metadata table
    CREATE TABLE IF NOT EXISTS metadata.albums (
        album_id BIGSERIAL PRIMARY KEY,
        musicbrainz_release_id TEXT UNIQUE,
        title TEXT NOT NULL,
        artist_credit TEXT,
        release_date DATE,
        track_count INTEGER,
        metadata_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Album tracks table
    CREATE TABLE IF NOT EXISTS metadata.album_tracks (
        track_id BIGSERIAL PRIMARY KEY,
        album_id BIGINT REFERENCES metadata.albums(album_id) ON DELETE CASCADE,
        sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE SET NULL,
        track_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        duration_ms INTEGER,
        musicbrainz_recording_id TEXT,
        UNIQUE (album_id, track_number)
    );

    -- Link songs to albums
    ALTER TABLE metadata.songs ADD COLUMN IF NOT EXISTS album_id BIGINT REFERENCES metadata.albums(album_id) ON DELETE SET NULL;

    -- Artist variants for fuzzy matching
    CREATE TABLE IF NOT EXISTS metadata.artist_variants (
        variant_id BIGSERIAL PRIMARY KEY,
        artist_id BIGINT NOT NULL REFERENCES metadata.artists(artist_id) ON DELETE CASCADE,
        variant_name TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        UNIQUE (artist_id, variant_name)
    );

    -- Artist profile data
    ALTER TABLE metadata.artists ADD COLUMN IF NOT EXISTS profile_json JSONB;
    ALTER TABLE metadata.artists ADD COLUMN IF NOT EXISTS musicbrainz_id TEXT;
    ALTER TABLE metadata.artists ADD COLUMN IF NOT EXISTS sort_name TEXT;
    ALTER TABLE metadata.artists ADD COLUMN IF NOT EXISTS disambiguation TEXT;
    ALTER TABLE metadata.artists ADD COLUMN IF NOT EXISTS song_count INTEGER DEFAULT 0;

    -- Play sessions table
    CREATE TABLE IF NOT EXISTS metadata.play_sessions (
        session_id BIGSERIAL PRIMARY KEY,
        sha_id CHAR(64) NOT NULL REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        duration_ms INTEGER,
        completion_percent REAL,
        context_type TEXT,
        context_id TEXT,
        was_skipped BOOLEAN DEFAULT FALSE,
        skip_position_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Play events table
    CREATE TABLE IF NOT EXISTS metadata.play_events (
        event_id BIGSERIAL PRIMARY KEY,
        session_id BIGINT NOT NULL REFERENCES metadata.play_sessions(session_id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        position_ms INTEGER,
        event_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Listening streaks table
    CREATE TABLE IF NOT EXISTS metadata.listening_streaks (
        streak_id BIGSERIAL PRIMARY KEY,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        streak_days INTEGER NOT NULL DEFAULT 1,
        is_current BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Smart playlists table
    CREATE TABLE IF NOT EXISTS metadata.smart_playlists (
        playlist_id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rules_json JSONB NOT NULL,
        sort_by TEXT DEFAULT 'added_at',
        sort_order TEXT DEFAULT 'desc',
        song_limit INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_refreshed_at TIMESTAMPTZ,
        is_auto_refresh BOOLEAN DEFAULT TRUE,
        refresh_interval_hours INTEGER DEFAULT 24
    );

    -- Smart playlist songs cache
    CREATE TABLE IF NOT EXISTS metadata.smart_playlist_songs (
        id BIGSERIAL PRIMARY KEY,
        playlist_id BIGINT NOT NULL REFERENCES metadata.smart_playlists(playlist_id) ON DELETE CASCADE,
        sha_id CHAR(64) NOT NULL REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (playlist_id, sha_id)
    );

    -- Audio features table
    CREATE TABLE IF NOT EXISTS metadata.audio_features (
        feature_id BIGSERIAL PRIMARY KEY,
        sha_id CHAR(64) NOT NULL REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
        bpm REAL,
        key_name TEXT,
        key_mode TEXT,
        key_camelot TEXT,
        energy REAL,
        danceability REAL,
        acousticness REAL,
        instrumentalness REAL,
        speechiness REAL,
        mood_primary TEXT,
        mood_secondary TEXT,
        mood_scores JSONB,
        raw_features JSONB,
        bpm_confidence REAL,
        key_confidence REAL,
        energy_confidence REAL,
        analyzer_version TEXT,
        model_metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sha_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_song_files_sha_id ON metadata.song_files (sha_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_sha_id ON embeddings.vggish_embeddings (sha_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings.vggish_embeddings USING HNSW (vector vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS idx_download_queue_status ON metadata.download_queue (status);
    CREATE INDEX IF NOT EXISTS idx_download_queue_sha ON metadata.download_queue (sha_id);
    CREATE INDEX IF NOT EXISTS idx_songs_verification ON metadata.songs (verification_status);
    CREATE INDEX IF NOT EXISTS idx_songs_album_id ON metadata.songs (album_id);
    CREATE INDEX IF NOT EXISTS idx_album_tracks_sha ON metadata.album_tracks (sha_id);
    CREATE INDEX IF NOT EXISTS idx_artist_variants_name ON metadata.artist_variants USING gin (variant_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON metadata.artists USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_play_sessions_sha ON metadata.play_sessions (sha_id);
    CREATE INDEX IF NOT EXISTS idx_play_sessions_started ON metadata.play_sessions (started_at);
    CREATE INDEX IF NOT EXISTS idx_play_events_session ON metadata.play_events (session_id);
    CREATE INDEX IF NOT EXISTS idx_smart_playlist_songs_playlist ON metadata.smart_playlist_songs (playlist_id);
    CREATE INDEX IF NOT EXISTS idx_audio_features_sha ON metadata.audio_features (sha_id);

    -- Migrations table for tracking
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Mark all migrations as applied
    INSERT INTO schema_migrations (version) VALUES
        ('001_init.sql'),
        ('002_add_metadata_verification.sql'),
        ('003_add_download_queue.sql'),
        ('004_update_download_queue.sql'),
        ('005_add_album_metadata.sql'),
        ('006_add_artist_fuzzy_matching.sql'),
        ('007_add_play_history.sql'),
        ('008_add_smart_playlists.sql'),
        ('009_smart_playlists_phase3.sql'),
        ('010_enhance_audio_features.sql'),
        ('011_stats_performance_indexes.sql')
    ON CONFLICT (version) DO NOTHING;
EOSQL

echo "Metadata database initialized successfully"
