ALTER TABLE metadata.songs
    ADD COLUMN IF NOT EXISTS musicbrainz_release_id TEXT,
    ADD COLUMN IF NOT EXISTS musicbrainz_release_group_id TEXT;

CREATE TABLE IF NOT EXISTS metadata.albums (
    album_id TEXT PRIMARY KEY,
    album_key TEXT NOT NULL,
    title TEXT NOT NULL,
    artist_name TEXT,
    artist_id BIGINT REFERENCES metadata.artists(artist_id) ON DELETE SET NULL,
    release_year INTEGER,
    release_date TEXT,
    track_count INTEGER,
    total_duration_sec INTEGER,
    musicbrainz_release_id TEXT,
    musicbrainz_release_group_id TEXT,
    source TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (album_key),
    UNIQUE (musicbrainz_release_id)
);

CREATE TABLE IF NOT EXISTS metadata.album_tracks (
    album_id TEXT REFERENCES metadata.albums(album_id) ON DELETE CASCADE,
    track_number INTEGER,
    title TEXT NOT NULL,
    duration_sec INTEGER,
    musicbrainz_recording_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (album_id, track_number, title)
);

CREATE INDEX IF NOT EXISTS idx_albums_artist_id
    ON metadata.albums (artist_id);

CREATE INDEX IF NOT EXISTS idx_album_tracks_album_id
    ON metadata.album_tracks (album_id);
