-- Migration: 009_smart_playlists_phase3.sql
-- Purpose: Phase 3 smart playlist optimizations + audio feature hooks

-- Audio feature storage (optional, populated by feature extraction pipeline)
CREATE TABLE IF NOT EXISTS metadata.audio_features (
    sha_id CHAR(64) PRIMARY KEY REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    bpm NUMERIC(6, 2),
    energy NUMERIC(5, 2),
    key VARCHAR(10),
    key_mode VARCHAR(10),
    danceability NUMERIC(5, 2),
    mood_primary VARCHAR(50),
    acousticness NUMERIC(5, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_features_bpm
    ON metadata.audio_features(bpm) WHERE bpm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_energy
    ON metadata.audio_features(energy) WHERE energy IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_key
    ON metadata.audio_features(key, key_mode) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_mood
    ON metadata.audio_features(mood_primary) WHERE mood_primary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_danceability
    ON metadata.audio_features(danceability) WHERE danceability IS NOT NULL;

-- Common smart playlist query indexes
CREATE INDEX IF NOT EXISTS idx_songs_verified_true
    ON metadata.songs(sha_id) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_songs_created_at
    ON metadata.songs(created_at DESC);
