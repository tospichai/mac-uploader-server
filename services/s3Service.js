import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, s3Config } from '../config/index.js';
import { generateS3Key, extractPhotoIdFromS3Key } from '../utils/fileUtils.js';
import { URL_EXPIRATION_SECONDS, MAX_S3_KEYS } from '../config/constants.js';
import { logInfo, logError, logPerformance } from '../middleware/logger.js';
import { createNotFoundError } from '../middleware/errorHandler.js';

/**
 * Upload file to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 key
 * @param {string} contentType - MIME type
 * @returns {Promise<Object>} - Upload result
 */
export async function uploadToS3(buffer, key, contentType) {
  const startTime = Date.now();

  try {
    logInfo(`Uploading to S3: ${key}`, 'S3Service');

    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    const result = await s3Client.send(command);

    logPerformance(`S3 upload: ${key}`, startTime, 'S3Service');

    return {
      success: true,
      key,
      etag: result.ETag,
      bucket: s3Config.bucket,
      region: s3Config.region
    };
  } catch (error) {
    logError(error, `S3Service.uploadToS3(${key})`);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * List objects in S3 with prefix
 * @param {string} prefix - S3 prefix
 * @param {number} maxKeys - Maximum number of keys to return
 * @returns {Promise<Array>} - Array of S3 objects
 */
export async function listS3Objects(prefix, maxKeys = MAX_S3_KEYS) {
  const startTime = Date.now();

  try {
    logInfo(`Listing S3 objects with prefix: ${prefix}`, 'S3Service');

    const command = new ListObjectsV2Command({
      Bucket: s3Config.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys
    });

    const response = await s3Client.send(command);
    const objects = response.Contents || [];

    logPerformance(`S3 list: ${prefix}`, startTime, 'S3Service');

    return objects;
  } catch (error) {
    logError(error, `S3Service.listS3Objects(${prefix})`);
    throw new Error(`Failed to list S3 objects: ${error.message}`);
  }
}

/**
 * Get object from S3
 * @param {string} key - S3 key
 * @returns {Promise<Object>} - S3 object data
 */
export async function getS3Object(key) {
  const startTime = Date.now();

  try {
    logInfo(`Getting S3 object: ${key}`, 'S3Service');

    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    const data = await s3Client.send(command);

    logPerformance(`S3 get: ${key}`, startTime, 'S3Service');

    return data;
  } catch (error) {
    logError(error, `S3Service.getS3Object(${key})`);

    if (error.name === 'NoSuchKey') {
      throw createNotFoundError(`S3 object with key: ${key}`);
    }

    throw new Error(`Failed to get S3 object: ${error.message}`);
  }
}

/**
 * Generate presigned URL for S3 object
 * @param {string} key - S3 key
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<string>} - Presigned URL
 */
export async function generatePresignedUrl(key, expiresIn = URL_EXPIRATION_SECONDS) {
  try {
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logError(error, `S3Service.generatePresignedUrl(${key})`);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
}

/**
 * Upload photo to S3 (both original and thumbnail)
 * @param {Object} originalFile - Processed original file data
 * @param {Object} thumbFile - Processed thumbnail file data (optional)
 * @param {string} eventCode - Event code
 * @param {string} photoId - Photo ID
 * @returns {Promise<Object>} - Upload result with keys and URLs
 */
export async function uploadPhotoToS3(originalFile, thumbFile, eventCode, photoId) {
  const startTime = Date.now();

  try {
    logInfo(`Uploading photo ${photoId} to S3`, 'S3Service');

    // Upload original file
    const originalKey = generateS3Key(eventCode, photoId, 'original');
    const originalUpload = await uploadToS3(
      originalFile.buffer,
      originalKey,
      originalFile.mimetype
    );

    // Upload thumbnail if provided
    let thumbKey = null;
    let thumbUpload = null;

    if (thumbFile && thumbFile.buffer) {
      thumbKey = generateS3Key(eventCode, photoId, 'thumb');
      thumbUpload = await uploadToS3(
        thumbFile.buffer,
        thumbKey,
        thumbFile.mimetype
      );
    }

    // Generate presigned URLs
    const [displayUrl, downloadUrl] = await Promise.all([
      generatePresignedUrl(thumbKey || originalKey),
      generatePresignedUrl(originalKey)
    ]);

    logPerformance(`Photo upload complete: ${photoId}`, startTime, 'S3Service');

    return {
      originalKey,
      thumbKey,
      displayUrl,
      downloadUrl,
      originalUpload,
      thumbUpload,
      bucket: s3Config.bucket,
      region: s3Config.region
    };
  } catch (error) {
    logError(error, `S3Service.uploadPhotoToS3(${photoId})`);
    throw new Error(`Failed to upload photo to S3: ${error.message}`);
  }
}

/**
 * Get photos for an event from S3
 * @param {string} eventCode - Event code
 * @returns {Promise<Array>} - Array of photo objects
 */
export async function getEventPhotos(eventCode) {
  const startTime = Date.now();

  try {
    logInfo(`Fetching photos for event: ${eventCode}`, 'S3Service');

    const prefix = `events/${eventCode}/`;
    const objects = await listS3Objects(prefix);

    // Filter only photo files (original and thumb)
    const photoObjects = objects.filter(obj =>
      obj.Key.includes('_original.jpg') || obj.Key.includes('_thumb.jpg')
    );

    // Group by photo ID
    const photoGroups = {};
    photoObjects.forEach(obj => {
      const photoId = extractPhotoIdFromS3Key(obj.Key);

      if (!photoGroups[photoId]) {
        photoGroups[photoId] = {};
      }

      if (obj.Key.includes('_thumb.jpg')) {
        photoGroups[photoId].thumb = obj;
      } else if (obj.Key.includes('_original.jpg')) {
        photoGroups[photoId].original = obj;
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

    logPerformance(`Event photos fetch: ${eventCode}`, startTime, 'S3Service');

    return photos;
  } catch (error) {
    logError(error, `S3Service.getEventPhotos(${eventCode})`);
    throw new Error(`Failed to get event photos: ${error.message}`);
  }
}

/**
 * Generate URLs for gallery photos
 * @param {Array} photos - Array of photo objects
 * @returns {Promise<Array>} - Array of photos with URLs
 */
export async function generatePhotoUrls(photos) {
  const startTime = Date.now();

  try {
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        const thumbKey = photo.thumb?.Key;
        const originalKey = photo.original?.Key;

        // Use thumbnail if available, otherwise use original
        const displayKey = thumbKey || originalKey;

        const [displayUrl, downloadUrl] = await Promise.all([
          displayKey ? generatePresignedUrl(displayKey) : null,
          originalKey ? generatePresignedUrl(originalKey) : null
        ]);

        return {
          photoId: photo.photoId,
          displayUrl,
          downloadUrl,
          lastModified: photo.original?.LastModified || photo.thumb?.LastModified,
        };
      })
    );

    logPerformance(`URL generation for ${photos.length} photos`, startTime, 'S3Service');

    return photosWithUrls;
  } catch (error) {
    logError(error, 'S3Service.generatePhotoUrls');
    throw new Error(`Failed to generate photo URLs: ${error.message}`);
  }
}