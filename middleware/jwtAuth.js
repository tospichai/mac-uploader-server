import { extractTokenFromHeader, verifyToken } from '../utils/jwtUtils.js';
import { createErrorResponse } from '../utils/responseUtils.js';
import { ERROR_MESSAGES } from '../config/constants.js';

/**
 * Middleware to validate JWT token for photographer authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function validateJwtToken(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json(
        createErrorResponse(ERROR_MESSAGES.MISSING_AUTH_TOKEN, 401)
      );
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach photographer data to request object
    req.photographer = {
      id: decoded.photographerId,
      username: decoded.username,
      email: decoded.email
    };

    // Also attach as user for backward compatibility
    req.user = req.photographer;

    next();
  } catch (error) {
    console.error('JWT validation error:', error.message);

    let errorMessage = ERROR_MESSAGES.INVALID_AUTH_TOKEN;
    if (error.message === 'Token has expired') {
      errorMessage = 'Token has expired';
    }

    return res.status(401).json(
      createErrorResponse(errorMessage, 401)
    );
  }
}

/**
 * Optional JWT validation middleware - doesn't fail if no token provided
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function validateJwtTokenOptional(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      // Verify token if provided
      const decoded = verifyToken(token);

      // Attach photographer data to request object
      req.photographer = {
        id: decoded.photographerId,
        username: decoded.username,
        email: decoded.email
      };

      // Also attach as user for backward compatibility
      req.user = req.photographer;
    }

    next();
  } catch (error) {
    console.error('Optional JWT validation error:', error.message);
    // Don't fail the request, just continue without photographer data
    next();
  }
}

/**
 * Middleware to check if photographer is active
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireActivePhotographer(req, res, next) {
  // This middleware should be used after validateJwtToken
  // and will check if the photographer is active in the database
  // For now, we'll assume the photographer is active if they have a valid token
  // In a real implementation, you might want to check the database
  next();
}

// Export the main authentication middleware as jwtAuth
export { validateJwtToken as jwtAuth };