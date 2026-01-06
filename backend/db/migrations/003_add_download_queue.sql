CREATE TABLE IF NOT EXISTS metadata.download_queue (
    queue_id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    genre TEXT,
    search_query TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    download_path TEXT,
    downloaded_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (title, artist, search_query, source_url)
);

CREATE INDEX IF NOT EXISTS idx_download_queue_status
    ON metadata.download_queue (status);
