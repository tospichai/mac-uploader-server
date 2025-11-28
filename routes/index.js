import express from "express";
import healthRoutes from "./health.js";
import eventsRoutes from "./events.js";

const router = express.Router();
// Mount route modules
router.use("/api", healthRoutes);
router.use("/api/events", eventsRoutes);

export default router;
