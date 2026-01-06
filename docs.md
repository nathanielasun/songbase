# Project Documentation

## Directory Structure

```
songbase/
├── frontend/           # Next.js TypeScript frontend
│   ├── app/           # Next.js app router
│   │   ├── layout.tsx # Root layout component
│   │   └── page.tsx   # Home page
│   ├── public/        # Static assets
│   ├── next.config.ts # Next.js configuration (API proxy)
│   ├── package.json   # Frontend dependencies
│   └── tsconfig.json  # TypeScript configuration
├── backend/
│   ├── api/           # FastAPI REST API
│   │   ├── routes/
│   │   │   ├── songs.py      - Song listing and retrieval endpoints
│   │   │   ├── processing.py - Audio processing endpoints
│   │   │   └── library.py    - Metadata + embedding ingestion endpoints
│   │   ├── app.py            - Main FastAPI application with CORS
│   │   └── requirements.txt  - API dependencies
│   ├── db/            # Postgres schema + ingestion tools
│   │   ├── migrations/
│   │   │   ├── 001_init.sql  - Metadata + embeddings schema with pgvector
│   │   │   ├── 002_add_metadata_verification.sql - Adds verification metadata columns
│   │   │   ├── 003_add_download_queue.sql - Adds download queue table
│   │   │   └── 004_update_download_queue.sql - Adds queue tracking fields
│   │   ├── connection.py     - Postgres connection helper
│   │   ├── embeddings.py     - Shared pgvector ingestion helpers
│   │   ├── image_connection.py - Image DB connection helper
│   │   ├── image_migrations/
│   │   │   └── 001_init.sql  - Image assets + profile schema
│   │   ├── ingest.py         - MP3 metadata + embeddings ingestion CLI
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
│       │   ├── cli.py            - CLI for MusicBrainz verification
│       │   ├── config.py         - MusicBrainz configuration defaults
│       │   ├── image_cli.py       - CLI for cover art + artist profiles
│       │   ├── image_db.py        - Image DB helpers
│       │   ├── image_pipeline.py  - Cover art + artist profile ingestion
│       │   ├── musicbrainz_client.py - MusicBrainz API wrapper
│       │   └── pipeline.py       - Unverified song verification flow
│       ├── vggish/
│       │   └── .gitkeep       - Placeholder for VGGish files
│       ├── dependencies.py    - Ensures local package dependencies are present
│       ├── mp3_to_pcm.py      - Bulk MP3 to PCM conversion
│       ├── orchestrator.py    - End-to-end processing pipeline runner
│       ├── pipeline_state.py  - Pipeline state JSONL utilities
│       └── storage_utils.py   - Hashed cache path + atomic moves
├── backend/tests/
│   └── test_orchestrator_integration.py - End-to-end pipeline smoke test (opt-in)
├── scripts/
│   └── build_unix.sh     - Builds standalone binary with bundled ffmpeg
├── songs/               # Music library (MP3 files)
├── preprocessed_cache/  # Downloaded MP3s + JSON metadata sidecars
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
  - Routes organized by domain (songs, processing)

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
  - `GET /api/library/songs/{sha_id}`: Fetch song metadata + relations

## Backend DB (Postgres + pgvector)

### backend/db/migrate.py
- **Purpose**: Apply schema migrations in `backend/db/migrations`
- **Requires**: `SONGBASE_DATABASE_URL` set to a Postgres connection string
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/db/migrate.py
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
- **Requires**: VGGish files, TensorFlow, NumPy, VGGish checkpoint + PCA params, resampy for non-16k input
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
- **Purpose**: Verify and enrich unverified songs via MusicBrainz, plus image/profile sourcing.
- **Key Modules**:
  - `cli.py`: Command-line interface for verification
  - `config.py`: MusicBrainz configuration defaults
  - `image_cli.py`: Cover art + artist profile CLI
  - `image_db.py`: Image DB helpers
  - `image_pipeline.py`: Cover art + artist profile ingestion
  - `musicbrainz_client.py`: MusicBrainz API wrapper
  - `pipeline.py`: Unverified song verification flow

### backend/processing/metadata_pipeline/cli.py
- **Purpose**: Verify and enrich unverified songs with MusicBrainz
- **Requires**: `SONGBASE_DATABASE_URL` set, plus musicbrainzngs
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... python backend/processing/metadata_pipeline/cli.py --limit 100
  ```

### backend/processing/metadata_pipeline/image_cli.py
- **Purpose**: Fetch cover art and artist profiles into the image database.
- **Requires**: `SONGBASE_DATABASE_URL` and `SONGBASE_IMAGE_DATABASE_URL` set, plus musicbrainzngs.
- **Usage**:
  ```bash
  SONGBASE_DATABASE_URL=postgres://... SONGBASE_IMAGE_DATABASE_URL=postgres://... \
    python backend/processing/metadata_pipeline/image_cli.py --limit-songs 100
  ```

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
