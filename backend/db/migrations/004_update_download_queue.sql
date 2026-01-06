ALTER TABLE metadata.download_queue
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sha_id CHAR(64),
    ADD COLUMN IF NOT EXISTS stored_path TEXT,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hashed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_download_queue_sha_id
    ON metadata.download_queue (sha_id);
