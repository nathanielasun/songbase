CREATE SCHEMA IF NOT EXISTS media;

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

CREATE TABLE IF NOT EXISTS media.song_images (
    song_sha_id CHAR(64) NOT NULL,
    image_id BIGINT REFERENCES media.image_assets(image_id) ON DELETE CASCADE,
    image_type TEXT NOT NULL DEFAULT 'cover',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (song_sha_id, image_type)
);

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

CREATE INDEX IF NOT EXISTS idx_song_images_sha_id
    ON media.song_images (song_sha_id);

CREATE INDEX IF NOT EXISTS idx_album_images_key
    ON media.album_images (album_key);

CREATE INDEX IF NOT EXISTS idx_artist_profiles_sha
    ON media.artist_profiles (profile_sha256);
