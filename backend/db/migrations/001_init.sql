CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS embeddings;

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

CREATE TABLE IF NOT EXISTS metadata.artists (
    artist_id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata.genres (
    genre_id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata.labels (
    label_id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata.producers (
    producer_id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata.song_artists (
    sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    artist_id BIGINT REFERENCES metadata.artists(artist_id) ON DELETE CASCADE,
    role TEXT DEFAULT 'primary',
    PRIMARY KEY (sha_id, artist_id, role)
);

CREATE TABLE IF NOT EXISTS metadata.song_genres (
    sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    genre_id BIGINT REFERENCES metadata.genres(genre_id) ON DELETE CASCADE,
    PRIMARY KEY (sha_id, genre_id)
);

CREATE TABLE IF NOT EXISTS metadata.song_labels (
    sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    label_id BIGINT REFERENCES metadata.labels(label_id) ON DELETE CASCADE,
    PRIMARY KEY (sha_id, label_id)
);

CREATE TABLE IF NOT EXISTS metadata.song_producers (
    sha_id CHAR(64) REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    producer_id BIGINT REFERENCES metadata.producers(producer_id) ON DELETE CASCADE,
    PRIMARY KEY (sha_id, producer_id)
);

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

CREATE TABLE IF NOT EXISTS metadata.processing_runs (
    run_id BIGSERIAL PRIMARY KEY,
    pipeline TEXT NOT NULL,
    version TEXT,
    config_json TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

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

CREATE INDEX IF NOT EXISTS idx_song_files_sha_id
    ON metadata.song_files (sha_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_sha_id
    ON embeddings.vggish_embeddings (sha_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON embeddings.vggish_embeddings
    USING HNSW (vector vector_cosine_ops);
