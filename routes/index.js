import express from 'express';
import photoRoutes from './photos.js';
import healthRoutes from './health.js';

const router = express.Router();

// Mount route modules
router.use('/api', healthRoutes);
router.use('/api/events', photoRoutes);
router.use('/', photoRoutes);

export default router;