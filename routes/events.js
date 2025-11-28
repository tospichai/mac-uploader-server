import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { validateApiKey } from "../middleware/auth.js";
import { corsForSSE } from "../middleware/cors.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  uploadPhoto,
  getEventPhotos,
  generatePhotoUrls,
  getPhoto,
} from "../services/storageService.js";
import {
  createSuccessResponse,
  createErrorResponse,
  createPhotoUploadResponse,
  createPhotoDataForSSE,
} from "../utils/responseUtils.js";
import { ERROR_MESSAGES, PHOTOS_PER_PAGE } from "../config/constants.js";
import { logInfo, logError } from "../middleware/logger.js";
import {
  setupSSEResponse,
  addSSEConnection,
  broadcastPhotoUpdate,
} from "../services/sseService.js";
import { processImage } from "../services/imageService.js";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload photo endpoint
 * POST /api/events/:event_code/photos
 * For rust desktop app
 */
router.post(
  "/:event_code/photos",
  upload.fields([
    { name: "original_file", maxCount: 1 },
    { name: "thumb_file", maxCount: 1 },
  ]),
  validateApiKey,
  asyncHandler(async (req, res) => {
    const eventCode = req.params.event_code || "unknown";
    logInfo(`Photo upload request for event: ${eventCode}`, "PhotosRoute");

    // Extract files from request
    const originalFile = req.files?.original_file?.[0] || null;
    const thumbFile = req.files?.thumb_file?.[0] || null;

    if (!originalFile) {
      return res
        .status(400)
        .json(createErrorResponse(ERROR_MESSAGES.MISSING_ORIGINAL_FILE, 400));
    }

    // Extract metadata
    const originalName =
      req.body.original_name || originalFile.originalname || "photo";
    const localPath = req.body.local_path || "";
    const shotAt = req.body.shot_at || "";
    const checksum = req.body.checksum || null;

    // Generate photo ID
    const photoId = uuidv4();

    try {
      // Process original file
      logInfo(`Processing original file: ${originalName}`, "PhotosRoute");
      const processedOriginal = await processImage(originalFile, originalName);

      // Process thumbnail if provided
      let processedThumb = null;
      if (thumbFile) {
        logInfo(
          `Processing thumbnail file: ${thumbFile.originalname}`,
          "PhotosRoute"
        );
        try {
          processedThumb = await processImage(
            thumbFile,
            thumbFile.originalname
          );
        } catch (error) {
          logError(error, "PhotosRoute.thumbnailProcessing");
          // Continue without thumbnail if processing fails
        }
      } else {
        // Generate thumbnail from original if not provided (for local storage mode)
        try {
          logInfo(`Generating thumbnail from original file`, "PhotosRoute");
          const { resizeImage, getImageMetadata } = await import(
            "../services/imageService.js"
          );

          // Get image metadata to check dimensions
          const metadata = await getImageMetadata(processedOriginal.buffer);
          let thumbBuffer = processedOriginal.buffer;

          // Only resize if image is wider than 1024px
          if (metadata.width && metadata.width > 1024) {
            logInfo(
              `Resizing image from ${metadata.width}px to 1024px`,
              "PhotosRoute"
            );
            thumbBuffer = await resizeImage(
              processedOriginal.buffer,
              1024,
              null,
              {
                quality: JPEG_QUALITY,
                fit: "cover",
              }
            );
          } else {
            logInfo(
              `Image width is ${metadata.width}px (<= 1024), no resize needed`,
              "PhotosRoute"
            );
          }

          processedThumb = {
            buffer: thumbBuffer,
            mimetype: "image/jpeg",
            processed: metadata.width && metadata.width > 1024,
          };
        } catch (error) {
          logError(error, "PhotosRoute.thumbnailGeneration");
          // Continue without thumbnail if generation fails
        }
      }

      // Generate base URL for local files
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;

      // Upload to storage (S3 or local)
      const uploadResult = await uploadPhoto(
        processedOriginal,
        processedThumb,
        eventCode,
        photoId,
        baseUrl
      );

      // Create photo data for response
      const photoUploadData = {
        photoId,
        originalKey: uploadResult.originalKey || uploadResult.originalPath,
        thumbKey: uploadResult.thumbKey || uploadResult.thumbPath,
        bucket: uploadResult.bucket || "",
        region: uploadResult.region || "",
        originalName,
        localPath,
        shotAt,
        checksum,
        eventCode,
        processed: processedOriginal.processed,
        originalFormat: processedOriginal.originalFormat || null,
      };

      // Create photo data for SSE broadcast
      const photoDataForSSE = createPhotoDataForSSE({
        photoId,
        displayUrl: uploadResult.displayUrl,
        downloadUrl: uploadResult.downloadUrl,
        originalName,
        localPath,
        shotAt,
        checksum,
      });

      // Broadcast photo update to all connected clients
      broadcastPhotoUpdate(eventCode, photoDataForSSE);

      // Return success response
      res.json(createPhotoUploadResponse(photoUploadData));
    } catch (error) {
      logError(error, "PhotosRoute.photoUpload");

      if (error.message.includes("processing failed")) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              `${ERROR_MESSAGES.FILE_PROCESSING_FAILED}: ${error.message}`,
              400
            )
          );
      }

      return res
        .status(500)
        .json(createErrorResponse("Server error during photo upload", 500));
    }
  })
);

/**
 * Get photos for an event
 * GET /api/events/:eventCode/photos
 */
router.get(
  "/:eventCode/photos",
  asyncHandler(async (req, res) => {
    const eventCode = req.params.eventCode;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * PHOTOS_PER_PAGE;

    logInfo(
      `Fetching photos for event: ${eventCode}, page: ${page}`,
      "EventsRoute"
    );

    try {
      // Get photos from storage
      const photos = await getEventPhotos(eventCode);

      // Generate base URL for local files
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;

      // Generate URLs for photos
      const photosWithUrls = await generatePhotoUrls(photos, baseUrl);

      // Apply pagination
      const totalPhotos = photosWithUrls.length;
      const totalPages = Math.ceil(totalPhotos / PHOTOS_PER_PAGE);
      const paginatedPhotos = photosWithUrls.slice(
        offset,
        offset + PHOTOS_PER_PAGE
      );

      // Create pagination data
      const pagination = {
        currentPage: page,
        totalPages,
        hasMultiplePages: totalPages > 1,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < totalPages ? page + 1 : null,
        pages: Array.from({ length: totalPages }, (_, i) => ({
          number: i + 1,
          active: i + 1 === page,
        })),
      };

      res.json(
        createSuccessResponse({
          photos: paginatedPhotos,
          pagination,
        })
      );
    } catch (error) {
      logError(error, "EventsRoute.getPhotos");

      res.status(500).json(createErrorResponse("Failed to load photos", 500));
    }
  })
);

/**
 * SSE endpoint for real-time photo updates
 * GET /api/events/:eventCode/photos/stream
 */
router.get("/:eventCode/photos/stream", corsForSSE, (req, res) => {
  const eventCode = req.params.eventCode;

  logInfo(`New SSE connection for event: ${eventCode}`, "EventsRoute");

  // Import moved to top level to avoid circular dependency

  // Set up SSE response
  setupSSEResponse(res);

  // Add connection to SSE service
  addSSEConnection(eventCode, res);
});

/**
 * Get single photo
 * GET /api/events/:eventCode/photos/:photoId
 */
router.get(
  "/:eventCode/photos/:photoId",
  asyncHandler(async (req, res) => {
    const { eventCode, photoId } = req.params;

    logInfo(
      `Downloading photo: ${photoId} from event: ${eventCode}`,
      "EventsRoute"
    );

    try {
      const data = await getPhoto(eventCode, photoId);

      // Read stream as buffer
      const chunks = [];
      for await (const chunk of data.Body) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");

      res.json(
        createSuccessResponse({
          photoId,
          base64: `data:image/jpeg;base64,${base64}`,
        })
      );
    } catch (error) {
      logError(error, "EventsRoute.getPhoto");

      res
        .status(500)
        .json(createErrorResponse(ERROR_MESSAGES.DOWNLOAD_FAILED, 500));
    }
  })
);

export default router;
