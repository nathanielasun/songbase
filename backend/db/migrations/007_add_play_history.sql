-- Migration: 007_add_play_history.sql
-- Purpose: Add tables for tracking play history and listening statistics

-- Play sessions: one row per song playback attempt
CREATE TABLE IF NOT EXISTS play_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha_id CHAR(64) NOT NULL REFERENCES metadata.songs(sha_id) ON DELETE CASCADE,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_played_ms INTEGER DEFAULT 0,

    -- Completion tracking
    song_duration_ms INTEGER,  -- Cached from song metadata
    completion_percent NUMERIC(5,2) DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,  -- True if >= 80% played
    skipped BOOLEAN DEFAULT FALSE,    -- True if < 30% and manually skipped

    -- Context: where was this played from?
    context_type VARCHAR(50),  -- 'radio', 'playlist', 'album', 'artist', 'search', 'queue', 'for-you'
    context_id VARCHAR(255),   -- playlist_id, album_id, artist_id, etc.

    -- Client info
    client_id VARCHAR(255),    -- Browser fingerprint or device ID
    user_agent TEXT,

    -- For future multi-user support
    user_id VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for play_sessions
CREATE INDEX IF NOT EXISTS idx_play_sessions_sha_id ON play_sessions(sha_id);
CREATE INDEX IF NOT EXISTS idx_play_sessions_started_at ON play_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_sessions_sha_started ON play_sessions(sha_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_sessions_context ON play_sessions(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_play_sessions_completed ON play_sessions(completed) WHERE completed = TRUE;
CREATE INDEX IF NOT EXISTS idx_play_sessions_date ON play_sessions(DATE(started_at AT TIME ZONE 'UTC'));

-- Granular play events within a session
CREATE TABLE IF NOT EXISTS play_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES play_sessions(session_id) ON DELETE CASCADE,

    event_type VARCHAR(20) NOT NULL,  -- 'start', 'pause', 'resume', 'seek', 'skip', 'complete', 'end'
    position_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Optional metadata (e.g., seek target, skip reason)
    metadata JSONB DEFAULT '{}'
);

-- Indexes for play_events
CREATE INDEX IF NOT EXISTS idx_play_events_session ON play_events(session_id);
CREATE INDEX IF NOT EXISTS idx_play_events_timestamp ON play_events(timestamp DESC);

-- Listening streaks for gamification
CREATE TABLE IF NOT EXISTS listening_streaks (
    streak_id SERIAL PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    length_days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
    is_current BOOLEAN DEFAULT FALSE,

    UNIQUE(start_date)
);

-- Indexes for listening_streaks
CREATE INDEX IF NOT EXISTS idx_streaks_current ON listening_streaks(is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_streaks_length ON listening_streaks(length_days DESC);

-- Materialized view for daily aggregates (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_listening_stats AS
SELECT
    DATE(started_at AT TIME ZONE 'UTC') as date,
    COUNT(*) as total_plays,
    COUNT(*) FILTER (WHERE completed) as completed_plays,
    COUNT(DISTINCT sha_id) as unique_songs,
    SUM(duration_played_ms) as total_duration_ms,
    ROUND(AVG(completion_percent), 2) as avg_completion_percent
FROM play_sessions
GROUP BY DATE(started_at AT TIME ZONE 'UTC');

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_listening_stats(date);

-- Function to refresh daily stats
CREATE OR REPLACE FUNCTION refresh_daily_listening_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_listening_stats;
END;
$$ LANGUAGE plpgsql;
