import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateConfig, serverConfig } from './config/index.js';
import { testDatabaseConnection } from './config/database.js';
import { setupCors } from './middleware/cors.js';
import { requestLogger } from './middleware/logger.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import eventManagementRoutes from './routes/eventManagement.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize server
async function initializeServer() {
  // Validate configuration
  validateConfig();

  // Test database connection
  await testDatabaseConnection();

  // Create Express app
  const app = express();

// Setup middleware
setupCors(app);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads BEFORE routes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Max 10 files
  }
});

app.use(requestLogger);

// Serve static files
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Serve local files (only used in local mode) with CORS headers
app.use('/api/files', (req, res, next) => {
  // Add CORS headers for static file serving
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Cache-Control");
  res.header("Access-Control-Allow-Methods", "GET");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Mount routes AFTER all middleware
app.use('/', routes);
app.use('/api/events', eventManagementRoutes);

// Handle 404 errors
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

  // Start server
  const PORT = serverConfig.port;
  const server = app.listen(PORT, () => {
    console.log(`🚀 Photo upload server running on http://localhost:${PORT}`);
    console.log(`📁 Environment: ${serverConfig.nodeEnv}`);
    console.log(`🔧 API Key: ${process.env.EXPECTED_API_KEY ? 'Configured' : 'Not configured (using default)'}`);
    console.log(`🪣 S3 Bucket: ${process.env.S3_BUCKET || 'khai-photo'}`);
    console.log(`🌍 AWS Region: ${process.env.AWS_REGION || 'ap-southeast-1'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });

  return app;
}

// Initialize the server
const app = initializeServer().catch(error => {
  console.error('❌ Failed to initialize server:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

export default app;
