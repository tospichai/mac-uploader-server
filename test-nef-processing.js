import fs from 'fs';
import path from 'path';
import { processImage } from './services/imageService.js';
import { logInfo, logError } from './middleware/logger.js';

async function testNEFProcessing() {
  try {
    console.log('🔍 Starting NEF processing test...');
    console.log('=====================================');

    // You'll need to replace this with an actual NEF file path
    const nefFilePath = './test-files/sample.nef';

    if (!fs.existsSync(nefFilePath)) {
      console.log(`❌ Test NEF file not found at: ${nefFilePath}`);
      console.log('📝 Please place a NEF file at ./test-files/sample.nef to run this test');
      console.log('');
      console.log('🔧 Before testing, make sure to run the installation script:');
      console.log('   chmod +x ./install-macos-raw-support.sh');
      console.log('   ./install-macos-raw-support.sh');
      return;
    }

    // Get original file size
    const originalStats = fs.statSync(nefFilePath);
    console.log(`📁 Original NEF file: ${nefFilePath}`);
    console.log(`📏 Original file size: ${(originalStats.size / 1024 / 1024).toFixed(2)} MB`);

    const fileBuffer = fs.readFileSync(nefFilePath);
    const file = {
      buffer: fileBuffer,
      mimetype: 'image/x-nikon-nef'
    };

    const filename = path.basename(nefFilePath);

    console.log(`🔄 Processing NEF file: ${filename}`);
    const startTime = Date.now();
    const result = await processImage(file, filename);
    const processingTime = Date.now() - startTime;

    console.log(`✅ Processing completed in ${processingTime}ms`);
    console.log(`🔄 Was processed: ${result.processed}`);
    console.log(`📄 Output mimetype: ${result.mimetype}`);
    console.log(`📐 Original format: ${result.originalFormat || 'Unknown'}`);

    // Save the processed image for inspection
    const outputPath = './test-files/processed-output.jpg';
    fs.writeFileSync(outputPath, result.buffer);

    const outputStats = fs.statSync(outputPath);
    console.log(`💾 Processed image saved to: ${outputPath}`);
    console.log(`📏 Output file size: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Get metadata to verify dimensions
    const { getImageMetadata } = await import('./services/imageService.js');
    const metadata = await getImageMetadata(result.buffer);
    console.log(`📐 Final image dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`🎨 Image format: ${metadata.format}`);
    console.log(`📊 Has alpha channel: ${metadata.hasAlpha}`);
    console.log(`🔄 Orientation: ${metadata.orientation || 'N/A'}`);

    // Quality assessment
    const aspectRatio = (metadata.width / metadata.height).toFixed(2);
    const compressionRatio = ((originalStats.size / outputStats.size).toFixed(2));

    console.log('');
    console.log('📊 Quality Assessment:');
    console.log(`   Aspect ratio: ${aspectRatio}`);
    console.log(`   Compression ratio: ${compressionRatio}:1`);
    console.log(`   Expected max width: 2048px`);
    console.log(`   Actual width: ${metadata.width}px`);

    if (metadata.width <= 2048) {
      console.log('✅ Width is within expected range');
    } else {
      console.log('⚠️  Width exceeds expected range');
    }

    console.log('');
    console.log('🎉 Test completed successfully!');
    console.log(`📁 Check the output file at: ${outputPath}`);

  } catch (error) {
    console.error('❌ NEF processing test failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting tips:');
    console.error('1. Make sure you ran the installation script:');
    console.error('   ./install-macos-raw-support.sh');
    console.error('2. Check that Homebrew is installed');
    console.error('3. Verify libraw is properly installed');
    console.error('4. Try rebuilding Sharp: npm install --build-from-source sharp');
  }
}

// Create test-files directory if it doesn't exist
if (!fs.existsSync('./test-files')) {
  fs.mkdirSync('./test-files');
  console.log('📁 Created test-files directory');
}

testNEFProcessing();