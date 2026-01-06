from __future__ import annotations

import os
import shutil
import unittest
from pathlib import Path

from backend.db.connection import get_connection
from backend.processing.acquisition_pipeline import config as acquisition_config
from backend.processing.acquisition_pipeline import db as acquisition_db
from backend.processing.orchestrator import OrchestratorConfig, PipelinePaths, run_orchestrator


@unittest.skipUnless(
    os.environ.get("SONGBASE_INTEGRATION_TEST") == "1",
    "Set SONGBASE_INTEGRATION_TEST=1 to run integration tests.",
)
class OrchestratorIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.test_mp3 = Path(os.environ.get("SONGBASE_TEST_MP3", "")).expanduser()
        if not self.test_mp3.exists():
            self.skipTest("Set SONGBASE_TEST_MP3 to a local MP3 file to run.")
        self.paths = PipelinePaths.default()
        self.queue_id = None
        self.sha_id = None
        self.stored_path = None

    def tearDown(self) -> None:
        if self.queue_id is None:
            return

        with get_connection() as conn:
            with conn.cursor() as cur:
                if self.sha_id:
                    cur.execute("DELETE FROM metadata.songs WHERE sha_id = %s", (self.sha_id,))
                cur.execute("DELETE FROM metadata.download_queue WHERE queue_id = %s", (self.queue_id,))
            conn.commit()

        for path in [
            self._download_path(),
            self._raw_pcm_path(),
            self._normalized_pcm_path(),
            self._embedding_path(),
        ]:
            if path and path.exists():
                path.unlink()

        if self.stored_path and self.stored_path.exists():
            self.stored_path.unlink()
            try:
                self.stored_path.parent.rmdir()
            except OSError:
                pass

    def _download_path(self) -> Path:
        return self.paths.preprocessed_cache_dir / f"{self.queue_id}.mp3"

    def _raw_pcm_path(self) -> Path:
        return self.paths.pcm_raw_dir / f"{self.queue_id}.wav"

    def _normalized_pcm_path(self) -> Path:
        return self.paths.pcm_norm_dir / f"{self.queue_id}.wav"

    def _embedding_path(self) -> Path | None:
        if not self.sha_id:
            return None
        return self.paths.embedding_dir / f"{self.sha_id}.npz"

    def test_end_to_end_pipeline(self) -> None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO metadata.download_queue (
                        title,
                        artist,
                        album,
                        genre,
                        search_query,
                        source_url,
                        status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING queue_id
                    """,
                    (
                        f"Integration Test {os.getpid()}",
                        "Songbase",
                        None,
                        None,
                        None,
                        None,
                        acquisition_config.DOWNLOAD_STATUS_DOWNLOADED,
                    ),
                )
                self.queue_id = cur.fetchone()[0]
            conn.commit()

        download_path = self._download_path()
        download_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.test_mp3, download_path)
        acquisition_db.mark_status(
            self.queue_id,
            acquisition_config.DOWNLOAD_STATUS_DOWNLOADED,
            download_path=str(download_path),
        )

        config = OrchestratorConfig(
            seed_sources=False,
            download=False,
            download_limit=None,
            process_limit=1,
            download_workers=None,
            pcm_workers=1,
            hash_workers=1,
            embed_workers=1,
            overwrite=True,
            dry_run=False,
            verify=False,
            images=False,
            image_limit_songs=None,
            image_limit_artists=None,
            image_rate_limit=None,
            sources_file=None,
        )

        run_orchestrator(config)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT status, sha_id, stored_path
                    FROM metadata.download_queue
                    WHERE queue_id = %s
                    """,
                    (self.queue_id,),
                )
                row = cur.fetchone()

        self.assertIsNotNone(row, "Download queue row missing after run.")
        status, sha_id, stored_path = row
        self.assertEqual(status, "stored")
        self.assertIsNotNone(sha_id)
        self.assertIsNotNone(stored_path)

        self.sha_id = sha_id
        self.stored_path = Path(stored_path)
        self.assertTrue(self.stored_path.exists())

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM metadata.songs WHERE sha_id = %s",
                    (sha_id,),
                )
                self.assertIsNotNone(cur.fetchone())
