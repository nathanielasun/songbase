#!/bin/bash
# Icon generation script for Songbase desktop application
# Generates icons for macOS, Windows, and Linux from a source PNG

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="${ROOT_DIR}/build"
ICONS_DIR="${BUILD_DIR}/icons"
SOURCE_ICON="${ROOT_DIR}/frontend/public/icon.png"

# Create directories
mkdir -p "$BUILD_DIR" "$ICONS_DIR"

# Check for source icon
if [ ! -f "$SOURCE_ICON" ]; then
    echo "Source icon not found at $SOURCE_ICON"
    echo "Generating placeholder icon..."

    # Try to generate with Python PIL
    python3 << 'PYTHON_SCRIPT'
from PIL import Image, ImageDraw, ImageFont
import os

size = 1024
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw gradient background (purple to pink)
for y in range(size):
    r = int(139 + (236 - 139) * y / size)
    g = int(92 + (72 - 92) * y / size)
    b = int(246 + (153 - 246) * y / size)
    for x in range(size):
        # Circular mask
        dx, dy = x - size//2, y - size//2
        if dx*dx + dy*dy <= (size//2 - 20)**2:
            draw.point((x, y), fill=(r, g, b, 255))

# Draw music note symbol
note_color = (255, 255, 255, 255)
cx, cy = size // 2, size // 2

# Note head (ellipse)
draw.ellipse([cx - 120, cy + 50, cx + 40, cy + 180], fill=note_color)
# Stem
draw.rectangle([cx + 20, cy - 200, cx + 40, cy + 100], fill=note_color)
# Flag
draw.polygon([
    (cx + 40, cy - 200),
    (cx + 150, cy - 100),
    (cx + 150, cy - 50),
    (cx + 40, cy - 100)
], fill=note_color)

output_path = os.path.join(os.environ.get('ROOT_DIR', '.'), 'frontend/public/icon.png')
os.makedirs(os.path.dirname(output_path), exist_ok=True)
img.save(output_path, 'PNG')
print(f"Generated icon at {output_path}")
PYTHON_SCRIPT

    if [ $? -ne 0 ]; then
        echo "Failed to generate icon with Python. Please install Pillow: pip install Pillow"
        echo "Or provide a 1024x1024 PNG at $SOURCE_ICON"
        exit 1
    fi
fi

echo "Source icon: $SOURCE_ICON"

# Check for required tools
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "Warning: $1 not found. Some icons may not be generated."
        return 1
    fi
    return 0
}

# Determine ImageMagick command (v7 uses 'magick', v6 uses 'convert')
get_magick_cmd() {
    if command -v magick &> /dev/null; then
        echo "magick"
    elif command -v convert &> /dev/null; then
        echo "convert"
    else
        echo ""
    fi
}

MAGICK_CMD=$(get_magick_cmd)

# Generate Linux icons (multiple sizes)
echo "Generating Linux icons..."
if [ -n "$MAGICK_CMD" ]; then
    for size in 16 24 32 48 64 128 256 512 1024; do
        $MAGICK_CMD "$SOURCE_ICON" -resize ${size}x${size} "${ICONS_DIR}/${size}x${size}.png"
        echo "  Created ${size}x${size}.png"
    done
else
    echo "  Skipping Linux icons (ImageMagick not installed)"
fi

# Generate Windows ICO
echo "Generating Windows icon..."
if [ -n "$MAGICK_CMD" ]; then
    $MAGICK_CMD "$SOURCE_ICON" \
        -define icon:auto-resize=256,128,64,48,32,16 \
        "${BUILD_DIR}/icon.ico"
    echo "  Created icon.ico"
else
    echo "  Skipping Windows icon (ImageMagick not installed)"
fi

# Generate macOS ICNS
echo "Generating macOS icon..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    ICONSET_DIR="${BUILD_DIR}/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    if check_command sips; then
        sips -z 16 16     "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_16x16.png"
        sips -z 32 32     "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_16x16@2x.png"
        sips -z 32 32     "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_32x32.png"
        sips -z 64 64     "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_32x32@2x.png"
        sips -z 128 128   "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_128x128.png"
        sips -z 256 256   "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_128x128@2x.png"
        sips -z 256 256   "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_256x256.png"
        sips -z 512 512   "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_256x256@2x.png"
        sips -z 512 512   "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_512x512.png"
        sips -z 1024 1024 "$SOURCE_ICON" --out "${ICONSET_DIR}/icon_512x512@2x.png"

        iconutil -c icns "$ICONSET_DIR" -o "${BUILD_DIR}/icon.icns"
        rm -rf "$ICONSET_DIR"
        echo "  Created icon.icns"
    else
        echo "  Skipping macOS icon (sips not available)"
    fi
else
    echo "  Skipping macOS icon (not on macOS)"
    # Try with ImageMagick as fallback
    if [ -n "$MAGICK_CMD" ]; then
        echo "  Attempting with ImageMagick..."
        $MAGICK_CMD "$SOURCE_ICON" -resize 1024x1024 "${BUILD_DIR}/icon.icns"
        echo "  Created icon.icns (may need conversion on macOS)"
    fi
fi

echo ""
echo "Icon generation complete!"
echo "Generated files:"
ls -la "$BUILD_DIR"/icon.* 2>/dev/null || true
ls -la "$ICONS_DIR"/*.png 2>/dev/null | head -5 || true
