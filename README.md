# songbase
A platform for users to curate their own personalized music streaming platform

## Architecture

- **Frontend**: Next.js + TypeScript + Tailwind CSS (port 3000)
- **Backend API**: FastAPI (port 8000)
- **Processing**: Python audio processing modules (MP3→PCM, VGGish tokenization)

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.8+
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
uvicorn backend.api.app:app --reload --port 8000
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
│       └── audio_pipeline/
├── songs/             # Music library (MP3 files)
├── .song_cache/       # SHA-256 hashed song database
└── STATUS/            # Project planning and status docs
```

## Development

The frontend proxies API requests to the backend automatically. API calls to `/api/*` from the frontend are forwarded to `http://localhost:8000/api/*`.

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
