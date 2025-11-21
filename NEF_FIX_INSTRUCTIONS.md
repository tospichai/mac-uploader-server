# NEF File Processing Fix

## Problem
NEF files were being resized from 4024×6048 to 160×120 instead of the expected 2048 width.

## Root Cause
Sharp (the image processing library) wasn't properly handling RAW NEF files due to missing system dependencies and suboptimal configuration.

## Changes Made

### 1. Updated Image Processing Logic (`services/imageService.js`)
- Added metadata logging to track original and processed dimensions
- Changed resize options to better handle RAW files:
  - Set `withoutEnlargement: false` to allow proper resizing
  - Used `fit: 'inside'` to ensure the image fits within the dimensions
  - Used pipeline approach for better control over the processing steps

### 2. Updated Docker Configuration (`Dockerfile`)
- Added required system libraries for RAW file processing:
  - `vips-dev` - Image processing library
  - `libraw-dev` - RAW file format support
  - Build tools (gcc, g++, make, python3) for compiling native modules

### 3. Updated Package Configuration (`package.json`)
- Added postinstall script to ensure Sharp is properly compiled with the new libraries

## How to Apply the Fix

### Option 1: If running with Docker
1. Rebuild the Docker image:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Option 2: If running directly on the server
1. Install system dependencies (Alpine Linux):
   ```bash
   apk add --no-cache vips-dev libraw-dev pkgconfig gcc g++ make python3
   ```
   
   For Ubuntu/Debian:
   ```bash
   apt-get update
   apt-get install -y libvips-dev libraw-dev pkg-config gcc g++ make python3
   ```
   
2. Reinstall Sharp with native compilation:
   ```bash
   npm install --build-from-source sharp
   ```

3. Restart the server:
   ```bash
   npm start
   ```

## Testing
Use the provided test script to verify the fix:
1. Place a NEF file at `./test-files/sample.nef`
2. Run the test:
   ```bash
   node test-nef-processing.js
   ```
3. Check the output for:
   - Original NEF dimensions (should be 4024×6048)
   - Processed JPEG dimensions (should have width of 2048)
   - The processed image saved at `./test-files/processed-output.jpg`

## Expected Results
After applying the fix:
- NEF files should be processed with the correct maximum width of 2048 pixels
- Aspect ratio should be maintained
- Image quality should be preserved with the specified JPEG quality (85%)