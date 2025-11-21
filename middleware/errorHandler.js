import { createErrorResponse } from '../utils/responseUtils.js';
import { logError } from './logger.js';

/**
 * Global error handling middleware
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function globalErrorHandler(err, req, res, next) {
  // Log the error
  logError(err, `${req.method} ${req.url}`);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json(
      createErrorResponse('Validation Error', 400, { details: err.message })
    );
  }

  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }

    return res.status(400).json(
      createErrorResponse(message, 400, { multerError: err.code })
    );
  }

  if (err.name === 'AWSError') {
    return res.status(500).json(
      createErrorResponse('AWS Service Error', 500, { awsError: err.message })
    );
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json(
    createErrorResponse(message, statusCode, {
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    })
  );
}

/**
 * 404 Not Found middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json(
    createErrorResponse(`Route ${req.originalUrl} not found`, 404)
  );
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - The async route handler function
 * @returns {Function} - Wrapped function with error handling
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create a validation error
 * @param {string} message - Error message
 * @param {Object} details - Error details
 * @returns {AppError} - Validation error instance
 */
export function createValidationError(message, details = {}) {
  return new AppError(message, 400, details);
}

/**
 * Create a not found error
 * @param {string} resource - Resource name
 * @returns {AppError} - Not found error instance
 */
export function createNotFoundError(resource = 'Resource') {
  return new AppError(`${resource} not found`, 404);
}

/**
 * Create an unauthorized error
 * @param {string} message - Error message
 * @returns {AppError} - Unauthorized error instance
 */
export function createUnauthorizedError(message = 'Unauthorized') {
  return new AppError(message, 401);
}