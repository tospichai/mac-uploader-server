// ES modules import for passwordUtils
import { validatePasswordStrength } from './passwordUtils.js';

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if email is valid
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateUsername(username) {
  const errors = [];

  if (!username) {
    errors.push('Username is required');
    return { isValid: false, errors };
  }

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username.length > 30) {
    errors.push('Username must be less than 30 characters long');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate email format and structure
 * @param {string} email - Email to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateEmail(email) {
  const errors = [];

  if (!email) {
    errors.push('Email is required');
    return { isValid: false, errors };
  }

  if (!isValidEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  if (email.length > 255) {
    errors.push('Email must be less than 255 characters long');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate display name
 * @param {string} displayName - Display name to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateDisplayName(displayName) {
  const errors = [];

  if (!displayName) {
    errors.push('Display name is required');
    return { isValid: false, errors };
  }

  if (displayName.length < 2) {
    errors.push('Display name must be at least 2 characters long');
  }

  if (displayName.length > 100) {
    errors.push('Display name must be less than 100 characters long');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is valid or empty
 */
export function isValidUrl(url) {
  if (!url || url.trim() === '') {
    return true; // Empty URLs are allowed
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate social media URLs
 * @param {Object} urls - Object containing social media URLs
 * @returns {Object} Validation result with isValid and errors
 */
export function validateSocialUrls(urls) {
  const errors = [];
  const { facebookUrl, instagramUrl, twitterUrl, websiteUrl } = urls;

  if (facebookUrl && !isValidUrl(facebookUrl)) {
    errors.push('Facebook URL is not valid');
  }

  if (instagramUrl && !isValidUrl(instagramUrl)) {
    errors.push('Instagram URL is not valid');
  }

  if (twitterUrl && !isValidUrl(twitterUrl)) {
    errors.push('Twitter URL is not valid');
  }

  if (websiteUrl && !isValidUrl(websiteUrl)) {
    errors.push('Website URL is not valid');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate registration data
 * @param {Object} data - Registration data
 * @returns {Object} Validation result with isValid and errors
 */
export function validateRegistration(data) {
  const errors = [];

  // Validate username
  const usernameValidation = validateUsername(data.username);
  if (!usernameValidation.isValid) {
    errors.push(...usernameValidation.errors);
  }

  // Validate email
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) {
    errors.push(...emailValidation.errors);
  }

  // Validate display name
  const displayNameValidation = validateDisplayName(data.displayName);
  if (!displayNameValidation.isValid) {
    errors.push(...displayNameValidation.errors);
  }

  // Validate password
  const passwordValidation = validatePasswordStrength(data.password);
  if (!passwordValidation.isValid) {
    errors.push(...passwordValidation.errors);
  }

  // Validate social URLs
  const socialUrlsValidation = validateSocialUrls({
    facebookUrl: data.facebookUrl,
    instagramUrl: data.instagramUrl,
    twitterUrl: data.twitterUrl,
    websiteUrl: data.websiteUrl
  });
  if (!socialUrlsValidation.isValid) {
    errors.push(...socialUrlsValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate login data
 * @param {Object} data - Login data
 * @returns {Object} Validation result with isValid and errors
 */
export function validateLogin(data) {
  const errors = [];

  if (!data.username && !data.email) {
    errors.push('Username or email is required');
  }

  if (!data.password) {
    errors.push('Password is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}