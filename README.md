# songbase
A platform for users to curate their own personalized music streaming platform

## Architecture

- **Frontend**: Next.js + TypeScript + Tailwind CSS (port 3000)
- **Backend API**: FastAPI (port 8000)
- **Processing**: Python audio processing modules (MP3→PCM, VGGish tokenization)

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (3.12 recommended)
- **ffmpeg** for audio processing (MP3→PCM WAV conversion)

Install ffmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

## Quick Start

### 1. Install Backend Dependencies

```bash
pip install -r backend/api/requirements.txt
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Run Development Servers

**Option A: Use the development script (recommended)**
```bash
./dev.sh
```

**Option B: Run servers manually**

Terminal 1 - Backend API:
```bash
./scripts/use_local_python.sh -m backend.api.server --reload --port 8000
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Project Structure

```
songbase/
├── frontend/           # Next.js TypeScript frontend
│   ├── app/           # Next.js app directory
│   ├── public/        # Static assets
│   └── package.json
├── backend/
│   ├── api/           # FastAPI REST API
│   │   ├── routes/    # API endpoints
│   │   └── app.py     # Main API application
│   └── processing/    # Audio processing modules
│       ├── mp3_to_pcm.py
│       ├── orchestrator.py
│       ├── pipeline_state.py
│       ├── storage_utils.py
│       └── audio_pipeline/
├── backend/tests/      # Backend test suite
├── songs/             # Music library (MP3 files)
├── .metadata/         # Local Postgres data (ignored)
├── .song_cache/       # SHA-256 hashed song database
└── STATUS/            # Project planning and status docs (see STATUS/processing-backend-plan.md)
```

## Development

The frontend proxies API requests to the backend automatically. API calls to `/api/*` from the frontend are forwarded to `http://localhost:8000/api/*`.

## Library Management UI

- **Your Library** (`/library`): Queue songs, monitor download and processing status, and inspect database statistics.
- **Settings** (`/settings`): Configure batch sizes, worker defaults, and storage paths (applies on next pipeline run or backend restart).
- **Sync images default**: Image sync is enabled by default; toggle it in Settings or per-run in the pipeline form.
- **Sources view**: The Downloads tab also shows entries from `backend/processing/acquisition_pipeline/sources.jsonl`.
- **Queue de-dup**: Sources already queued move out of the sources list and appear only in the pipeline queue list.
- **Seed sources**: Use the Downloads tab to insert `sources.jsonl` entries into the queue.
- **Last seed timestamp**: The Sources view displays when the queue was last seeded.
- **Queue cleanup**: The Downloads tab includes confirmation-protected controls to clear sources.jsonl entries or the pipeline queue.

When the backend starts and database URLs are missing, it will automatically bootstrap the local Postgres cluster under `.metadata/`.

## Local Python Runner

Use the local Python wrapper to ensure commands resolve the project modules and run inside `.venv`:

```bash
./scripts/use_local_python.sh -m backend.db.local_postgres ensure
./scripts/use_local_python.sh -m backend.processing.run_pipeline --process-limit 25
```

The `backend.processing.run_pipeline` entrypoint installs Python dependencies on first run using `backend/api/requirements.txt`. To install offline, set `SONGBASE_WHEELHOUSE_DIR` to a local wheelhouse.

If the wrapper selects an unsupported Python version, override it with `PYTHON_BIN=python3.12`.

For the backend API, prefer the bootstrap-aware entrypoint:

```bash
./scripts/use_local_python.sh -m backend.api.server --reload --port 8000
```

## Processing Orchestrator

The processing orchestrator ties acquisition, PCM conversion, hashing, embeddings, and storage into one pipeline.
Embeddings and normalization require TensorFlow and resampy; the bootstrap installs them automatically on first run.

```bash
SONGBASE_DATABASE_URL=postgres://... python backend/processing/orchestrator.py --seed-sources --download --process-limit 25
```

Add `--images` to sync cover art and artist profiles after verification (requires `SONGBASE_IMAGE_DATABASE_URL`).

## Local Postgres Databases

Songbase can bootstrap two local Postgres databases under `.metadata/` (metadata + images). This requires a local Postgres install (`initdb`, `pg_ctl`, `psql`, `createdb`) and the pgvector extension. If the environment variables are not set, `dev.sh` will auto-run this bootstrap. The bootstrap auto-detects `pg_config`, Homebrew/Postgres.app, and asdf installs; set `POSTGRES_BIN_DIR` if detection fails.
The connection helper will create the `vector` extension on first connect if it is missing.

```bash
python backend/db/local_postgres.py ensure
eval "$(python backend/db/local_postgres.py env)"
```

To use the bundled Postgres+pgvector binaries, set `POSTGRES_BUNDLE_URL` (or OS-specific variants like `POSTGRES_BUNDLE_URL_DARWIN_ARM64`) and optional `POSTGRES_BUNDLE_SHA256` before running the bootstrap. If your archive wraps files under a top-level folder, set `POSTGRES_BUNDLE_ARCHIVE_ROOT` to strip it. You can override the bundle destination with `POSTGRES_BUNDLE_DIR` and the metadata root with `SONGBASE_METADATA_DIR`.

To generate a local bundle URL + SHA, run:

```bash
python backend/db/build_postgres_bundle.py
```

To persist bundle URLs, set `POSTGRES_BUNDLE_MANIFEST` or write the manifest directly with:

```bash
python backend/db/build_postgres_bundle.py --write-manifest
```

## Image Metadata Database

Cover art and artist profiles are stored in a separate Postgres database. Apply the image migrations and run the image pipeline with both database URLs set.

```bash
SONGBASE_IMAGE_DATABASE_URL=postgres://... python backend/db/migrate_images.py
SONGBASE_DATABASE_URL=postgres://... SONGBASE_IMAGE_DATABASE_URL=postgres://... \
  python backend/processing/metadata_pipeline/image_cli.py --limit-songs 100
```

## Testing

Opt-in end-to-end smoke test (requires ffmpeg, VGGish assets, and a local MP3):

```bash
SONGBASE_INTEGRATION_TEST=1 SONGBASE_TEST_MP3=/path/to/file.mp3 \
  SONGBASE_DATABASE_URL=postgres://... python -m unittest backend.tests.test_orchestrator_integration
```

## Building Desktop Application

Songbase can be packaged as a standalone desktop application (like Spotify) using Electron.

### Prerequisites for Desktop Build

- All web development prerequisites above
- **PyInstaller**: `pip install pyinstaller`

### Build Desktop App

```bash
./scripts/build_desktop.sh
```

This will:
1. Bundle the FastAPI backend into a standalone binary (PyInstaller)
2. Build the Next.js frontend as static files
3. Package everything with Electron
4. Create platform-specific installers in `dist-electron/`

### Platform-Specific Outputs

- **macOS**: `.dmg` and `.zip` files
- **Windows**: `.exe` installer and portable `.exe`
- **Linux**: `.AppImage` and `.deb` packages

### Development with Electron

To test the Electron app in development mode:

```bash
# Terminal 1 - Start backend API
uvicorn backend.api.app:app --reload --port 8000

# Terminal 2 - Start Next.js frontend
cd frontend && npm run dev

# Terminal 3 - Start Electron
npm run electron:dev
```

The Electron window will load `http://localhost:3000` in development mode.
