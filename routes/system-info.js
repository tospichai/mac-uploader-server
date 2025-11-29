import express from "express";
import { createSuccessResponse } from "../utils/responseUtils.js";
import { validateJwtToken } from "../middleware/jwtAuth.js";

const router = express.Router();

/**
 * System information endpoint
 * GET /api/system-information
 */
router.get("/system-information", validateJwtToken, (req, res) => {
  const systemInfo = {
    data: {
      backendEndpoint: "http://localhost:3001",
      frontendEndpoint: "http://localhost:3000",
    },
  };

  res.json(
    createSuccessResponse(
      systemInfo,
      "System information retrieved successfully"
    )
  );
});

export default router;
