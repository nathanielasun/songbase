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

## Optional: Multi-Source Metadata Configuration

The metadata pipeline supports fetching images from multiple sources. **Spotify API access is optional** but recommended for better image coverage.

### Spotify API Setup (Optional)

To enable Spotify as a metadata source:

1. Create a Spotify Developer account at https://developer.spotify.com/dashboard
2. Click "Create App" and fill in the details (name/description)
3. Copy your **Client ID** and **Client Secret**
4. Set environment variables:

```bash
export SPOTIFY_CLIENT_ID="your_client_id_here"
export SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

Or add to your `~/.bashrc` / `~/.zshrc`:
```bash
echo 'export SPOTIFY_CLIENT_ID="your_client_id_here"' >> ~/.bashrc
echo 'export SPOTIFY_CLIENT_SECRET="your_client_secret_here"' >> ~/.bashrc
source ~/.bashrc
```

**Note**: The pipeline will automatically use Spotify when credentials are configured. If not configured, it will fall back to free sources (MusicBrainz, Wikidata, Cover Art Archive).

### Metadata Sources

The metadata verification pipeline uses multiple sources to ensure comprehensive coverage:

- **MusicBrainz** (Primary, always enabled) - Free music encyclopedia for core metadata
- **Cover Art Archive** (Always enabled) - Free album cover repository
- **Wikidata** (Always enabled) - Free artist images and information from Wikimedia Commons
- **Spotify** (Optional) - Commercial music service for additional metadata coverage (requires API key)

### Integrated Metadata Verification with Image Fetching

The verification pipeline now automatically fetches missing images during metadata verification:

1. **Intelligent Filename Parsing with Progressive Title Simplification**: When a song has minimal metadata, the pipeline uses advanced parsing strategies:
   - **Pattern extraction**: Parses filenames to extract artist and title (e.g., "ALLEYCVT - BACK2LIFE" → artist: "ALLEYCVT", title: "BACK2LIFE")
   - **Progressive qualifier stripping**: Automatically removes common video/audio qualifiers to improve matching:
     - "Marquez - Firemen Official Visualizer" → tries "Firemen Official Visualizer", then "Firemen Visualizer", then "Firemen"
     - "Back2Life (Official Music Video)" → tries original, then "Back2Life Music Video", then "Back2Life"
     - Handles: Official Video, Visualizer, Lyric Video, HD/HQ/4K, Live, Acoustic, Remastered, and many more
   - **Smart fallbacks**: If a search fails with extra qualifiers, automatically retries with progressively cleaner titles
   - **Placeholder handling**: Ignores placeholder artists like "Unknown Artist" (or single stop-word artists) and merges them into title-only searches when helpful, cleaning underscores and label tags (e.g., Monstercat) along the way

2. **Multi-Source Verification**: For each song, the pipeline tries all sources in sequence:
   - MusicBrainz (highest priority for accuracy)
   - Spotify (if configured, for modern commercial tracks)
   - Wikidata (for additional artist information)

3. **Automatic Image Fetching**: After successfully verifying a song, the pipeline immediately fetches:
   - **Album cover art** from Cover Art Archive, Spotify, or other sources
   - **Artist profile images** from Wikidata (artist photos), MusicBrainz, or Spotify

4. **Real-Time Status Updates**: The verification UI shows live status updates as each source is queried and images are fetched, providing complete visibility into the verification process.

All verification and image fetching happens in a single operation, ensuring that verified songs immediately have complete metadata and artwork.

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
├── .embeddings/       # VGGish embedding files (SHA-named .npz)
└── STATUS/            # Project planning and status docs (see STATUS/processing-backend-plan.md)
```

## Development

The frontend proxies API requests to the backend automatically. API calls to `/api/*` from the frontend are forwarded to `http://localhost:8000/api/*`.

## Library Management UI

- **Your Library** (`/library`): Queue songs, monitor download and processing status, and inspect database statistics.
- **Settings** (`/settings`): Configure batch sizes, worker defaults, and storage paths (applies on next pipeline run or backend restart).
- **Reset controls**: Settings includes a confirmation-gated reset to clear embeddings, hashed music, and artist/album data.
- **Sync images default**: Image sync is enabled by default; toggle it in Settings or per-run in the pipeline form.
- **Sources view**: The Downloads tab also shows entries from `backend/processing/acquisition_pipeline/sources.jsonl`.
- **Acquisition backend management**: Configure and authenticate music acquisition backends (yt-dlp) via the UI with support for browser cookies to access age-restricted or member-only content.
- **Queue de-dup**: Sources already queued move out of the sources list and appear only in the pipeline queue list.
- **Automatic queue cleanup**: Songs are automatically removed from the queue once they reach "stored" or "duplicate" status to prevent duplication.
- **Run until empty**: Optional checkbox on the pipeline form to automatically process batches until the queue is completely empty.
- **Queue pagination**: The pipeline queue table is paged (10/25/50/100 per page).
- **Run details**: The Downloads tab shows live pipeline run details (last event, config, and paths).
- **Stop controls**: Active pipeline, verification, and image sync tasks can be stopped from the UI.
- **Seed sources**: Use the Downloads tab to insert `sources.jsonl` entries into the queue.
- **Last seed timestamp**: The Sources view displays when the queue was last seeded.
- **Queue cleanup**: The Downloads tab includes confirmation-protected controls to clear sources.jsonl entries or the pipeline queue.
- **Local import**: The Manage Music tab lets you upload audio/video files from your computer and enqueue them directly for conversion and processing.
- **Large uploads**: The Next.js dev proxy allows up to 5GB per import request via `experimental.proxyClientMaxBodySize`.
- **Song metadata editor**: The Database tab lists stored songs with a right-side panel to view and edit metadata, including artist/profile links.
- **Album metadata sync**: Image/profile sync also caches album metadata + track lists for linking and browsing.
- **Manual linking**: The Database tab lets you attach unassigned songs to existing album records.
- **Artwork serving**: `/api/library/images/*` endpoints serve song, album, and artist artwork to the frontend.

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

## Acquisition Backend Configuration

Songbase supports configuring acquisition backends for downloading music. Currently yt-dlp is supported with cookie-based authentication and intelligent format selection.

### Intelligent Format Selection

The acquisition pipeline automatically queries available formats for each download and intelligently selects the best option:

- **Prefers audio-only formats** over video+audio to save bandwidth, storage, and conversion time
- **Quality-aware selection**: Chooses the best audio quality up to 256kbps by default
- **Automatic fallback**: Falls back to "bestaudio/best" if format selection fails
- **Configurable**: Set `SONGBASE_YTDLP_PREFER_AUDIO_ONLY=0` to disable audio-only preference
- **Quality limit**: Set `SONGBASE_YTDLP_MAX_AUDIO_QUALITY=320` to prefer higher quality audio (in kbps)

This eliminates "Requested format is not available" errors by adapting to each video's available formats.

### Browser Cookie Authentication

To download age-restricted or member-only content, you can configure yt-dlp with your browser cookies:

1. Navigate to `/library` → **Downloads** tab
2. Expand the **Acquisition Backend** section
3. Export cookies from your browser:
   - **Chrome/Edge**: Install "Get cookies.txt LOCALLY" extension, visit YouTube (logged in), click extension, export
   - **Firefox**: Install "cookies.txt" extension, visit YouTube (logged in), click extension, export
4. Enter the **absolute path** to your cookies file (e.g., `/Users/you/.config/yt-dlp/cookies.txt`)
   - You can use `~` which will be automatically expanded
   - The system validates the file exists when you save
5. Click **Save Configuration**
6. Click **Test Connection** to verify the backend is working

The acquisition pipeline will automatically use the configured cookies for all downloads.

**Important Notes:**
- Cookies expire after 1-2 weeks. If you see "Sign in to confirm you're not a bot" errors, re-export fresh cookies
- Make sure you're logged into YouTube in your browser when exporting cookies
- Use the absolute file path, not a relative path
- The cookies are loaded dynamically, so no restart is needed after updating the configuration

**Troubleshooting:**
If downloads fail with bot detection errors:
1. Export fresh cookies from your browser (make sure you're logged in)
2. Verify the file path is correct and the file exists
3. Click "Save Configuration" then "Test Connection" in the UI
4. If still failing, try logging out of YouTube and back in, then re-export cookies

## Processing Orchestrator

The processing orchestrator ties acquisition, audio conversion, PCM conversion, hashing, embeddings, and storage into one pipeline.

### Pipeline Stages

1. **Acquisition** (`pending` → `downloading` → `downloaded` or `converting`)
   - Downloads music from configured backends (yt-dlp)
   - Detects format: videos (MP4, AVI, etc.) or audio (M4A, AAC, etc.)
   - Video files and non-MP3 audio marked as `converting`
   - Local file imports are inserted directly as `downloaded` or `converting`

2. **Audio Conversion** (`converting` → `downloaded`)
   - Converts video files to MP3 (extracts audio track)
   - Converts other audio formats (M4A, AAC, FLAC, etc.) to MP3
   - Uses ffmpeg with high quality settings (320kbps)
   - Original files are deleted after successful conversion

3. **PCM Conversion** (`downloaded` → `pcm_raw_ready`)
   - Converts MP3 to PCM WAV format for processing

4. **Hashing** (`pcm_raw_ready` → `hashed`)
   - Creates normalized, de-duplicated hash of audio

5. **Embedding** (`hashed` → `embedded`)
   - Generates VGGish embeddings for similarity search

6. **Storage** (`embedded` → `stored`)
   - Stores final file in `.song_cache/` with metadata
   - Item automatically removed from queue

Embeddings and normalization require TensorFlow and resampy; the bootstrap installs them automatically on first run.
VGGish also requires `tf_slim`, which is included in the bootstrap.
Pipeline runs triggered from the UI do not auto-seed `sources.jsonl`; use the Seed button when needed.
Pipeline start will fail fast if TensorFlow, tf_slim, or resampy is missing.

```bash
SONGBASE_DATABASE_URL=postgres://... python backend/processing/orchestrator.py --seed-sources --download --process-limit 25
```

Add `--images` to sync cover art and artist profiles after verification (requires `SONGBASE_IMAGE_DATABASE_URL`).
Add `--run-until-empty` to automatically continue processing batches until the queue is completely empty.

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
The image sync step also hydrates album metadata + track lists into the main metadata database for linking.

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

## Known Issues & Suppressions

The development servers suppress certain deprecation warnings from third-party dependencies:

- **Keras `np.object` FutureWarning**: Suppressed via Python warning filters. This is a known compatibility issue between Keras and NumPy 2.x that will be fixed in future Keras releases.
- **Node.js `util._extend` deprecation**: Suppressed via `NODE_NO_WARNINGS=1` in the dev script. This originates from a transitive dependency. Use `npm run dev:debug` to see all warnings for debugging.
