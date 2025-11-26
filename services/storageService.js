import { storageConfig } from '../config/index.js';
import { logInfo } from '../middleware/logger.js';

// Import S3 service
import {
  uploadPhotoToS3,
  getEventPhotos as getS3EventPhotos,
  generatePhotoUrls as generateS3PhotoUrls,
  getS3Object
} from './s3Service.js';

// Import Local storage service
import {
  uploadPhotoToLocal,
  getEventPhotos as getLocalEventPhotos,
  generatePhotoUrls as generateLocalPhotoUrls,
  getLocalFile
} from './localStorageService.js';

/**
 * Storage service that abstracts S3 and local storage operations
 * Automatically routes to the appropriate storage based on UPLOAD_MODE
 */

/**
 * Upload photo to storage (S3 or local)
 * @param {Object} originalFile - Processed original file data
 * @param {Object} thumbFile - Processed thumbnail file data (optional)
 * @param {string} eventCode - Event code
 * @param {string} photoId - Photo ID
 * @param {string} baseUrl - Base URL of the server (optional, used for local storage)
 * @returns {Promise<Object>} - Upload result with keys/paths and URLs
 */
export async function uploadPhoto(originalFile, thumbFile, eventCode, photoId, baseUrl = null) {
  logInfo(`Uploading photo ${photoId} using ${storageConfig.uploadMode} storage`, 'StorageService');

  if (storageConfig.uploadMode === 's3') {
    return await uploadPhotoToS3(originalFile, thumbFile, eventCode, photoId);
  } else {
    return await uploadPhotoToLocal(originalFile, thumbFile, eventCode, photoId, baseUrl);
  }
}

/**
 * Get photos for an event from storage
 * @param {string} eventCode - Event code
 * @returns {Promise<Array>} - Array of photo objects
 */
export async function getEventPhotos(eventCode) {
  logInfo(`Fetching photos for event ${eventCode} using ${storageConfig.uploadMode} storage`, 'StorageService');

  if (storageConfig.uploadMode === 's3') {
    return await getS3EventPhotos(eventCode);
  } else {
    return await getLocalEventPhotos(eventCode);
  }
}

/**
 * Generate URLs for gallery photos
 * @param {Array} photos - Array of photo objects
 * @param {string} baseUrl - Base URL of the server (optional, used for local storage)
 * @returns {Promise<Array>} - Array of photos with URLs
 */
export async function generatePhotoUrls(photos, baseUrl = null) {
  logInfo(`Generating URLs for ${photos.length} photos using ${storageConfig.uploadMode} storage`, 'StorageService');

  if (storageConfig.uploadMode === 's3') {
    return await generateS3PhotoUrls(photos);
  } else {
    return await generateLocalPhotoUrls(photos, baseUrl);
  }
}

/**
 * Get single photo from storage
 * @param {string} eventCode - Event code
 * @param {string} photoId - Photo ID
 * @returns {Promise<Object>} - Photo data
 */
export async function getPhoto(eventCode, photoId) {
  logInfo(`Getting photo ${photoId} from event ${eventCode} using ${storageConfig.uploadMode} storage`, 'StorageService');

  if (storageConfig.uploadMode === 's3') {
    const key = `events/${eventCode}/${photoId}_original.jpg`;
    return await getS3Object(key);
  } else {
    const filePath = `events/${eventCode}/${photoId}_original.jpg`;
    return await getLocalFile(filePath);
  }
}

/**
 * Get current storage mode
 * @returns {string} - Current storage mode ('s3' or 'local')
 */
export function getStorageMode() {
  return storageConfig.uploadMode;
}

/**
 * Check if using S3 storage
 * @returns {boolean} - True if using S3
 */
export function isUsingS3() {
  return storageConfig.uploadMode === 's3';
}

/**
 * Check if using local storage
 * @returns {boolean} - True if using local storage
 */
export function isUsingLocal() {
  return storageConfig.uploadMode === 'local';
}

/**
 * Get storage configuration info
 * @returns {Object} - Storage configuration
 */
export function getStorageInfo() {
  return {
    mode: storageConfig.uploadMode,
    localStoragePath: storageConfig.uploadMode === 'local' ? storageConfig.localStoragePath : null,
    s3Bucket: storageConfig.uploadMode === 's3' ? process.env.S3_BUCKET : null,
    s3Region: storageConfig.uploadMode === 's3' ? process.env.AWS_REGION : null
  };
}