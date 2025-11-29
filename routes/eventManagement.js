import express from "express";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { createSuccessResponse, createErrorResponse } from "../utils/responseUtils.js";
import {
  createEvent,
  getPhotographerEvents,
  getEventById,
  getEventBySlug,
  updateEvent,
  deleteEvent,
  updateEventPublishStatus,
  getEventStats,
  checkFolderAvailability,
  validateEventAccess,
  getEventInfoByCode
} from "../services/eventService.js";
import { logInfo, logError } from "../middleware/logger.js";
import { validateFolderName, isValidLanguage } from "../utils/stringUtils.js";

const router = express.Router();

// Apply JWT authentication to all routes
router.use(jwtAuth);

// Add debugging middleware
router.use((req, res, next) => {
  console.log('JWT middleware - req.user:', req.user);
  console.log('JWT middleware - req.photographer:', req.photographer);
  next();
});

/**
 * Create a new event
 * POST /api/events
 */
router.post("/", asyncHandler(async (req, res) => {
  try {
    // Debug the entire request object
    console.log('Full request object keys:', Object.keys(req));
    console.log('Request photographer:', req.photographer);
    console.log('Request user:', req.user);
    console.log('Request headers.authorization:', req.headers.authorization);

    // Use user for backward compatibility
    const userObj = req.user || req.photographer;

    if (!userObj) {
      console.log('No user object found');
      return res.status(401).json(createErrorResponse("Authentication required", 401));
    }

    console.log('User object:', JSON.stringify(userObj, null, 2));

    if (!userObj.id) {
      console.log('User object has no id:', userObj);
      return res.status(401).json(createErrorResponse("Authentication required", 401));
    }
    const photographerId = userObj.id;
    console.log('Photographer ID:', photographerId);
    const eventData = req.body;

    // Validate required fields
    if (!eventData.eventDate) {
      return res.status(400).json(createErrorResponse("Event date is required", 400));
    }

    if (!eventData.title || eventData.title.trim().length === 0) {
      return res.status(400).json(createErrorResponse("Event name is required", 400));
    }

    if (!eventData.folderName || eventData.folderName.trim().length === 0) {
      return res.status(400).json(createErrorResponse("Folder name is required", 400));
    }

    // Validate folder name
    const folderValidation = validateFolderName(eventData.folderName);
    if (!folderValidation.isValid) {
      return res.status(400).json(createErrorResponse(folderValidation.error, 400));
    }

    // Validate language if provided
    if (eventData.defaultLanguage && !isValidLanguage(eventData.defaultLanguage)) {
      return res.status(400).json(createErrorResponse("Invalid language code. Must be one of: th, en, cn, vn", 400));
    }

    // Check folder availability
    const isFolderAvailable = await checkFolderAvailability(eventData.folderName, photographerId);
    if (!isFolderAvailable) {
      return res.status(409).json(createErrorResponse("Folder name already exists", 409));
    }

    const event = await createEvent(eventData, photographerId);

    res.status(201).json(createSuccessResponse(event, "Event created successfully"));
  } catch (error) {
    logError(error, "EventRoutes.createEvent");

    if (error.message.includes("already exists")) {
      return res.status(409).json(createErrorResponse(error.message, 409));
    }

    res.status(400).json(createErrorResponse(error.message, 400));
  }
}));

/**
 * Get events for the authenticated photographer
 * GET /api/events
 */
router.get("/", asyncHandler(async (req, res) => {
  try {
    if (!req.photographer || !req.photographer.id) {
      return res.status(401).json(createErrorResponse("Authentication required", 401));
    }
    const photographerId = req.photographer.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status || 'all',
      language: req.query.language,
      search: req.query.search
    };

    // Validate pagination
    if (options.page < 1) {
      return res.status(400).json(createErrorResponse("Page must be greater than 0", 400));
    }

    if (options.limit < 1 || options.limit > 100) {
      return res.status(400).json(createErrorResponse("Limit must be between 1 and 100", 400));
    }

    // Validate status
    const validStatuses = ['all', 'published', 'draft'];
    if (!validStatuses.includes(options.status)) {
      return res.status(400).json(createErrorResponse("Invalid status. Must be one of: all, published, draft", 400));
    }

    // Validate language if provided
    if (options.language && !isValidLanguage(options.language)) {
      return res.status(400).json(createErrorResponse("Invalid language code", 400));
    }

    const result = await getPhotographerEvents(photographerId, options);

    res.json(createSuccessResponse(result));
  } catch (error) {
    logError(error, "EventRoutes.getEvents");
    res.status(500).json(createErrorResponse("Failed to fetch events", 500));
  }
}));

/**
 * Get event by ID
 * GET /api/events/:eventId
 */
router.get("/:eventId", asyncHandler(async (req, res) => {
  try {
    const { eventId } = req.params;
    const photographerId = req.photographer.id;

    // Validate eventId format
    if (!eventId || eventId.length === 0) {
      return res.status(400).json(createErrorResponse("Event ID is required", 400));
    }

    const event = await getEventById(eventId, photographerId);

    res.json(createSuccessResponse(event));
  } catch (error) {
    logError(error, "EventRoutes.getEventById");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    res.status(500).json(createErrorResponse("Failed to fetch event", 500));
  }
}));

/**
 * Update event
 * PUT /api/events/:eventId
 */
router.put("/:eventId", asyncHandler(async (req, res) => {
  try {
    const { eventId } = req.params;
    const photographerId = req.photographer.id;
    const updateData = req.body;

    // Validate eventId format
    if (!eventId || eventId.length === 0) {
      return res.status(400).json(createErrorResponse("Event ID is required", 400));
    }

    // Validate folder name if being updated
    if (updateData.folderName) {
      const folderValidation = validateFolderName(updateData.folderName);
      if (!folderValidation.isValid) {
        return res.status(400).json(createErrorResponse(folderValidation.error, 400));
      }

      // Check folder availability if changing
      const currentEvent = await getEventById(eventId, photographerId);
      if (currentEvent.folderName !== updateData.folderName) {
        const isFolderAvailable = await checkFolderAvailability(updateData.folderName, photographerId);
        if (!isFolderAvailable) {
          return res.status(409).json(createErrorResponse("Folder name already exists", 409));
        }
      }
    }

    // Validate language if being updated
    if (updateData.defaultLanguage && !isValidLanguage(updateData.defaultLanguage)) {
      return res.status(400).json(createErrorResponse("Invalid language code", 400));
    }

    const event = await updateEvent(eventId, photographerId, updateData);

    res.json(createSuccessResponse(event, "Event updated successfully"));
  } catch (error) {
    logError(error, "EventRoutes.updateEvent");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    res.status(400).json(createErrorResponse(error.message, 400));
  }
}));

/**
 * Delete event
 * DELETE /api/events/:eventId
 */
router.delete("/:eventId", asyncHandler(async (req, res) => {
  try {
    const { eventId } = req.params;
    const photographerId = req.photographer.id;

    // Validate eventId format
    if (!eventId || eventId.length === 0) {
      return res.status(400).json(createErrorResponse("Event ID is required", 400));
    }

    await deleteEvent(eventId, photographerId);

    res.json(createSuccessResponse(null, "Event deleted successfully"));
  } catch (error) {
    logError(error, "EventRoutes.deleteEvent");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    res.status(500).json(createErrorResponse("Failed to delete event", 500));
  }
}));

/**
 * Update event publish status
 * PATCH /api/events/:eventId/publish
 */
router.patch("/:eventId/publish", asyncHandler(async (req, res) => {
  try {
    const { eventId } = req.params;
    const photographerId = req.photographer.id;
    const { isPublished } = req.body;

    // Validate eventId format
    if (!eventId || eventId.length === 0) {
      return res.status(400).json(createErrorResponse("Event ID is required", 400));
    }

    // Validate isPublished
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json(createErrorResponse("isPublished must be a boolean", 400));
    }

    const event = await updateEventPublishStatus(eventId, photographerId, isPublished);

    res.json(createSuccessResponse(event, "Event status updated successfully"));
  } catch (error) {
    logError(error, "EventRoutes.updatePublishStatus");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    res.status(500).json(createErrorResponse("Failed to update event status", 500));
  }
}));

/**
 * Get event statistics
 * GET /api/events/:eventId/stats
 */
router.get("/:eventId/stats", asyncHandler(async (req, res) => {
  try {
    const { eventId } = req.params;
    const photographerId = req.photographer.id;

    // Validate eventId format
    if (!eventId || eventId.length === 0) {
      return res.status(400).json(createErrorResponse("Event ID is required", 400));
    }

    const stats = await getEventStats(eventId, photographerId);

    res.json(createSuccessResponse(stats));
  } catch (error) {
    logError(error, "EventRoutes.getEventStats");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    res.status(500).json(createErrorResponse("Failed to fetch event statistics", 500));
  }
}));

/**
 * Check folder availability
 * GET /api/events/check-folder/:folderName
 */
router.get("/check-folder/:folderName", asyncHandler(async (req, res) => {
  try {
    const { folderName } = req.params;
    const photographerId = req.photographer.id;

    // Validate folder name
    const folderValidation = validateFolderName(folderName);
    if (!folderValidation.isValid) {
      return res.status(400).json(createErrorResponse(folderValidation.error, 400));
    }

    const isAvailable = await checkFolderAvailability(folderName, photographerId);

    res.json(createSuccessResponse({
      folderName,
      isAvailable,
      message: isAvailable ? "Folder name is available" : "Folder name already exists"
    }));
  } catch (error) {
    logError(error, "EventRoutes.checkFolderAvailability");
    res.status(500).json(createErrorResponse("Failed to check folder availability", 500));
  }
}));

/**
 * Validate event access
 * GET /api/events/validate/:event_code
 */
router.get("/validate/:event_code", asyncHandler(async (req, res) => {
  try {
    const { event_code } = req.params;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json(createErrorResponse("API key required", 401));
    }

    const result = await validateEventAccess(event_code, apiKey);

    res.json(createSuccessResponse(result));
  } catch (error) {
    logError(error, "EventRoutes.validateEvent");
    res.status(500).json(createErrorResponse("Failed to validate event", 500));
  }
}));

/**
 * Get event info
 * GET /api/events/info/:event_code
 */
router.get("/info/:event_code", asyncHandler(async (req, res) => {
  try {
    const { event_code } = req.params;
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json(createErrorResponse("API key required", 401));
    }

    const eventInfo = await getEventInfoByCode(event_code, apiKey);

    res.json(createSuccessResponse(eventInfo));
  } catch (error) {
    logError(error, "EventRoutes.getEventInfo");

    if (error.name === 'NotFoundError') {
      return res.status(404).json(createErrorResponse(error.message, 404));
    }

    if (error.name === 'ForbiddenError') {
      return res.status(403).json(createErrorResponse(error.message, 403));
    }

    res.status(500).json(createErrorResponse("Failed to get event info", 500));
  }
}));

export default router;