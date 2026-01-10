-- Migration: 011_stats_performance_indexes.sql
-- Purpose: Add performance indexes for stats dashboard queries

-- ============================================================================
-- Play Sessions Indexes
-- ============================================================================

-- Index for period-based queries (week, month, year filtering)
CREATE INDEX IF NOT EXISTS idx_play_sessions_started_at_brin
ON play_sessions USING BRIN (started_at);

-- Composite index for top songs/artists queries with period filter
CREATE INDEX IF NOT EXISTS idx_play_sessions_sha_started_completed
ON play_sessions(sha_id, started_at DESC, completed);

-- Index for skip analysis queries
CREATE INDEX IF NOT EXISTS idx_play_sessions_skipped
ON play_sessions(skipped, started_at DESC)
WHERE skipped = TRUE;

-- Index for context distribution queries
CREATE INDEX IF NOT EXISTS idx_play_sessions_context_started
ON play_sessions(context_type, started_at DESC);

-- Index for heatmap queries (day of week and hour extraction)
CREATE INDEX IF NOT EXISTS idx_play_sessions_dow_hour
ON play_sessions(
    EXTRACT(DOW FROM started_at AT TIME ZONE 'UTC'),
    EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC')
);

-- ============================================================================
-- Audio Features Indexes
-- ============================================================================

-- Index for BPM distribution queries
CREATE INDEX IF NOT EXISTS idx_audio_features_bpm
ON metadata.audio_features(bpm)
WHERE bpm IS NOT NULL;

-- Index for energy distribution
CREATE INDEX IF NOT EXISTS idx_audio_features_energy
ON metadata.audio_features(energy)
WHERE energy IS NOT NULL;

-- Index for danceability distribution
CREATE INDEX IF NOT EXISTS idx_audio_features_danceability
ON metadata.audio_features(danceability)
WHERE danceability IS NOT NULL;

-- Index for key distribution queries
CREATE INDEX IF NOT EXISTS idx_audio_features_key_mode
ON metadata.audio_features(key, key_mode)
WHERE key IS NOT NULL;

-- Index for mood distribution queries
CREATE INDEX IF NOT EXISTS idx_audio_features_mood
ON metadata.audio_features(mood_primary)
WHERE mood_primary IS NOT NULL;

-- Composite index for scatter plot queries (energy vs danceability)
CREATE INDEX IF NOT EXISTS idx_audio_features_energy_dance
ON metadata.audio_features(energy, danceability)
WHERE energy IS NOT NULL AND danceability IS NOT NULL;

-- ============================================================================
-- Songs Table Indexes
-- ============================================================================

-- Index for library growth queries (songs added over time)
CREATE INDEX IF NOT EXISTS idx_songs_created_at
ON metadata.songs(created_at DESC);

-- Index for decade/year distribution
CREATE INDEX IF NOT EXISTS idx_songs_release_year
ON metadata.songs(release_year)
WHERE release_year IS NOT NULL;

-- Index for duration distribution
CREATE INDEX IF NOT EXISTS idx_songs_duration
ON metadata.songs(duration_sec)
WHERE duration_sec IS NOT NULL;

-- ============================================================================
-- Artist-related Indexes
-- ============================================================================

-- Index for top artists queries with play session join
CREATE INDEX IF NOT EXISTS idx_song_artists_primary
ON metadata.song_artists(artist_id)
WHERE role = 'primary';

-- ============================================================================
-- Materialized View for Stats Performance
-- ============================================================================

-- Weekly listening stats (complements daily_listening_stats)
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_listening_stats AS
SELECT
    DATE_TRUNC('week', started_at AT TIME ZONE 'UTC')::DATE as week_start,
    COUNT(*) as total_plays,
    COUNT(*) FILTER (WHERE completed) as completed_plays,
    COUNT(DISTINCT sha_id) as unique_songs,
    SUM(duration_played_ms) as total_duration_ms,
    ROUND(AVG(completion_percent), 2) as avg_completion_percent,
    COUNT(*) FILTER (WHERE skipped) as skip_count
FROM play_sessions
GROUP BY DATE_TRUNC('week', started_at AT TIME ZONE 'UTC');

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_stats_week
ON weekly_listening_stats(week_start);

-- Monthly listening stats
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_listening_stats AS
SELECT
    DATE_TRUNC('month', started_at AT TIME ZONE 'UTC')::DATE as month_start,
    COUNT(*) as total_plays,
    COUNT(*) FILTER (WHERE completed) as completed_plays,
    COUNT(DISTINCT sha_id) as unique_songs,
    SUM(duration_played_ms) as total_duration_ms,
    ROUND(AVG(completion_percent), 2) as avg_completion_percent,
    COUNT(*) FILTER (WHERE skipped) as skip_count
FROM play_sessions
GROUP BY DATE_TRUNC('month', started_at AT TIME ZONE 'UTC');

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_stats_month
ON monthly_listening_stats(month_start);

-- Top songs per period (pre-aggregated)
CREATE MATERIALIZED VIEW IF NOT EXISTS top_songs_monthly AS
SELECT
    DATE_TRUNC('month', ps.started_at AT TIME ZONE 'UTC')::DATE as month,
    ps.sha_id,
    s.title,
    a.name as artist,
    COUNT(*) as play_count,
    SUM(ps.duration_played_ms) as total_duration_ms,
    ROUND(AVG(ps.completion_percent), 2) as avg_completion
FROM play_sessions ps
JOIN metadata.songs s ON ps.sha_id = s.sha_id
LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
GROUP BY
    DATE_TRUNC('month', ps.started_at AT TIME ZONE 'UTC'),
    ps.sha_id, s.title, a.name;

CREATE INDEX IF NOT EXISTS idx_top_songs_monthly_month
ON top_songs_monthly(month DESC, play_count DESC);

-- ============================================================================
-- Refresh Functions for New Materialized Views
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_weekly_listening_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_listening_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_monthly_listening_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_listening_stats;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_top_songs_monthly()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY top_songs_monthly;
END;
$$ LANGUAGE plpgsql;

-- Combined refresh function for all stats views
CREATE OR REPLACE FUNCTION refresh_all_stats_views()
RETURNS void AS $$
BEGIN
    PERFORM refresh_daily_listening_stats();
    PERFORM refresh_weekly_listening_stats();
    PERFORM refresh_monthly_listening_stats();
    PERFORM refresh_top_songs_monthly();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Analyze tables for query planner optimization
-- ============================================================================

ANALYZE play_sessions;
ANALYZE play_events;
ANALYZE metadata.songs;
ANALYZE metadata.audio_features;
ANALYZE metadata.song_artists;
ANALYZE metadata.artists;
