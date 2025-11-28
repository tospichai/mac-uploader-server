import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/index.js';

/**
 * Generate JWT token for photographer
 * @param {Object} payload - Data to include in token
 * @returns {string} JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    issuer: 'photo-uploader-server',
    audience: 'photo-uploader-client'
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtConfig.secret, {
      issuer: 'photo-uploader-server',
      audience: 'photo-uploader-client'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} JWT token or null if not found
 */
export function extractTokenFromHeader(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}