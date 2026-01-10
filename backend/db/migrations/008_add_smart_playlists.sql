-- Smart Playlists Migration
-- Adds rule-based dynamic playlist system

-- Smart playlist definitions
CREATE TABLE IF NOT EXISTS smart_playlists (
    playlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rule definition (JSONB for flexible querying)
    rules JSONB NOT NULL,
    rules_version INTEGER DEFAULT 1,

    -- Sorting and limits
    sort_by VARCHAR(50) DEFAULT 'added_at',  -- title, artist, album, release_year, duration_sec, play_count, random
    sort_order VARCHAR(4) DEFAULT 'desc',    -- asc, desc
    limit_count INTEGER,                      -- NULL = unlimited

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_refreshed_at TIMESTAMPTZ,
    auto_refresh BOOLEAN DEFAULT TRUE,        -- Refresh on library changes

    -- Cached stats
    song_count INTEGER DEFAULT 0,
    total_duration_sec INTEGER DEFAULT 0,

    -- Template support
    is_template BOOLEAN DEFAULT FALSE,
    template_category VARCHAR(50)             -- 'recently_added', 'favorites', 'discovery', etc.
);

-- Indexes for smart_playlists
CREATE INDEX IF NOT EXISTS idx_smart_playlists_name ON smart_playlists(name);
CREATE INDEX IF NOT EXISTS idx_smart_playlists_updated ON smart_playlists(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_playlists_templates ON smart_playlists(is_template) WHERE is_template = TRUE;
CREATE INDEX IF NOT EXISTS idx_smart_playlists_rules ON smart_playlists USING GIN (rules);

-- Cached song membership (materialized results)
CREATE TABLE IF NOT EXISTS smart_playlist_songs (
    playlist_id UUID NOT NULL REFERENCES smart_playlists(playlist_id) ON DELETE CASCADE,
    sha_id CHAR(64) NOT NULL REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,      -- For ordered display
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (playlist_id, sha_id)
);

CREATE INDEX IF NOT EXISTS idx_smart_playlist_songs_sha ON smart_playlist_songs(sha_id);
CREATE INDEX IF NOT EXISTS idx_smart_playlist_songs_position ON smart_playlist_songs(playlist_id, position);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_smart_playlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS smart_playlist_update_timestamp ON smart_playlists;
CREATE TRIGGER smart_playlist_update_timestamp
    BEFORE UPDATE ON smart_playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_smart_playlist_timestamp();

-- Function to update playlist stats after refresh
CREATE OR REPLACE FUNCTION update_smart_playlist_stats(p_playlist_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE smart_playlists
    SET last_refreshed_at = NOW(),
        song_count = (SELECT COUNT(*) FROM smart_playlist_songs WHERE playlist_id = p_playlist_id),
        total_duration_sec = (
            SELECT COALESCE(SUM(s.duration_sec), 0)
            FROM smart_playlist_songs sps
            JOIN metadata.songs s ON s.sha_id = sps.sha_id
            WHERE sps.playlist_id = p_playlist_id
        )
    WHERE playlist_id = p_playlist_id;
END;
$$ LANGUAGE plpgsql;

-- Insert default templates
INSERT INTO smart_playlists (name, description, rules, sort_by, sort_order, is_template, template_category) VALUES
(
    'Recently Added',
    'Songs added in the last 30 days',
    '{"version": 1, "match": "all", "conditions": [{"field": "added_at", "operator": "within_days", "value": 30}]}',
    'added_at', 'desc', TRUE, 'time'
),
(
    'Heavy Rotation',
    'Your most played songs this month',
    '{"version": 1, "match": "all", "conditions": [{"field": "play_count", "operator": "greater", "value": 5}, {"field": "last_played", "operator": "within_days", "value": 30}]}',
    'play_count', 'desc', TRUE, 'favorites'
),
(
    'Forgotten Favorites',
    'Liked songs you haven''t played recently',
    '{"version": 1, "match": "all", "conditions": [{"field": "is_liked", "operator": "is_true", "value": true}, {"field": "last_played", "operator": "before", "value": "-90 days"}]}',
    'last_played', 'asc', TRUE, 'discovery'
),
(
    'Never Played',
    'Songs in your library you''ve never listened to',
    '{"version": 1, "match": "all", "conditions": [{"field": "play_count", "operator": "equals", "value": 0}]}',
    'added_at', 'desc', TRUE, 'discovery'
),
(
    'Short Songs',
    'Songs under 3 minutes',
    '{"version": 1, "match": "all", "conditions": [{"field": "duration_sec", "operator": "less", "value": 180}]}',
    'duration_sec', 'asc', TRUE, 'duration'
),
(
    'Long Songs',
    'Epic tracks over 7 minutes',
    '{"version": 1, "match": "all", "conditions": [{"field": "duration_sec", "operator": "greater", "value": 420}]}',
    'duration_sec', 'desc', TRUE, 'duration'
),
(
    'Top Rated',
    'Songs you frequently complete without skipping',
    '{"version": 1, "match": "all", "conditions": [{"field": "completion_rate", "operator": "greater", "value": 80}, {"field": "play_count", "operator": "greater", "value": 3}]}',
    'completion_rate', 'desc', TRUE, 'favorites'
),
(
    'Frequently Skipped',
    'Songs you often skip - consider removing?',
    '{"version": 1, "match": "all", "conditions": [{"field": "skip_count", "operator": "greater", "value": 3}, {"field": "completion_rate", "operator": "less", "value": 50}]}',
    'skip_count', 'desc', TRUE, 'cleanup'
)
ON CONFLICT DO NOTHING;
