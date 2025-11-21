#!/bin/bash

# macOS RAW Processing Support Installation Script
# This script installs the necessary dependencies for NEF file processing

echo "🔧 Installing RAW processing dependencies for macOS..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install Homebrew first:"
    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

# Install required dependencies
echo "📦 Installing libraw and other dependencies..."
brew install libraw vips pkg-config

# Set environment variables for Sharp compilation
echo "🔧 Setting up environment variables..."
export CPPFLAGS="-I$(brew --prefix libraw)/include $CPPFLAGS"
export LDFLAGS="-L$(brew --prefix libraw)/lib $LDFLAGS"
export PKG_CONFIG_PATH="$(brew --prefix libraw)/lib/pkgconfig:$PKG_CONFIG_PATH"

# Rebuild Sharp with RAW support
echo "🔄 Rebuilding Sharp with RAW support..."
npm install --build-from-source sharp

echo "✅ Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Restart your server: npm start"
echo "2. Test with a NEF file using: node test-nef-processing.js"
echo ""
echo "If you encounter any issues, please check the error messages above."