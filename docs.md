# Project Documentation

## Directory Structure

```
songbase/
├── frontend/           # Next.js TypeScript frontend
│   ├── app/           # Next.js app router
│   │   ├── layout.tsx # Root layout component
│   │   ├── page.tsx   # Home page
│   │   ├── library/
│   │   │   └── page.tsx # Library management UI
│   │   └── settings/
│   │       └── page.tsx # Pipeline + storage settings UI
│   ├── public/        # Static assets
│   ├── next.config.ts # Next.js configuration (API proxy)
│   ├── package.json   # Frontend dependencies
│   └── tsconfig.json  # TypeScript configuration
├── backend/
│   ├── api/           # FastAPI REST API
│   │   ├── routes/
│   │   │   ├── songs.py      - Song listing and retrieval endpoints
│   │   │   ├── processing.py - Audio processing endpoints
│   │   │   ├── library.py    - Metadata + queue + pipeline endpoints
│   │   │   └── settings.py   - Settings read/write endpoints
│   │   ├── app.py            - Main FastAPI application with CORS
│   │   └── requirements.txt  - API dependencies
│   ├── bootstrap.py     - Python dependency bootstrapper
│   ├── app_settings.py  - Persistent UI settings stored under .metadata
│   ├── db/            # Postgres schema + ingestion tools
│   │   ├── migrations/
│   │   │   ├── 001_init.sql  - Metadata + embeddings schema with pgvector
│   │   │   ├── 002_add_metadata_verification.sql - Adds verification metadata columns
│   │   │   ├── 003_add_download_queue.sql - Adds download queue table
│   │   │   ├── 004_update_download_queue.sql - Adds queue tracking fields
│   │   │   └── 005_add_album_metadata.sql - Adds album metadata + track list tables
│   │   ├── build_postgres_bundle.py - Build Postgres + pgvector bundle archives
│   │   ├── connection.py     - Postgres connection helper
│   │   ├── embeddings.py     - Shared pgvector ingestion helpers
│   │   ├── image_connection.py - Image DB connection helper
│   │   ├── image_migrations/
│   │   │   └── 001_init.sql  - Image assets + profile schema
│   │   ├── ingest.py         - MP3 metadata + embeddings ingestion CLI
│   │   ├── local_postgres.py - Local Postgres bootstrap under .metadata
│   │   ├── migrate.py        - Migration runner
│   │   └── migrate_images.py - Image DB migration runner
│   └── processing/    # Audio processing modules
│       ├── bin/
│       │   └── .gitkeep      - Placeholder for bundled ffmpeg binary
│       ├── audio_pipeline/
│       │   ├── cli.py         - CLI for embedding PCM WAVs
│       │   ├── config.py      - Pipeline constants
│       │   ├── embedding.py   - VGGish embedding execution
│       │   ├── io.py          - WAV load/save helpers
│       │   ├── pipeline.py    - WAV → embeddings orchestration
│       │   ├── preprocessing.py - Audio preprocessing utilities
│       │   └── vggish_model.py  - VGGish model loader
│       ├── hash_pipeline/
│       │   ├── __init__.py      - Package entry point for normalization helpers
│       │   ├── cli.py           - CLI for normalization pipeline
│       │   ├── config.py        - Hashing normalization constants
│       │   ├── io.py            - WAV load/save + metadata helpers
│       │   ├── pipeline.py      - WAV → normalized WAV orchestration
│       │   └── preprocessing.py - Resample/mono/normalize/trim utilities
│       ├── acquisition_pipeline/
│       │   ├── __init__.py      - Package entry point for acquisition helpers
│       │   ├── cli.py           - CLI for song acquisition (yt-dlp)
│       │   ├── config.py        - Acquisition settings + cache paths
│       │   ├── db.py            - Download queue DB helpers
│       │   ├── discovery.py     - Song list discovery + sources.jsonl writer
│       │   ├── discovery_providers.py - External discovery routines (MusicBrainz, hotlists)
│       │   ├── downloader.py    - yt-dlp download worker
│       │   ├── io.py            - Metadata JSON writer
│       │   ├── pipeline.py      - Parallel download orchestration
│       │   └── sources.py       - Extendable song source list reader
│       ├── metadata_pipeline/
│       │   ├── __init__.py       - Package entry point for verification helpers
│       │   ├── album_pipeline.py  - Album metadata + track list ingestion
│       │   ├── cli.py            - CLI for MusicBrainz verification
│       │   ├── config.py         - Configuration for MusicBrainz, Spotify, Wikidata APIs
│       │   ├── filename_parser.py - Intelligent filename parsing (Artist - Title extraction)
│       │   ├── image_cli.py       - CLI for cover art + artist profiles
│       │   ├── image_db.py        - Image DB helpers
│       │   ├── image_pipeline.py  - Multi-source cover art + artist profile ingestion (Cover Art Archive, Spotify, Wikidata)
│       │   ├── musicbrainz_client.py - MusicBrainz API wrapper
│       │   ├── spotify_client.py  - Spotify Web API client for metadata + images
│       │   ├── wikidata_client.py - Wikidata API client for artist images
│       │   └── pipeline.py       - Unverified song verification flow with intelligent parsing
│       ├── vggish/
│       │   └── .gitkeep       - Placeholder for VGGish files
│       ├── dependencies.py    - Ensures local package dependencies are present
│       ├── mp3_to_pcm.py      - Bulk MP3 to PCM conversion
│       ├── orchestrator.py    - End-to-end processing pipeline runner
│       ├── run_pipeline.py    - Orchestrator entrypoint with auto deps
│       ├── pipeline_state.py  - Pipeline state JSONL utilities
│       └── storage_utils.py   - Hashed cache path + atomic moves
├── backend/tests/
│   └── test_orchestrator_integration.py - End-to-end pipeline smoke test (opt-in)
├── scripts/
│   ├── build_unix.sh     - Builds standalone binary with bundled ffmpeg
│   └── use_local_python.sh - Run project modules via the local venv
├── songs/               # Music library (MP3 files)
├── preprocessed_cache/  # Downloaded MP3s + JSON metadata sidecars
├── .metadata/           # Local Postgres data (ignored)
├── .song_cache/         # SHA-256 hashed song database
├── STATUS/              # Project planning and status docs (see STATUS/processing-backend-plan.md)
└── dev.sh               # Development server startup script
```

## Frontend (Next.js + TypeScript)

### frontend/app/
- **Purpose**: Next.js 15 app router with TypeScript
- **Key Files**:
  - `layout.tsx`: Root layout component with metadata
  - `page.tsx`: Home page component
  - `globals.css`: Global styles with Tailwind CSS

### frontend/next.config.ts
- **Purpose**: Next.js configuration
- **Features**:
  - API proxy rewrites: `/api/*` → `http://localhost:8000/api/*`
  - Enables seamless frontend-backend communication in development

### frontend/app/library/page.tsx
- **Purpose**: Library management UI for queueing songs, monitoring pipeline status, and viewing stats.
- **Uses**: `/api/library/queue`, `/api/library/queue/clear`, `/api/library/sources`, `/api/library/sources/clear`, `/api/library/stats`, `/api/library/pipeline/status`
- **Notes**: Sources already queued are hidden from the sources list and shown only in the pipeline queue table.
- **Notes**: The pipeline queue table is paged (10/25/50/100).
- **Notes**: The pipeline run panel shows live config, last event, and cache paths while running.
- **Notes**: "Run until queue is empty" checkbox automatically processes batches until all pending and processing items are stored or failed.

### frontend/app/settings/page.tsx
- **Purpose**: Settings UI for batch sizes, storage paths, and reset actions.
- **Uses**: `/api/settings`, `/api/settings/reset`

### Usage Examples

**Fetching songs from the frontend**:
```typescript
// In a React component
const response = await fetch('/api/songs');
const songs = await response.json();
```

**Making API calls with error handling**:
```typescript
try {
  const response = await fetch('/api/processing/config');
  const config = await response.json();
  console.log('Sample rate:', config.audio_sample_rate);
} catch (error) {
  console.error('API error:', error);
}
```

## Backend API (FastAPI)

### backend/api/app.py
- **Purpose**: Main FastAPI application
- **Features**:
  - CORS middleware (allows requests from http://localhost:3000)
  - Auto-generated OpenAPI docs at `/docs`
  - Health check endpoint at `/health`
  - Routes organized by domain (songs, processing, library, settings)
  - Auto-bootstraps local Postgres if database URLs are missing

### backend/api/routes/songs.py
- **Purpose**: Song management endpoints
- **Endpoints**:
  - `GET /api/songs/`: List all MP3 files in the songs directory
  - `GET /api/songs/{song_id}`: Get details for a specific song
- **Usage**:
  ```bash
  curl http://localhost:8000/api/songs/
  curl http://localhost:8000/api/songs/my-song
  ```

### backend/api/routes/processing.py
- **Purpose**: Audio processing endpoints
- **Endpoints**:
  - `GET /api/processing/config`: Get processing configuration
  - `POST /api/processing/convert`: Convert MP3 to PCM WAV
- **Usage**:
  ```bash
  # Get processing config
  curl http://localhost:8000/api/processing/config

  # Convert MP3 to PCM
  curl -X POST http://localhost:8000/api/processing/convert \
    -H "Content-Type: application/json" \
    -d '{"input_path": "songs", "output_path": "output"}'
  ```

### backend/api/routes/library.py
- **Purpose**: Metadata ingestion and lookup endpoints backed by Postgres + pgvector
- **Endpoints**:
  - `POST /api/library/ingest`: Ingest MP3 metadata and optional embeddings
  - `GET /api/library/songs`: List songs in the metadata DB
  - `GET /api/library/songs/unlinked`: List songs missing album or artist metadata
  - `GET /api/library/songs/{sha_id}`: Fetch song metadata + relations
  - `POST /api/library/songs/link`: Attach songs to an existing album record
  - `GET /api/library/albums`: List cached album metadata
  - `GET /api/library/albums/{album_id}`: Fetch album metadata + library songs
  - `GET /api/library/images/song/{sha_id}`: Stream song artwork
  - `GET /api/library/images/album/{album_id}`: Stream album artwork
  - `GET /api/library/images/artist/{artist_id}`: Stream artist artwork
  - `GET /api/library/stream/{sha_id}`: Stream audio from the hashed cache
  - `POST /api/library/queue`: Queue songs for acquisition (accepts a list of titles)
  - `GET /api/library/queue`: View download queue status
  - `POST /api/library/queue/clear`: Clear the download queue
  - `GET /api/library/sources`: List entries in `sources.jsonl`
  - `POST /api/library/seed-sources`: Insert `sources.jsonl` into the queue
  - `POST /api/library/sources/clear`: Clear `sources.jsonl` entries
  - `GET /api/library/stats`: Database + queue metrics
  - `POST /api/library/pipeline/run`: Start a processing pipeline run
  - `GET /api/library/pipeline/status`: Fetch pipeline status + recent events
- **Usage**:
  ```bash
  curl -X POST http://localhost:8000/api/library/queue \
    -H "Content-Type: application/json" \
    -d '{"items":[{"title":"Artist - Track","search_query":"Artist - Track"}]}'

  curl http://localhost:8000/api/library/pipeline/status
  ```

### backend/api/routes/settings.py
- **Purpose**: Persist UI settings for pipeline defaults and storage paths
- **Endpoints**:
  - `GET /api/settings`: Fetch stored settings
  - `PUT /api/settings`: Update settings (pipeline + paths)
  - `POST /api/settings/reset`: Clear embeddings and/or hashed music (requires `confirm: "CLEAR"`)
- **Usage**:
  ```bash
  curl http://localhost:8000/api/settings

  curl -X PUT http://localhost:8000/api/settings \
    -H "Content-Type: application/json" \
    -d '{"pipeline":{"process_limit":8},"paths":{"preprocessed_cache_dir":"./preprocessed_cache"}}'
  ```

### backend/app_settings.py
- **Purpose**: Load/store UI settings under `.metadata/settings.json`
- **Used By**: `/api/settings`, pipeline runner (default batch sizes and paths)

## Backend DB (Postgres + pgvector)

### backend/db/connection.py
- **Purpose**: Connection helper for metadata DB; auto-creates the `vector` extension if missing.
- **Used By**: API routes, migrations, ingestion, pipeline runners.

### backend/db/migrate.py
- **Purpose**: Apply schema migrations in `backend/db/migrations`
- **Requires**: `SONGBASE_DATABASE_URL` set to a Postgres connection string
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/db/migrate.py
  ```

### backend/db/local_postgres.py
- **Purpose**: Initialize and start a local Postgres cluster under `.metadata/` and create both databases.
- **Requires**: `initdb`, `pg_ctl`, `psql`, `createdb` on PATH, plus the pgvector extension installed. The bootstrap auto-detects `pg_config`, Homebrew/Postgres.app, and asdf installs; set `POSTGRES_BIN_DIR` if detection fails.
- **Usage**:
  ```bash
  python backend/db/local_postgres.py ensure
  eval "$(python backend/db/local_postgres.py env)"
  ```
- **Bundle Support**: If `POSTGRES_BUNDLE_URL` (or OS-specific URL env vars) is set, it will auto-download a Postgres+pgvector bundle into `backend/processing/bin/postgres` and use it. Use `POSTGRES_BUNDLE_ARCHIVE_ROOT` if the archive has a top-level folder to strip.
- **Manifest Support**: `POSTGRES_BUNDLE_MANIFEST` (default `backend/processing/postgres_bundle.json`) can supply per-OS bundle URLs + SHA256.
- **Overrides**: `POSTGRES_BUNDLE_DIR` sets the bundle destination; `SONGBASE_METADATA_DIR` sets the `.metadata` root.

### backend/db/build_postgres_bundle.py
- **Purpose**: Build a local Postgres+pgvector bundle and print the URL + SHA256 to configure downloads.
- **Requires**: `pg_config` on PATH, plus pgvector installed in the same Postgres prefix.
- **Usage**:
  ```bash
  python backend/db/build_postgres_bundle.py
  python backend/db/build_postgres_bundle.py --write-manifest
  ```

### backend/db/ingest.py
- **Purpose**: Ingest MP3 metadata and SHA IDs, optionally insert VGGish embeddings
- **Requires**: `SONGBASE_DATABASE_URL` set, plus NumPy and Mutagen
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/db/ingest.py songs
  ```
- **Embedding Notes**: If `--embedding-dir` is set, it should contain `{sha_id}.npz` files with `embedding` or `postprocessed` arrays.

### backend/db/embeddings.py
- **Purpose**: Shared pgvector embedding ingestion helpers (used by ingest + orchestrator).
- **Usage**: Imported by pipeline code when inserting VGGish embeddings.

## Image Metadata DB (Separate Postgres)

### backend/db/migrate_images.py
- **Purpose**: Apply schema migrations for cover art and artist profiles.
- **Requires**: `SONGBASE_IMAGE_DATABASE_URL` set to a Postgres connection string.
- **Usage**:
  ```bash
  SONGBASE_IMAGE_DATABASE_URL=postgres://... python backend/db/migrate_images.py
  ```

## Backend Processing Modules

### backend/processing/mp3_to_pcm.py
- **Purpose**: Bulk MP3 to PCM WAV conversion
- **Requires**: ffmpeg (auto-downloads to `backend/processing/bin/ffmpeg` when missing, or uses PATH)
- **Usage**:
  ```bash
  python backend/processing/mp3_to_pcm.py /path/to/mp3s /path/to/output --threads=8
  # Optional: add --overwrite to replace existing .wav files
  ```

### backend/processing/orchestrator.py
- **Purpose**: End-to-end orchestration of download, PCM conversion, hashing, embeddings, and storage.
- **Requires**: `SONGBASE_DATABASE_URL` set, ffmpeg, and VGGish assets.
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/processing/orchestrator.py --seed-sources --download --process-limit 25
  ```
- **Notes**: Appends progress events to `preprocessed_cache/pipeline_state.jsonl`.
- **Optional**: Add `--images` to sync cover art and artist profiles (requires `SONGBASE_IMAGE_DATABASE_URL`).
- **Optional**: Add `--run-until-empty` to automatically continue processing batches until the queue is completely empty (downloads and processes in batches based on limits).
- **Preflight**: Verifies `tensorflow`, `tf_slim`, and `resampy` are installed before running embeddings.
- **UI Behavior**: The web UI does not auto-seed `sources.jsonl` when starting the pipeline; use the Seed action explicitly.

### backend/processing/pipeline_state.py
- **Purpose**: Append-only pipeline state writer and compaction utility.
- **Usage**:
  ```bash
  python backend/processing/pipeline_state.py --compact
  ```

### backend/processing/storage_utils.py
- **Purpose**: Shared `.song_cache/` path helpers and atomic move utility.

### backend/processing/audio_pipeline/
- **Purpose**: Structured WAV-to-embedding pipeline with modular components
- **Key Modules**:
  - `cli.py`: Command-line interface for the pipeline
  - `config.py`: Pipeline constants (sample rate, VGGish settings)
  - `embedding.py`: VGGish embedding execution
  - `preprocessing.py`: Audio preprocessing (resample, mono, normalize)
  - `pipeline.py`: Orchestrates WAV → embeddings flow

### backend/processing/audio_pipeline/cli.py
- **Purpose**: Tokenize PCM WAV files into VGGish embeddings
- **Requires**: VGGish files, TensorFlow, NumPy, VGGish checkpoint + PCA params, resampy for non-16k input, plus `tf_slim`.
- **Note**: TensorFlow, resampy, and `tf_slim` install via `backend/api/requirements.txt` when bootstrapping.
- **Usage**:
  ```bash
  python backend/processing/audio_pipeline/cli.py /path/to/wavs /path/to/tokens
  ```

### backend/processing/dependencies.py
- **Purpose**: Central routine for ensuring local package dependencies (models, assets, binaries).
- **Behavior**:
  - Auto-downloads missing files when `SONGBASE_ALLOW_DOWNLOAD=1` (default).
  - Verifies SHA-256 when available; set `SONGBASE_FORCE_DOWNLOAD=1` to re-download.
  - Optional download URLs can be provided via env vars (example: `FFMPEG_DOWNLOAD_URL`).
  - ffmpeg defaults are platform-aware; override when running on an unsupported CPU/OS.
- **Usage**:
  ```bash
  python backend/processing/dependencies.py --name vggish_assets
  ```

### backend/processing/hash_pipeline/
- **Purpose**: Normalize PCM WAV files for hashing (22.05kHz mono, amplitude normalization, silence trim)
- **Key Modules**:
  - `cli.py`: Command-line interface for normalization
  - `config.py`: Hashing normalization constants
  - `preprocessing.py`: Audio preprocessing (resample, mono, normalize, trim)
  - `pipeline.py`: Orchestrates WAV → normalized WAV flow

### backend/processing/hash_pipeline/cli.py
- **Purpose**: Normalize PCM WAV files for hashing
- **Requires**: NumPy, resampy for non-22.05k input
- **Usage**:
  ```bash
  python backend/processing/hash_pipeline/cli.py /path/to/wavs /path/to/normalized
  ```

### backend/processing/metadata_pipeline/
- **Purpose**: Verify and enrich unverified songs via multi-source metadata and automatic image fetching
- **Key Modules**:
  - `album_pipeline.py`: Album metadata + track list ingestion
  - `cli.py`: Command-line interface for verification
  - `config.py`: Configuration for MusicBrainz, Spotify, Wikidata APIs
  - `filename_parser.py`: Intelligent filename parsing to extract artist and title
  - `image_cli.py`: Standalone cover art + artist profile CLI
  - `image_db.py`: Image DB helpers
  - `image_pipeline.py`: Multi-source cover art + artist profile ingestion
  - `multi_source_resolver.py`: Multi-source metadata resolution with intelligent parsing
  - `musicbrainz_client.py`: MusicBrainz API wrapper
  - `spotify_client.py`: Spotify Web API client for metadata and images
  - `wikidata_client.py`: Wikidata API client for artist images
  - `pipeline.py`: Integrated verification flow with automatic image fetching

### backend/processing/metadata_pipeline/cli.py
- **Purpose**: Verify and enrich unverified songs with MusicBrainz
- **Requires**: `SONGBASE_DATABASE_URL` set, plus musicbrainzngs
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/processing/metadata_pipeline/cli.py --limit 100
  ```

### backend/processing/metadata_pipeline/image_cli.py
- **Purpose**: Fetch cover art, artist profiles, and album metadata into the image + metadata databases.
- **Requires**: `SONGBASE_DATABASE_URL` and `SONGBASE_IMAGE_DATABASE_URL` set, plus musicbrainzngs.
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... SONGBASE_IMAGE_DATABASE_URL=postgres://... \
    python backend/processing/metadata_pipeline/image_cli.py --limit-songs 100
  ```

## Local Python Runner

Use the wrapper to ensure local module resolution and a `.venv` Python interpreter:

```bash
./scripts/use_local_python.sh -m backend.db.local_postgres ensure
./scripts/use_local_python.sh -m backend.processing.run_pipeline --process-limit 25
```

`backend.processing.run_pipeline` installs Python dependencies on first run (using `backend/api/requirements.txt`). To install offline, set `SONGBASE_WHEELHOUSE_DIR` to a local wheelhouse directory.

If the wrapper selects an unsupported Python version, set `PYTHON_BIN=python3.12` before running it.

## Testing

### backend/tests/test_orchestrator_integration.py
- **Purpose**: Opt-in end-to-end smoke test for the processing orchestrator.
- **Requires**: `SONGBASE_DATABASE_URL`, `SONGBASE_TEST_MP3`, ffmpeg, and VGGish assets.
- **Usage**:
  ```bash
  SONGBASE_INTEGRATION_TEST=1 SONGBASE_TEST_MP3=/path/to/file.mp3 \
    SONGBASE_DATABASE_URL=postgres://... python -m unittest backend.tests.test_orchestrator_integration
  ```

### backend/processing/acquisition_pipeline/
- **Purpose**: Download pending songs into `preprocessed_cache/` using yt-dlp
- **Key Modules**:
  - `cli.py`: Command-line interface for acquisition
  - `config.py`: Cache locations + yt-dlp settings
  - `db.py`: Download queue helpers (reads `metadata.download_queue`)
    - **Automatic cleanup**: Songs are automatically removed from the queue when they reach "stored" or "duplicate" status to prevent duplication
  - `discovery.py`: Song list discovery + sources.jsonl writer (no downloads)
  - `discovery_providers.py`: External discovery routines (MusicBrainz, hotlists)
  - `downloader.py`: yt-dlp download worker
  - `io.py`: Writes JSON metadata sidecars
  - `pipeline.py`: Parallel download orchestration
  - `sources.py`: Extendable JSONL song list ingestion
  - `sources.jsonl`: Default song source list

### backend/processing/acquisition_pipeline/cli.py
- **Purpose**: Seed the download queue and fetch MP3s in parallel
- **Requires**: `SONGBASE_DATABASE_URL` set, plus yt-dlp (and ffmpeg)
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/processing/acquisition_pipeline/cli.py --workers 4
  ```
- **Sources File Format** (`backend/processing/acquisition_pipeline/sources.jsonl`):
  ```json
  {"title": "Example Song", "artist": "Example Artist", "search_query": "Example Artist - Example Song"}
  ```
- **Output**:
  - MP3s written to `preprocessed_cache/`
  - JSON metadata sidecar per MP3 (same filename, `.json` extension)

### backend/processing/acquisition_pipeline/discovery.py
- **Purpose**: Discover new song lists (genre similarity, same artist/album, hotlists) and append to `sources.jsonl`
- **Requires**: `SONGBASE_DATABASE_URL` set, plus musicbrainzngs; hotlists are optional via `SONGBASE_HOTLIST_URLS`
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/processing/acquisition_pipeline/discovery.py --dry-run
  ```

## Scripts

### scripts/build_unix.sh
- **Purpose**: Build standalone binary with PyInstaller (macOS/Linux)
- **Requires**: Python, PyInstaller, ffmpeg at `backend/processing/bin/ffmpeg`
- **Output**: `dist/mp3-to-pcm`

### scripts/use_local_python.sh
- **Purpose**: Run project modules with the local `.venv` and project root on `PYTHONPATH`.
- **Usage**:
  ```bash
  ./scripts/use_local_python.sh -m backend.db.local_postgres ensure
  ./scripts/use_local_python.sh -m backend.processing.run_pipeline --process-limit 25
  ```

## Distribution Strategy
- **Mode**: Plug-and-play standalone binaries (PyInstaller) for the target OS.
- **Goal**: Users run a single executable without installing Python or dependencies.
- **Notes**: Build artifacts are OS/architecture-specific; rebuild per target platform.

### dev.sh
- **Purpose**: Start both frontend and backend development servers
- **Usage**:
  ```bash
  ./dev.sh
  ```
- **Starts**:
  - FastAPI backend on http://localhost:8000
  - Next.js frontend on http://localhost:3000
- **Features**: Automatic cleanup on Ctrl+C
 - **Notes**: Uses the local Python wrapper to create a `.venv`, install dependencies, and bootstrap local Postgres when database URLs are missing.

### backend/api/server.py
- **Purpose**: Bootstrap dependencies, ensure local Postgres, and start the FastAPI server.
- **Usage**:
  ```bash
  ./scripts/use_local_python.sh -m backend.api.server --reload --port 8000
  ```

## API Development

### Interactive API Documentation
FastAPI automatically generates interactive API documentation:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Use these to explore and test API endpoints directly in the browser.

### Adding New API Endpoints

1. Create a new route file in `backend/api/routes/`:
   ```python
   from fastapi import APIRouter

   router = APIRouter()

   @router.get("/example")
   async def example_endpoint():
       return {"message": "Hello"}
   ```

2. Register the router in `backend/api/app.py`:
   ```python
   from backend.api.routes import example
   app.include_router(example.router, prefix="/api/example", tags=["example"])
   ```

## Environment Setup

### Backend Dependencies
```bash
pip install -r backend/api/requirements.txt
```

### Frontend Dependencies
```bash
cd frontend && npm install
```

## Desktop Application (Electron)

### Overview
Songbase can be packaged as a standalone desktop application using Electron, similar to Spotify. The desktop app bundles:
- **Frontend**: Next.js app built as static HTML/CSS/JS
- **Backend**: FastAPI server bundled as a standalone binary (PyInstaller)
- **Electron**: Desktop wrapper that manages both components

### Directory Structure

```
songbase/
├── electron/
│   ├── main.js        # Electron main process (manages windows, backend)
│   └── preload.js     # Preload script (security bridge)
├── songbase-api.spec  # PyInstaller spec for FastAPI backend
└── package.json       # Root package.json with Electron dependencies
```

### electron/main.js
- **Purpose**: Electron main process
- **Responsibilities**:
  - Starts the bundled FastAPI backend binary on app launch
  - Creates the application window
  - Loads the Next.js frontend (static files in production, dev server in development)
  - Manages backend lifecycle (stops backend when app closes)
- **Development Mode**: Loads `http://localhost:3000`, expects manually-started backend
- **Production Mode**: Loads static files from `frontend/out/`, starts bundled backend binary

### electron/preload.js
- **Purpose**: Security bridge between Electron and web content
- **Exposes**: `window.electron` API with platform info and API URL

### songbase-api.spec
- **Purpose**: PyInstaller specification for bundling FastAPI backend
- **Entry Point**: `backend/api/server.py`
- **Output**: `dist/songbase-api` (or `songbase-api.exe` on Windows)
- **Includes**: All FastAPI dependencies, routes, and processing modules
- **Hidden Imports**: Uvicorn, FastAPI routes, processing modules

### backend/api/server.py
- **Purpose**: Standalone entry point for the API server
- **Usage**:
  ```bash
  python backend/api/server.py --host 127.0.0.1 --port 8000
  ```
- **Bundled Usage**: After PyInstaller builds it:
  ```bash
  ./dist/songbase-api --port 8000
  ```

### scripts/build_desktop.sh
- **Purpose**: Complete desktop app build pipeline
- **Steps**:
  1. Builds FastAPI backend with PyInstaller → `dist/songbase-api`
  2. Builds Next.js frontend with static export → `frontend/out/`
  3. Installs Electron dependencies
  4. Packages everything with electron-builder → `dist-electron/`
- **Output**: Platform-specific installers (.dmg, .exe, .AppImage, etc.)
- **Usage**:
  ```bash
  ./scripts/build_desktop.sh
  ```

### package.json (root)
- **Purpose**: Electron project configuration
- **Scripts**:
  - `npm run electron:dev` - Start Electron in development mode
  - `npm run electron:build` - Package app with electron-builder
  - `npm run build:all` - Full build pipeline
- **Build Configuration**:
  - Bundles `electron/` and `frontend/out/`
  - Includes `dist/songbase-api` as extra resource
  - Generates installers for macOS, Windows, Linux

### Build Process Details

**1. Backend Binary Build (PyInstaller)**
```bash
pyinstaller songbase-api.spec --clean
```
- Creates `dist/songbase-api` binary
- Bundles Python runtime, FastAPI, Uvicorn, all dependencies
- No Python installation required on user's machine

**2. Frontend Static Build**
```bash
cd frontend
BUILD_TARGET=electron npm run build
```
- Exports Next.js as static HTML/CSS/JS to `frontend/out/`
- No Node.js required on user's machine
- All assets are self-contained

**3. Electron Packaging**
```bash
npm run electron:build
```
- Creates platform-specific installers in `dist-electron/`
- Bundles Chromium + Node.js + your app code
- Includes backend binary as extra resource

### Development Workflow

**Option 1: Full Electron Development**
```bash
# Terminal 1
uvicorn backend.api.app:app --reload --port 8000

# Terminal 2
cd frontend && npm run dev

# Terminal 3
npm run electron:dev
```

**Option 2: Web Development (no Electron)**
```bash
./dev.sh
# Opens in regular browser
```

### Platform-Specific Notes

**macOS**
- Output: `.dmg` (installer) and `.zip` (portable)
- Requires code signing for distribution (set `codesign_identity` in package.json)

**Windows**
- Output: `.exe` (NSIS installer) and portable `.exe`
- May need to sign binaries for Windows Defender

**Linux**
- Output: `.AppImage` (universal) and `.deb` (Debian/Ubuntu)
- AppImage is portable, no installation required

### File Size Expectations
- **Electron base**: ~100-150MB (Chromium + Node.js)
- **Backend binary**: ~30-50MB (Python runtime + FastAPI)
- **Frontend static**: ~5-10MB (Next.js build)
- **Total**: ~150-200MB (typical for Electron apps)

### Distribution

After building, distribute the files from `dist-electron/`:
- Users download and install like any native app
- No Python, Node.js, or browser required
- Backend runs locally on `localhost:8000`
- Frontend displays in Electron window

### Updating the App

To add features:
1. Develop in web mode (`./dev.sh`)
2. Test in Electron dev mode (`npm run electron:dev`)
3. Build production app (`./scripts/build_desktop.sh`)
4. Distribute new version

## Multi-Source Metadata & Image Acquisition

The metadata pipeline now supports fetching metadata and images from multiple sources with intelligent fallbacks:

### Supported Sources

1. **MusicBrainz** (Primary) - Free, open music encyclopedia
2. **Cover Art Archive** - Free album cover repository (linked to MusicBrainz)
3. **Wikidata** - Free knowledge base with artist images from Wikimedia Commons
4. **Spotify** - Commercial music service (requires API credentials)

### Configuration

#### Spotify API Setup (Optional)

To enable Spotify as an image source, you need to register an application:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (any name/description)
3. Copy your Client ID and Client Secret
4. Set environment variables:

```bash
export SPOTIFY_CLIENT_ID="your_client_id_here"
export SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

#### Wikidata

Wikidata is enabled by default and requires no API keys. It queries the free Wikidata API and Wikimedia Commons for artist images.

### How It Works

The pipeline tries multiple sources in order until it finds the requested data:

**For Artist Images:**
1. MusicBrainz URL relations (if artist has image link)
2. Wikidata (via MusicBrainz Wikidata link if available)
3. Wikidata search (by artist name)
4. Spotify (if configured)

**For Album Cover Art:**
1. Cover Art Archive (via MusicBrainz release ID)
2. Spotify (if configured)

### Status Messages

When running the image pipeline, you'll see detailed status messages showing:
- Which entity is being processed (song/artist/album name)
- Which source is being queried (MusicBrainz, Wikidata, Spotify, etc.)
- Success/failure for each source attempt

Example output:
```
[Artists 1/25] Processing: AOA
  → Fetching MusicBrainz profile...
    ✓ MusicBrainz profile found
    → Trying MusicBrainz URL relations...
    → Trying Wikidata (ID: Q12345)...
    ✓ Found image from Wikidata
    → Downloading image from wikidata...
    ✓ Image downloaded successfully
  ✓ Profile and image stored
```

### Usage

Run the image pipeline as usual:

```bash
python -m backend.processing.metadata_pipeline.image_cli --limit-artists 50
```

The pipeline will automatically try all configured sources. If Spotify credentials are not set, it will skip Spotify and continue with other sources.

## Integrated Metadata Verification with Image Fetching

Starting from the latest update, the metadata verification pipeline (`backend/processing/metadata_pipeline/pipeline.py`) now automatically fetches missing images immediately after verifying each song. This provides a seamless, single-operation workflow for complete metadata enrichment.

### How It Works

1. **Intelligent Filename Parsing with Progressive Title Simplification**: When a song lacks artist/title metadata, the pipeline uses exceptionally robust parsing strategies:
   - **Pattern extraction strategies**:
     - **Dash pattern**: "ARTIST - TITLE" (most common)
     - **Underscore pattern**: "ARTIST_TITLE"
     - **Parentheses**: "(ARTIST) TITLE" or "TITLE (ARTIST)"
     - **Track numbers**: "01 ARTIST - TITLE"
     - **CamelCase**: "ArtistNameSongTitle"
   - **Confidence scoring**: Each parse strategy returns a confidence score (0.0-1.0)
   - **Progressive title variant generation**: Automatically strips common qualifiers to improve matching accuracy
     - Removes: "Official Video", "Visualizer", "Official Audio", "Lyric Video", "Lyrics"
     - Removes: "HD", "HQ", "4K", "UHD", "1080p", "720p", "480p"
     - Removes: "Live", "Acoustic", "Unplugged", "Live at/from/in"
     - Removes: "Remastered", "Remix", "Extended", "Radio Edit", "Album/Single Version"
     - Removes: "Explicit/Clean Version", "M V", "MV"
     - Removes: Parenthetical/bracketed qualifiers: "(Official Video)", "[Visualizer]", etc.
   - **Automatic fallback chain**: For "Marquez - Firemen Official Visualizer":
     1. First tries: "Firemen Official Visualizer"
     2. Then tries: "Firemen Visualizer"
     3. Then tries: "Firemen"
     4. Returns first successful match
   - **Smart de-duplication**: Avoids trying identical variants multiple times

2. **Multi-Source Metadata Resolution**: For each song, the pipeline tries sources in this order:
   - **MusicBrainz** (highest priority for accuracy and completeness)
   - **Spotify** (if configured, excellent for modern commercial tracks)
   - **Wikidata** (for additional artist information)

3. **Automatic Image Fetching**: After successfully verifying a song, the pipeline immediately:
   - **Fetches album cover art** from:
     - Cover Art Archive (via MusicBrainz release ID)
     - Spotify (if configured)
   - **Fetches artist profile images** from:
     - MusicBrainz URL relations
     - Wikidata (via MusicBrainz link or artist name search)
     - Spotify (if configured)

4. **Real-Time Status Updates**: All verification and image fetching operations stream status updates to the frontend via Server-Sent Events (SSE):
   - Which source is being queried for metadata
   - Success/failure of each metadata source attempt
   - Image fetching progress (album covers and artist images)
   - Final statistics including images fetched

### Technical Implementation

**Backend Components:**

1. **`backend/processing/metadata_pipeline/filename_parser.py`**:
   - Parses filenames with multiple strategies
   - Returns confidence-scored interpretations
   - Handles common artist-title patterns

2. **`backend/processing/metadata_pipeline/multi_source_resolver.py`**:
   - Orchestrates multi-source metadata resolution
   - Implements fallback chain across all sources
   - Validates parsed metadata against match results

3. **`backend/processing/metadata_pipeline/pipeline.py`**:
   - Main verification entry point
   - Integrates image fetching after successful verification
   - Returns comprehensive results including image statistics

4. **`backend/api/routes/processing.py`**:
   - SSE endpoint for real-time status streaming
   - Formats status messages as JSON
   - Includes image statistics in completion message

**Frontend Components:**

1. **`frontend/app/library/page.tsx`**:
   - Connects to SSE endpoint for live updates
   - Displays streaming status messages
   - Shows completion summary with image counts

### Usage Examples

**Via Web UI:**
1. Navigate to `/library` → Metadata tab
2. Click "Verify Songs"
3. Watch real-time status updates showing:
   - Filename parsing attempts
   - Multi-source metadata queries
   - Image fetching progress
4. See final summary: "X verified, Y album covers, Z artist images"

**Via CLI:**
```bash
# Metadata verification now includes automatic image fetching
SONGBASE_DATABASE_URL=postgres://... \
SONGBASE_IMAGE_DATABASE_URL=postgres://... \
python backend/processing/metadata_pipeline/cli.py --limit 100
```

**Via API:**
```bash
# Connect to SSE stream for real-time updates
curl -N http://localhost:8000/api/processing/metadata/verify-stream?limit=10

# SSE messages format (simple match):
data: {"type": "status", "message": "[1/10] Verifying: ALLEYCVT - BACK2LIFE"}
data: {"type": "status", "message": "  → Trying MusicBrainz..."}
data: {"type": "status", "message": "  ✓ Found match from MusicBrainz"}
data: {"type": "status", "message": "    → Fetching album cover art..."}
data: {"type": "status", "message": "    ✓ Album cover fetched from cover-art-archive"}

# SSE messages format (with progressive title simplification):
data: {"type": "status", "message": "[2/10] Verifying: Marquez - Firemen Official Visualizer"}
data: {"type": "status", "message": "  → Trying MusicBrainz..."}
data: {"type": "status", "message": "  ✗ No match from MusicBrainz"}
data: {"type": "status", "message": "  → Trying Spotify..."}
data: {"type": "status", "message": "  ✗ No match from Spotify"}
data: {"type": "status", "message": "  → Trying simplified title: 'Firemen Visualizer'..."}
data: {"type": "status", "message": "  ✗ No match"}
data: {"type": "status", "message": "  → Trying simplified title: 'Firemen'..."}
data: {"type": "status", "message": "  ✓ Match found with simplified title!"}
data: {"type": "status", "message": "  ✓ Verified: Marquez - Firemen (source: musicbrainz, score: 95)"}

data: {"type": "complete", "verified": 10, "processed": 10, "skipped": 0, "album_images": 8, "artist_images": 5}
```

### Benefits

1. **Single Operation**: No need to run separate verification and image sync commands
2. **Immediate Results**: Verified songs have artwork immediately available
3. **Better Coverage**: Multi-source approach maximizes metadata and image availability
4. **Intelligent Parsing**: Extracts metadata from filenames when embedded tags are missing
5. **Real-Time Feedback**: Live status updates show exactly what the pipeline is doing
6. **Efficient**: Images are fetched only for newly verified songs (checks for existing images first)
