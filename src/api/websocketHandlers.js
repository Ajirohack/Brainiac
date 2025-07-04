const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

/**
 * WebSocket Handlers for CAI Platform
 * Provides real-time communication interface
 */
class WebSocketHandlers extends EventEmitter {
    constructor(platform, config = {}, logger) {
        super();

        this.platform = platform;
        this.config = {
            port: 8001,
            heartbeat_interval: 30000, // 30 seconds
            max_connections: 1000,
            message_size_limit: 1024 * 1024, // 1MB
            enable_compression: true,
            enable_authentication: false,
            ...config
        };

        this.logger = logger || console;
        this.wss = null;
        this.isRunning = false;

        // Connection management
        this.connections = new Map();
        this.rooms = new Map();

        // Message handlers
        this.messageHandlers = new Map();
        this.initializeMessageHandlers();

        // Statistics
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            messagesByType: new Map(),
            averageResponseTime: 0,
            errors: 0
        };

        // Heartbeat management
        this.heartbeatInterval = null;
    }

    /**
     * Initialize message handlers
     */
    initializeMessageHandlers() {
        // Authentication
        this.messageHandlers.set('auth', this.handleAuth.bind(this));

        // Chat messages
        this.messageHandlers.set('chat', this.handleChat.bind(this));

        // Query requests
        this.messageHandlers.set('query', this.handleQuery.bind(this));

        // Real-time processing
        this.messageHandlers.set('process', this.handleProcess.bind(this));

        // Knowledge management
        this.messageHandlers.set('knowledge_add', this.handleKnowledgeAdd.bind(this));
        this.messageHandlers.set('knowledge_search', this.handleKnowledgeSearch.bind(this));

        // Room management
        this.messageHandlers.set('join_room', this.handleJoinRoom.bind(this));
        this.messageHandlers.set('leave_room', this.handleLeaveRoom.bind(this));

        // Status requests
        this.messageHandlers.set('status', this.handleStatus.bind(this));

        // Ping/Pong
        this.messageHandlers.set('ping', this.handlePing.bind(this));

        // Subscription management
        this.messageHandlers.set('subscribe', this.handleSubscribe.bind(this));
        this.messageHandlers.set('unsubscribe', this.handleUnsubscribe.bind(this));
    }

    /**
     * Start WebSocket server
     */
    async start() {
        try {
            if (this.isRunning) {
                this.logger.warn('⚠️ WebSocket server is already running');
                return;
            }

            const wsOptions = {
                port: this.config.port,
                perMessageDeflate: this.config.enable_compression,
                maxPayload: this.config.message_size_limit
            };

            this.wss = new WebSocket.Server(wsOptions);

            this.wss.on('connection', this.handleConnection.bind(this));
            this.wss.on('error', this.handleServerError.bind(this));

            // Start heartbeat
            this.startHeartbeat();

            this.isRunning = true;
            this.logger.info(`🔌 WebSocket server started on port ${this.config.port}`);

        } catch (error) {
            this.logger.error('❌ Failed to start WebSocket server:', error);
            throw error;
        }
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, request) {
        try {
            const connectionId = uuidv4();
            const clientInfo = {
                id: connectionId,
                ws,
                ip: request.socket.remoteAddress,
                userAgent: request.headers['user-agent'],
                connectedAt: new Date(),
                authenticated: !this.config.enable_authentication,
                subscriptions: new Set(),
                rooms: new Set(),
                lastActivity: new Date(),
                messageCount: 0
            };

            this.connections.set(connectionId, clientInfo);
            this.stats.totalConnections++;
            this.stats.activeConnections++;

            this.logger.debug(`🔗 New WebSocket connection: ${connectionId} from ${clientInfo.ip}`);

            // Setup connection handlers
            ws.on('message', (data) => this.handleMessage(connectionId, data));
            ws.on('close', (code, reason) => this.handleDisconnection(connectionId, code, reason));
            ws.on('error', (error) => this.handleConnectionError(connectionId, error));
            ws.on('pong', () => this.handlePong(connectionId));

            // Send welcome message
            this.sendMessage(connectionId, {
                type: 'welcome',
                connectionId,
                timestamp: new Date().toISOString(),
                serverInfo: {
                    name: 'CAI Platform WebSocket',
                    version: '1.0.0',
                    capabilities: Array.from(this.messageHandlers.keys())
                }
            });

            this.emit('connection', clientInfo);

        } catch (error) {
            this.logger.error('❌ Error handling new connection:', error);
            ws.close(1011, 'Server error');
        }
    }

    /**
     * Handle incoming message
     */
    async handleMessage(connectionId, data) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) {
                this.logger.warn(`⚠️ Message from unknown connection: ${connectionId}`);
                return;
            }

            connection.lastActivity = new Date();
            connection.messageCount++;
            this.stats.totalMessages++;

            // Parse message
            let message;
            try {
                message = JSON.parse(data.toString());
            } catch (parseError) {
                this.sendError(connectionId, 'Invalid JSON format', 'PARSE_ERROR');
                return;
            }

            // Validate message structure
            if (!message.type || !message.id) {
                this.sendError(connectionId, 'Message must have type and id fields', 'INVALID_MESSAGE');
                return;
            }

            // Check authentication if required
            if (this.config.enable_authentication && !connection.authenticated && message.type !== 'auth') {
                this.sendError(connectionId, 'Authentication required', 'AUTH_REQUIRED', message.id);
                return;
            }

            const startTime = Date.now();

            this.logger.debug(`📨 Message from ${connectionId}: ${message.type}`);

            // Update message type statistics
            const typeCount = this.stats.messagesByType.get(message.type) || 0;
            this.stats.messagesByType.set(message.type, typeCount + 1);

            // Handle message
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
                await handler(connectionId, message);
            } else {
                this.sendError(connectionId, `Unknown message type: ${message.type}`, 'UNKNOWN_TYPE', message.id);
            }

            // Update response time statistics
            const responseTime = Date.now() - startTime;
            this.stats.averageResponseTime =
                (this.stats.averageResponseTime * (this.stats.totalMessages - 1) + responseTime) /
                this.stats.totalMessages;

        } catch (error) {
            this.logger.error(`❌ Error handling message from ${connectionId}:`, error);
            this.stats.errors++;
            this.sendError(connectionId, 'Internal server error', 'SERVER_ERROR');
        }
    }

    /**
     * Handle authentication
     */
    async handleAuth(connectionId, message) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            // Simple token-based authentication (can be enhanced)
            const { token, userId } = message.data || {};

            // Validate token (placeholder - implement actual validation)
            const isValid = await this.validateAuthToken(token, userId);

            if (isValid) {
                connection.authenticated = true;
                connection.userId = userId;

                this.sendMessage(connectionId, {
                    type: 'auth_success',
                    id: message.id,
                    data: {
                        userId,
                        authenticated: true
                    }
                });

                this.logger.debug(`✅ Authentication successful for ${connectionId} (user: ${userId})`);
            } else {
                this.sendError(connectionId, 'Invalid authentication credentials', 'AUTH_FAILED', message.id);
            }

        } catch (error) {
            this.logger.error('❌ Authentication error:', error);
            this.sendError(connectionId, 'Authentication error', 'AUTH_ERROR', message.id);
        }
    }

    /**
     * Handle chat message
     */
    async handleChat(connectionId, message) {
        try {
            const { text, context = {}, options = {} } = message.data || {};

            if (!text) {
                this.sendError(connectionId, 'Text is required for chat', 'MISSING_TEXT', message.id);
                return;
            }

            this.logger.debug(`💬 Chat from ${connectionId}: ${text.substring(0, 100)}...`);

            // Send processing notification
            this.sendMessage(connectionId, {
                type: 'chat_processing',
                id: message.id,
                data: { status: 'processing' }
            });

            // Process chat request
            const response = await this.platform.processRequest({
                type: 'chat',
                content: text,
                context,
                options
            });

            // Send response
            this.sendMessage(connectionId, {
                type: 'chat_response',
                id: message.id,
                data: {
                    response: response.response,
                    metadata: response.metadata,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            this.logger.error('❌ Chat processing error:', error);
            this.sendError(connectionId, 'Chat processing failed', 'CHAT_ERROR', message.id);
        }
    }

    /**
     * Handle query message
     */
    async handleQuery(connectionId, message) {
        try {
            const { query, type = 'hybrid', limit = 10 } = message.data || {};

            if (!query) {
                this.sendError(connectionId, 'Query is required', 'MISSING_QUERY', message.id);
                return;
            }

            this.logger.debug(`🔍 Query from ${connectionId}: ${query}`);

            const response = await this.platform.processRequest({
                type: 'query',
                content: query,
                options: { type, limit }
            });

            this.sendMessage(connectionId, {
                type: 'query_response',
                id: message.id,
                data: {
                    results: response.response,
                    metadata: response.metadata,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            this.logger.error('❌ Query processing error:', error);
            this.sendError(connectionId, 'Query processing failed', 'QUERY_ERROR', message.id);
        }
    }

    /**
     * Handle real-time processing
     */
    async handleProcess(connectionId, message) {
        try {
            const { input, system = 'auto', options = {} } = message.data || {};

            if (!input) {
                this.sendError(connectionId, 'Input is required for processing', 'MISSING_INPUT', message.id);
                return;
            }

            this.logger.debug(`⚡ Process from ${connectionId}: ${system}`);

            // Send processing updates
            const progressCallback = (progress) => {
                this.sendMessage(connectionId, {
                    type: 'process_progress',
                    id: message.id,
                    data: progress
                });
            };

            const response = await this.platform.processRequest({
                type: 'process',
                content: input,
                system,
                options: { ...options, progressCallback }
            });

            this.sendMessage(connectionId, {
                type: 'process_complete',
                id: message.id,
                data: {
                    result: response.response,
                    metadata: response.metadata,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            this.logger.error('❌ Processing error:', error);
            this.sendError(connectionId, 'Processing failed', 'PROCESS_ERROR', message.id);
        }
    }

    /**
     * Handle knowledge addition
     */
    async handleKnowledgeAdd(connectionId, message) {
        try {
            const { content, metadata = {}, source = 'websocket' } = message.data || {};

            if (!content) {
                this.sendError(connectionId, 'Content is required', 'MISSING_CONTENT', message.id);
                return;
            }

            const result = await this.platform.ragSystem?.addDocument?.({
                content,
                metadata: { ...metadata, source, addedAt: new Date().toISOString() }
            });

            if (!result) {
                throw new Error('RAG system not available');
            }

            this.sendMessage(connectionId, {
                type: 'knowledge_added',
                id: message.id,
                data: {
                    success: true,
                    documentId: result.id
                }
            });

        } catch (error) {
            this.logger.error('❌ Knowledge addition error:', error);
            this.sendError(connectionId, 'Knowledge addition failed', 'KNOWLEDGE_ERROR', message.id);
        }
    }

    /**
     * Handle knowledge search
     */
    async handleKnowledgeSearch(connectionId, message) {
        try {
            const { query, limit = 10 } = message.data || {};

            if (!query) {
                this.sendError(connectionId, 'Query is required', 'MISSING_QUERY', message.id);
                return;
            }

            const results = await this.platform.ragSystem?.search?.(query, {
                k: parseInt(limit)
            });

            if (!results) {
                throw new Error('RAG system not available');
            }

            this.sendMessage(connectionId, {
                type: 'knowledge_results',
                id: message.id,
                data: {
                    results,
                    query,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            this.logger.error('❌ Knowledge search error:', error);
            this.sendError(connectionId, 'Knowledge search failed', 'SEARCH_ERROR', message.id);
        }
    }

    /**
     * Handle room joining
     */
    async handleJoinRoom(connectionId, message) {
        try {
            const { roomId } = message.data || {};

            if (!roomId) {
                this.sendError(connectionId, 'Room ID is required', 'MISSING_ROOM_ID', message.id);
                return;
            }

            const connection = this.connections.get(connectionId);
            if (!connection) return;

            // Add to room
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, new Set());
            }

            this.rooms.get(roomId).add(connectionId);
            connection.rooms.add(roomId);

            this.sendMessage(connectionId, {
                type: 'room_joined',
                id: message.id,
                data: { roomId }
            });

            // Notify other room members
            this.broadcastToRoom(roomId, {
                type: 'user_joined',
                data: {
                    connectionId,
                    roomId,
                    timestamp: new Date().toISOString()
                }
            }, connectionId);

            this.logger.debug(`🏠 ${connectionId} joined room ${roomId}`);

        } catch (error) {
            this.logger.error('❌ Room join error:', error);
            this.sendError(connectionId, 'Failed to join room', 'ROOM_ERROR', message.id);
        }
    }

    /**
     * Handle room leaving
     */
    async handleLeaveRoom(connectionId, message) {
        try {
            const { roomId } = message.data || {};

            if (!roomId) {
                this.sendError(connectionId, 'Room ID is required', 'MISSING_ROOM_ID', message.id);
                return;
            }

            this.removeFromRoom(connectionId, roomId);

            this.sendMessage(connectionId, {
                type: 'room_left',
                id: message.id,
                data: { roomId }
            });

            this.logger.debug(`🚪 ${connectionId} left room ${roomId}`);

        } catch (error) {
            this.logger.error('❌ Room leave error:', error);
            this.sendError(connectionId, 'Failed to leave room', 'ROOM_ERROR', message.id);
        }
    }

    /**
     * Handle status request
     */
    async handleStatus(connectionId, message) {
        try {
            const status = await this.platform.getStatus();

            this.sendMessage(connectionId, {
                type: 'status_response',
                id: message.id,
                data: {
                    platform: status,
                    websocket: this.getStats(),
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            this.logger.error('❌ Status request error:', error);
            this.sendError(connectionId, 'Failed to get status', 'STATUS_ERROR', message.id);
        }
    }

    /**
     * Handle ping
     */
    async handlePing(connectionId, message) {
        this.sendMessage(connectionId, {
            type: 'pong',
            id: message.id,
            data: {
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Handle subscription
     */
    async handleSubscribe(connectionId, message) {
        try {
            const { events } = message.data || {};

            if (!Array.isArray(events)) {
                this.sendError(connectionId, 'Events array is required', 'MISSING_EVENTS', message.id);
                return;
            }

            const connection = this.connections.get(connectionId);
            if (!connection) return;

            for (const event of events) {
                connection.subscriptions.add(event);
            }

            this.sendMessage(connectionId, {
                type: 'subscribed',
                id: message.id,
                data: {
                    events,
                    totalSubscriptions: connection.subscriptions.size
                }
            });

            this.logger.debug(`📡 ${connectionId} subscribed to ${events.join(', ')}`);

        } catch (error) {
            this.logger.error('❌ Subscription error:', error);
            this.sendError(connectionId, 'Subscription failed', 'SUBSCRIPTION_ERROR', message.id);
        }
    }

    /**
     * Handle unsubscription
     */
    async handleUnsubscribe(connectionId, message) {
        try {
            const { events } = message.data || {};

            if (!Array.isArray(events)) {
                this.sendError(connectionId, 'Events array is required', 'MISSING_EVENTS', message.id);
                return;
            }

            const connection = this.connections.get(connectionId);
            if (!connection) return;

            for (const event of events) {
                connection.subscriptions.delete(event);
            }

            this.sendMessage(connectionId, {
                type: 'unsubscribed',
                id: message.id,
                data: {
                    events,
                    totalSubscriptions: connection.subscriptions.size
                }
            });

            this.logger.debug(`📡 ${connectionId} unsubscribed from ${events.join(', ')}`);

        } catch (error) {
            this.logger.error('❌ Unsubscription error:', error);
            this.sendError(connectionId, 'Unsubscription failed', 'SUBSCRIPTION_ERROR', message.id);
        }
    }

    /**
     * Handle connection disconnection
     */
    handleDisconnection(connectionId, code, reason) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            this.logger.debug(`🔌 Connection ${connectionId} disconnected (code: ${code})`);

            // Remove from all rooms
            for (const roomId of connection.rooms) {
                this.removeFromRoom(connectionId, roomId);
            }

            // Remove connection
            this.connections.delete(connectionId);
            this.stats.activeConnections--;

            this.emit('disconnection', { connectionId, code, reason });

        } catch (error) {
            this.logger.error('❌ Error handling disconnection:', error);
        }
    }

    /**
     * Handle connection error
     */
    handleConnectionError(connectionId, error) {
        this.logger.error(`❌ Connection error for ${connectionId}:`, error);
        this.stats.errors++;
    }

    /**
     * Handle server error
     */
    handleServerError(error) {
        this.logger.error('❌ WebSocket server error:', error);
        this.stats.errors++;
    }

    /**
     * Handle pong response
     */
    handlePong(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.lastActivity = new Date();
        }
    }

    /**
     * Send message to connection
     */
    sendMessage(connectionId, message) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
                return false;
            }

            const messageStr = JSON.stringify({
                ...message,
                timestamp: message.timestamp || new Date().toISOString()
            });

            connection.ws.send(messageStr);
            return true;

        } catch (error) {
            this.logger.error(`❌ Error sending message to ${connectionId}:`, error);
            return false;
        }
    }

    /**
     * Send error message
     */
    sendError(connectionId, message, code = 'ERROR', requestId = null) {
        this.sendMessage(connectionId, {
            type: 'error',
            id: requestId,
            data: {
                message,
                code,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Broadcast message to all connections
     */
    broadcast(message, excludeConnectionId = null) {
        let sentCount = 0;

        for (const [connectionId, connection] of this.connections) {
            if (connectionId !== excludeConnectionId &&
                connection.ws.readyState === WebSocket.OPEN) {
                if (this.sendMessage(connectionId, message)) {
                    sentCount++;
                }
            }
        }

        return sentCount;
    }

    /**
     * Broadcast message to room
     */
    broadcastToRoom(roomId, message, excludeConnectionId = null) {
        const room = this.rooms.get(roomId);
        if (!room) return 0;

        let sentCount = 0;

        for (const connectionId of room) {
            if (connectionId !== excludeConnectionId) {
                if (this.sendMessage(connectionId, message)) {
                    sentCount++;
                }
            }
        }

        return sentCount;
    }

    /**
     * Broadcast to subscribers
     */
    broadcastToSubscribers(eventType, message) {
        let sentCount = 0;

        for (const [connectionId, connection] of this.connections) {
            if (connection.subscriptions.has(eventType) &&
                connection.ws.readyState === WebSocket.OPEN) {
                if (this.sendMessage(connectionId, {
                    type: 'event',
                    data: {
                        eventType,
                        ...message
                    }
                })) {
                    sentCount++;
                }
            }
        }

        return sentCount;
    }

    /**
     * Remove connection from room
     */
    removeFromRoom(connectionId, roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.delete(connectionId);

            // Clean up empty rooms
            if (room.size === 0) {
                this.rooms.delete(roomId);
            } else {
                // Notify other room members
                this.broadcastToRoom(roomId, {
                    type: 'user_left',
                    data: {
                        connectionId,
                        roomId,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }

        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.rooms.delete(roomId);
        }
    }

    /**
     * Start heartbeat mechanism
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = new Date();
            const timeout = this.config.heartbeat_interval * 2;

            for (const [connectionId, connection] of this.connections) {
                const timeSinceLastActivity = now - connection.lastActivity;

                if (timeSinceLastActivity > timeout) {
                    this.logger.debug(`💔 Closing inactive connection: ${connectionId}`);
                    connection.ws.close(1000, 'Inactive connection');
                } else if (connection.ws.readyState === WebSocket.OPEN) {
                    // Send ping
                    connection.ws.ping();
                }
            }
        }, this.config.heartbeat_interval);
    }

    /**
     * Stop heartbeat mechanism
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Validate authentication token
     */
    async validateAuthToken(token, userId) {
        // Placeholder implementation - replace with actual authentication logic
        if (!token || !userId) return false;

        // Simple validation for demo purposes
        return token.length > 10 && userId.length > 0;
    }

    /**
     * Get WebSocket server statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            port: this.config.port,
            activeRooms: this.rooms.size,
            messageHandlers: this.messageHandlers.size
        };
    }

    /**
     * Stop WebSocket server
     */
    async stop() {
        try {
            if (!this.isRunning) {
                this.logger.warn('⚠️ WebSocket server is not running');
                return;
            }

            this.stopHeartbeat();

            // Close all connections
            for (const [connectionId, connection] of this.connections) {
                connection.ws.close(1001, 'Server shutting down');
            }

            // Close server
            if (this.wss) {
                await new Promise((resolve) => {
                    this.wss.close(() => {
                        this.isRunning = false;
                        this.logger.info('✅ WebSocket server stopped');
                        resolve();
                    });
                });
            }

        } catch (error) {
            this.logger.error('❌ Error stopping WebSocket server:', error);
            throw error;
        }
    }
}

module.exports = WebSocketHandlers;