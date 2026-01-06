#!/bin/bash
set -e

echo "=================================="
echo "Building Songbase Desktop App"
echo "=================================="

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "Step 1/4: Building FastAPI backend binary with PyInstaller..."
echo "--------------------------------------"

# Check if pyinstaller is installed
if ! command -v pyinstaller &> /dev/null; then
    echo "PyInstaller not found. Installing..."
    pip install pyinstaller
fi

# Build the backend binary
pyinstaller songbase-api.spec --clean

if [ ! -f "dist/songbase-api" ]; then
    echo "ERROR: Backend binary build failed!"
    exit 1
fi

echo "✓ Backend binary built successfully"

echo ""
echo "Step 2/4: Building Next.js frontend..."
echo "--------------------------------------"

cd frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Build frontend for Electron (static export)
BUILD_TARGET=electron npm run build

if [ ! -d "out" ]; then
    echo "ERROR: Frontend build failed!"
    exit 1
fi

echo "✓ Frontend built successfully"

cd "$PROJECT_ROOT"

echo ""
echo "Step 3/4: Installing Electron dependencies..."
echo "--------------------------------------"

# Install root package.json dependencies (Electron)
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found in project root!"
    exit 1
fi

npm install

echo "✓ Dependencies installed"

echo ""
echo "Step 4/4: Packaging Electron app..."
echo "--------------------------------------"

# Package the Electron app
npm run electron:build

echo ""
echo "=================================="
echo "Build Complete!"
echo "=================================="
echo ""
echo "Desktop app location:"
ls -lh dist-electron/*.dmg dist-electron/*.AppImage dist-electron/*.exe 2>/dev/null || echo "Check dist-electron/ directory"
echo ""
