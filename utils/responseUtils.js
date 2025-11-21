/**
 * Create a standardized success response
 * @param {Object} data - The response data
 * @param {string} message - Success message
 * @returns {Object} - Formatted success response
 */
export function createSuccessResponse(data = {}, message = 'Success') {
  return {
    success: true,
    message,
    ...data
  };
}

/**
 * Create a standardized error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} - Formatted error response
 */
export function createErrorResponse(message, statusCode = 500, details = {}) {
  return {
    success: false,
    message,
    statusCode,
    ...details
  };
}

/**
 * Create a photo upload response
 * @param {Object} photoData - Photo upload data
 * @returns {Object} - Formatted photo upload response
 */
export function createPhotoUploadResponse(photoData) {
  return createSuccessResponse({
    photo_id: photoData.photoId,
    s3: {
      original_key: photoData.originalKey,
      thumb_key: photoData.thumbKey,
      bucket: photoData.bucket,
      region: photoData.region
    },
    meta: {
      original_name: photoData.originalName,
      local_path: photoData.localPath,
      shot_at: photoData.shotAt,
      checksum: photoData.checksum,
      event_code: photoData.eventCode,
      processed: photoData.processed,
      original_format: photoData.originalFormat || null
    }
  }, 'Photo uploaded successfully');
}

/**
 * Create a photo data object for SSE broadcast
 * @param {Object} photoData - Photo data
 * @returns {Object} - Formatted photo data for SSE
 */
export function createPhotoDataForSSE(photoData) {
  return {
    photoId: photoData.photoId,
    displayUrl: photoData.displayUrl,
    downloadUrl: photoData.downloadUrl,
    lastModified: photoData.lastModified || new Date().toISOString(),
    original_name: photoData.originalName,
    local_path: photoData.localPath,
    shot_at: photoData.shotAt,
    checksum: photoData.checksum
  };
}

/**
 * Create a gallery photo object
 * @param {string} photoId - Photo ID
 * @param {Object} urls - Display and download URLs
 * @param {Date} lastModified - Last modified date
 * @returns {Object} - Formatted gallery photo object
 */
export function createGalleryPhoto(photoId, urls, lastModified) {
  return {
    photoId,
    displayUrl: urls.displayUrl,
    downloadUrl: urls.downloadUrl,
    lastModified
  };
}

/**
 * Create pagination metadata
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} - Pagination metadata
 */
export function createPaginationMetadata(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  return {
    currentPage: page,
    totalPages,
    itemsPerPage: limit,
    totalItems: total,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}