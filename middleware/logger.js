/**
 * Request logging middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress || 'Unknown';

  console.log(`${timestamp} - ${method} ${url}`);
  console.log(`IP: ${ip} | User-Agent: ${userAgent}`);
  console.log("Headers:", req.headers);

  if (req.method === "POST") {
    console.log("Body:", req.body);
    console.log("Files:", req.files);
  }

  console.log('---'); // Separator for readability

  // Add request start time for calculating duration
  req.startTime = Date.now();

  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const statusCode = res.statusCode;
    console.log(`${timestamp} - ${method} ${url} - ${statusCode} - ${duration}ms`);
    console.log('---');
  });

  next();
}

/**
 * Error logging utility
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 */
export function logError(error, context = 'Unknown') {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR in ${context}:`);
  console.error(`Message: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  console.error('---');
}

/**
 * Info logging utility
 * @param {string} message - The info message
 * @param {string} context - Context of the info message
 */
export function logInfo(message, context = 'Info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${context}: ${message}`);
}

/**
 * Debug logging utility (only logs in development)
 * @param {string} message - The debug message
 * @param {string} context - Context of the debug message
 */
export function logDebug(message, context = 'Debug') {
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${context}: ${message}`);
  }
}

/**
 * Performance logging utility
 * @param {string} operation - Name of the operation
 * @param {number} startTime - Start time in milliseconds
 * @param {string} context - Additional context
 */
export function logPerformance(operation, startTime, context = 'Performance') {
  const duration = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${context}: ${operation} took ${duration}ms`);
}