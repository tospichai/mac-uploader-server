import sharp from "sharp";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import {
  isDirectUploadAllowed,
  isNEFFile,
  getFileExtension,
} from "../utils/fileUtils.js";
import {
  IMAGE_MAX_WIDTH,
  JPEG_QUALITY,
  PROGRESSIVE_JPEG,
  ERROR_MESSAGES,
} from "../config/constants.js";
import { createValidationError } from "../middleware/errorHandler.js";
import { logInfo, logError, logPerformance } from "../middleware/logger.js";

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
      throw createValidationError("Invalid file data");
    }

    logInfo(`Processing file: ${filename}`, "ImageService");

    // If it's already a supported format (jpg, jpeg, png), return as-is
    if (isDirectUploadAllowed(filename)) {
      logPerformance("Direct upload allowed", startTime, "ImageService");
      return {
        buffer: file.buffer,
        mimetype: file.mimetype || "image/jpeg",
        processed: false,
      };
    }

    // If it's NEF file, convert to JPG with optimization
    if (isNEFFile(filename)) {
      logInfo(`Converting NEF file: ${filename}`, "ImageService");
      const result = await convertNEFToJPG(file.buffer);
      logPerformance("NEF conversion", startTime, "ImageService");
      return {
        ...result,
        processed: true,
        originalFormat: "NEF",
      };
    }

    // If it's another unsupported format, try to convert to JPG
    logInfo(
      `Attempting to convert unsupported file: ${filename}`,
      "ImageService"
    );
    const result = await convertToJPG(file.buffer);
    logPerformance("Format conversion", startTime, "ImageService");
    return {
      ...result,
      processed: true,
      originalFormat: getFileExtension(filename),
    };
  } catch (error) {
    logError(error, "ImageService.processImage");

    if (error.name === "AppError") {
      throw error;
    }

    if (isNEFFile(filename)) {
      throw createValidationError(
        `${ERROR_MESSAGES.FAILED_TO_PROCESS_NEF}: ${error.message}`
      );
    }

    throw createValidationError(
      `${ERROR_MESSAGES.UNSUPPORTED_FORMAT}: ${getFileExtension(filename)}`
    );
  }
}

/**
 * Convert NEF file to JPG
 * @param {Buffer} buffer - NEF file buffer
 * @returns {Promise<Object>} - Converted image data
 */
async function convertNEFToJPG(buffer) {
  const tmpDir = os.tmpdir();
  const nefPath = path.join(tmpDir, `nef-${Date.now()}.nef`);
  const jpgPath = nefPath.replace(/\.nef$/, ".jpg");

  const start = Date.now();

  try {
    logInfo("Saving NEF to temp file ...", "ImageService");
    await fs.writeFile(nefPath, buffer);

    // 1) ใช้ darktable-cli แปลง NEF → JPEG โดยตรง
    // ตัวอย่าง options:
    //   --hq false   : ปิด high quality processing เพื่อลดเวลาคำนวณ
    //   --width/--height : บังคับ resize ตอน export ได้เลย (แล้วแต่ต้องการ)
    logInfo("Starting RAW → JPEG via darktable-cli ...", "ImageService");

    await execFileAsync("darktable-cli", [
      nefPath,
      jpgPath,
      "--hq",
      "false",
      "--export-format",
      "jpeg",
      "--export-quality",
      String(JPEG_QUALITY),
    ]);

    logInfo(`darktable-cli finished, JPEG path: ${jpgPath}`, "ImageService");

    // 2) อ่าน JPEG ที่ได้ด้วย sharp เพื่อจัดการต่อ (resize เพิ่ม, progressive ฯลฯ)
    const jpegSharp = sharp(jpgPath);
    const meta = await jpegSharp.metadata();

    logInfo(
      `Decoded JPEG from NEF: ${meta.width}x${meta.height}, depth: ${meta.depth}`,
      "ImageService"
    );

    let pipeline = jpegSharp;

    if (meta.width && meta.width > IMAGE_MAX_WIDTH) {
      pipeline = pipeline.resize({
        width: IMAGE_MAX_WIDTH,
        height: null,
        fit: "inside",
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
    }

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
      `Final JPEG from NEF (after sharp): ${finalMeta.width}x${finalMeta.height}`,
      "ImageService"
    );

    logInfo(
      `NEF conversion (darktable-cli + sharp) took ${Date.now() - start}ms`,
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
    // ลบไฟล์ชั่วคราว
    try {
      await fs.rm(nefPath, { force: true });
      await fs.rm(jpgPath, { force: true });
    } catch (cleanupErr) {
      logInfo(
        `Cleanup temp NEF/JPEG failed: ${cleanupErr.message}`,
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
        withoutEnlargement: true,
      })
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: PROGRESSIVE_JPEG,
      })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimetype: "image/jpeg",
    };
  } catch (error) {
    logError(error, "ImageService.convertToJPG");
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
      orientation: metadata.orientation,
    };
  } catch (error) {
    logError(error, "ImageService.getImageMetadata");
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
      fit: options.fit || "cover",
    };

    const processedBuffer = await sharp(buffer)
      .resize(resizeOptions)
      .jpeg({
        quality: options.quality || JPEG_QUALITY,
        progressive: options.progressive !== false,
      })
      .toBuffer();

    return processedBuffer;
  } catch (error) {
    logError(error, "ImageService.resizeImage");
    throw new Error(`Failed to resize image: ${error.message}`);
  }
}
