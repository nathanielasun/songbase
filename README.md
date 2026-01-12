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

### GPU Acceleration (Optional)

VGGish audio embeddings can leverage GPU/Metal acceleration for faster processing:

**For Apple Silicon Macs (M1/M2/M3):**
```bash
pip install tensorflow-metal
```

**For NVIDIA GPUs (Linux/Windows):**
- Ensure CUDA Toolkit and cuDNN are installed
- TensorFlow will automatically detect and use NVIDIA GPUs

**Test GPU Detection:**
```bash
python backend/processing/audio_pipeline/test_gpu_detection.py
```

See [GPU Acceleration Guide](backend/processing/audio_pipeline/GPU_ACCELERATION.md) for detailed configuration.

**Configure via UI:**
The VGGish embedding parameters (device preference, sample rate, mel spectrogram settings) can also be configured via the web UI at `/library` → Database tab → VGGish Embeddings panel. This panel also allows recalculating embeddings for songs with live progress tracking.

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

## Docker Deployment

Songbase can be deployed using Docker containers for easy setup and scalability.

### Quick Start with Docker

```bash
# Clone the repository
git clone <repo-url>
cd songbase

# Copy and configure environment variables
cp .env.docker.example .env.docker
# Edit .env.docker with your settings (especially POSTGRES_PASSWORD)

# Build and start all services
docker compose --env-file .env.docker up -d

# View logs
docker compose logs -f
```

Access the application at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Docker Architecture

The Docker setup consists of three services:

| Service | Description | Port |
|---------|-------------|------|
| `database` | PostgreSQL 16 with pgvector extension | 5432 |
| `backend` | FastAPI Python backend | 8000 |
| `frontend` | Next.js frontend | 3000 |

### Configuration

Environment variables can be set in `.env.docker`:

```bash
# Database credentials
POSTGRES_USER=songbase
POSTGRES_PASSWORD=your_secure_password

# Optional: API credentials for enhanced metadata
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
DISCOGS_USER_TOKEN=your_discogs_token

# Optional: Mount your existing music library
SONGS_DIR=/path/to/your/music
```

### Data Persistence

Docker volumes are used for persistent storage:
- `postgres_data` - Database files
- `songs_data` - Music library
- `song_cache` - SHA-256 hashed song cache
- `embeddings` - VGGish embeddings
- `metadata` - Application settings

### Development with Docker

For development with hot-reloading:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Useful Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v

# Rebuild after code changes
docker compose build --no-cache

# View service status
docker compose ps

# Access database shell
docker compose exec database psql -U songbase -d songbase_metadata

# View backend logs
docker compose logs -f backend
```

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
├── frontend/              # Next.js TypeScript frontend
│   ├── app/               # Next.js app directory
│   ├── components/        # React components
│   ├── contexts/          # React contexts
│   ├── public/            # Static assets
│   ├── Dockerfile         # Production Docker image
│   ├── Dockerfile.dev     # Development Docker image
│   └── package.json
├── backend/
│   ├── api/               # FastAPI REST API
│   │   ├── routes/        # API endpoints
│   │   └── app.py         # Main API application
│   ├── db/                # Database migrations and connection
│   │   ├── migrations/    # SQL migration files
│   │   └── image_migrations/
│   ├── processing/        # Audio processing modules
│   │   ├── audio_pipeline/
│   │   ├── feature_pipeline/
│   │   ├── metadata_pipeline/
│   │   └── acquisition_pipeline/
│   ├── services/          # Business logic services
│   ├── Dockerfile         # Production Docker image
│   ├── Dockerfile.dev     # Development Docker image
│   └── docker-entrypoint.sh
├── database/              # Docker database initialization
│   └── init/              # SQL/shell init scripts
├── docker-compose.yml     # Production Docker configuration
├── docker-compose.dev.yml # Development Docker override
├── .env.docker.example    # Docker environment template
├── backend/tests/         # Backend test suite
├── songs/                 # Music library (MP3 files)
├── .metadata/             # Local Postgres data (ignored)
├── .song_cache/           # SHA-256 hashed song database
├── .embeddings/           # VGGish embedding files
└── STATUS/                # Project planning and status docs
```

## Development

The frontend proxies API requests to the backend automatically. API calls to `/api/*` from the frontend are forwarded to `http://localhost:8000/api/*`.

## Library Management UI

- **Your Library** (`/library`): Queue songs, monitor download and processing status, and inspect database statistics.
- **Settings** (`/settings`): Configure batch sizes, worker defaults, and storage paths (applies on next pipeline run or backend restart).
- **Reset controls**: Settings includes a confirmation-gated reset to clear embeddings, hashed music, and artist/album data.
- **Sync images default**: Image sync is enabled by default; toggle it in Settings or per-run in the pipeline form.
- **Sources view**: The Downloads tab also shows entries from `backend/processing/acquisition_pipeline/sources.jsonl`.
- **Local file import**: Import audio files from your computer directly into the library.
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

## Search

Navigate to **Search** (`/search`) from the sidebar to find content across your entire library:

- **Songs**: Search by title, artist name, or album name
- **Artists**: Search artists by name, view song counts, and start artist radio
- **Albums**: Search albums by title or artist name, view release year and track counts
- **Playlists**: Search your created playlists by name or description
- **Genres**: Browse all genres or filter by name

**Features:**
- Category filters to focus on specific content types (All, Songs, Artists, Albums, Playlists, Genres)
- Click on a genre to see all songs in that genre
- Start artist radio directly from search results
- When not searching, shows popular artists and albums from your library

## Personalization Features

### Like/Dislike System

Songs can be liked or disliked using the heart icon:
- **In the music player**: Click the heart next to the currently playing song
- **In song lists**: Click the heart icon that appears on hover (or always visible if liked)

Preferences are stored locally in your browser and are independent of the song metadata.

### Liked Songs Playlist

Your liked songs are automatically collected in a special **Liked Songs** playlist, accessible from the sidebar under the playlists section.

**Features:**
- Purple/pink gradient cover with heart icon
- Shows total song count and duration
- Play all liked songs with one click
- Download all liked songs
- Unlike songs directly from the playlist (removes them from the list)
- Add songs to other playlists via the context menu

The Liked Songs playlist updates automatically as you like/unlike songs throughout the app.

### "For You" Radio

Navigate to **For You** in the sidebar to access your personalized radio station.

**How it works:**
1. The algorithm computes the average embedding of your liked songs (attraction point)
2. If you have disliked songs, it also computes their average embedding (repulsion point)
3. For each candidate song, it calculates:
   - Similarity to liked songs (positive factor)
   - Dissimilarity to disliked songs (negative penalty)
   - Final score = like_similarity - (dislike_weight × dislike_similarity)
4. Songs are ranked by final score with diversity constraints to avoid too many songs from the same artist/album

**Requirements:**
- At least one liked song with embeddings
- Songs must have VGGish embeddings computed

## Additional UI Features

- **Large uploads**: The Next.js dev proxy allows up to 5GB per import request via `experimental.proxyClientMaxBodySize`.
- **Song metadata editor**: The Database tab lists stored songs with a right-side panel to view and edit metadata, including artist/profile links.
- **Per-song verification**: Each catalog row includes a Verify button to re-run metadata matching for that specific song using the current verification settings.
- **Album metadata sync**: Image/profile sync also caches album metadata + track lists for linking and browsing.
- **Manual linking**: The Database tab lets you attach unassigned songs to existing album records.
- **Artwork serving**: `/api/library/images/*` endpoints serve song, album, and artist artwork to the frontend.

When the backend starts and database URLs are missing, it will automatically bootstrap the local Postgres cluster under `.metadata/`.
Set `SONGBASE_SKIP_DB_BOOTSTRAP=1` to skip redundant bootstrap if your environment already prepared the local databases (for example, when running `./dev.sh`).

## Listening Analytics

Songbase automatically tracks your listening behavior to provide insights and power improved recommendations.

**Features:**
- **Automatic tracking**: All playback events (play, pause, seek, skip, complete) are tracked in the background
- **Stats dashboard**: View your listening stats at `/stats` including total plays, time listened, and listening streaks
- **Top charts**: See your most played songs and artists with visual bar charts
- **Activity heatmap**: Visualize when you listen most (by day of week and hour)
- **Play history**: Browse your recent listening activity with completion/skip indicators
- **Period filtering**: Filter all stats by week, month, year, or all time
- **Charts library**: Reusable Recharts-based components in `frontend/components/charts/` for building visualizations (bar, line, pie, area, radar, scatter charts with dark theme styling)

**Data tracked:**
- Play sessions with start/end times and completion percentage
- Playback context (which playlist, album, or radio the song was played from)
- Granular events (pause, resume, seek, skip)
- Listening streaks (consecutive days with play activity)

## Smart Playlists

Create rule-based playlists that automatically populate with matching songs from your library.

**Features:**
- **Rule builder**: Create complex rules with AND/OR logic and nested condition groups
- **Multiple field types**: Filter by metadata (title, artist, album, genre, year), playback stats (play count, skip count, completion rate), analytics (last-week plays, trending/declining), and preferences (liked, disliked)
- **Audio features**: Filter by BPM, energy, danceability, key, and mood when audio features are available
- **Operators**: Supports equals, contains, greater/less than, between, in list, within days, and more
- **Advanced rules**: Relative year rules (`years_ago`), cross-playlist matches (`same_as`), and similarity-based matching (`similar_to`)
- **Live preview**: See matching songs as you build rules
- **Sort options**: Sort results by date added, title, artist, play count, duration, or random
- **Song limits**: Optionally limit playlist to a specific number of songs
- **Auto-refresh**: Playlists automatically update when library changes
- **Templates**: Quick-start with pre-built templates like "Recently Added", "Heavy Rotation", "Forgotten Favorites"
- **Presets + suggestions**: Apply rule presets or auto-suggested rules in the builder
- **Import/Export**: Share and import smart playlist definitions as JSON

**Creating a Smart Playlist:**
1. Click **Smart Playlist** in the sidebar
2. Choose a template or "Create from Scratch"
3. Define your rules using the visual rule builder
4. Preview matching songs in real-time
5. Set sorting and limits
6. Save your playlist

**Example Rules:**
- Songs added in the last 30 days
- Rock songs from the 1980s with play count > 5
- Liked songs you haven't played in 90+ days
- Songs over 7 minutes that you frequently complete

**Access:**
- **Sidebar**: Shows all your smart playlists with a bolt icon
- **New Smart Playlist**: Click "Smart Playlist" in sidebar to create
- **View/Edit**: Click any smart playlist to view songs or edit rules
- **Refresh**: Manual refresh button on each playlist to update contents

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

The processing orchestrator ties acquisition, audio conversion, PCM conversion, hashing, embeddings, and storage into one pipeline.

### Pipeline Stages

1. **Acquisition** (`pending` → `downloaded` or `converting`)
   - Import local audio/video files via the Manage Library UI
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
The local bootstrap will clear stale `postmaster.pid` and socket files and attempt to remove the shared memory segment recorded in `postmaster.pid` when no server process is running. If startup still fails with `pre-existing shared memory block`, run `ipcrm -m <id>` (from `.metadata/postgres/data/postmaster.pid`) or reboot, then delete stale files under `.metadata/postgres/run/`.
To avoid concurrent bootstraps, the local cluster startup grabs `.metadata/postgres/cluster.lock`; adjust the wait with `SONGBASE_DB_LOCK_TIMEOUT` (seconds).

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
