import express from 'express';
import { validateApiKey } from '../middleware/auth.js';
import { corsForSSE } from '../middleware/cors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getEventPhotos,
  generatePhotoUrls,
  getPhoto
} from '../services/storageService.js';
import {
  createSuccessResponse,
  createErrorResponse
} from '../utils/responseUtils.js';
import {
  ERROR_MESSAGES,
  PHOTOS_PER_PAGE
} from '../config/constants.js';
import { logInfo, logError } from '../middleware/logger.js';
import { setupSSEResponse, addSSEConnection } from '../services/sseService.js';

const router = express.Router();

/**
 * Get event information (mock data for now)
 * GET /api/events/:eventCode
 */
router.get('/:eventCode', asyncHandler(async (req, res) => {
  const { eventCode } = req.params;

  logInfo(`Fetching event info for: ${eventCode}`, 'EventsRoute');

  try {
    // Mock event data for now - in the future this would come from a database
    const eventInfo = {
      eventCode,
      eventName: eventCode.charAt(0).toUpperCase() + eventCode.slice(1),
      photographerName: 'photographer', // This would be parsed from URL in frontend
      createdAt: new Date().toISOString(),
      totalPhotos: 0 // This will be updated when we get photos
    };

    // Get actual photo count
    const photos = await getEventPhotos(eventCode);
    eventInfo.totalPhotos = photos.length;

    res.json(createSuccessResponse(eventInfo));

  } catch (error) {
    logError(error, 'EventsRoute.getEventInfo');

    res.status(500).json(
      createErrorResponse('Failed to fetch event information', 500)
    );
  }
}));

/**
 * Get photos for an event
 * GET /api/events/:eventCode/photos
 */
router.get('/:eventCode/photos', asyncHandler(async (req, res) => {
  const eventCode = req.params.eventCode;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * PHOTOS_PER_PAGE;

  logInfo(`Fetching photos for event: ${eventCode}, page: ${page}`, 'EventsRoute');

  try {
    // Get photos from storage
    const photos = await getEventPhotos(eventCode);

    // Generate base URL for local files
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    // Generate URLs for photos
    const photosWithUrls = await generatePhotoUrls(photos, baseUrl);

    // Apply pagination
    const totalPhotos = photosWithUrls.length;
    const totalPages = Math.ceil(totalPhotos / PHOTOS_PER_PAGE);
    const paginatedPhotos = photosWithUrls.slice(offset, offset + PHOTOS_PER_PAGE);

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
        active: i + 1 === page
      }))
    };

    res.json(createSuccessResponse({
      photos: paginatedPhotos,
      pagination
    }));

  } catch (error) {
    logError(error, 'EventsRoute.getPhotos');

    res.status(500).json(
      createErrorResponse('Failed to load photos', 500)
    );
  }
}));

/**
 * SSE endpoint for real-time photo updates
 * GET /api/events/:eventCode/photos/stream
 */
router.get('/:eventCode/photos/stream', corsForSSE, (req, res) => {
  const eventCode = req.params.eventCode;

  logInfo(`New SSE connection for event: ${eventCode}`, 'EventsRoute');

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
router.get('/:eventCode/photos/:photoId', asyncHandler(async (req, res) => {
  const { eventCode, photoId } = req.params;

  logInfo(`Downloading photo: ${photoId} from event: ${eventCode}`, 'EventsRoute');

  try {
    const data = await getPhoto(eventCode, photoId);

    // Read stream as buffer
    const chunks = [];
    for await (const chunk of data.Body) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');

    res.json(createSuccessResponse({
      photoId,
      base64: `data:image/jpeg;base64,${base64}`
    }));

  } catch (error) {
    logError(error, 'EventsRoute.getPhoto');

    res.status(500).json(
      createErrorResponse(ERROR_MESSAGES.DOWNLOAD_FAILED, 500)
    );
  }
}));

export default router;