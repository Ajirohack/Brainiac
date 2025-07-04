const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ noServer: true });
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.setupWebSocket(server);
  }

  setupWebSocket(server) {
    // Handle upgrade from HTTP to WebSocket
    server.on('upgrade', (request, socket, head) => {
      // Extract token from query parameters or headers
      const token = this.getTokenFromRequest(request);
      
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request, decoded);
        });
      } catch (error) {
        logger.error('WebSocket authentication failed', { error: error.message });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });

    // Handle new WebSocket connections
    this.wss.on('connection', (ws, request, user) => {
      const userId = user.id;
      
      // Add to clients map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Set up cleanup on close
      const cleanup = () => {
        if (this.clients.has(userId)) {
          this.clients.get(userId).delete(ws);
          if (this.clients.get(userId).size === 0) {
            this.clients.delete(userId);
          }
        }
      };

      ws.on('close', cleanup);
      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message, userId });
        cleanup();
      });

      // Send initial connection confirmation
      this.sendToUser(userId, {
        type: 'connection',
        status: 'connected',
        timestamp: new Date().toISOString(),
      });
    });
  }

  getTokenFromRequest(request) {
    // Try to get token from query params
    const url = new URL(request.url, `http://${request.headers.host}`);
    let token = url.searchParams.get('token');
    
    // If not in query params, try Authorization header
    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    return token;
  }

  /**
   * Send a message to a specific user
   * @param {string} userId - The ID of the user to send the message to
   * @param {object} message - The message to send
   */
  sendToUser(userId, message) {
    if (!this.clients.has(userId)) return;

    const messageString = JSON.stringify(message);
    
    this.clients.get(userId).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString, (error) => {
          if (error) {
            logger.error('Error sending WebSocket message', { error: error.message, userId });
          }
        });
      }
    });
  }

  /**
   * Broadcast a message to all connected clients
   * @param {object} message - The message to broadcast
   */
  broadcast(message) {
    const messageString = JSON.stringify(message);
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  }

  /**
   * Notify a user about file processing status
   * @param {string} userId - The ID of the user to notify
   * @param {string} fileId - The ID of the file being processed
   * @param {string} status - The processing status
   * @param {object} [data] - Additional data about the status
   */
  notifyFileStatus(userId, fileId, status, data = {}) {
    this.sendToUser(userId, {
      type: 'fileStatus',
      fileId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

// Singleton instance
let webSocketService = null;

/**
 * Initialize the WebSocket service
 * @param {http.Server} server - The HTTP server instance
 * @returns {WebSocketService} The WebSocket service instance
 */
function initWebSocketService(server) {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
  }
  return webSocketService;
}

/**
 * Get the WebSocket service instance
 * @returns {WebSocketService} The WebSocket service instance
 */
function getWebSocketService() {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return webSocketService;
}

module.exports = {
  initWebSocketService,
  getWebSocketService,
};
