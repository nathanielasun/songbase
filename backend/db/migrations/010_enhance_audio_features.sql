-- Migration: 010_enhance_audio_features.sql
-- Purpose: Enhance audio_features table with full schema for Phase 2

-- Add missing columns to audio_features table
ALTER TABLE metadata.audio_features
    ADD COLUMN IF NOT EXISTS bpm_confidence NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS key_confidence NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS key_camelot VARCHAR(3),
    ADD COLUMN IF NOT EXISTS mood_secondary VARCHAR(50),
    ADD COLUMN IF NOT EXISTS mood_scores JSONB,
    ADD COLUMN IF NOT EXISTS instrumentalness NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS speechiness NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS beat_strength NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS tempo_stability NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS energy_variance NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS spectral_centroid_mean REAL,
    ADD COLUMN IF NOT EXISTS rms_mean REAL,
    ADD COLUMN IF NOT EXISTS chroma_profile FLOAT8[12],
    ADD COLUMN IF NOT EXISTS analyzer_version VARCHAR(20),
    ADD COLUMN IF NOT EXISTS analysis_duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add constraints for valid ranges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_bpm'
    ) THEN
        ALTER TABLE metadata.audio_features
            ADD CONSTRAINT valid_bpm CHECK (bpm IS NULL OR (bpm >= 30 AND bpm <= 300));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_energy'
    ) THEN
        ALTER TABLE metadata.audio_features
            ADD CONSTRAINT valid_energy CHECK (energy IS NULL OR (energy >= 0 AND energy <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_danceability'
    ) THEN
        ALTER TABLE metadata.audio_features
            ADD CONSTRAINT valid_danceability CHECK (danceability IS NULL OR (danceability >= 0 AND danceability <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_acousticness'
    ) THEN
        ALTER TABLE metadata.audio_features
            ADD CONSTRAINT valid_acousticness CHECK (acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100));
    END IF;
END $$;

-- Add additional indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_audio_features_bpm_energy
    ON metadata.audio_features(bpm, energy) WHERE bpm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_key_bpm
    ON metadata.audio_features(key, key_mode, bpm) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_features_analyzed
    ON metadata.audio_features(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_features_errors
    ON metadata.audio_features(sha_id) WHERE error_message IS NOT NULL;

-- Create or replace view for easy song lookup with features
CREATE OR REPLACE VIEW metadata.songs_with_features AS
SELECT
    s.*,
    af.bpm,
    af.bpm_confidence,
    af.key,
    af.key_mode,
    af.key_camelot,
    af.key_confidence,
    af.energy,
    af.mood_primary,
    af.mood_secondary,
    af.danceability,
    af.acousticness,
    af.instrumentalness,
    af.updated_at as features_analyzed_at
FROM metadata.songs s
LEFT JOIN metadata.audio_features af ON af.sha_id = s.sha_id;
