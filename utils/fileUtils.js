import path from 'path';
import { ALLOWED_DIRECT_UPLOAD_EXTENSIONS, NEF_EXTENSION } from '../config/constants.js';

/**
 * Check if file extension is allowed for direct upload
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if allowed, false otherwise
 */
export function isDirectUploadAllowed(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_DIRECT_UPLOAD_EXTENSIONS.includes(ext);
}

/**
 * Check if file is NEF format
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if NEF file, false otherwise
 */
export function isNEFFile(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ext === NEF_EXTENSION;
}

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} - The file extension (without dot)
 */
export function getFileExtension(filename) {
  if (!filename) return '';
  return path.extname(filename).substring(1).toLowerCase();
}

/**
 * Check if file is an image based on extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if image, false otherwise
 */
export function isImageFile(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.nef', '.raw'].includes(ext);
}

/**
 * Generate S3 key for photo
 * @param {string} eventCode - The event code
 * @param {string} photoId - The photo ID
 * @param {string} type - The type ('original' or 'thumb')
 * @returns {string} - The S3 key
 */
export function generateS3Key(eventCode, photoId, type) {
  return `events/${eventCode}/${photoId}_${type}.jpg`;
}

/**
 * Extract photo ID from S3 key
 * @param {string} s3Key - The S3 key
 * @returns {string} - The photo ID
 */
export function extractPhotoIdFromS3Key(s3Key) {
  const keyParts = s3Key.split('/');
  const fileName = keyParts[keyParts.length - 1];
  return fileName.split('_')[0];
}

/**
 * Generate local path for photo
 * @param {string} eventCode - The event code
 * @param {string} photoId - The photo ID
 * @param {string} type - The type ('original' or 'thumb')
 * @returns {string} - The local file path
 */
export function generateLocalPath(eventCode, photoId, type) {
  return `events/${eventCode}/${photoId}_${type}.jpg`;
}

/**
 * Extract photo ID from local path
 * @param {string} localPath - The local file path
 * @returns {string} - The photo ID
 */
export function extractPhotoIdFromLocalPath(localPath) {
  const pathParts = localPath.split('/');
  const fileName = pathParts[pathParts.length - 1];
  return fileName.split('_')[0];
}