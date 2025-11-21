// File type constants
export const ALLOWED_DIRECT_UPLOAD_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
export const NEF_EXTENSION = '.nef';

// Image processing constants
export const IMAGE_MAX_WIDTH = 2048;
export const JPEG_QUALITY = 85;
export const PROGRESSIVE_JPEG = true;

// Pagination constants
export const PHOTOS_PER_PAGE = 20;
export const MAX_S3_KEYS = 1000;

// SSE constants
export const SSE_HEARTBEAT_INTERVAL = 30000; // 30 seconds
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_DELAY = 3000; // 3 seconds

// URL expiration constants
export const URL_EXPIRATION_SECONDS = 3600; // 1 hour

// Error messages
export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'Invalid API key',
  MISSING_ORIGINAL_FILE: 'original_file is required',
  FILE_PROCESSING_FAILED: 'File processing failed',
  UNSUPPORTED_FORMAT: 'Unsupported file format',
  FAILED_TO_PROCESS_NEF: 'Failed to process NEF file',
  DOWNLOAD_FAILED: 'Download failed',
  EVENT_CODE_REQUIRED: 'eventCode query parameter is required',
  INVALID_RESPONSE: 'Invalid response from server',
  DOWNLOAD_ERROR: 'ไม่สามารถดาวน์โหลดไฟล์ได้'
};

// Success messages
export const SUCCESS_MESSAGES = {
  PHOTO_UPLOADED: 'Photo uploaded successfully',
  SERVER_RUNNING: 'Server is running',
  SSE_CONNECTED: 'เชื่อมต่อแบบเรียลไทม์แล้ว',
  NEW_PHOTO: 'มีรูปใหม่!',
  RECONNECTING: 'พยายามเชื่อมต่อใหม่...',
  SSE_CONNECTION_FAILED: 'ไม่สามารถเชื่อมต่อแบบเรียลไทม์ได้ กรุณารีเฟรชหน้า'
};