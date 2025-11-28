import express from "express";
import { validateApiKeyOptional } from "../middleware/auth.js";
import { createSuccessResponse } from "../utils/responseUtils.js";

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get("/health", validateApiKeyOptional, (req, res) => {
  const healthData = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
  };

  res.json(createSuccessResponse(healthData, "Server is running"));
});

export default router;
