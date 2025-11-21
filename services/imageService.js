import sharp from 'sharp';
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { isDirectUploadAllowed, isNEFFile, getFileExtension } from '../utils/fileUtils.js';
import {
  IMAGE_MAX_WIDTH,
  JPEG_QUALITY,
  PROGRESSIVE_JPEG,
  ERROR_MESSAGES
} from '../config/constants.js';
import { createValidationError } from '../middleware/errorHandler.js';
import { logInfo, logError, logPerformance } from '../middleware/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Process image based on file type
 * @param {Object} file - File object with buffer and mimetype
 * @param {string} filename - Original filename
 * @returns {Promise<Object>} - Processed image data
 */
export async function processImage(file, filename) {
  const startTime = Date.now();

  try {
    if (!file || !file.buffer) {
      throw createValidationError('Invalid file data');
    }

    logInfo(`Processing file: ${filename}`, 'ImageService');

    // If it's already a supported format (jpg, jpeg, png), return as-is
    if (isDirectUploadAllowed(filename)) {
      logPerformance('Direct upload allowed', startTime, 'ImageService');
      return {
        buffer: file.buffer,
        mimetype: file.mimetype || 'image/jpeg',
        processed: false
      };
    }

    // If it's NEF file, convert to JPG with optimization
    if (isNEFFile(filename)) {
      logInfo(`Converting NEF file: ${filename}`, 'ImageService');
      const result = await convertNEFToJPG(file.buffer);
      logPerformance('NEF conversion', startTime, 'ImageService');
      return {
        ...result,
        processed: true,
        originalFormat: 'NEF'
      };
    }

    // If it's another unsupported format, try to convert to JPG
    logInfo(`Attempting to convert unsupported file: ${filename}`, 'ImageService');
    const result = await convertToJPG(file.buffer);
    logPerformance('Format conversion', startTime, 'ImageService');
    return {
      ...result,
      processed: true,
      originalFormat: getFileExtension(filename)
    };

  } catch (error) {
    logError(error, 'ImageService.processImage');

    if (error.name === 'AppError') {
      throw error;
    }

    if (isNEFFile(filename)) {
      throw createValidationError(`${ERROR_MESSAGES.FAILED_TO_PROCESS_NEF}: ${error.message}`);
    }

    throw createValidationError(`${ERROR_MESSAGES.UNSUPPORTED_FORMAT}: ${getFileExtension(filename)}`);
  }
}

/**
 * Convert NEF file to JPG
 * @param {Buffer} buffer - NEF file buffer
 * @returns {Promise<Object>} - Converted image data
 */
async function convertNEFToJPG(buffer) {
  // NOTE: อย่าใช้ sharp(buffer) กับ NEF โดยตรง เพราะจะได้แค่ thumbnail
  const tmpDir = os.tmpdir();
  const nefPath = path.join(tmpDir, `nef-${Date.now()}.nef`);
  const tiffPath = nefPath.replace(/\.nef$/, ".tiff");

  try {
    logInfo("Starting NEF → TIFF via dcraw ...", "ImageService");

    // 1) เขียน buffer NEF ลงไฟล์ชั่วคราวก่อน
    await fs.writeFile(nefPath, buffer);

    // 2) ใช้ dcraw แปลง NEF → TIFF (16-bit, full-res, white balance จากกล้อง)
    // -T  : output เป็น TIFF
    // -o 1: sRGB color space
    // -q 3: high quality demosaic
    // -w  : ใช้ camera white balance
    await execFileAsync("dcraw", ["-T", "-o", "1", "-q", "3", "-w", nefPath]);

    // dcraw จะสร้างไฟล์ .tiff ชื่อเดียวกันกับ .nef
    // เช่น xxx.nef → xxx.tiff
    logInfo(`dcraw finished, TIFF path: ${tiffPath}`, "ImageService");

    // 3) ใช้ sharp อ่าน TIFF (full resolution แล้ว)
    const tiffSharp = sharp(tiffPath);
    const meta = await tiffSharp.metadata();
    logInfo(
      `Decoded TIFF from NEF: ${meta.width}x${meta.height}, depth: ${meta.depth}`,
      "ImageService"
    );

    // 4) สร้าง pipeline resize (ถ้าต้องการจำกัดความกว้าง)
    let pipeline = tiffSharp;

    if (meta.width && meta.width > IMAGE_MAX_WIDTH) {
      pipeline = pipeline.resize({
        width: IMAGE_MAX_WIDTH,
        height: null,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
    }

    // 5) แปลงเป็น JPEG คุณภาพสูง
    const processedBuffer = await pipeline
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: PROGRESSIVE_JPEG,
        chromaSubsampling: "4:2:0",
        mozjpeg: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        optimiseScans: true,
      })
      .toBuffer();

    const finalMeta = await sharp(processedBuffer).metadata();
    logInfo(
      `Final JPEG from NEF: ${finalMeta.width}x${finalMeta.height}`,
      "ImageService"
    );

    return {
      buffer: processedBuffer,
      mimetype: "image/jpeg",
    };
  } catch (error) {
    logError(error, "ImageService.convertNEFToJPG");
    throw new Error(`NEF conversion failed: ${error.message}`);
  } finally {
    // 6) ลบไฟล์ชั่วคราว
    try {
      await fs.rm(nefPath, { force: true });
      await fs.rm(tiffPath, { force: true });
    } catch (cleanupErr) {
      logInfo(
        `Cleanup temp NEF/TIFF failed: ${cleanupErr.message}`,
        "ImageService"
      );
    }
  }
}

/**
 * Convert any image format to JPG
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} - Converted image data
 */
async function convertToJPG(buffer) {
  try {
    const processedBuffer = await sharp(buffer)
      .resize({
        width: IMAGE_MAX_WIDTH,
        height: null,
        withoutEnlargement: true
      })
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: PROGRESSIVE_JPEG
      })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimetype: 'image/jpeg'
    };
  } catch (error) {
    logError(error, 'ImageService.convertToJPG');
    throw new Error(`Image conversion failed: ${error.message}`);
  }
}

/**
 * Get image metadata
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} - Image metadata
 */
export async function getImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation
    };
  } catch (error) {
    logError(error, 'ImageService.getImageMetadata');
    throw new Error(`Failed to get image metadata: ${error.message}`);
  }
}

/**
 * Resize image to specific dimensions
 * @param {Buffer} buffer - Image buffer
 * @param {number} width - Target width
 * @param {number} height - Target height (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Buffer>} - Resized image buffer
 */
export async function resizeImage(buffer, width, height = null, options = {}) {
  try {
    const resizeOptions = {
      width,
      height: height || null,
      withoutEnlargement: options.withoutEnlargement !== false,
      fit: options.fit || 'cover'
    };

    const processedBuffer = await sharp(buffer)
      .resize(resizeOptions)
      .jpeg({
        quality: options.quality || JPEG_QUALITY,
        progressive: options.progressive !== false
      })
      .toBuffer();

    return processedBuffer;
  } catch (error) {
    logError(error, 'ImageService.resizeImage');
    throw new Error(`Failed to resize image: ${error.message}`);
  }
}