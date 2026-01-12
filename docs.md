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
│   │   ├── stats/
│   │   │   └── page.tsx # Statistics dashboard
│   │   └── settings/
│   │       └── page.tsx # Pipeline + storage settings UI
│   ├── components/
│   │   ├── charts/    # Recharts-based visualization library
│   │   │   ├── colors.ts       # Color palette and theming
│   │   │   ├── ChartContainer.tsx # Wrapper with loading/empty states
│   │   │   ├── BarChart.tsx    # Bar chart variants
│   │   │   ├── LineChart.tsx   # Line chart with comparisons
│   │   │   ├── PieChart.tsx    # Pie/donut/gauge charts
│   │   │   ├── AreaChart.tsx   # Area charts and sparklines
│   │   │   ├── RadarChart.tsx  # Radar charts for audio features
│   │   │   ├── ScatterChart.tsx # Scatter plots
│   │   │   └── index.ts        # Barrel exports
│   │   ├── stats/     # Statistics components
│   │   └── features/  # Audio feature display components
│   ├── public/        # Static assets
│   ├── next.config.ts # Next.js configuration (API proxy, Docker support)
│   ├── Dockerfile     # Production Docker image (multi-stage build)
│   ├── Dockerfile.dev # Development Docker image (hot reload)
│   ├── package.json   # Frontend dependencies (includes recharts)
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
│   │   │   ├── export.py     - Data export and share card endpoints
│   │   │   ├── smart_playlists.py - Rule-based smart playlist endpoints
│   │   │   └── features.py   - Audio feature extraction endpoints
│   │   ├── events/
│   │   │   └── library_events.py - Library event hub + smart playlist refresh signals
│   │   ├── app.py            - Main FastAPI application with CORS
│   │   └── requirements.txt  - API dependencies
│   ├── Dockerfile            - Production Docker image (multi-stage)
│   ├── Dockerfile.dev        - Development Docker image
│   └── docker-entrypoint.sh  - Container startup script
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
│   │   │   ├── 007_add_play_history.sql - Adds play_sessions, play_events, listening_streaks tables
│   │   │   ├── 008_add_smart_playlists.sql - Adds smart_playlists, smart_playlist_songs tables
│   │   │   ├── 009_smart_playlists_phase3.sql - Adds audio_features table + smart playlist indexes
│   │   │   └── 010_enhance_audio_features.sql - Adds confidence, metadata, and analyzer columns to audio_features
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
│       ├── feature_pipeline/
│       │   ├── __init__.py      - Package exports (FeaturePipeline, extractors)
│       │   ├── config.py        - Feature extraction configuration
│       │   ├── pipeline.py      - Main orchestration for feature extraction
│       │   ├── cli.py           - CLI for batch feature extraction
│       │   ├── extractors/
│       │   │   ├── __init__.py  - Extractor exports
│       │   │   ├── base.py      - BaseExtractor and ExtractionResult
│       │   │   ├── bpm.py       - BPM/tempo detection
│       │   │   ├── key.py       - Musical key/mode detection
│       │   │   ├── energy.py    - Energy/intensity extraction
│       │   │   ├── mood.py      - Rule-based mood classification
│       │   │   ├── danceability.py - Danceability scoring
│       │   │   └── acoustic.py  - Acoustic/electronic and instrumentalness
│       │   ├── db.py            - Database integration for feature extraction
│       │   └── utils/
│       │       ├── __init__.py  - Utility exports
│       │       ├── audio_loader.py - Audio file loading
│       │       ├── normalization.py - Feature normalization
│       │       └── aggregation.py - Result aggregation
│       ├── acquisition_pipeline/
│       │   ├── __init__.py      - Package entry point for acquisition helpers
│       │   ├── cli.py           - CLI for song acquisition
│       │   ├── config.py        - Acquisition settings + cache paths
│       │   ├── db.py            - Download queue DB helpers
│       │   ├── discovery.py     - Song list discovery + sources.jsonl writer
│       │   ├── discovery_providers.py - External discovery routines (MusicBrainz, hotlists)
│       │   ├── io.py            - Metadata JSON writer
│       │   ├── importer.py      - Local file import into the queue
│       │   ├── pipeline.py      - Pipeline orchestration
│       │   └── sources.py       - Extendable song source list reader
│       ├── metadata_pipeline/
│       │   ├── __init__.py       - Package entry point for verification helpers
│       │   ├── album_pipeline.py  - Album metadata + track list ingestion
│       │   ├── artist_lookup.py   - Hybrid artist lookup (exact + trigram + popular filter)
│       │   ├── cli.py            - CLI for MusicBrainz verification
│       │   ├── config.py         - Configuration for MusicBrainz, Spotify, Wikidata, Discogs APIs
│       │   ├── discogs_client.py  - Discogs API client for metadata and images
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
│       ├── data_retention.py - Data cleanup jobs and privacy controls
│       ├── rule_engine.py - Smart playlist rule parsing, validation, and SQL compilation
│       ├── playlist_refresher.py - Smart playlist song list refresh service
│       └── playlist_refresh_scheduler.py - Debounced auto-refresh worker for smart playlists
├── backend/tests/
│   └── test_orchestrator_integration.py - End-to-end pipeline smoke test (opt-in)
├── scripts/
│   ├── build_unix.sh     - Builds standalone binary with bundled ffmpeg
│   └── use_local_python.sh - Run project modules via the local venv
├── database/            # Docker database initialization
│   └── init/            # SQL/shell scripts for PostgreSQL container
│       ├── 01-create-databases.sql - Creates metadata and images databases
│       ├── 02-init-metadata.sh     - Initializes metadata schema and migrations
│       └── 03-init-images.sh       - Initializes images schema
├── docker-compose.yml   # Production Docker configuration
├── docker-compose.dev.yml # Development Docker override (hot reload)
├── .env.docker.example  # Docker environment variable template
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
- **Uses**: `/api/library/queue`, `/api/library/queue/clear`, `/api/library/import`, `/api/library/stats`, `/api/library/pipeline/status`, `/api/settings/vggish`
- **Notes**: The pipeline queue table is paged (10/25/50/100).
- **Notes**: The pipeline run panel shows live config, last event, and cache paths while running.
- **Notes**: "Run until queue is empty" checkbox automatically processes batches until all pending and processing items are stored or failed.
- **Notes**: Manage Music includes local file import (audio/video) via `/api/library/import`.
- **Notes**: Database tab includes a song metadata editor with a right-side details panel, edit flow, per-song metadata verification buttons, and song deletion with optional file removal.
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
- **Uses**: `/api/stats/overview`, `/api/stats/top-songs`, `/api/stats/top-artists`, `/api/stats/heatmap`, `/api/stats/history`, `/api/stats/library`, `/api/stats/library/growth`, `/api/stats/library/composition`, `/api/stats/audio-features`, `/api/stats/audio-features/correlation`, `/api/stats/keys`, `/api/stats/moods`, `/api/library/genres`, `/api/library/artists/popular`, `/api/smart-playlists`
- **Tabs**:
  - **Overview**: Period-based listening statistics, top songs/artists, heatmap, history
  - **Library**: Library size, growth trends, composition breakdown
  - **Audio**: Audio feature analysis with radar charts, distributions, and visualizations
- **Features**:
  - **FilterBar component** with advanced filtering:
    - Time range presets (Today, This Week, This Month, This Year, All Time)
    - Custom date range picker with native date inputs
    - Comparison mode for period A vs period B analysis
    - Filter chips for genres, artists, and playlists
    - Audio feature range filters (energy, danceability, BPM)
    - URL state persistence (filters saved in query params)
  - Overview cards (total plays, time listened, unique songs, listening streak)
  - Top songs chart with play counts and inline play buttons
  - Top artists chart with links to artist pages
  - Listening heatmap showing activity by day of week and hour
  - Recent play history with completion/skip status
  - Audio feature radar chart (energy, danceability, acousticness, instrumentalness, speechiness)
  - BPM distribution histogram with min/max/avg statistics
  - Energy vs Danceability scatter plot with correlation analysis
  - Key distribution donut chart with major/minor breakdown
  - Mood breakdown chart with primary moods
  - Feature distributions as small multiples
- **Notes**: All playback is automatically tracked via MusicPlayerContext integration. Filters are persisted in URL query parameters for shareable links.

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

### frontend/app/playlist/smart/new/page.tsx
- **Purpose**: Create new smart playlist page with template gallery
- **Uses**: `/api/playlists/smart/templates`, `/api/playlists/smart`
- **Features**:
  - Template gallery with categorized preset templates
  - "Create from Scratch" option for custom rules
  - Full RuleBuilder component for defining rules
  - Live preview of matching songs
  - Sort options and song limit configuration
- **Notes**: After creation, redirects to the new smart playlist view page

### frontend/app/playlist/smart/[id]/page.tsx
- **Purpose**: View and manage a smart playlist
- **Uses**: `/api/playlists/smart/{playlist_id}`, `/api/playlists/smart/{playlist_id}/explain`, `/api/playlists/smart/{playlist_id}/refresh`
- **Features**:
  - Gradient header with bolt icon indicating smart playlist
  - Human-readable rule explanation
  - Song list with play controls
  - Manual refresh button
  - Edit and delete options
  - Play all button
  - Stats: song count, total duration, last refresh time
- **Notes**: Songs are cached in smart_playlist_songs table; refresh recalculates based on current rules

### frontend/app/playlist/smart/[id]/edit/page.tsx
- **Purpose**: Edit an existing smart playlist's rules
- **Uses**: `/api/playlists/smart/{playlist_id}` (GET and PUT)
- **Features**:
  - Full RuleBuilder component pre-populated with existing rules
  - Live preview updates as rules change
  - Cancel returns to playlist view
  - Save updates rules and auto-refreshes playlist
- **Notes**: Playlist is automatically refreshed after rules are updated

### frontend/components/smart-playlists/
- **Purpose**: Reusable components for smart playlist rule building
- **Key Components**:
  - `RuleBuilder.tsx`: Main rule builder with name, description, rules, sorting, preview
  - `ConditionGroup.tsx`: Recursive component for AND/OR condition groups
  - `ConditionRow.tsx`: Single condition with field, operator, value
  - `FieldSelector.tsx`: Dropdown for selecting rule fields (grouped by category)
  - `OperatorSelector.tsx`: Dropdown for operators (dynamic based on field type)
  - `ValueInput.tsx`: Dynamic input based on field type and operator
  - `TemplateGallery.tsx`: Grid of template cards with categories
  - `TemplateCard.tsx`: Individual template card with icon and description
  - `types.ts`: TypeScript interfaces and constants
- **Notes**: RuleBuilder surfaces preset rules and suggested rules for quick inserts.
- **Field Categories**:
  - Metadata: title, artist, album, genre, release_year, duration_sec, track_number, added_at, verified
  - Playback: play_count, last_played, skip_count, completion_rate, last_week_plays, trending, declining
  - Preference: is_liked, is_disliked
  - Audio: has_embedding, bpm, energy, danceability, key, key_mode, key_camelot, acousticness, instrumentalness, mood
  - Advanced: similar_to
- **Usage**:
  ```tsx
  import { RuleBuilder, rulesToApi, rulesFromApi } from '@/components/smart-playlists';

  <RuleBuilder
    initialData={existingPlaylist}
    onSave={async (data) => {
      const apiRules = rulesToApi(data.rules);
      await fetch('/api/playlists/smart', {
        method: 'POST',
        body: JSON.stringify({ ...data, rules: apiRules })
      });
    }}
    onCancel={() => router.back()}
    isEditing={false}
  />
  ```

### frontend/components/features/
- **Purpose**: Audio feature display and filter components for BPM, key, energy, mood, danceability, and acousticness
- **Key Components**:
  - `BpmDisplay.tsx`: Tempo display with confidence indicator (low confidence shows ~)
  - `KeyDisplay.tsx`: Key/mode display with Camelot wheel notation and color coding
  - `EnergyMeter.tsx`: Energy level bar with color gradient (blue→green→yellow→orange→red)
  - `MoodBadge.tsx`: Mood category badges with icons (happy, sad, energetic, calm, aggressive, romantic, dark, uplifting)
  - `DanceabilityMeter.tsx`: Danceability score visualization with dance icon
  - `AcousticBadge.tsx`: Acoustic/electronic classification badge with instrumentalness
  - `FeaturePanel.tsx`: Composite panel showing all features (supports compact, full, inline layouts)
  - `FeatureFilters.tsx`: Filter UI for library/search with BPM range, key selector, energy slider, mood chips
  - `AudioFeaturesPanel.tsx`: Analysis management UI for Database tab with progress tracking
- **Usage**:
  ```tsx
  import {
    BpmDisplay,
    KeyDisplay,
    EnergyMeter,
    MoodBadge,
    FeaturePanel,
    FeatureFilters,
    AudioFeaturesPanel,
    type AudioFeatures,
    type FeatureFilterState,
  } from '@/components/features';

  // Display all features for a song
  <FeaturePanel features={songFeatures} layout="full" showCamelot={true} />

  // Compact display for song lists
  <FeaturePanel features={songFeatures} layout="compact" />

  // Individual components
  <BpmDisplay bpm={128} confidence={0.95} size="lg" />
  <KeyDisplay keyName="A" mode="Minor" camelot="8A" showCamelot />
  <MoodBadge mood="energetic" secondary="happy" showSecondary />

  // Filter UI
  <FeatureFilters
    filters={filterState}
    onChange={setFilterState}
    onClear={() => setFilterState(DEFAULT_FEATURE_FILTERS)}
  />

  // Analysis management (used in Database tab)
  <AudioFeaturesPanel />
  ```

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

### frontend/components/charts/
**Purpose**: Reusable chart component library built on Recharts with consistent dark theme styling for the statistics dashboard.

**Components**:
- `colors.ts` - Color palette constants and helper functions
- `ChartContainer.tsx` - Wrapper component with loading/empty states
- `ChartTooltip.tsx` - Custom tooltip components
- `ChartLegend.tsx` - Custom legend components
- `BarChart.tsx` - Bar chart (horizontal/vertical) with variants
- `LineChart.tsx` - Line chart with comparison support
- `PieChart.tsx` - Pie/donut/gauge charts
- `AreaChart.tsx` - Area charts with stacking and sparklines
- `RadarChart.tsx` - Radar/spider charts for audio features
- `ScatterChart.tsx` - Scatter plots for BPM vs Energy analysis
- `index.ts` - Barrel exports for all components

**Color Palette** (from `colors.ts`):
```typescript
import { CHART_COLORS, getSeriesColor, KEY_COLORS, MOOD_COLORS } from '@/components/charts';

// Brand colors
CHART_COLORS.primary    // #ec4899 (Pink)
CHART_COLORS.secondary  // #8b5cf6 (Purple)
CHART_COLORS.tertiary   // #06b6d4 (Cyan)

// Get series color by index (cycles through palette)
getSeriesColor(0)  // Returns first color in series
```

**Usage Examples**:
```tsx
import {
  BarChart,
  SimpleLineChart,
  DonutChart,
  AudioFeaturesRadar,
  BpmEnergyScatter,
  Sparkline,
} from '@/components/charts';

// Simple bar chart
<BarChart
  data={[{ name: 'Rock', value: 100 }, { name: 'Pop', value: 80 }]}
  dataKeys={['value']}
  title="Songs by Genre"
  height={300}
/>

// Line chart with comparison
<ComparisonLineChart
  data={weeklyData}
  title="Weekly Listening"
  currentLabel="This Week"
  previousLabel="Last Week"
/>

// Donut chart
<DonutChart
  data={genreData}
  title="Genre Distribution"
  showPercentage
/>

// Audio features radar (specialized for audio analysis)
<AudioFeaturesRadar
  features={{ energy: 0.8, danceability: 0.6, acousticness: 0.2 }}
  title="Audio Profile"
/>

// BPM vs Energy scatter plot
<BpmEnergyScatter
  data={songData}
  colorByMood
  sizeByPlayCount
/>

// Inline sparkline
<Sparkline data={[10, 20, 15, 30, 25]} color="#ec4899" width={100} height={30} />
```

**Specialized Charts**:
- `AudioFeaturesRadar` - Pre-configured for energy, danceability, acousticness, etc.
- `BpmEnergyScatter` - Scatter plot with BPM on X-axis, energy on Y-axis
- `DanceabilityEnergyScatter` - Danceability vs Energy analysis
- `Sparkline` - Minimal inline charts for overview cards
- `GaugeChart` - Half-donut for percentage displays

**Accessibility Features** (`accessibility.ts`):
```typescript
import {
  COLOR_BLIND_SAFE,
  generateDataSummary,
  announceToScreenReader,
  getAccessibleColor,
  KEYBOARD_KEYS,
} from '@/components/charts';

// Color-blind safe palette (deuteranopia, protanopia, tritanopia)
COLOR_BLIND_SAFE.series   // 8-color accessible palette
COLOR_BLIND_SAFE.status   // success, warning, error, info

// Generate screen reader summary for chart data
const summary = generateDataSummary(data, 'plays');
// "Contains 10 items. Total plays: 1,234. Highest: Rock with 300. Lowest: Jazz with 50."

// Announce updates to screen readers
announceToScreenReader('Chart updated with new data');

// Get accessible color with minimum contrast ratio
getAccessibleColor('#ec4899', '#111827');  // Returns color if contrast >= 4.5:1
```

### frontend/components/stats/EmptyState.tsx
- **Purpose**: Accessible empty state components with helpful suggestions
- **Components**:
  - `EmptyState`: Full empty state with icon, title, suggestions, and actions
  - `InlineEmptyState`: Compact inline empty state for lists
  - `Skeleton`: Loading placeholder (text, circular, rectangular, chart variants)
  - `StatCardSkeleton`: Pre-styled skeleton for stat cards
  - `ListSkeleton`: Pre-styled skeleton for list items
- **Preset Types**: `no-data`, `no-plays`, `no-songs`, `no-results`, `loading-failed`, `coming-soon`, `no-activity`, `no-favorites`, `no-playlists`
- **Usage**:
  ```tsx
  import { EmptyState, Skeleton, StatCardSkeleton } from '@/components/stats';

  // Use preset empty state
  <EmptyState type="no-plays" />

  // Custom empty state with suggestions
  <EmptyState
    title="No Data Available"
    description="Select a different time range"
    suggestions={[
      { text: 'Try last month', action: { label: 'Last Month', onClick: () => {} } }
    ]}
    action={{ label: 'Browse Library', href: '/library' }}
  />

  // Loading skeletons
  <Skeleton variant="text" lines={3} />
  <StatCardSkeleton />
  <ListSkeleton items={5} showImage />
  ```

### frontend/components/stats/Transitions.tsx
- **Purpose**: Animation components with reduced motion support
- **Motion Preference**: Automatically respects `prefers-reduced-motion` media query
- **Components**:
  - `FadeIn`: Simple opacity animation
  - `SlideIn`: Slide from direction (up, down, left, right)
  - `ScaleIn`: Scale up animation
  - `Stagger`: Stagger animations for list items
  - `Collapse`: Height animation for expandable content
  - `TabTransition`: Smooth tab switching animation
  - `AnimatedPresence`: Mount/unmount with animation
  - `NumberTransition`: Animated number counter
  - `Pulse`: Pulsing glow effect
  - `AnimateOnView`: Animate when element enters viewport
- **Hooks**:
  - `useReducedMotion()`: Check if user prefers reduced motion
  - `useInView(ref)`: Detect when element is in viewport
- **Usage**:
  ```tsx
  import {
    FadeIn,
    SlideIn,
    Stagger,
    NumberTransition,
    useReducedMotion,
    AnimateOnView,
  } from '@/components/stats';

  // Fade in with delay
  <FadeIn delay={200}>Content</FadeIn>

  // Slide in from bottom
  <SlideIn direction="up" duration={300}>Content</SlideIn>

  // Staggered list animation
  <Stagger staggerDelay={50} animation="slide">
    {items.map(item => <ListItem key={item.id} />)}
  </Stagger>

  // Animated number
  <NumberTransition value={1234} formatValue={(v) => `${v} plays`} />

  // Animate when scrolled into view
  <AnimateOnView animation="fade" threshold={0.1}>
    <ChartComponent />
  </AnimateOnView>

  // Check reduced motion preference
  const prefersReducedMotion = useReducedMotion();
  ```

### frontend/components/stats/AccessibleTabs.tsx
- **Purpose**: WCAG-compliant tab navigation with full keyboard support
- **Components**:
  - `Tabs`, `TabList`, `Tab`, `TabPanel`: Composable tab system
  - `StatsTabs`: Pre-styled tabs for stats dashboard
  - `GridNavigation`: Arrow key navigation for data grids
  - `SkipLink`: Skip to content link for keyboard users
  - `LiveRegion`: ARIA live region for announcements
- **Keyboard Navigation**:
  - Arrow Left/Right: Navigate between tabs
  - Home/End: Jump to first/last tab
  - Enter/Space: Select focused item
- **Usage**:
  ```tsx
  import { Tabs, TabList, Tab, TabPanel, StatsTabs, SkipLink } from '@/components/stats';

  // Composable tabs
  <Tabs defaultTab="overview" onTabChange={(id) => console.log(id)}>
    <TabList label="Statistics sections">
      <Tab id="overview">Overview</Tab>
      <Tab id="library">Library</Tab>
      <Tab id="listening">Listening</Tab>
    </TabList>
    <TabPanel id="overview">Overview content</TabPanel>
    <TabPanel id="library" lazy>Library content (lazy loaded)</TabPanel>
    <TabPanel id="listening">Listening content</TabPanel>
  </Tabs>

  // Pre-styled stats tabs
  <StatsTabs
    tabs={[
      { id: 'overview', label: 'Overview', icon: <ChartIcon /> },
      { id: 'library', label: 'Library' },
    ]}
    activeTab={activeTab}
    onTabChange={setActiveTab}
  />

  // Skip link for keyboard users
  <SkipLink targetId="main-content" />
  <main id="main-content">...</main>
  ```

### frontend/contexts/UserPreferencesContext.tsx
- **Purpose**: Client-side storage of user preferences (likes/dislikes)
- **Storage**: `localStorage` with key `songbase_user_preferences`
- **Sync**: Sends liked/disliked IDs to `/api/playlists/smart/preferences/changed` for smart playlist auto-refresh.
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
  - Routes organized by domain (processing, library, settings, acquisition, playback, stats, stats_stream, export, smart_playlists, features)
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
  - `DELETE /api/library/songs/{sha_id}`: Delete a song and all associated data (metadata, associations, features, embeddings, play history, smart playlist memberships, images). Optional `delete_file=true` query param to also delete the audio file from disk.
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
  - `GET /api/settings/features`: Get audio feature extraction configuration and stats
  - `PUT /api/settings/features`: Update feature extraction settings (enabled, auto_analyze, extractors)
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

  # Get audio feature extraction settings
  curl http://localhost:8000/api/settings/features

  # Update feature extraction settings
  curl -X PUT http://localhost:8000/api/settings/features \
    -H "Content-Type: application/json" \
    -d '{"enabled":true,"auto_analyze":true,"extractors":{"bpm":true,"key":true,"mood":false}}'
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
  - `GET /api/stats/library`: Comprehensive library statistics (total songs, albums, artists, duration, storage, songs by decade/year)
  - `GET /api/stats/library/growth`: Library growth over time (songs added per period with cumulative totals)
  - `GET /api/stats/library/composition`: Library breakdown by source, verification status, and audio feature availability
  - `GET /api/stats/audio-features`: Audio feature distributions (BPM, energy, danceability, acousticness, instrumentalness, speechiness) with min/max/avg/median and histogram buckets
  - `GET /api/stats/audio-features/correlation`: Correlation matrix between audio features with sample scatter plot data
  - `GET /api/stats/keys`: Musical key distribution with mode (major/minor) and Camelot notation
  - `GET /api/stats/moods`: Primary and secondary mood breakdown with associated audio feature averages
  - `GET /api/stats/listening/timeline`: Listening activity timeline with comparison to previous period
  - `GET /api/stats/listening/completion-trend`: Daily completion and skip rate trends over time
  - `GET /api/stats/listening/skip-analysis`: Most skipped songs, skip rate by genre and hour
  - `GET /api/stats/listening/context`: Play context distribution (radio, playlist, album, etc.) with trends
  - `GET /api/stats/listening/sessions`: Listening session analysis with length distribution
  - `GET /api/stats/heatmap/enhanced`: Enhanced heatmap with top song per time slot
  - `GET /api/stats/daily-activity`: Daily plays and songs added for sparkline charts
  - `GET /api/stats/discoveries/summary`: Discovery metrics summary (songs added, new artists/genres, first listens)
  - `GET /api/stats/discoveries/recently-added`: Recently added songs grouped by date
  - `GET /api/stats/discoveries/new-artists`: Artists discovered (first played) in period with first song
  - `GET /api/stats/discoveries/genre-exploration`: Genre listening evolution with new genre discoveries
  - `GET /api/stats/discoveries/unplayed`: Songs never played with library percentage
  - `GET /api/stats/discoveries/one-hit-wonders`: Songs played exactly once
  - `GET /api/stats/discoveries/hidden-gems`: Low play count but high completion rate songs
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

  # Get comprehensive library statistics
  curl "http://localhost:8000/api/stats/library"

  # Get library growth by month
  curl "http://localhost:8000/api/stats/library/growth?period=month"

  # Get library composition breakdown
  curl "http://localhost:8000/api/stats/library/composition"

  # Get audio feature distributions (BPM, energy, danceability, etc.)
  curl "http://localhost:8000/api/stats/audio-features"

  # Get audio feature correlations for scatter plots
  curl "http://localhost:8000/api/stats/audio-features/correlation"

  # Get musical key distribution
  curl "http://localhost:8000/api/stats/keys"

  # Get mood breakdown with feature averages
  curl "http://localhost:8000/api/stats/moods"

  # Get listening timeline with comparison data
  curl "http://localhost:8000/api/stats/listening/timeline?period=month&granularity=day"

  # Get completion and skip rate trends
  curl "http://localhost:8000/api/stats/listening/completion-trend?period=month"

  # Get skip analysis (most skipped songs, by genre/hour)
  curl "http://localhost:8000/api/stats/listening/skip-analysis?period=month&limit=20"

  # Get play context distribution
  curl "http://localhost:8000/api/stats/listening/context?period=month"

  # Get listening session analysis
  curl "http://localhost:8000/api/stats/listening/sessions?period=month"

  # Get enhanced heatmap with top songs per slot
  curl "http://localhost:8000/api/stats/heatmap/enhanced"

  # Get daily activity for sparklines (7 days)
  curl "http://localhost:8000/api/stats/daily-activity?days=7"

  # Get discovery summary for the month
  curl "http://localhost:8000/api/stats/discoveries/summary?period=month"

  # Get recently added songs (last 30 days)
  curl "http://localhost:8000/api/stats/discoveries/recently-added?days=30&limit=50"

  # Get new artists discovered this month
  curl "http://localhost:8000/api/stats/discoveries/new-artists?period=month"

  # Get genre exploration data
  curl "http://localhost:8000/api/stats/discoveries/genre-exploration?period=year"

  # Get unplayed songs
  curl "http://localhost:8000/api/stats/discoveries/unplayed?limit=50"

  # Get one-hit wonders (songs played once)
  curl "http://localhost:8000/api/stats/discoveries/one-hit-wonders?period=all&limit=30"

  # Get hidden gems (high completion, low plays)
  curl "http://localhost:8000/api/stats/discoveries/hidden-gems?limit=20"

  # Refresh daily stats materialized view
  curl -X POST http://localhost:8000/api/stats/refresh-daily
  ```

### backend/api/routes/stats_stream.py
- **Purpose**: Real-time WebSocket endpoint for live listening statistics
- **Endpoints**:
  - `WebSocket /api/stats/stream/live`: WebSocket connection for real-time stats updates
  - `GET /api/stats/stream/clients`: Get count of connected WebSocket clients
- **Message Types** (from server):
  - `initial`: Full stats payload sent on connection
  - `periodic`: Abbreviated stats sent every 30 seconds
  - `refresh`: Full stats in response to client refresh request
  - `play_update`: Play event (started, completed, skipped) with song details and updated stats
  - `pong`: Response to client ping
- **Message Types** (from client):
  - `ping`: Keep-alive ping
  - `refresh`: Request full stats refresh
- **Play Update Payload**:
  ```json
  {
    "type": "play_update",
    "event_type": "started|completed|skipped",
    "sha_id": "abc123",
    "session_id": "session-uuid",
    "timestamp": "2024-01-15T10:30:00Z",
    "today_plays": 42,
    "today_duration_formatted": "2h 15m",
    "current_streak": 5,
    "song": {
      "title": "Song Title",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
  ```
- **Features**:
  - Broadcasts play events to all connected clients
  - Automatic stats refresh every 30 seconds
  - Connection management with proper cleanup
  - Exponential backoff reconnection on client side
- **Frontend Hook** (`frontend/hooks/useStatsStream.ts`):
  ```typescript
  import { useStatsStream } from '@/hooks/useStatsStream';

  function MyComponent() {
    const { connected, stats, activity, refresh, error } = useStatsStream({
      enabled: true,
      maxActivityItems: 20,
      onPlayUpdate: (event) => console.log('Play event:', event),
    });

    return (
      <div>
        <p>Connected: {connected ? 'Yes' : 'No'}</p>
        <p>Total plays: {stats.total_plays}</p>
        <p>Recent activity: {activity.length} items</p>
      </div>
    );
  }
  ```
- **Real-time Components**:
  - `AnimatedCounter`: Smoothly animates between number values with easing
  - `AnimatedDuration`: Animated counter for duration strings
  - `LiveIndicator`: Shows connection status with pulsing dot
  - `LiveActivityFeed`: Real-time feed of listening activity with animated entries
  - `StatCardWithAnimation`: Stat card that animates value changes

### backend/api/routes/export.py
- **Purpose**: Export listening history and statistics in various formats
- **Endpoints**:
  - `GET /api/export/history`: Export play history as JSON or CSV
  - `GET /api/export/stats`: Export statistics summary as JSON
  - `GET /api/export/wrapped/{year}`: Export year-in-review data as JSON
  - `GET /api/export/share-card`: Generate shareable listening stats card data
  - `GET /api/export/report/{report_type}`: Export comprehensive reports (overview, library, listening, audio, discoveries, full)
- **Query Parameters** (for history):
  - `format`: `json` (default) or `csv`
  - `period`: `week`, `month`, `year`, `all`, or specific date (`YYYY`, `YYYY-MM`)
  - `limit`: Maximum records to export (default: 10000)
- **Report Types** (for `/api/export/report/{type}`):
  - `overview`: Overview stats with top songs, artists, albums, genres
  - `library`: Library statistics, growth, and composition
  - `listening`: Timeline, completion trends, skip analysis, context distribution, sessions
  - `audio`: Audio features, key distribution, mood breakdown
  - `discoveries`: Summary, recently added, new artists, unplayed songs, hidden gems
  - `full`: Comprehensive report combining all statistics
- **Share Card Types**:
  - `overview`: General listening stats (4 key metrics)
  - `top-song`: Top song for the period
  - `top-artist`: Top artist for the period
  - `wrapped`: Year-in-review summary
  - `monthly-summary`: Comprehensive period summary with top songs, artists, genres, and streaks
  - `top-5-songs`: Top 5 songs ranked with play counts
  - `listening-personality`: Listening personality type with traits and audio profile
- **Listening Personality Types** (computed based on listening patterns):
  - "The Explorer": High variety in artists/genres
  - "The Devotee": Deep loyalty to favorites
  - "The Energizer": Preference for high-energy tracks
  - "The Chill Seeker": Preference for mellow sounds
  - "The Completionist": High completion rate
  - "The Sampler": Low completion, high discovery
  - "The Balanced Listener": Mix of favorites and discoveries
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

  # Generate monthly summary card
  curl "http://localhost:8000/api/export/share-card?type=monthly-summary&period=month"

  # Generate listening personality card
  curl "http://localhost:8000/api/export/share-card?type=listening-personality&period=year"

  # Export full report as JSON
  curl "http://localhost:8000/api/export/report/full?period=month"

  # Export listening report as CSV
  curl "http://localhost:8000/api/export/report/listening?format=csv&period=week"
  ```

### frontend/components/stats/ExportButton.tsx
- **Purpose**: Export stats data in various formats (JSON, CSV, PNG, PDF)
- **Components**:
  - `ExportButton`: Dropdown button with multiple export format options
  - `QuickExportButton`: Single-format export button
  - `ExportHistoryButton`: Specialized button for exporting play history
- **Supported Formats**:
  - JSON: Structured data download
  - CSV: Spreadsheet-compatible format
  - PNG: Screenshot of current view (using html2canvas)
  - PDF: Print-ready document (opens browser print dialog)
- **Props**:
  - `reportType`: Type of report (overview, library, listening, audio, discoveries, full)
  - `period`: Time period for the export
  - `captureRef`: Reference to element for PNG capture
  - `formats`: Array of available formats (default: all)
  - `variant`: Button style ('default', 'compact', 'icon-only')
- **Usage**:
  ```tsx
  import { ExportButton, QuickExportButton, ExportHistoryButton } from '@/components/stats';

  // Full dropdown export button
  <ExportButton reportType="overview" period="month" />

  // Compact dropdown
  <ExportButton reportType="listening" period="week" variant="compact" />

  // Quick single-format export
  <QuickExportButton format="csv" reportType="overview" period="month" />

  // Export history button
  <ExportHistoryButton format="csv" period="all" />
  ```

### frontend/components/stats/ShareCard.tsx (Enhanced)
- **Purpose**: Render and share listening statistics cards
- **Components**:
  - `ShareCard`: Modal component displaying a shareable stats card
  - `ShareCardButton`: Button that fetches and displays a share card
  - `fetchShareCardData`: Utility function to fetch card data from API
- **Supported Card Types**:
  - `overview`: 4 key metrics in a grid
  - `top-song`: Featured song with play count
  - `top-artist`: Featured artist with stats
  - `wrapped`: Year-in-review summary
  - `monthly-summary`: Comprehensive summary with top songs, artists, and streaks
  - `top-5-songs`: Ranked list of top 5 songs with medal styling
  - `listening-personality`: Personality type with traits and audio profile
- **Features**:
  - Copy as text (clipboard)
  - Save as image (PNG via html2canvas)
  - Gradient backgrounds and styled cards
- **Usage**:
  ```tsx
  import { ShareCard, ShareCardButton, fetchShareCardData } from '@/components/stats';

  // Use ShareCardButton for automatic fetching
  <ShareCardButton type="monthly-summary" period="month" />
  <ShareCardButton type="listening-personality" period="year" />
  <ShareCardButton type="top-5-songs" period="week" />

  // Manual fetch and display
  const data = await fetchShareCardData('monthly-summary', 'month');
  <ShareCard data={data} onClose={() => {}} />
  ```

### backend/api/routes/smart_playlists.py
- **Purpose**: Rule-based smart playlist management with automatic song population
- **Endpoints**:
  - `POST /api/playlists/smart`: Create a new smart playlist with rules
  - `GET /api/playlists/smart`: List all smart playlists
  - `GET /api/playlists/smart/templates`: Get available smart playlist templates
  - `GET /api/playlists/smart/presets`: List rule presets
  - `POST /api/playlists/smart/suggest`: Suggest rules from library composition
  - `POST /api/playlists/smart/convert`: Convert a static playlist to smart rules
  - `POST /api/playlists/smart/import`: Import a smart playlist definition
  - `POST /api/playlists/smart/share`: Encode a shareable rules token
  - `GET /api/playlists/smart/share/{token}`: Decode a shared rules token
  - `POST /api/playlists/smart/from-template/{template_id}`: Create playlist from template
  - `GET /api/playlists/smart/preview`: Preview rule results without saving
  - `POST /api/playlists/smart/preview`: Preview rules (POST version for complex rules)
  - `POST /api/playlists/smart/preview/explain`: Query plan for preview rules
  - `GET /api/playlists/smart/refresh/stream`: SSE stream of refresh events
  - `POST /api/playlists/smart/preferences/changed`: Sync preference changes for auto-refresh
  - `GET /api/playlists/smart/{playlist_id}`: Get playlist with songs
  - `GET /api/playlists/smart/{playlist_id}/export`: Export playlist definition
  - `PUT /api/playlists/smart/{playlist_id}`: Update playlist (auto-refreshes if rules change)
  - `DELETE /api/playlists/smart/{playlist_id}`: Delete playlist
  - `POST /api/playlists/smart/{playlist_id}/refresh`: Manually refresh playlist
  - `POST /api/playlists/smart/refresh-all`: Refresh all auto-refresh playlists
  - `GET /api/playlists/smart/{playlist_id}/explain`: Get human-readable rule explanation
- **Rule Schema**:
  ```json
  {
    "version": 1,
    "match": "all",  // "all" (AND) or "any" (OR)
    "conditions": [
      {"field": "genre", "operator": "contains", "value": "Rock"},
      {"field": "release_year", "operator": "between", "value": [1980, 1989]},
      {
        "match": "any",  // Nested group with OR
        "conditions": [
          {"field": "artist", "operator": "contains", "value": "Van Halen"},
          {"field": "artist", "operator": "contains", "value": "Bon Jovi"}
        ]
      }
    ]
  }
  ```
- **Advanced Examples**:
  ```json
  {"field": "release_year", "operator": "years_ago", "value": 10}
  {"field": "artist", "operator": "same_as", "value": "playlist:uuid"}
  {"field": "similar_to", "operator": "top_n", "value": {"sha_id": "abc...", "count": 10}}
  ```
- **Supported Fields**: title, artist, album, genre, release_year, duration_sec, track_number, added_at, play_count, last_played, skip_count, completion_rate, last_week_plays, trending, declining, is_liked, is_disliked, has_embedding, bpm, energy, danceability, key, key_mode, mood, similar_to, verified
- **Supported Operators**: equals, not_equals, contains, not_contains, starts_with, ends_with, regex, greater, greater_or_equal, less, less_or_equal, between, in_list, not_in_list, is_true, is_false, is_null, is_not_null, before, after, within_days, years_ago, same_as, top_n, never
- **Default Templates**: Recently Added, Heavy Rotation, Forgotten Favorites, Never Played, Short Songs, Long Songs, Top Rated, Frequently Skipped
- **Usage**:
  ```bash
  # Create smart playlist
  curl -X POST http://localhost:8000/api/playlists/smart \
    -H "Content-Type: application/json" \
    -d '{
      "name": "80s Rock Classics",
      "description": "Rock songs from the 1980s",
      "rules": {
        "version": 1,
        "match": "all",
        "conditions": [
          {"field": "genre", "operator": "contains", "value": "Rock"},
          {"field": "release_year", "operator": "between", "value": [1980, 1989]}
        ]
      },
      "sort_by": "release_year",
      "sort_order": "asc"
    }'

  # List smart playlists
  curl http://localhost:8000/api/playlists/smart

  # Get templates
  curl http://localhost:8000/api/playlists/smart/templates

  # Create from template
  curl -X POST http://localhost:8000/api/playlists/smart/from-template/{template_id} \
    -H "Content-Type: application/json" \
    -d '{"name": "My Recently Added"}'

  # Preview rules
  curl -X POST http://localhost:8000/api/playlists/smart/preview \
    -H "Content-Type: application/json" \
    -d '{
      "rules": {"version": 1, "match": "all", "conditions": [{"field": "play_count", "operator": "greater", "value": 5}]},
      "limit": 20
    }'

  # Get playlist with songs
  curl http://localhost:8000/api/playlists/smart/{playlist_id}

  # Refresh playlist
  curl -X POST http://localhost:8000/api/playlists/smart/{playlist_id}/refresh \
    -H "Content-Type: application/json" \
    -d '{"liked_song_ids": ["sha1", "sha2"], "disliked_song_ids": []}'

  # Get rule explanation
  curl http://localhost:8000/api/playlists/smart/{playlist_id}/explain
  ```

### backend/api/routes/features.py
- **Purpose**: Audio feature extraction API (BPM, key, energy, mood, danceability, acousticness)
- **Endpoints**:
  - `GET /api/features/{sha_id}`: Get extracted features for a specific song
  - `GET /api/features/stats/summary`: Get analysis statistics (analyzed, pending, failed counts)
  - `POST /api/features/analyze`: Start batch feature analysis
  - `GET /api/features/analyze/stream`: SSE stream for analysis progress
  - `POST /api/features/analyze/stop`: Stop ongoing analysis
  - `GET /api/features/pending`: Get list of songs needing analysis
  - `GET /api/features/failed`: Get list of songs where analysis failed
  - `POST /api/features/{sha_id}/reanalyze`: Re-analyze features for a specific song
- **Feature Fields**:
  - `bpm`: Tempo in beats per minute (30-300, normalized to 60-180)
  - `bpm_confidence`: Confidence score (0-1)
  - `key`: Musical key (C, C#, D, etc.)
  - `key_mode`: Major or Minor
  - `key_camelot`: Camelot wheel notation (8B, 12A, etc.)
  - `key_confidence`: Key detection confidence (0-1)
  - `energy`: Energy/intensity score (0-100)
  - `mood_primary`: Primary mood category (happy, sad, energetic, calm, etc.)
  - `mood_secondary`: Secondary mood if applicable
  - `danceability`: Danceability score (0-100)
  - `acousticness`: Acoustic vs electronic score (0-100, 100=acoustic)
  - `instrumentalness`: Vocal presence (0-100, 100=instrumental)
- **Usage**:
  ```bash
  # Get features for a song
  curl http://localhost:8000/api/features/{sha_id}

  # Get analysis statistics
  curl http://localhost:8000/api/features/stats/summary

  # Start batch analysis (use SSE stream for progress)
  curl -N http://localhost:8000/api/features/analyze/stream?limit=50

  # Stop ongoing analysis
  curl -X POST http://localhost:8000/api/features/analyze/stop

  # Get songs pending analysis
  curl http://localhost:8000/api/features/pending?limit=20

  # Re-analyze a specific song
  curl -X POST http://localhost:8000/api/features/{sha_id}/reanalyze
  ```

### backend/api/events/library_events.py
- **Purpose**: Thread-safe event hub for library and smart playlist refresh events
- **Used By**: Auto-refresh scheduler, refresh SSE stream
- **Helpers**:
  - `emit_library_event(event_type, sha_id, payload)`: Broadcast a library event
  - `get_library_event_hub()`: Subscribe to event stream consumers

### backend/services/rule_engine.py
- **Purpose**: Parse, validate, and compile smart playlist rules to SQL
- **Key Classes**:
  - `RuleEngine`: Main engine for rule processing
  - `Condition`: Single rule condition (field, operator, value)
  - `ConditionGroup`: Group of conditions with AND/OR logic
  - `Operator`: Enum of supported operators
- **Key Methods**:
  - `parse(rules_json)`: Parse JSON rules to typed AST
  - `validate(rules)`: Validate rules and return warnings
  - `compile_to_sql(rules, liked_ids, disliked_ids)`: Compile to SQL WHERE clause
  - `explain(rules)`: Generate human-readable explanation
- **Features**:
  - Nested condition groups with unlimited depth (capped at 3 for safety)
  - Type-aware operator validation
  - SQL injection protection
  - External field support (likes/dislikes from frontend)
  - Computed field support (play statistics via CTEs)
  - Advanced operators (years_ago, same_as, top_n similarity)
  - Audio feature fields (bpm, energy, danceability, key, mood)

### backend/services/playlist_refresher.py
- **Purpose**: Execute smart playlist rules and cache results
- **Key Methods**:
  - `refresh_single(playlist_id, liked_ids, disliked_ids)`: Refresh one playlist
  - `refresh_all(liked_ids, disliked_ids)`: Refresh all auto-refresh playlists
  - `preview_rules(rules, sort_by, sort_order, limit, ...)`: Preview without saving
  - `explain_rules(rules, ...)`: Return EXPLAIN plan for a rules query
- **Features**:
  - Query timeout (30 seconds) to prevent runaway queries
  - Efficient CTE-based queries for play statistics
  - Atomic updates with transaction handling
  - Automatic stat updates after refresh
  - Playlist reference resolution (`same_as`) and similarity rule support
  - Preview caching for hot rule edits

### backend/services/playlist_refresh_scheduler.py
- **Purpose**: Debounced auto-refresh worker for smart playlists
- **Triggers**: Library changes, play history updates, preference syncs
- **Features**:
  - Event batching with debounce window
  - Auto-refresh filtering by rule fields
  - Emits refresh status events for SSE streaming

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

### metadata.audio_features
- **Purpose**: Optional audio feature table (bpm, energy, danceability, key, mood) for smart playlist rules.
- **Notes**: Populated by the audio feature extraction pipeline when enabled.

### backend/db/local_postgres.py
- **Purpose**: Initialize and start a local Postgres cluster under `.metadata/` and create both databases.
- **Requires**: `initdb`, `pg_ctl`, `psql`, `createdb` on PATH, plus the pgvector extension installed. The bootstrap auto-detects `pg_config`, Homebrew/Postgres.app, and asdf installs; set `POSTGRES_BIN_DIR` if detection fails.
- **Usage**:
  ```bash
  python backend/db/local_postgres.py ensure
  eval "$(python backend/db/local_postgres.py env)"
  ```
- **Stale State Cleanup**: On startup, clears stale `postmaster.pid` and socket files and attempts to remove the shared memory segment recorded in `postmaster.pid`. If you still see `pre-existing shared memory block`, run `ipcrm -m <id>` (from `.metadata/postgres/data/postmaster.pid`) or reboot, then delete `.metadata/postgres/run/.s.PGSQL.*`.
- **Bootstrap Lock**: Uses `.metadata/postgres/cluster.lock` to serialize local Postgres startup and prevent concurrent clusters. Set `SONGBASE_DB_LOCK_TIMEOUT` to tune the wait time (seconds).
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
- **Optional**: Add `--features` to extract audio features (BPM, key, mood, etc.) after processing. Use `--features-limit N` to limit the number of songs analyzed.
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

### backend/processing/feature_pipeline/
- **Purpose**: Extract audio features (BPM, key, energy, mood, danceability, acousticness) from audio files
- **Key Modules**:
  - `config.py`: Feature extraction configuration (sample rates, normalization bounds, weights)
  - `pipeline.py`: Main orchestration for loading audio and running extractors
  - `cli.py`: Command-line interface for batch feature extraction
  - `db.py`: Database integration (save/load features, batch processing from DB)
  - `extractors/`: Individual feature extractors
    - `base.py`: BaseExtractor ABC and ExtractionResult dataclass
    - `bpm.py`: BPM detection using librosa beat tracking
    - `key.py`: Musical key/mode detection using Krumhansl-Schmuckler profiles
    - `energy.py`: Energy/intensity extraction (RMS, spectral centroid, onset rate)
    - `mood.py`: Rule-based mood classification (happy, sad, energetic, calm, etc.)
    - `danceability.py`: Danceability scoring (beat strength, tempo stability, groove)
    - `acoustic.py`: Acoustic vs electronic detection and instrumentalness
  - `utils/`: Utility modules
    - `audio_loader.py`: Audio file loading with format support and preprocessing
    - `normalization.py`: Feature value normalization utilities
    - `aggregation.py`: Aggregate results from multiple extractors
- **Supported Input Formats**: MP3, WAV, FLAC, OGG, M4A, AAC
- **Dependencies**: librosa, soundfile, scipy (added to requirements.txt)
- **Usage**:
  ```bash
  # Extract features from a single file
  python -m backend.processing.feature_pipeline.cli song.mp3

  # Process all files in a directory recursively
  python -m backend.processing.feature_pipeline.cli ./music/ -r -o features.json

  # Programmatic usage
  from backend.processing.feature_pipeline import FeaturePipeline, extract_features

  # Quick extraction
  features = extract_features("song.mp3")
  # Returns: {"bpm": 120, "key": "C", "mode": "Major", "energy": 75, ...}

  # Full pipeline with options
  pipeline = FeaturePipeline()
  result = pipeline.extract_from_file("song.mp3", include_metadata=True)
  print(result.to_db_columns())  # For database storage
  ```
- **Extracted Features**:
  - `bpm`: Integer 60-180 (tempo in beats per minute)
  - `key`: String (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  - `mode`: String (Major or Minor)
  - `camelot`: String (DJ-friendly key notation, e.g., "8A", "11B")
  - `energy`: Integer 0-100 (overall intensity)
  - `danceability`: Integer 0-100 (how suitable for dancing)
  - `acousticness`: Integer 0-100 (acoustic vs electronic)
  - `instrumentalness`: Integer 0-100 (instrumental vs vocal)
  - `mood`: String (happy, sad, energetic, calm, aggressive, romantic, dark, uplifting)

### backend/processing/metadata_pipeline/
- **Purpose**: Verify and enrich unverified songs via multi-source metadata and automatic image fetching
- **Key Modules**:
  - `album_pipeline.py`: Album metadata + track list ingestion
  - `cli.py`: Command-line interface for verification
  - `config.py`: Configuration for MusicBrainz, Spotify, Wikidata, Discogs APIs
  - `discogs_client.py`: Discogs API client for metadata, genres/styles, and cover art
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
- **Purpose**: Manage song acquisition from local files and queue processing
- **Key Modules**:
  - `cli.py`: Command-line interface for acquisition
  - `config.py`: Cache locations and discovery settings
  - `db.py`: Download queue helpers (reads `metadata.download_queue`)
    - **Automatic cleanup**: Songs are automatically removed from the queue when they reach "stored" or "duplicate" status to prevent duplication
  - `discovery.py`: Song list discovery + sources.jsonl writer
  - `discovery_providers.py`: External discovery routines (MusicBrainz, hotlists)
  - `io.py`: Writes JSON metadata sidecars
  - `importer.py`: Local file import into the queue
  - `pipeline.py`: Pipeline orchestration
  - `sources.py`: Extendable JSONL song list ingestion
  - `sources.jsonl`: Default song source list
- **Note**: External downloading has been removed. Use local file import via the Manage Library UI.

### backend/processing/acquisition_pipeline/cli.py
- **Purpose**: Seed the download queue from sources file
- **Requires**: `SONGBASE_DATABASE_URL` set
- **Sources File Format** (`backend/processing/acquisition_pipeline/sources.jsonl`):
  ```json
  {"title": "Example Song", "artist": "Example Artist", "search_query": "Example Artist - Example Song"}
  ```

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
- **Notes**: Uses the local Python wrapper to create a `.venv`, install dependencies, and bootstrap local Postgres when database URLs are missing. Sets `SONGBASE_SKIP_DB_BOOTSTRAP=1` to avoid double-bootstrapping in the backend process.

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
5. **Discogs** - Comprehensive music database with genres, styles, and cover art (requires API credentials)

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

#### Discogs API Setup (Optional)

To enable Discogs as a metadata source, you need to register an application:

1. Go to [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Create a new application (any name/description)
3. You have two authentication options:
   - **Personal Access Token** (recommended for single-user): Generate a token from the Developers page
   - **Consumer Key/Secret**: For OAuth-based authentication

4. Set environment variables:

```bash
# Option 1: Personal Access Token (simpler)
export DISCOGS_USER_TOKEN="your_personal_access_token"

# Option 2: Consumer Key/Secret
export DISCOGS_CONSUMER_KEY="your_consumer_key"
export DISCOGS_CONSUMER_SECRET="your_consumer_secret"
```

**Discogs Features:**
- Release metadata (album, year, label, catalog number)
- Track listings with durations
- Genre and style tags (more granular than other sources)
- High-quality cover art
- Country and format information (CD, Vinyl, Digital, etc.)

**Rate Limits:** 60 requests/minute (authenticated), 25 requests/minute (unauthenticated)

#### Wikidata

Wikidata is enabled by default and requires no API keys. It queries the free Wikidata API and Wikimedia Commons for artist images.

### How It Works

The pipeline tries multiple sources in order until it finds the requested data:

**For Metadata Verification:**
1. MusicBrainz (primary source with comprehensive recording database)
2. Spotify (if configured, provides high-confidence matches)
3. Discogs (if configured, provides rich genre/style information)

**For Artist Images:**
1. MusicBrainz URL relations (if artist has image link)
2. Wikidata (via MusicBrainz Wikidata link if available)
3. Wikidata search (by artist name)
4. Spotify (if configured)
5. Discogs (if configured)

**For Album Cover Art:**
1. Cover Art Archive (via MusicBrainz release ID)
2. Spotify (if configured)
3. Discogs (if configured, via release ID)

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
