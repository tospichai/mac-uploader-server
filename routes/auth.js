import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateJwtToken } from '../middleware/jwtAuth.js';
import {
  createPhotographer,
  authenticatePhotographer,
  getPhotographerById,
  updatePhotographer,
  checkPhotographerExists
} from '../services/photographerService.js';
import { validateRegistration, validateLogin } from '../utils/validation.js';
import { generateToken } from '../utils/jwtUtils.js';
import {
  createSuccessResponse,
  createErrorResponse
} from '../utils/responseUtils.js';
import { ERROR_MESSAGES } from '../config/constants.js';
import { logInfo, logError } from '../middleware/logger.js';

const router = express.Router();

/**
 * Register new photographer
 * POST /api/auth/register
 */
router.post('/register', asyncHandler(async (req, res) => {
  logInfo('Photographer registration request', 'AuthRoute');

  const {
    username,
    email,
    password,
    displayName,
    logoUrl,
    facebookUrl,
    instagramUrl,
    twitterUrl,
    websiteUrl
  } = req.body;

  // Validate registration data
  const validation = validateRegistration({
    username,
    email,
    password,
    displayName,
    facebookUrl,
    instagramUrl,
    twitterUrl,
    websiteUrl
  });

  if (!validation.isValid) {
    return res.status(400).json(
      createErrorResponse(validation.errors.join(', '), 400)
    );
  }

  try {
    // Check if photographer already exists
    const exists = await checkPhotographerExists(username, email);

    if (exists.usernameExists) {
      return res.status(409).json(
        createErrorResponse(ERROR_MESSAGES.USERNAME_EXISTS, 409)
      );
    }

    if (exists.emailExists) {
      return res.status(409).json(
        createErrorResponse(ERROR_MESSAGES.EMAIL_EXISTS, 409)
      );
    }

    // Create photographer
    const photographer = await createPhotographer({
      username,
      email,
      password,
      displayName,
      logoUrl,
      facebookUrl,
      instagramUrl,
      twitterUrl,
      websiteUrl
    });

    // Generate JWT token for automatic login
    const token = generateToken({
      photographerId: photographer.id,
      username: photographer.username,
      email: photographer.email
    });

    logInfo(`Photographer registered and logged in: ${photographer.username}`, 'AuthRoute');

    res.status(201).json(
      createSuccessResponse({
        message: 'Photographer registered successfully',
        user: photographer,
        token
      })
    );
  } catch (error) {
    logError(error, 'AuthRoute.register');

    res.status(500).json(
      createErrorResponse(ERROR_MESSAGES.REGISTRATION_FAILED, 500)
    );
  }
}));

/**
 * Login photographer
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(async (req, res) => {
  logInfo('Photographer login request', 'AuthRoute');

  const { username, email, password } = req.body;
  const usernameOrEmail = username || email;

  // Validate login data
  const validation = validateLogin({ username, email, password });

  if (!validation.isValid) {
    return res.status(400).json(
      createErrorResponse(validation.errors.join(', '), 400)
    );
  }

  try {
    // Authenticate photographer
    const result = await authenticatePhotographer(usernameOrEmail, password);

    logInfo(`Photographer logged in: ${result.photographer.username}`, 'AuthRoute');

    res.json(
      createSuccessResponse({
        message: 'Login successful',
        user: result.photographer,
        token: result.token
      })
    );
  } catch (error) {
    logError(error, 'AuthRoute.login');

    if (error.message === 'Photographer not found' ||
        error.message === 'Invalid password') {
      return res.status(401).json(
        createErrorResponse(ERROR_MESSAGES.INVALID_CREDENTIALS, 401)
      );
    }

    if (error.message === 'Photographer account is inactive') {
      return res.status(403).json(
        createErrorResponse(ERROR_MESSAGES.USER_INACTIVE, 403)
      );
    }

    res.status(500).json(
      createErrorResponse(ERROR_MESSAGES.LOGIN_FAILED, 500)
    );
  }
}));

/**
 * Get current photographer profile
 * GET /api/auth/me
 */
router.get('/me', validateJwtToken, asyncHandler(async (req, res) => {
  const photographerId = req.photographer.id;

  try {
    const photographer = await getPhotographerById(photographerId);

    logInfo(`Photographer profile retrieved: ${photographer.username}`, 'AuthRoute');

    res.json(
      createSuccessResponse({
        photographer
      })
    );
  } catch (error) {
    logError(error, 'AuthRoute.getProfile');

    if (error.message === 'Photographer not found') {
      return res.status(404).json(
        createErrorResponse(ERROR_MESSAGES.USER_NOT_FOUND, 404)
      );
    }

    res.status(500).json(
      createErrorResponse('Failed to get profile', 500)
    );
  }
}));

/**
 * Update photographer profile
 * PUT /api/auth/profile
 */
router.put('/profile', validateJwtToken, asyncHandler(async (req, res) => {
  const photographerId = req.photographer.id;

  const {
    displayName,
    logoUrl,
    facebookUrl,
    instagramUrl,
    twitterUrl,
    websiteUrl
  } = req.body;

  try {
    const updatedPhotographer = await updatePhotographer(photographerId, {
      displayName,
      logoUrl,
      facebookUrl,
      instagramUrl,
      twitterUrl,
      websiteUrl
    });

    logInfo(`Photographer profile updated: ${updatedPhotographer.username}`, 'AuthRoute');

    res.json(
      createSuccessResponse({
        message: 'Profile updated successfully',
        photographer: updatedPhotographer
      })
    );
  } catch (error) {
    logError(error, 'AuthRoute.updateProfile');

    if (error.message === 'Photographer not found') {
      return res.status(404).json(
        createErrorResponse(ERROR_MESSAGES.USER_NOT_FOUND, 404)
      );
    }

    if (error.message === 'Username already exists' ||
        error.message === 'Email already exists') {
      return res.status(409).json(
        createErrorResponse(error.message, 409)
      );
    }

    res.status(500).json(
      createErrorResponse('Failed to update profile', 500)
    );
  }
}));

/**
 * Logout photographer (client-side token removal)
 * POST /api/auth/logout
 */
router.post('/logout', asyncHandler(async (req, res) => {
  // In a stateless JWT implementation, logout is handled client-side
  // by removing the token from storage
  // For server-side logout, we would need to implement token blacklisting

  logInfo('Photographer logout request', 'AuthRoute');

  res.json(
    createSuccessResponse({
      message: 'Logout successful. Please remove the token from client storage.'
    })
  );
}));

export default router;
