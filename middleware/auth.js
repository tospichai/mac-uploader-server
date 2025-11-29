import { apiConfig } from "../config/index.js";
import { createErrorResponse } from "../utils/responseUtils.js";
import { ERROR_MESSAGES } from "../config/constants.js";
import { getPhotographerByApiKey } from "../services/photographerService.js";

/**
 * Middleware to validate API key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function validateApiKey(req, res, next) {
  // Skip API key validation for health check
  if (req.path === "/api/health") {
    return next();
  }

  const apiKeyFromQuery = req.query.api_key;
  const apiKeyFromBody = req.body ? req.body.api_key : null;
  const apiKeyFromHeader = req.headers["x-api-key"];
  const clientApiKey =
    apiKeyFromQuery || apiKeyFromBody || apiKeyFromHeader || null;

  if (apiConfig.expectedApiKey && clientApiKey !== apiConfig.expectedApiKey) {
    return res
      .status(401)
      .json(createErrorResponse(ERROR_MESSAGES.INVALID_API_KEY, 401));
  }

  next();
}

/**
 * Middleware to validate API key for health check (optional)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function validateApiKeyOptional(req, res, next) {
  const apiKeyFromQuery = req.query.api_key;
  const clientApiKey = apiKeyFromQuery || null;

  // Skip validation if no API key is provided (optional)
  if (!clientApiKey) {
    return next();
  }

  // Check if it's a photographer API key
  try {
    const photographer = await getPhotographerByApiKey(clientApiKey);
    // Attach photographer to request for later use
    req.photographer = photographer;
    return next();
  } catch (error) {
    console.log('error', error)
    return res
      .status(401)
      .json(createErrorResponse(ERROR_MESSAGES.INVALID_API_KEY, 401));
  }
}
