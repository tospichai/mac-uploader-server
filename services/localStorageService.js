import fs from 'fs/promises';
import path from 'path';
import { generateLocalPath, extractPhotoIdFromLocalPath } from '../utils/fileUtils.js';
import { storageConfig } from '../config/index.js';
import { logInfo, logError, logPerformance } from '../middleware/logger.js';
import { createNotFoundError } from '../middleware/errorHandler.js';

/**
 * Upload file to local storage
 * @param {Buffer} buffer - File buffer
 * @param {string} filePath - Local file path
 * @returns {Promise<Object>} - Upload result
 */
export async function uploadToLocal(buffer, filePath) {
  const startTime = Date.now();

  try {
    logInfo(`Uploading to local storage: ${filePath}`, 'LocalStorageService');

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    logPerformance(`Local upload: ${filePath}`, startTime, 'LocalStorageService');

    return {
      success: true,
      filePath,
      size: buffer.length
    };
  } catch (error) {
    logError(error, `LocalStorageService.uploadToLocal(${filePath})`);
    throw new Error(`Failed to upload to local storage: ${error.message}`);
  }
}

/**
 * List files in local directory with prefix
 * @param {string} prefix - Directory prefix
 * @returns {Promise<Array>} - Array of file objects
 */
export async function listLocalFiles(prefix) {
  const startTime = Date.now();

  try {
    logInfo(`Listing local files with prefix: ${prefix}`, 'LocalStorageService');

    const dirPath = path.join(storageConfig.localStoragePath, prefix);

    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      const fileObjects = [];

      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(dirPath, file.name);
          const stats = await fs.stat(filePath);

          fileObjects.push({
            Key: path.join(prefix, file.name).replace(/\\/g, '/'),
            LastModified: stats.mtime,
            Size: stats.size,
            ETag: `"${stats.mtime.getTime()}"` // Simple ETag using modification time
          });
        }
      }

      logPerformance(`Local list: ${prefix}`, startTime, 'LocalStorageService');
      return fileObjects;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, return empty array
        return [];
      }
      throw error;
    }
  } catch (error) {
    logError(error, `LocalStorageService.listLocalFiles(${prefix})`);
    throw new Error(`Failed to list local files: ${error.message}`);
  }
}

/**
 * Get file from local storage
 * @param {string} filePath - Local file path
 * @returns {Promise<Object>} - File data
 */
export async function getLocalFile(filePath) {
  const startTime = Date.now();

  try {
    logInfo(`Getting local file: ${filePath}`, 'LocalStorageService');

    const fullPath = path.join(storageConfig.localStoragePath, filePath);

    try {
      const buffer = await fs.readFile(fullPath);
      const stats = await fs.stat(fullPath);

      logPerformance(`Local get: ${filePath}`, startTime, 'LocalStorageService');

      return {
        Body: buffer,
        ContentType: 'image/jpeg', // Default to JPEG
        LastModified: stats.mtime,
        ContentLength: stats.size
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw createNotFoundError(`Local file: ${filePath}`);
      }
      throw error;
    }
  } catch (error) {
    logError(error, `LocalStorageService.getLocalFile(${filePath})`);
    throw new Error(`Failed to get local file: ${error.message}`);
  }
}

/**
 * Generate URL for local file
 * @param {string} filePath - Local file path
 * @param {string} baseUrl - Base URL of the server (optional)
 * @returns {string} - URL to access the file
 */
export function generateLocalUrl(filePath, baseUrl = null) {
  // Generate URL that will be served by the server
  const relativeUrl = `/api/files/${filePath}`;

  // If base URL is provided, return full URL, otherwise return relative URL
  if (baseUrl) {
    // Remove trailing slash from baseUrl if present
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}${relativeUrl}`;
  }

  return relativeUrl;
}

/**
 * Upload photo to local storage (both original and thumbnail)
 * @param {Object} originalFile - Processed original file data
 * @param {Object} thumbFile - Processed thumbnail file data (optional)
 * @param {string} eventCode - Event code
 * @param {string} photoId - Photo ID
 * @param {string} baseUrl - Base URL of the server (optional)
 * @returns {Promise<Object>} - Upload result with paths and URLs
 */
export async function uploadPhotoToLocal(originalFile, thumbFile, eventCode, photoId, baseUrl = null) {
  const startTime = Date.now();

  try {
    logInfo(`Uploading photo ${photoId} to local storage`, 'LocalStorageService');

    // Upload original file
    const originalPath = generateLocalPath(eventCode, photoId, 'original');
    const originalUpload = await uploadToLocal(
      originalFile.buffer,
      path.join(storageConfig.localStoragePath, originalPath)
    );

    // Upload thumbnail if provided
    let thumbPath = null;
    let thumbUpload = null;

    if (thumbFile && thumbFile.buffer) {
      thumbPath = generateLocalPath(eventCode, photoId, 'thumb');
      thumbUpload = await uploadToLocal(
        thumbFile.buffer,
        path.join(storageConfig.localStoragePath, thumbPath)
      );
    }

    // Generate URLs
    const displayUrl = generateLocalUrl(thumbPath || originalPath, baseUrl);
    const downloadUrl = generateLocalUrl(originalPath, baseUrl);

    logPerformance(`Photo upload complete: ${photoId}`, startTime, 'LocalStorageService');

    return {
      originalPath,
      thumbPath,
      displayUrl,
      downloadUrl,
      originalUpload,
      thumbUpload
    };
  } catch (error) {
    logError(error, `LocalStorageService.uploadPhotoToLocal(${photoId})`);
    throw new Error(`Failed to upload photo to local storage: ${error.message}`);
  }
}

/**
 * Get photos for an event from local storage
 * @param {string} eventCode - Event code
 * @returns {Promise<Array>} - Array of photo objects
 */
export async function getEventPhotos(eventCode) {
  const startTime = Date.now();

  try {
    logInfo(`Fetching photos for event: ${eventCode}`, 'LocalStorageService');

    const prefix = `events/${eventCode}/`;
    const files = await listLocalFiles(prefix);

    // Filter only photo files (original and thumb)
    const photoFiles = files.filter(file =>
      file.Key.includes('_original.jpg') || file.Key.includes('_thumb.jpg')
    );

    // Group by photo ID
    const photoGroups = {};
    photoFiles.forEach(file => {
      const photoId = extractPhotoIdFromLocalPath(file.Key);

      if (!photoGroups[photoId]) {
        photoGroups[photoId] = {};
      }

      if (file.Key.includes('_thumb.jpg')) {
        photoGroups[photoId].thumb = file;
      } else if (file.Key.includes('_original.jpg')) {
        photoGroups[photoId].original = file;
      }
    });

    // Convert to array and sort by date (newest first)
    const photos = Object.keys(photoGroups)
      .map(photoId => ({
        photoId,
        ...photoGroups[photoId]
      }))
      .sort((a, b) => {
        const dateA = a.original?.LastModified || a.thumb?.LastModified || new Date(0);
        const dateB = b.original?.LastModified || b.thumb?.LastModified || new Date(0);
        return dateB - dateA;
      });

    logPerformance(`Event photos fetch: ${eventCode}`, startTime, 'LocalStorageService');

    return photos;
  } catch (error) {
    logError(error, `LocalStorageService.getEventPhotos(${eventCode})`);
    throw new Error(`Failed to get event photos: ${error.message}`);
  }
}

/**
 * Generate URLs for gallery photos
 * @param {Array} photos - Array of photo objects
 * @param {string} baseUrl - Base URL of the server (optional)
 * @returns {Promise<Array>} - Array of photos with URLs
 */
export async function generatePhotoUrls(photos, baseUrl = null) {
  const startTime = Date.now();

  try {
    const photosWithUrls = photos.map((photo) => {
      const thumbPath = photo.thumb?.Key;
      const originalPath = photo.original?.Key;

      // Use thumbnail if available, otherwise use original
      const displayPath = thumbPath || originalPath;

      const displayUrl = displayPath ? generateLocalUrl(displayPath, baseUrl) : null;
      const downloadUrl = originalPath ? generateLocalUrl(originalPath, baseUrl) : null;

      return {
        photoId: photo.photoId,
        displayUrl,
        downloadUrl,
        lastModified: photo.original?.LastModified || photo.thumb?.LastModified,
      };
    });

    logPerformance(`URL generation for ${photos.length} photos`, startTime, 'LocalStorageService');

    return photosWithUrls;
  } catch (error) {
    logError(error, 'LocalStorageService.generatePhotoUrls');
    throw new Error(`Failed to generate photo URLs: ${error.message}`);
  }
}