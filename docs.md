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
│   │   │   ├── processing.py - Audio processing endpoints
│   │   │   ├── library.py    - Metadata + queue + pipeline endpoints
│   │   │   ├── settings.py   - Settings read/write endpoints
│   │   │   ├── acquisition.py - Acquisition backend configuration endpoints
│   │   │   ├── playback.py   - Play session tracking endpoints
│   │   │   ├── stats.py      - Listening statistics endpoints
│   │   │   ├── stats_stream.py - WebSocket real-time stats streaming
│   │   │   └── export.py     - Data export and share card endpoints
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
│   │   │   ├── 005_add_album_metadata.sql - Adds album metadata + track list tables
│   │   │   ├── 006_add_artist_fuzzy_matching.sql - Adds pg_trgm, artist variants, song counts
│   │   │   └── 007_add_play_history.sql - Adds play_sessions, play_events, listening_streaks tables
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
│       ├── audio_conversion_pipeline/
│       │   ├── config.py      - Conversion settings and supported formats
│       │   ├── converter.py   - Audio/video to MP3 conversion logic
│       │   └── pipeline.py    - Batch conversion orchestration
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
│       │   ├── importer.py      - Local file import into the queue
│       │   ├── pipeline.py      - Parallel download orchestration
│       │   └── sources.py       - Extendable song source list reader
│       ├── metadata_pipeline/
│       │   ├── __init__.py       - Package entry point for verification helpers
│       │   ├── album_pipeline.py  - Album metadata + track list ingestion
│       │   ├── artist_lookup.py   - Hybrid artist lookup (exact + trigram + popular filter)
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
│   └── services/         # Business logic services
│       ├── playback_tracker.py - Play session tracking service
│       ├── stats_aggregator.py - Listening statistics aggregation service
│       ├── play_history_signals.py - Behavioral signals from play history for recommendations
│       ├── performance.py - Event batching, query caching, materialized view refresh
│       └── data_retention.py - Data cleanup jobs and privacy controls
├── backend/tests/
│   └── test_orchestrator_integration.py - End-to-end pipeline smoke test (opt-in)
├── scripts/
│   ├── build_unix.sh     - Builds standalone binary with bundled ffmpeg
│   └── use_local_python.sh - Run project modules via the local venv
├── songs/               # Music library (MP3 files)
├── preprocessed_cache/  # Downloaded MP3s + JSON metadata sidecars
├── .metadata/           # Local Postgres data (ignored)
├── .song_cache/         # SHA-256 hashed song database
├── .embeddings/         # VGGish embedding files (SHA-named .npz)
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
  - Raises proxy body limit to 5GB for local file import uploads

### frontend/app/search/page.tsx
- **Purpose**: Unified search page for discovering songs, artists, albums, playlists, and genres
- **Uses**:
  - `/api/library/search?q=...` - Search songs by title, artist, album
  - `/api/library/artists?q=...` - Search artists by name
  - `/api/library/albums?q=...` - Search albums by title or artist
  - `/api/library/genres` - Load all genres
  - `/api/library/artists/popular` - Load popular artists (when no search query)
  - `/api/library/albums/popular` - Load popular albums (when no search query)
- **Features**:
  - Category filters: All, Songs, Artists, Albums, Playlists, Genres
  - Real-time search across all entity types
  - Client-side playlist filtering from PlaylistContext
  - Client-side genre filtering
  - Genre click navigates to filtered song view
  - Artist radio button on artist cards
- **Notes**: Playlists are stored client-side in localStorage via PlaylistContext, so playlist search is client-side

### frontend/app/library/page.tsx
- **Purpose**: Library management UI for queueing songs, monitoring pipeline status, and viewing stats.
- **Uses**: `/api/library/queue`, `/api/library/queue/clear`, `/api/library/import`, `/api/library/stats`, `/api/library/pipeline/status`, `/api/acquisition/backends`, `/api/settings/vggish`
- **Notes**: The pipeline queue table is paged (10/25/50/100).
- **Notes**: The pipeline run panel shows live config, last event, and cache paths while running.
- **Notes**: "Run until queue is empty" checkbox automatically processes batches until all pending and processing items are stored or failed.
- **Notes**: Acquisition backend panel allows configuring yt-dlp authentication with browser cookies for accessing age-restricted or member-only content.
- **Notes**: Manage Music includes local file import (audio/video) via `/api/library/import`.
- **Notes**: Database tab includes a song metadata editor with a right-side details panel, edit flow, and per-song metadata verification buttons.
- **Notes**: Database tab includes a VGGish Embeddings panel for configuring embedding parameters (sample rate, mel spectrogram settings, device preference) and recalculating embeddings with live progress.

### frontend/app/settings/page.tsx
- **Purpose**: Settings UI for batch sizes, storage paths, PCM processing, and reset actions.
- **Uses**: `/api/settings`, `/api/settings/vggish`, `/api/settings/reset`
- **Sections**:
  - **Processing Defaults**: Download/process limits, worker counts, verify/images toggles
  - **Storage Paths**: Temp MP3 dir, SQL database dir, hashed song cache dir
  - **PCM Processing**: Sample rate, device preference (auto/cpu/gpu/metal), GPU memory fraction, allow growth, postprocessing
  - **Download Settings**: Filename format with placeholders
  - **Danger Zone**: Reset embeddings, hashed music, song metadata, artist/album data

### frontend/app/radio/for-you/page.tsx
- **Purpose**: Personalized radio based on user preferences (liked/disliked songs)
- **Uses**: `/api/library/playlist/preferences` (POST)
- **Notes**: Generates playlists by computing embedding centroids of liked songs and penalizing similarity to disliked songs

### frontend/app/stats/page.tsx
- **Purpose**: Listening statistics and analytics dashboard
- **Uses**: `/api/stats/overview`, `/api/stats/top-songs`, `/api/stats/top-artists`, `/api/stats/heatmap`, `/api/stats/history`
- **Features**:
  - Period selector (Week/Month/Year/All Time)
  - Overview cards (total plays, time listened, unique songs, listening streak)
  - Top songs chart with play counts and inline play buttons
  - Top artists chart with links to artist pages
  - Listening heatmap showing activity by day of week and hour
  - Recent play history with completion/skip status
- **Notes**: All playback is automatically tracked via MusicPlayerContext integration

### frontend/app/playlist/liked/page.tsx
- **Purpose**: Dedicated playlist page for all liked songs
- **Uses**: `/api/library/songs/{sha_id}` to fetch song details for each liked song ID
- **Features**:
  - Purple/pink gradient cover art with heart icon
  - Total song count and duration display
  - Play all button to start playback from first song
  - Download all button to batch download liked songs
  - Remove (unlike) songs directly from the playlist
  - Add songs to other playlists via modal
- **Notes**: Liked song IDs come from `UserPreferencesContext` (localStorage); song details are fetched from backend

### frontend/components/stats/ShareCard.tsx
- **Purpose**: Shareable listening stats card component for social sharing
- **Features**:
  - Supports multiple card types: overview, top-song, top-artist, wrapped
  - Generates formatted text summary for clipboard sharing
  - Gradient styling with stats visualization
  - Close button for modal overlay
- **Usage**:
  ```tsx
  import ShareCard, { fetchShareCardData } from '@/components/stats/ShareCard';

  // Fetch card data
  const data = await fetchShareCardData('top-song', 'month');

  // Render card
  <ShareCard data={data} onClose={() => setShowCard(false)} />
  ```
- **Card Types**:
  - `overview`: General stats grid (plays, minutes, unique songs)
  - `top-song`: Featured song with play count
  - `top-artist`: Featured artist with play count and song count
  - `wrapped`: Year-in-review with top song, artist, and personality

### frontend/contexts/UserPreferencesContext.tsx
- **Purpose**: Client-side storage of user preferences (likes/dislikes)
- **Storage**: `localStorage` with key `songbase_user_preferences`
- **Key Functions**:
  - `likeSong(songId)`: Toggle like status for a song
  - `dislikeSong(songId)`: Toggle dislike status for a song
  - `isLiked(songId)`: Check if song is liked
  - `isDisliked(songId)`: Check if song is disliked
  - `likedSongIds`: Array of all liked song IDs
  - `dislikedSongIds`: Array of all disliked song IDs
- **Notes**: Preferences are independent of song metadata and stored locally in the browser

### Usage Examples

**Fetching songs from the frontend**:
```typescript
// In a React component
const response = await fetch('/api/library/songs');
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
  - Routes organized by domain (processing, library, settings, acquisition, playback, stats, stats_stream, export)
  - Auto-bootstraps local Postgres if database URLs are missing

### backend/api/routes/processing.py
- **Purpose**: Audio processing endpoints
- **Endpoints**:
  - `GET /api/processing/config`: Get processing configuration
  - `POST /api/processing/convert`: Convert MP3 to PCM WAV
  - `GET /api/processing/metadata/verify-stream`: Stream metadata verification updates (SSE)
  - `POST /api/processing/metadata/verify/stop`: Stop an active verification stream
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
  - `PUT /api/library/songs/{sha_id}`: Update song metadata (title, artist, album, genre, release year, track number)
  - `POST /api/library/songs/{sha_id}/verify`: Re-run metadata verification for a single song
  - `POST /api/library/songs/link`: Attach songs to an existing album record
  - `GET /api/library/albums`: List cached album metadata
  - `GET /api/library/albums/{album_id}`: Fetch album metadata + library songs
  - `GET /api/library/images/song/{sha_id}`: Stream song artwork
  - `GET /api/library/images/album/{album_id}`: Stream album artwork
  - `GET /api/library/images/artist/{artist_id}`: Stream artist artwork
  - `GET /api/library/stream/{sha_id}`: Stream audio from the hashed cache
  - `POST /api/library/queue`: Queue songs for acquisition (accepts a list of titles)
  - `POST /api/library/import`: Import local audio/video files into the queue (multipart form upload)
  - `GET /api/library/queue`: View download queue status
  - `POST /api/library/queue/clear`: Clear the download queue
  - `GET /api/library/stats`: Database + queue metrics
  - `POST /api/library/pipeline/run`: Start a processing pipeline run
  - `POST /api/library/pipeline/stop`: Request the active processing pipeline to stop after the current stage
  - `GET /api/library/pipeline/status`: Fetch pipeline status + recent events
  - `POST /api/library/metadata/stop`: Stop a running metadata task (`verification` or `images`)
  - `GET /api/library/radio/song/{sha_id}`: Generate song radio playlist based on similarity
  - `GET /api/library/radio/artist/{artist_id}`: Generate artist radio playlist based on average artist embedding
  - `GET /api/library/similar/{sha_id}`: Find songs similar to a given song
  - `POST /api/library/playlist/preferences`: Generate personalized playlist from liked/disliked songs
  - `POST /api/library/playlist/enhanced-for-you`: Generate enhanced personalized playlist combining explicit preferences with play history signals
- **Usage**:
  ```bash
  curl -X POST http://localhost:8000/api/library/queue \
    -H "Content-Type: application/json" \
    -d '{"items":[{"title":"Artist - Track","search_query":"Artist - Track"}]}'

  curl http://localhost:8000/api/library/pipeline/status

  # Verify metadata for a single song
  curl -X POST http://localhost:8000/api/library/songs/{sha_id}/verify \
    -H "Content-Type: application/json" \
    -d '{"min_score": 85, "rate_limit": 1.0}'

  # Import local files
  curl -X POST http://localhost:8000/api/library/import \
    -F "files=@/path/to/song.mp3" \
    -F "files=@/path/to/video.mp4"

  # Generate preference-based playlist
  curl -X POST http://localhost:8000/api/library/playlist/preferences \
    -H "Content-Type: application/json" \
    -d '{"liked_song_ids":["sha_id_1","sha_id_2"],"disliked_song_ids":["sha_id_3"],"limit":50}'

  # Generate enhanced playlist with play history signals
  curl -X POST http://localhost:8000/api/library/playlist/enhanced-for-you \
    -H "Content-Type: application/json" \
    -d '{"liked_song_ids":["sha_id_1"],"disliked_song_ids":[],"limit":50,"use_play_history":true,"history_days":30}'
  ```

### backend/api/routes/acquisition.py
- **Purpose**: Manage acquisition backend configuration and authentication
- **Endpoints**:
  - `GET /api/acquisition/backends`: Get all configured acquisition backends
  - `POST /api/acquisition/backends/{backend_id}`: Update or create a backend configuration
  - `POST /api/acquisition/backends/{backend_id}/set-active`: Set the active acquisition backend
  - `DELETE /api/acquisition/backends/{backend_id}`: Delete a backend configuration
  - `POST /api/acquisition/backends/{backend_id}/test`: Test backend configuration and authentication
- **Usage**:
  ```bash
  # Get current backends
  curl http://localhost:8000/api/acquisition/backends

  # Update yt-dlp backend with cookies
  curl -X POST http://localhost:8000/api/acquisition/backends/yt-dlp \
    -H "Content-Type: application/json" \
    -d '{"backend_type":"yt-dlp","enabled":true,"auth_method":"cookies","cookies_file":"~/.config/yt-dlp/cookies.txt"}'

  # Test backend
  curl -X POST http://localhost:8000/api/acquisition/backends/yt-dlp/test
  ```

### backend/api/routes/settings.py
- **Purpose**: Persist UI settings for pipeline defaults, storage paths, and VGGish configuration
- **Endpoints**:
  - `GET /api/settings`: Fetch stored settings
  - `PUT /api/settings`: Update settings (pipeline + paths)
  - `POST /api/settings/reset`: Clear embeddings, hashed music, and/or artist/album data (requires `confirm: "CLEAR"`)
  - `GET /api/settings/vggish`: Fetch VGGish configuration, available devices, and embedding task status
  - `PUT /api/settings/vggish`: Update VGGish configuration parameters
  - `GET /api/settings/vggish/recalculate-stream`: Recalculate embeddings (SSE stream with live progress)
  - `POST /api/settings/vggish/recalculate/stop`: Stop an active embedding recalculation
  - `GET /api/settings/performance`: Get performance metrics (cache size, pending events, view refresh status)
  - `POST /api/settings/performance/refresh-views`: Trigger immediate refresh of materialized views
  - `POST /api/settings/performance/clear-cache`: Clear the query cache
  - `GET /api/settings/retention`: Get data retention policy and summary
  - `POST /api/settings/retention/cleanup`: Run cleanup of old data based on retention policy
  - `POST /api/settings/retention/delete-all`: Delete ALL play history (requires `confirm: "DELETE_ALL"`)
  - `DELETE /api/settings/retention/song/{sha_id}`: Delete play history for a specific song
- **Usage**:
  ```bash
  curl http://localhost:8000/api/settings

  curl -X PUT http://localhost:8000/api/settings \
    -H "Content-Type: application/json" \
    -d '{"pipeline":{"process_limit":8},"paths":{"preprocessed_cache_dir":"./preprocessed_cache"}}'

  # Get VGGish configuration and detected devices
  curl http://localhost:8000/api/settings/vggish

  # Update VGGish configuration
  curl -X PUT http://localhost:8000/api/settings/vggish \
    -H "Content-Type: application/json" \
    -d '{"device_preference":"auto","gpu_memory_fraction":0.8,"use_postprocess":true}'

  # Recalculate embeddings (SSE stream)
  curl -N "http://localhost:8000/api/settings/vggish/recalculate-stream?limit=10&force=false"

  # Stop embedding recalculation
  curl -X POST http://localhost:8000/api/settings/vggish/recalculate/stop

  # Get performance metrics
  curl http://localhost:8000/api/settings/performance

  # Refresh materialized views
  curl -X POST http://localhost:8000/api/settings/performance/refresh-views

  # Clear query cache
  curl -X POST http://localhost:8000/api/settings/performance/clear-cache

  # Get data retention policy and summary
  curl http://localhost:8000/api/settings/retention

  # Run cleanup based on retention policy
  curl -X POST http://localhost:8000/api/settings/retention/cleanup

  # Delete ALL play history (destructive!)
  curl -X POST http://localhost:8000/api/settings/retention/delete-all \
    -H "Content-Type: application/json" \
    -d '{"confirm":"DELETE_ALL"}'

  # Delete play history for a specific song
  curl -X DELETE http://localhost:8000/api/settings/retention/song/{sha_id}
  ```

### backend/api/routes/playback.py
- **Purpose**: Track play sessions and listening events for analytics
- **Endpoints**:
  - `POST /api/play/start`: Start a new play session when a song begins playing
  - `POST /api/play/event`: Record events within a session (pause, resume, seek, skip)
  - `POST /api/play/complete`: Mark a session as completed (song finished naturally)
  - `POST /api/play/end`: End a session (skip, next song, page close)
  - `GET /api/play/session/{session_id}`: Get session details
  - `GET /api/play/streak`: Get current listening streak info
- **Session Lifecycle**:
  1. Frontend calls `/start` when playback begins → receives `session_id`
  2. Frontend calls `/event` for pause, resume, seek actions
  3. Frontend calls `/complete` if song finishes naturally (>80% played)
  4. Frontend calls `/end` if user skips or navigates away
- **Completion Thresholds**:
  - **Completed**: ≥80% of song duration played
  - **Skipped**: <30% played and reason is "next_song"
- **Usage**:
  ```bash
  # Start a play session
  curl -X POST http://localhost:8000/api/play/start \
    -H "Content-Type: application/json" \
    -d '{"sha_id":"abc123...","context_type":"radio","context_id":"song_xyz"}'

  # Record a pause event
  curl -X POST http://localhost:8000/api/play/event \
    -H "Content-Type: application/json" \
    -d '{"session_id":"uuid","event_type":"pause","position_ms":45000}'

  # Complete a session (song finished)
  curl -X POST http://localhost:8000/api/play/complete \
    -H "Content-Type: application/json" \
    -d '{"session_id":"uuid","final_position_ms":180000}'

  # End a session (user skipped)
  curl -X POST http://localhost:8000/api/play/end \
    -H "Content-Type: application/json" \
    -d '{"session_id":"uuid","final_position_ms":30000,"reason":"next_song"}'

  # Get current streak
  curl http://localhost:8000/api/play/streak
  ```

### backend/api/routes/stats.py
- **Purpose**: Retrieve listening statistics and analytics from play history
- **Endpoints**:
  - `GET /api/stats/overview`: High-level listening statistics (total plays, duration, unique songs/artists, streak info)
  - `GET /api/stats/top-songs`: Most played songs for a period
  - `GET /api/stats/top-artists`: Most played artists for a period
  - `GET /api/stats/top-albums`: Most played albums for a period
  - `GET /api/stats/history`: Paginated play history with song details
  - `GET /api/stats/heatmap`: Listening activity heatmap by day of week and hour
  - `GET /api/stats/genres`: Genre breakdown with play counts and percentages
  - `GET /api/stats/trends`: Compare current period to previous period (percentage changes)
  - `GET /api/stats/wrapped/{year}`: Year-in-review summary (similar to Spotify Wrapped)
  - `POST /api/stats/refresh-daily`: Refresh the daily listening stats materialized view
- **Period Formats**: Endpoints accepting `period` parameter support:
  - `week`, `month`, `year`, `all` - Relative periods
  - `YYYY` - Specific year (e.g., "2024")
  - `YYYY-MM` - Specific month (e.g., "2024-06")
- **Usage**:
  ```bash
  # Get overview stats for current month
  curl "http://localhost:8000/api/stats/overview?period=month"

  # Get top 20 songs for 2024
  curl "http://localhost:8000/api/stats/top-songs?period=2024&limit=20"

  # Get top artists for all time
  curl "http://localhost:8000/api/stats/top-artists?period=all&limit=10"

  # Get play history (paginated)
  curl "http://localhost:8000/api/stats/history?limit=50&offset=0"

  # Get listening heatmap for current year
  curl "http://localhost:8000/api/stats/heatmap"

  # Get genre breakdown for current month
  curl "http://localhost:8000/api/stats/genres?period=month"

  # Get trends comparing this week to last week
  curl "http://localhost:8000/api/stats/trends?period=week"

  # Get 2024 Wrapped summary
  curl "http://localhost:8000/api/stats/wrapped/2024"

  # Refresh daily stats materialized view
  curl -X POST http://localhost:8000/api/stats/refresh-daily
  ```

### backend/api/routes/stats_stream.py
- **Purpose**: Real-time WebSocket endpoint for live listening statistics
- **Endpoints**:
  - `WebSocket /api/stats/stream/live`: WebSocket connection for real-time stats updates
- **Message Types** (from server):
  - `stats_update`: Current listening statistics (sent on connect and periodically)
  - `play_started`: A song started playing (includes song details)
  - `play_completed`: A song finished playing
  - `play_skipped`: A song was skipped
- **Features**:
  - Broadcasts play events to all connected clients
  - Automatic stats refresh every 30 seconds
  - Connection management with proper cleanup
- **Usage**:
  ```javascript
  // Frontend WebSocket connection
  const ws = new WebSocket('ws://localhost:8000/api/stats/stream/live');

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'stats_update':
        console.log('Stats:', data.stats);
        break;
      case 'play_started':
        console.log('Now playing:', data.song);
        break;
      case 'play_completed':
        console.log('Finished:', data.session_id);
        break;
    }
  };
  ```

### backend/api/routes/export.py
- **Purpose**: Export listening history and statistics in various formats
- **Endpoints**:
  - `GET /api/export/history`: Export play history as JSON or CSV
  - `GET /api/export/stats`: Export statistics summary as JSON
  - `GET /api/export/wrapped/{year}`: Export year-in-review data as JSON
  - `GET /api/export/share-card`: Generate shareable listening stats card data
- **Query Parameters** (for history):
  - `format`: `json` (default) or `csv`
  - `period`: `week`, `month`, `year`, `all`, or specific date (`YYYY`, `YYYY-MM`)
  - `limit`: Maximum records to export (default: 1000)
  - `offset`: Pagination offset
- **Share Card Types**:
  - `overview`: General listening stats
  - `top-song`: Top song for the period
  - `top-artist`: Top artist for the period
  - `wrapped`: Year-in-review summary
- **Usage**:
  ```bash
  # Export play history as JSON
  curl "http://localhost:8000/api/export/history?period=month&limit=500"

  # Export play history as CSV
  curl "http://localhost:8000/api/export/history?format=csv&period=2024" > history.csv

  # Export stats summary
  curl "http://localhost:8000/api/export/stats?period=year"

  # Export 2024 wrapped data
  curl "http://localhost:8000/api/export/wrapped/2024"

  # Generate share card data
  curl "http://localhost:8000/api/export/share-card?type=top-song&period=month"
  ```

### backend/services/play_history_signals.py
- **Purpose**: Extract behavioral signals from play history to enhance recommendations
- **Key Functions**:
  - `get_frequently_played_songs(days, min_plays)`: Songs played multiple times
  - `get_recently_played_songs(days, limit)`: Recently listened songs
  - `get_often_skipped_songs(days, min_skips)`: Songs frequently skipped
  - `get_completed_songs(days, min_completions)`: Songs listened to completion
  - `calculate_implicit_preference_score(sha_id, days)`: Combined preference score from play behavior
- **Used By**: Enhanced For You playlist generation in similarity_pipeline

### backend/services/performance.py
- **Purpose**: Performance optimization utilities for database operations
- **Components**:
  - **EventBuffer**: Batches play events before database insertion (reduces write load)
  - **QueryCache**: TTL-based in-memory cache for expensive queries
  - **MaterializedViewRefresher**: Scheduled background refresh of aggregated stats
- **Key Functions**:
  - `get_event_buffer()`: Singleton event buffer with auto-flush
  - `get_query_cache()`: Singleton query cache (60s default TTL)
  - `@cached(ttl, key_prefix)`: Decorator for caching function results
  - `get_performance_metrics()`: Current performance stats for monitoring

### backend/services/data_retention.py
- **Purpose**: Data cleanup and privacy controls for play history
- **Default Retention Policies**:
  - Play events: 90 days
  - Play sessions: 365 days
  - Aggregate stats: 1825 days (5 years)
- **Key Functions**:
  - `cleanup_old_events()`: Delete events older than retention period
  - `cleanup_old_sessions()`: Delete sessions older than retention period
  - `run_full_cleanup()`: Run all cleanup tasks
  - `delete_all_history()`: Complete privacy reset (destructive)
  - `delete_history_for_song(sha_id)`: Remove history for specific song
  - `get_data_summary()`: Storage usage and retention policy info
- **Background Task**: Automatic periodic cleanup (default: every 24 hours)

### backend/app_settings.py
- **Purpose**: Load/store UI settings under `.metadata/settings.json`
- **Used By**: `/api/settings`, pipeline runner (default batch sizes and paths)
- **VGGish Settings**: Includes configuration for VGGish audio embeddings (sample rate, mel spectrogram parameters, device preference, GPU settings)

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

### backend/processing/audio_conversion_pipeline/
- **Purpose**: Convert various audio and video formats to MP3 before processing
- **Key Modules**:
  - `config.py`: Supported formats and conversion settings
  - `converter.py`: Core conversion logic using ffmpeg
  - `pipeline.py`: Batch conversion orchestration with queue integration
- **Supported Input Formats**:
  - **Audio**: M4A, AAC, FLAC, WAV, OGG, Opus, WMA
  - **Video**: MP4, AVI, MOV, MKV, WebM, FLV, WMV (extracts audio track)
- **Output**: High-quality MP3 (320kbps, 44.1kHz)
- **Queue Status**: `converting` → `downloaded`
- **Notes**: Original files are automatically deleted after successful conversion to save space

### backend/processing/mp3_to_pcm.py
- **Purpose**: Bulk MP3 to PCM WAV conversion
- **Requires**: ffmpeg (auto-downloads to `backend/processing/bin/ffmpeg` when missing, or uses PATH)
- **Usage**:
  ```bash
  python backend/processing/mp3_to_pcm.py /path/to/mp3s /path/to/output --threads=8
  # Optional: add --overwrite to replace existing .wav files
  ```

### backend/processing/orchestrator.py
- **Purpose**: End-to-end orchestration of download, audio conversion, PCM conversion, hashing, embeddings, and storage.
- **Requires**: `SONGBASE_DATABASE_URL` set, ffmpeg, and VGGish assets.
- **Pipeline Flow**:
  1. **Acquisition** (`pending` → `downloading` → `downloaded` or `converting`)
  2. **Audio Conversion** (`converting` → `downloaded`) - converts videos/other formats to MP3
  3. **PCM Conversion** (`downloaded` → `pcm_raw_ready`)
  4. **Hashing** (`pcm_raw_ready` → `hashed`)
  5. **Embedding** (`hashed` → `embedded`)
  6. **Storage** (`embedded` → `stored`, then removed from queue)
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

### backend/processing/similarity_pipeline/
- **Purpose**: Song similarity search and playlist generation using VGGish embeddings
- **Key Modules**:
  - `config.py`: Configuration constants (radio size, similarity thresholds, diversity constraints)
  - `similarity.py`: Similarity metrics (cosine, euclidean, dot product) and pgvector queries
  - `pipeline.py`: High-level playlist generation functions
- **Key Functions** (in `pipeline.py`):
  - `get_song_embedding(sha_id)`: Fetch embedding for a song
  - `generate_song_radio(sha_id, limit, metric, apply_diversity)`: Generate radio from a seed song
  - `generate_artist_radio(artist_id, limit, metric, apply_diversity)`: Generate radio from artist's average embedding
  - `find_similar_songs(sha_id, limit, metric)`: Find songs similar to a given song
  - `generate_preference_playlist(liked_sha_ids, disliked_sha_ids, limit, metric, apply_diversity, dislike_weight)`: Generate personalized playlist using user preferences
  - `generate_enhanced_for_you(liked_sha_ids, disliked_sha_ids, limit, history_days)`: Enhanced playlist combining explicit preferences with play history signals
- **Preference Playlist Algorithm**:
  1. Compute average embedding of liked songs (attraction centroid)
  2. Compute average embedding of disliked songs (repulsion centroid)
  3. For each candidate song: `score = like_similarity - (dislike_weight × dislike_similarity)`
  4. Apply diversity constraints (max songs per artist/album)
  5. Return top-scoring songs
- **Enhanced For You Algorithm** (combines explicit + implicit signals):
  1. Gather behavioral signals from play history:
     - Frequently played songs (weight: 0.8)
     - Completed songs (weight: 0.7)
     - Skipped songs (negative weight: -0.5)
  2. Compute weighted centroid combining:
     - Explicit likes (weight: 1.0)
     - Play history signals (weights above)
     - Explicit dislikes (weight: -1.0)
  3. Score candidates against weighted centroid
  4. Apply diversity constraints and return top results

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
  - `id3_extractor.py`: MP3 ID3 tag extraction for genres and metadata using mutagen
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
    - **Dynamic cookies loading**: Checks stored acquisition settings first, then falls back to `SONGBASE_YTDLP_COOKIES_FILE` environment variable
    - **Backend authentication**: Supports browser cookie files for yt-dlp authentication
    - **Format selection preferences**: `YTDLP_PREFER_AUDIO_ONLY` (default: `True`), `YTDLP_MAX_AUDIO_QUALITY` (default: `256` kbps)
    - **Player client configuration**: `YTDLP_PLAYER_CLIENTS` (default: `default,android,ios,web,mediaconnect`)
  - `db.py`: Download queue helpers (reads `metadata.download_queue`)
    - **Automatic cleanup**: Songs are automatically removed from the queue when they reach "stored" or "duplicate" status to prevent duplication
  - `downloader.py`: yt-dlp download worker
    - **Intelligent format selection**: Queries available formats first, then selects the best one
    - **Audio-only preference**: Prefers audio-only formats over video+audio to save bandwidth and conversion time
    - **Quality-aware**: Sorts by audio bitrate (up to max quality) and filesize
    - **Player client fallback**: When signature extraction fails, tries multiple YouTube player clients (android, ios, web, mediaconnect)
    - **Automatic fallback**: Falls back to flexible format string if no specific format can be selected
    - **Format detection**: Detects if downloaded file needs audio conversion (videos, non-MP3 audio)
  - `discovery.py`: Song list discovery + sources.jsonl writer (no downloads)
  - `discovery_providers.py`: External discovery routines (MusicBrainz, hotlists)
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
   - Treats placeholder artists (e.g., "Unknown Artist") and numeric prefixes as weak signals, keeping title-only fallbacks
   - **YouTube filename preprocessing**: Normalizes common YouTube download patterns like `Artist_ - _Title` and `Artist__Title`
   - **Callback-based artist lookup**: Accepts optional `lookup_fn` callback for scalable database-backed matching
   - **Generalized normalization**: Uses `_normalize_for_comparison()` and `_generate_name_variants()` to handle variations like "edsheeran" → "Ed Sheeran" without hardcoded mappings

2. **`backend/processing/metadata_pipeline/artist_lookup.py`** (NEW):
   - Hybrid artist name lookup combining three strategies for scalability:
     1. **Exact match** via normalized variants table (O(1) lookup using pre-computed variants)
     2. **Trigram fuzzy match** via `pg_trgm` extension (uses GIN index, scales to millions of artists)
     3. **Popular artists filter** (only searches artists with 2+ songs for faster trigram matching)
   - Provides `create_artist_lookup_fn()` to create a callback for the parser
   - Memory-efficient: No need to load all artists into memory

3. **`backend/processing/metadata_pipeline/musicbrainz_client.py`**:
   - MusicBrainz API wrapper with retry logic and rate limiting
   - **Enhanced title normalization**: Aggressively strips video qualifiers (Official Video, Visualizer, HD, 4K, etc.), year patterns, and version indicators for better matching
   - **Enhanced artist normalization**: Removes "The " prefix, featuring artists, and special characters for fuzzy matching
   - **Artist-aware scoring**: When artist is provided, heavily weights artist match in scoring (45% vs 25% for title) to prevent wrong artist matches
   - **No fallback to no-artist search**: When artist is provided, does NOT fall back to searching without artist to prevent mismatches like "Ed Sheeran - Bad Habits" → "Thin Lizzy - Bad Habits"
   - **Configurable thresholds**: Min score (75), title similarity (0.72 with artist, 0.85 without), artist similarity (0.6)

4. **`backend/processing/metadata_pipeline/multi_source_resolver.py`**:
   - Orchestrates multi-source metadata resolution
   - Implements fallback chain across all sources
   - Validates parsed metadata against match results
   - Tries title/artist variants (underscore cleanup, MV/Visualizer/Monstercat stripping) and merges stop-word artists into title-only searches when needed

5. **`backend/processing/metadata_pipeline/pipeline.py`**:
   - Main verification entry point
   - Creates database-backed artist lookup callback for efficient parsing
   - Integrates image fetching after successful verification
   - Returns comprehensive results including image statistics

6. **`backend/api/routes/processing.py`**:
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

# Stop an in-flight verification stream
curl -X POST http://localhost:8000/api/processing/metadata/verify/stop

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
