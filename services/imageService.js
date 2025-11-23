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

  const start = Date.now();

  try {
    // 1) เซฟ NEF ชั่วคราว
    logInfo("Saving NEF to temp file ...", "ImageService");
    await fs.writeFile(nefPath, buffer);

    // 2) ดึง orientation จาก NEF
    const orientation = await getOrientationFromNEF(nefPath);
    const rotationDegrees = orientationToDegrees(orientation);
    logInfo(
      `NEF Orientation: ${orientation ?? "N/A"}, rotate: ${rotationDegrees}°`,
      "ImageService"
    );

    // 3) ดึง JPEG preview จาก NEF
    logInfo("Extracting JPEG preview via exiftool ...", "ImageService");
    const previewBuffer = await extractPreviewFromNEF(nefPath);

    // 4) ให้ sharp หมุนตามมุมที่เราคำนวณเอง
    let pipeline = sharp(previewBuffer).rotate(rotationDegrees);

    const meta = await pipeline.metadata();
    logInfo(
      `Embedded JPEG preview (after rotate meta): ${meta.width}x${meta.height}, depth: ${meta.depth}`,
      "ImageService"
    );

    // 5) Resize ถ้ากว้างเกิน
    // if (meta.width && meta.width > IMAGE_MAX_WIDTH) {
    //   pipeline = pipeline.resize({
    //     width: IMAGE_MAX_WIDTH,
    //     height: null,
    //     fit: "inside",
    //     withoutEnlargement: true,
    //     kernel: sharp.kernel.lanczos3,
    //   });
    // }

    // 6) แปลงเป็น JPEG
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
      `Final JPEG from NEF preview: ${finalMeta.width}x${finalMeta.height}`,
      "ImageService"
    );

    logInfo(
      `NEF preview conversion took ${Date.now() - start}ms`,
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
    try {
      await fs.rm(nefPath, { force: true });
    } catch (cleanupErr) {
      logInfo(`Cleanup temp NEF failed: ${cleanupErr.message}`, "ImageService");
    }
  }
}

async function getOrientationFromNEF(nefPath) {
  try {
    // -Orientation# หรือ -Orientation -n เพื่อให้ได้ค่าตัวเลข
    // -s3 = แสดงค่าอย่างเดียว (ไม่เอา label)
    const { stdout } = await execFileAsync("exiftool", [
      "-Orientation#",
      "-n",
      "-s3",
      nefPath,
    ]);

    const raw = stdout.toString().trim();
    if (!raw) return null;

    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) return null;

    return value; // 1,3,6,8, ...
  } catch (err) {
    // ถ้าหาค่าไม่ได้ก็ปล่อยไป ใช้ null
    return null;
  }
}

function orientationToDegrees(orientation) {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return 0;
  }
}

async function extractPreviewFromNEF(nefPath) {
  // helper ใช้ซ้ำได้
  async function runExiftool(tag) {
    const { stdout } = await execFileAsync("exiftool", ["-b", tag, nefPath], {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 200,
    });
    const buf = stdout;
    return buf && buf.length ? buf : null;
  }

  // 1) พยายามดึง JpgFromRaw ก่อน (มักจะใหญ่กว่าหรือ full-size)
  let buf = await runExiftool("-JpgFromRaw");
  if (buf) {
    logInfo("Using embedded JpgFromRaw as preview", "ImageService");
    return buf;
  }

  // 2) ถ้าไม่มี ค่อย fallback เป็น PreviewImage (ส่วนมาก 640x424 แบบที่เจอ)
  buf = await runExiftool("-PreviewImage");
  if (buf) {
    logInfo("Using embedded PreviewImage as preview", "ImageService");
    return buf;
  }

  throw new Error("No embedded JPEG (JpgFromRaw/PreviewImage) found in NEF");
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
