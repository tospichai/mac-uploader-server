import express from "express";
import healthRoutes from "./health.js";
import eventsRoutes from "./events.js";
import authRoutes from "./auth.js";
import systemInfoRoutes from "./system-info.js";

const router = express.Router();

// Mount route modules
router.use("/api", healthRoutes);
router.use("/api/events", eventsRoutes);
router.use("/api/auth", authRoutes);
router.use("/api", systemInfoRoutes);

export default router;
