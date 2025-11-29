import { PrismaClient } from '@prisma/client';
import { logInfo, logError } from '../middleware/logger.js';
import { createNotFoundError, createForbiddenError } from '../middleware/errorHandler.js';
import { generateSlug } from '../utils/stringUtils.js';

const prisma = new PrismaClient();

/**
 * Create a new event
 * @param {Object} eventData - Event data
 * @param {string} photographerId - Photographer ID
 * @returns {Promise<Object>} - Created event
 */
export async function createEvent(eventData, photographerId) {
  try {
    const {
      eventDate,
      title,
      subtitle,
      description,
      folderName,
      defaultLanguage = 'th',
      isPublished = false,
      slug
    } = eventData;

    // Generate slug if not provided
    const finalSlug = slug || generateSlug(title);

    // Check if folder name is unique for this photographer
    const existingFolder = await prisma.event.findFirst({
      where: {
        photographerId,
        folderName
      }
    });

    if (existingFolder) {
      throw new Error(`Folder name '${folderName}' already exists`);
    }

    const event = await prisma.event.create({
      data: {
        photographerId,
        eventDate: new Date(eventDate),
        title,
        subtitle,
        description,
        folderName,
        defaultLanguage,
        isPublished,
        slug: finalSlug
      }
    });

    logInfo(`Created event: ${event.id}`, 'EventService');
    return event;
  } catch (error) {
    logError(error, 'EventService.createEvent');
    throw error;
  }
}

/**
 * Get events for a photographer
 * @param {string} photographerId - Photographer ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Events with pagination
 */
export async function getPhotographerEvents(photographerId, options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'all', // 'all', 'published', 'draft'
      language,
      search
    } = options;

    const skip = (page - 1) * limit;
    const where = { photographerId };

    // Filter by status
    if (status === 'published') {
      where.status = 'published';
    } else if (status === 'draft') {
      where.status = 'draft';
    }

    // Filter by language
    if (language) {
      where.defaultLanguage = language;
    }

    // Search functionality
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { subtitle: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [events, totalEvents] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.event.count({ where })
    ]);

    const totalPages = Math.ceil(totalEvents / limit);

    return {
      events,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  } catch (error) {
    logError(error, 'EventService.getPhotographerEvents');
    throw error;
  }
}

/**
 * Get event by ID
 * @param {string} eventId - Event ID
 * @param {string} photographerId - Photographer ID (for authorization)
 * @returns {Promise<Object>} - Event data
 */
export async function getEventById(eventId, photographerId = null) {
  try {
    const where = { id: eventId };

    // If photographerId is provided, ensure the photographer owns the event
    if (photographerId) {
      where.photographerId = photographerId;
    }

    const event = await prisma.event.findFirst({
      where,
      include: {
        photos: {
          select: {
            id: true,
            originalFilename: true,
            fileSizeBytes: true,
            uploadedAt: true
          },
          orderBy: { uploadedAt: 'desc' },
          take: 5 // Get only 5 recent photos
        }
      }
    });

    if (!event) {
      throw createNotFoundError('Event');
    }

    return event;
  } catch (error) {
    logError(error, 'EventService.getEventById');
    throw error;
  }
}

/**
 * Get event by slug (for public access)
 * @param {string} slug - Event slug
 * @returns {Promise<Object>} - Event data
 */
export async function getEventBySlug(slug) {
  try {
    const event = await prisma.event.findFirst({
      where: {
        slug,
        status: 'published' // Only return published events
      }
    });

    if (!event) {
      throw createNotFoundError('Event');
    }

    return event;
  } catch (error) {
    logError(error, 'EventService.getEventBySlug');
    throw error;
  }
}

/**
 * Update event
 * @param {string} eventId - Event ID
 * @param {string} photographerId - Photographer ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated event
 */
export async function updateEvent(eventId, photographerId, updateData) {
  try {
    // Check if event exists and belongs to photographer
    const existingEvent = await prisma.event.findFirst({
      where: {
        id: eventId,
        photographerId
      }
    });

    if (!existingEvent) {
      throw createNotFoundError('Event');
    }

    // If updating title and no slug provided, generate new slug
    if (updateData.title && !updateData.slug) {
      updateData.slug = generateSlug(updateData.title);
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: updateData
    });

    logInfo(`Updated event: ${event.id}`, 'EventService');
    return event;
  } catch (error) {
    logError(error, 'EventService.updateEvent');
    throw error;
  }
}

/**
 * Delete event
 * @param {string} eventId - Event ID
 * @param {string} photographerId - Photographer ID
 * @returns {Promise<void>}
 */
export async function deleteEvent(eventId, photographerId) {
  try {
    // Check if event exists and belongs to photographer
    const existingEvent = await prisma.event.findFirst({
      where: {
        id: eventId,
        photographerId
      }
    });

    if (!existingEvent) {
      throw createNotFoundError('Event');
    }

    // Delete event (photos will be deleted due to cascade)
    await prisma.event.delete({
      where: { id: eventId }
    });

    logInfo(`Deleted event: ${eventId}`, 'EventService');
  } catch (error) {
    logError(error, 'EventService.deleteEvent');
    throw error;
  }
}

/**
 * Update event publish status
 * @param {string} eventId - Event ID
 * @param {string} photographerId - Photographer ID
 * @param {boolean} isPublished - Publish status
 * @returns {Promise<Object>} - Updated event
 */
export async function updateEventPublishStatus(eventId, photographerId, isPublished) {
  try {
    const status = isPublished ? 'published' : 'draft';
    const event = await updateEvent(eventId, photographerId, { status });
    logInfo(`Updated publish status for event: ${eventId} to ${status}`, 'EventService');
    return event;
  } catch (error) {
    logError(error, 'EventService.updateEventPublishStatus');
    throw error;
  }
}

/**
 * Get event statistics
 * @param {string} eventId - Event ID
 * @param {string} photographerId - Photographer ID
 * @returns {Promise<Object>} - Event statistics
 */
export async function getEventStats(eventId, photographerId) {
  try {
    // Check if event exists and belongs to photographer
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        photographerId
      },
      include: {
        photos: {
          select: {
            fileSizeBytes: true,
            uploadedAt: true
          }
        }
      }
    });

    if (!event) {
      throw createNotFoundError('Event');
    }

    const totalSize = event.photos.reduce((sum, photo) => sum + photo.fileSizeBytes, 0);
    const lastPhotoUpload = event.photos.length > 0
      ? new Date(Math.max(...event.photos.map(p => p.uploadedAt.getTime())))
      : null;

    return {
      eventId,
      photoCount: event.photoCount,
      totalSizeMb: Math.round(totalSize / (1024 * 1024)),
      createdAt: event.createdAt,
      lastPhotoUpload,
      // Add additional stats like views, downloads, favorites if you implement them
    };
  } catch (error) {
    logError(error, 'EventService.getEventStats');
    throw error;
  }
}

/**
 * Check if folder name is available
 * @param {string} folderName - Folder name to check
 * @param {string} photographerId - Photographer ID
 * @returns {Promise<boolean>} - True if available
 */
export async function checkFolderAvailability(folderName, photographerId) {
  try {
    const existingEvent = await prisma.event.findFirst({
      where: {
        photographerId,
        folderName
      }
    });

    return !existingEvent;
  } catch (error) {
    logError(error, 'EventService.checkFolderAvailability');
    throw error;
  }
}

/**
 * Validate event access for photographer
 * @param {string} eventCode - Event code (slug or folderName)
 * @param {string} apiKey - API key of photographer
 * @returns {Promise<Object>} - Validation result
 */
export async function validateEventAccess(eventCode, apiKey) {
  try {
    // Find photographer by API key
    const photographer = await prisma.photographer.findUnique({
      where: { apiKey }
    });

    if (!photographer) {
      return {
        eventExists: false,
        hasAccess: false,
        eventInfo: null
      };
    }

    // Find event by slug or folderName
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { slug: eventCode },
          { folderName: eventCode }
        ]
      }
    });

    const eventExists = !!event;
    const hasAccess = eventExists && event.photographerId === photographer.id;

    return {
      eventExists,
      hasAccess,
      eventInfo: hasAccess ? {
        id: event.id,
        title: event.title,
        folderName: event.folderName,
        status: event.status
      } : null
    };
  } catch (error) {
    logError(error, 'EventService.validateEventAccess');
    throw error;
  }
}

/**
 * Get event info by code
 * @param {string} eventCode - Event code (slug or folderName)
 * @param {string} apiKey - API key of photographer
 * @returns {Promise<Object>} - Event info
 */
export async function getEventInfoByCode(eventCode, apiKey) {
  try {
    // Find photographer by API key
    const photographer = await prisma.photographer.findUnique({
      where: { apiKey }
    });

    if (!photographer) {
      throw createForbiddenError('Invalid API key');
    }

    // Find event by slug or folderName
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { slug: eventCode },
          { folderName: eventCode }
        ],
        photographerId: photographer.id
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        folderName: true,
        status: true,
        photoCount: true,
        totalSizeMb: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!event) {
      throw createNotFoundError('Event');
    }

    return event;
  } catch (error) {
    logError(error, 'EventService.getEventInfoByCode');
    throw error;
  }
}

/**
 * Find or create event by code (for photo upload)
 * @param {string} eventCode - Event code
 * @param {string} photographerId - Photographer ID
 * @returns {Promise<Object>} - Event with flag indicating if it was created
 */
export async function findOrCreateEvent(eventCode, photographerId) {
  try {
    // Try to find existing event
    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { slug: eventCode },
          { folderName: eventCode }
        ]
      }
    });

    let wasCreated = false;

    // If not found, create new event
    if (!event) {
      logInfo(`Creating new event for code: ${eventCode}`, 'EventService');

      const slug = eventCode.toLowerCase()
        .replace(/[^a-z0-9\-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      event = await prisma.event.create({
        data: {
          photographerId,
          eventDate: new Date(),
          title: eventCode,
          folderName: eventCode,
          slug: slug,
          defaultLanguage: 'th',
          status: 'draft',
        }
      });

      wasCreated = true;
      logInfo(`Created new event with ID: ${event.id}`, 'EventService');
    }

    return { event, wasCreated };
  } catch (error) {
    logError(error, 'EventService.findOrCreateEvent');
    throw error;
  }
}

/**
 * Update event statistics after photo upload
 * @param {string} eventId - Event ID
 * @param {number} fileSizeBytes - Size of uploaded photo
 * @returns {Promise<void>}
 */
export async function updateEventStats(eventId, fileSizeBytes) {
  try {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        photoCount: {
          increment: 1
        },
        totalSizeMb: {
          increment: Math.round(fileSizeBytes / (1024 * 1024))
        }
      }
    });

    logInfo(`Updated stats for event: ${eventId}`, 'EventService');
  } catch (error) {
    logError(error, 'EventService.updateEventStats');
    throw error;
  }
}