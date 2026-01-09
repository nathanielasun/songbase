-- Enable pg_trgm extension for trigram-based fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add song_count to artists for popularity-based filtering
ALTER TABLE metadata.artists
    ADD COLUMN IF NOT EXISTS song_count INTEGER DEFAULT 0;

-- Create normalized artist name variants table for fast exact lookups
-- This stores pre-computed normalized forms that map to canonical names
CREATE TABLE IF NOT EXISTS metadata.artist_name_variants (
    normalized_name TEXT PRIMARY KEY,
    artist_id BIGINT NOT NULL REFERENCES metadata.artists(artist_id) ON DELETE CASCADE,
    canonical_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigram index on artist names for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm
    ON metadata.artists USING GIN (name gin_trgm_ops);

-- Create index on normalized variants for fast lookups
CREATE INDEX IF NOT EXISTS idx_artist_variants_normalized
    ON metadata.artist_name_variants (normalized_name);

-- Create index for popular artists (song_count) for filtered queries
CREATE INDEX IF NOT EXISTS idx_artists_song_count
    ON metadata.artists (song_count DESC) WHERE song_count > 0;

-- Function to normalize artist name for variant lookup
-- Strips special chars, lowercases, removes extra spaces
CREATE OR REPLACE FUNCTION metadata.normalize_artist_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^\w\s]', '', 'g'),
        '\s+', ' ', 'g'
    )));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate variants of an artist name
-- Returns array of normalized variants to insert
CREATE OR REPLACE FUNCTION metadata.generate_artist_variants(name TEXT)
RETURNS TEXT[] AS $$
DECLARE
    base TEXT;
    no_spaces TEXT;
    without_the TEXT;
    variants TEXT[];
BEGIN
    base := metadata.normalize_artist_name(name);
    variants := ARRAY[base];

    -- Add version without spaces
    no_spaces := REPLACE(base, ' ', '');
    IF no_spaces != base AND LENGTH(no_spaces) > 0 THEN
        variants := array_append(variants, no_spaces);
    END IF;

    -- Add version without "the " prefix
    IF base LIKE 'the %' THEN
        without_the := SUBSTRING(base FROM 5);
        IF LENGTH(without_the) > 0 THEN
            variants := array_append(variants, without_the);
        END IF;
    END IF;

    RETURN variants;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to update artist variants when artist is inserted/updated
CREATE OR REPLACE FUNCTION metadata.update_artist_variants()
RETURNS TRIGGER AS $$
DECLARE
    variant TEXT;
    variants TEXT[];
BEGIN
    -- Delete old variants for this artist
    DELETE FROM metadata.artist_name_variants WHERE artist_id = NEW.artist_id;

    -- Generate and insert new variants
    variants := metadata.generate_artist_variants(NEW.name);
    FOREACH variant IN ARRAY variants
    LOOP
        INSERT INTO metadata.artist_name_variants (normalized_name, artist_id, canonical_name)
        VALUES (variant, NEW.artist_id, NEW.name)
        ON CONFLICT (normalized_name) DO UPDATE
        SET artist_id = EXCLUDED.artist_id,
            canonical_name = EXCLUDED.canonical_name;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on artists table
DROP TRIGGER IF EXISTS trg_artist_variants ON metadata.artists;
CREATE TRIGGER trg_artist_variants
    AFTER INSERT OR UPDATE OF name ON metadata.artists
    FOR EACH ROW
    EXECUTE FUNCTION metadata.update_artist_variants();

-- Trigger function to update artist song_count when song_artists changes
CREATE OR REPLACE FUNCTION metadata.update_artist_song_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE metadata.artists
        SET song_count = song_count + 1
        WHERE artist_id = NEW.artist_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE metadata.artists
        SET song_count = GREATEST(0, song_count - 1)
        WHERE artist_id = OLD.artist_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on song_artists table
DROP TRIGGER IF EXISTS trg_artist_song_count ON metadata.song_artists;
CREATE TRIGGER trg_artist_song_count
    AFTER INSERT OR DELETE ON metadata.song_artists
    FOR EACH ROW
    EXECUTE FUNCTION metadata.update_artist_song_count();

-- Backfill song_count for existing artists
UPDATE metadata.artists a
SET song_count = (
    SELECT COUNT(DISTINCT sa.sha_id)
    FROM metadata.song_artists sa
    WHERE sa.artist_id = a.artist_id
);

-- Backfill variants for existing artists
INSERT INTO metadata.artist_name_variants (normalized_name, artist_id, canonical_name)
SELECT DISTINCT
    unnest(metadata.generate_artist_variants(a.name)) AS normalized_name,
    a.artist_id,
    a.name
FROM metadata.artists a
WHERE a.name IS NOT NULL AND a.name != ''
ON CONFLICT (normalized_name) DO NOTHING;
