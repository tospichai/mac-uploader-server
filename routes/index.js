import express from "express";
import healthRoutes from "./health.js";
import eventsRoutes from "./events.js";
import authRoutes from "./auth.js";
import { validateJwtToken } from "../middleware/jwtAuth.js";

const router = express.Router();

// Mount route modules
router.use("/api", healthRoutes);
router.use("/api/events", eventsRoutes);
router.use("/api/auth", authRoutes);

// Protected routes example (you can add more protected routes here)
// router.use("/api/photographers", validateJwtToken, photographerRoutes);

export default router;
