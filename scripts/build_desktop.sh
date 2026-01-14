#!/bin/bash
# Songbase Desktop Application Build Script
# Builds cross-platform desktop application for macOS, Windows, and Linux

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="${ROOT_DIR}/dist"
BUILD_DIR="${ROOT_DIR}/build"
FRONTEND_DIR="${ROOT_DIR}/frontend"

# Default options
SKIP_ICONS=false
SKIP_POSTGRES=false
SKIP_BACKEND=false
SKIP_FRONTEND=false
PLATFORM=""
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-icons)
            SKIP_ICONS=true
            shift
            ;;
        --skip-postgres)
            SKIP_POSTGRES=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-icons      Skip icon generation"
            echo "  --skip-postgres   Skip PostgreSQL bundle"
            echo "  --skip-backend    Skip backend build"
            echo "  --skip-frontend   Skip frontend build"
            echo "  --platform PLAT   Build for specific platform (mac, win, linux, all)"
            echo "  --verbose, -v     Verbose output"
            echo "  --help, -h        Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

# Prerequisites check
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()

    if ! check_command python3; then
        missing+=("python3")
    fi

    if ! check_command node; then
        missing+=("node")
    fi

    if ! check_command npm; then
        missing+=("npm")
    fi

    # Only check for PyInstaller if backend build is not skipped
    if [ "$SKIP_BACKEND" != true ]; then
        if ! python3 -c "import PyInstaller" 2>/dev/null; then
            missing+=("PyInstaller (pip install pyinstaller)")
        fi
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing prerequisites: ${missing[*]}"
        exit 1
    fi

    log_success "All prerequisites found"
}

# Build icons
build_icons() {
    if [ "$SKIP_ICONS" = true ]; then
        log_info "Skipping icon generation (--skip-icons)"
        return
    fi

    log_info "Generating application icons..."

    if [ -f "${ROOT_DIR}/scripts/build_icons.sh" ]; then
        ROOT_DIR="$ROOT_DIR" bash "${ROOT_DIR}/scripts/build_icons.sh"
        log_success "Icons generated"
    else
        log_warn "Icon build script not found, skipping"
    fi
}

# Build PostgreSQL bundle
build_postgres_bundle() {
    if [ "$SKIP_POSTGRES" = true ]; then
        log_info "Skipping PostgreSQL bundle (--skip-postgres)"
        return
    fi

    log_info "Building PostgreSQL bundle..."

    # Check if pg_config is available
    if ! check_command pg_config; then
        log_warn "pg_config not found, skipping PostgreSQL bundle"
        log_warn "Install PostgreSQL or provide a pre-built bundle"
        return
    fi

    # Create bundle directory
    mkdir -p "${ROOT_DIR}/.metadata/postgres_bundle"

    # Run the bundle builder
    cd "$ROOT_DIR"
    if python3 -m backend.db.build_postgres_bundle \
        --output "${ROOT_DIR}/.metadata/postgres_bundle/postgres.tar.gz" \
        --write-manifest; then
        log_success "PostgreSQL bundle created"
    else
        log_warn "PostgreSQL bundle creation failed"
    fi
}

# Build backend binary
build_backend() {
    if [ "$SKIP_BACKEND" = true ]; then
        log_info "Skipping backend build (--skip-backend)"
        return
    fi

    log_info "Building backend binary with PyInstaller..."

    cd "$ROOT_DIR"

    # Activate virtual environment if it exists
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi

    # Clean previous builds
    rm -rf "${DIST_DIR}/songbase-api" build/songbase-api 2>/dev/null || true

    # Run PyInstaller
    if [ "$VERBOSE" = true ]; then
        pyinstaller --clean --noconfirm songbase-api.spec
    else
        pyinstaller --clean --noconfirm songbase-api.spec 2>&1 | tail -20
    fi

    # Verify build
    if [ -d "${DIST_DIR}/songbase-api" ]; then
        log_success "Backend binary built successfully"
        log_info "Binary location: ${DIST_DIR}/songbase-api"
    else
        log_error "Backend build failed"
        exit 1
    fi
}

# Build frontend
build_frontend() {
    if [ "$SKIP_FRONTEND" = true ]; then
        log_info "Skipping frontend build (--skip-frontend)"
        return
    fi

    log_info "Building frontend for Electron..."

    cd "$FRONTEND_DIR"

    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm ci
    fi

    # Build Next.js production build (not static export)
    # Electron will run Next.js as a local server
    npm run build

    # Verify build
    if [ -d "${FRONTEND_DIR}/.next" ]; then
        log_success "Frontend built successfully"
        log_info "Output location: ${FRONTEND_DIR}/.next"
    else
        log_error "Frontend build failed"
        exit 1
    fi
}

# Package with Electron Builder
package_electron() {
    log_info "Packaging with Electron Builder..."

    cd "$ROOT_DIR"

    # Install root dependencies
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "Installing Electron dependencies..."
        npm install
    fi

    # Install notarization dependency if on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        npm install --save-dev @electron/notarize 2>/dev/null || true
    fi

    # Determine platform flags
    local platform_flags=""
    case "$PLATFORM" in
        mac|macos|darwin)
            platform_flags="--mac"
            ;;
        win|windows)
            platform_flags="--win"
            ;;
        linux)
            platform_flags="--linux"
            ;;
        "")
            # Build for current platform
            case "$OSTYPE" in
                darwin*)
                    platform_flags="--mac"
                    ;;
                linux*)
                    platform_flags="--linux"
                    ;;
                msys*|cygwin*|win*)
                    platform_flags="--win"
                    ;;
            esac
            ;;
        all)
            platform_flags="--mac --win --linux"
            ;;
        *)
            log_error "Unknown platform: $PLATFORM"
            exit 1
            ;;
    esac

    log_info "Building for: $platform_flags"

    # Run electron-builder
    if [ "$VERBOSE" = true ]; then
        npx electron-builder $platform_flags --config electron-builder.yml
    else
        npx electron-builder $platform_flags --config electron-builder.yml 2>&1 | tail -30
    fi

    log_success "Electron packaging complete!"
}

# Print build summary
print_summary() {
    echo ""
    echo "========================================"
    echo "           BUILD COMPLETE"
    echo "========================================"
    echo ""

    if [ -d "${ROOT_DIR}/dist-electron" ]; then
        log_info "Build artifacts:"
        ls -la "${ROOT_DIR}/dist-electron/"* 2>/dev/null | grep -E '\.(dmg|exe|AppImage|deb|rpm|zip)$' || echo "  (checking...)"

        echo ""
        log_info "To install:"
        echo "  macOS:   Open dist-electron/Songbase-*.dmg"
        echo "  Windows: Run dist-electron/Songbase-*.exe"
        echo "  Linux:   Run dist-electron/Songbase-*.AppImage"
    else
        log_warn "No build artifacts found in dist-electron/"
    fi

    echo ""
}

# Main build process
main() {
    echo "========================================"
    echo "    Songbase Desktop Build"
    echo "========================================"
    echo ""

    check_prerequisites
    echo ""

    build_icons
    echo ""

    build_postgres_bundle
    echo ""

    build_backend
    echo ""

    build_frontend
    echo ""

    package_electron

    print_summary
}

# Run main
main
