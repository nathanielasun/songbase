ALTER TABLE metadata.songs
    ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_source TEXT,
    ADD COLUMN IF NOT EXISTS verification_score INTEGER,
    ADD COLUMN IF NOT EXISTS musicbrainz_recording_id TEXT;

CREATE INDEX IF NOT EXISTS idx_songs_verified
    ON metadata.songs (verified);
