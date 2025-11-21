import {
  SSE_HEARTBEAT_INTERVAL,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY
} from '../config/constants.js';
import { logInfo, logError, logDebug } from '../middleware/logger.js';

// Store active SSE connections per event code
const sseConnections = new Map(); // eventCode -> Set of response objects

/**
 * Add SSE connection for an event
 * @param {string} eventCode - Event code
 * @param {Object} res - Express response object
 */
export function addSSEConnection(eventCode, res) {
  logInfo(`New SSE connection for event: ${eventCode}`, 'SSEService');

  if (!sseConnections.has(eventCode)) {
    sseConnections.set(eventCode, new Set());
  }

  sseConnections.get(eventCode).add(res);

  // Send initial connection message
  sendSSEMessage(res, {
    type: "connected",
    eventCode
  });

  // Set up heartbeat for this connection
  const heartbeat = setInterval(() => {
    sendSSEMessage(res, { type: "heartbeat" });
  }, SSE_HEARTBEAT_INTERVAL);

  // Store heartbeat interval ID for cleanup
  res.heartbeatInterval = heartbeat;

  // Handle connection close
  res.on('close', () => {
    removeSSEConnection(eventCode, res);
  });

  return res;
}

/**
 * Remove SSE connection for an event
 * @param {string} eventCode - Event code
 * @param {Object} res - Express response object
 */
export function removeSSEConnection(eventCode, res) {
  logInfo(`SSE connection closed for event: ${eventCode}`, 'SSEService');

  const connections = sseConnections.get(eventCode);
  if (connections) {
    connections.delete(res);

    // Clean up heartbeat interval
    if (res.heartbeatInterval) {
      clearInterval(res.heartbeatInterval);
    }

    // Remove event code if no more connections
    if (connections.size === 0) {
      sseConnections.delete(eventCode);
    }
  }
}

/**
 * Send message to a specific SSE connection
 * @param {Object} res - Express response object
 * @param {Object} data - Message data
 */
export function sendSSEMessage(res, data) {
  try {
    const message = JSON.stringify(data);
    res.write(`data: ${message}\n\n`);
    logDebug(`SSE message sent: ${message}`, 'SSEService');
  } catch (error) {
    logError(error, 'SSEService.sendSSEMessage');
    // Remove dead connection
    // Note: We can't remove from here directly since we don't know the eventCode
    // The connection will be cleaned up on the next heartbeat failure
  }
}

/**
 * Broadcast message to all connections for an event
 * @param {string} eventCode - Event code
 * @param {Object} data - Message data
 */
export function broadcastToEvent(eventCode, data) {
  const connections = sseConnections.get(eventCode);
  if (!connections || connections.size === 0) {
    logDebug(`No active SSE connections for event: ${eventCode}`, 'SSEService');
    return;
  }

  const message = JSON.stringify(data);
  logInfo(`Broadcasting to ${connections.size} clients for event: ${eventCode}`, 'SSEService');
  logDebug(`Broadcast message: ${message}`, 'SSEService');

  const deadConnections = new Set();

  connections.forEach((res) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch (error) {
      logError(error, 'SSEService.broadcastToEvent');
      deadConnections.add(res);
    }
  });

  // Remove dead connections
  deadConnections.forEach((res) => {
    connections.delete(res);
  });

  // Clean up event code if no more connections
  if (connections.size === 0) {
    sseConnections.delete(eventCode);
  }
}

/**
 * Broadcast photo update to all connections for an event
 * @param {string} eventCode - Event code
 * @param {Object} photoData - Photo data
 */
export function broadcastPhotoUpdate(eventCode, photoData) {
  broadcastToEvent(eventCode, {
    type: "photo_update",
    eventCode,
    photo: photoData
  });
}

/**
 * Get connection count for an event
 * @param {string} eventCode - Event code
 * @returns {number} - Number of active connections
 */
export function getConnectionCount(eventCode) {
  const connections = sseConnections.get(eventCode);
  return connections ? connections.size : 0;
}

/**
 * Get all active events
 * @returns {Array} - Array of event codes with active connections
 */
export function getActiveEvents() {
  return Array.from(sseConnections.keys());
}

/**
 * Get connection statistics
 * @returns {Object} - Connection statistics
 */
export function getConnectionStats() {
  const stats = {
    totalEvents: sseConnections.size,
    totalConnections: 0,
    events: {}
  };

  sseConnections.forEach((connections, eventCode) => {
    stats.totalConnections += connections.size;
    stats.events[eventCode] = connections.size;
  });

  return stats;
}

/**
 * Clean up all connections (useful for server shutdown)
 */
export function cleanupAllConnections() {
  logInfo('Cleaning up all SSE connections', 'SSEService');

  sseConnections.forEach((connections, eventCode) => {
    connections.forEach((res) => {
      try {
        // Clean up heartbeat interval
        if (res.heartbeatInterval) {
          clearInterval(res.heartbeatInterval);
        }

        // Try to end the response
        if (!res.destroyed) {
          res.end();
        }
      } catch (error) {
        logError(error, `SSEService.cleanupAllConnections(${eventCode})`);
      }
    });
  });

  // Clear all connections
  sseConnections.clear();
}

/**
 * Set up SSE response headers
 * @param {Object} res - Express response object
 */
export function setupSSEResponse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });
}

/**
 * Create SSE connection info object
 * @param {string} eventCode - Event code
 * @param {Object} req - Express request object
 * @returns {Object} - Connection info
 */
export function createConnectionInfo(eventCode, req) {
  return {
    eventCode,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent') || 'Unknown',
    connectedAt: new Date().toISOString(),
    reconnectAttempts: 0
  };
}

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logInfo('Received SIGTERM, cleaning up SSE connections', 'SSEService');
  cleanupAllConnections();
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('Received SIGINT, cleaning up SSE connections', 'SSEService');
  cleanupAllConnections();
  process.exit(0);
});