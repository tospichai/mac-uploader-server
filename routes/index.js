import express from 'express';
import photoRoutes from './photos.js';
import healthRoutes from './health.js';
import eventsRoutes from './events.js';

const router = express.Router();

// Mount route modules
router.use('/api', healthRoutes);
router.use('/api/events', eventsRoutes);
router.use('/', photoRoutes); // Keep existing routes for backward compatibility

export default router;