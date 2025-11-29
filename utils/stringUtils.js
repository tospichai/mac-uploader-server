/**
 * Generate URL-friendly slug from text
 * @param {string} text - Text to convert to slug
 * @returns {string} - URL-friendly slug
 */
export function generateSlug(text) {
  if (!text) {
    return '';
  }

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars except -
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Generate unique slug by appending number if needed
 * @param {string} baseText - Base text to generate slug from
 * @param {Function} checkExists - Function to check if slug exists
 * @returns {Promise<string>} - Unique slug
 */
export async function generateUniqueSlug(baseText, checkExists) {
  let slug = generateSlug(baseText);
  let counter = 1;
  let originalSlug = slug;

  // Keep trying until we find a unique slug
  while (await checkExists(slug)) {
    slug = `${originalSlug}-${counter}`;
    counter++;

    // Prevent infinite loop
    if (counter > 100) {
      throw new Error('Unable to generate unique slug after 100 attempts');
    }
  }

  return slug;
}

/**
 * Validate folder name format
 * @param {string} folderName - Folder name to validate
 * @returns {Object} - Validation result
 */
export function validateFolderName(folderName) {
  if (!folderName) {
    return {
      isValid: false,
      error: 'Folder name is required'
    };
  }

  if (folderName.length < 3) {
    return {
      isValid: false,
      error: 'Folder name must be at least 3 characters long'
    };
  }

  if (folderName.length > 100) {
    return {
      isValid: false,
      error: 'Folder name must be less than 100 characters'
    };
  }

  // Only allow alphanumeric, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(folderName)) {
    return {
      isValid: false,
      error: 'Folder name can only contain letters, numbers, hyphens, and underscores'
    };
  }

  return {
    isValid: true,
    error: null
  };
}

/**
 * Sanitize folder name for filesystem
 * @param {string} folderName - Folder name to sanitize
 * @returns {string} - Sanitized folder name
 */
export function sanitizeFolderName(folderName) {
  if (!folderName) {
    return '';
  }

  return folderName
    .toString()
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')  // Remove invalid filesystem characters
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .toLowerCase();
}

/**
 * Validate language code
 * @param {string} language - Language code to validate
 * @returns {boolean} - True if valid
 */
export function isValidLanguage(language) {
  const validLanguages = ['th', 'en', 'cn', 'vn'];
  return validLanguages.includes(language);
}

/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate random string for temporary names
 * @param {number} length - Length of string to generate
 * @returns {string} - Random string
 */
export function generateRandomString(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}