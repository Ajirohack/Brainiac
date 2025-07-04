const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { body, query, validationResult } = require('express-validator');

/**
 * REST API Endpoints for CAI Platform
 * Provides HTTP interface for all platform capabilities
 */
class RestEndpoints {
    constructor(platform, config = {}, logger) {
        this.platform = platform;
        this.config = {
            port: 8000,
            cors_origin: '*',
            rate_limit_window: 15 * 60 * 1000, // 15 minutes
            rate_limit_max: 100, // requests per window
            enable_compression: true,
            enable_security: true,
            api_prefix: '/api/v1',
            ...config
        };

        this.logger = logger || console;
        this.app = express();
        this.server = null;
        this.isRunning = false;

        // Request tracking
        this.requestStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            endpointStats: new Map()
        };

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security middleware
        if (this.config.enable_security) {
            this.app.use(helmet());
        }

        // CORS
        this.app.use(cors({
            origin: this.config.cors_origin,
            credentials: true
        }));

        // Compression
        if (this.config.enable_compression) {
            this.app.use(compression());
        }

        // Rate limiting
        const limiter = rateLimit({
            windowMs: this.config.rate_limit_window,
            max: this.config.rate_limit_max,
            message: {
                error: 'Too many requests',
                retryAfter: Math.ceil(this.config.rate_limit_window / 1000)
            }
        });
        this.app.use(limiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request tracking and metrics collection
        this.app.use((req, res, next) => {
            // Set up request timing
            req._startTime = process.hrtime();
            req._startTimestamp = new Date();
            
            // Track request start time for more accurate timing
            req.startTime = Date.now();
            
            // Increment total requests counter
            this.requestStats.totalRequests++;
            
            // Get the actual endpoint path (handles both route and raw path)
            const path = req.route?.path || req.path;
            const endpoint = `${req.method} ${path}`;
            
            // Initialize endpoint stats if not exists
            if (!this.requestStats.endpointStats.has(endpoint)) {
                this.requestStats.endpointStats.set(endpoint, {
                    count: 0,
                    totalTime: 0,
                    averageTime: 0,
                    minTime: Infinity,
                    maxTime: 0,
                    errors: 0,
                    statusCodes: new Map(),
                    lastRequest: null,
                    firstRequest: new Date().toISOString(),
                    methods: new Set()
                });
            }
            
            // Get endpoint stats
            const endpointStat = this.requestStats.endpointStats.get(endpoint);
            
            // Update endpoint stats
            endpointStat.count++;
            endpointStat.methods.add(req.method);
            endpointStat.lastRequest = new Date().toISOString();
            
            // Track status codes
            const statusCode = res.statusCode.toString();
            const statusCount = (endpointStat.statusCodes.get(statusCode) || 0) + 1;
            endpointStat.statusCodes.set(statusCode, statusCount);
            
            // Log request start
            this.logger.debug(`📥 ${req.method} ${path} [${req.ip}]`);
            
            // Store the original send function
            const originalSend = res.send;
            
            // Override the send function to track response metrics
            res.send = function(body) {
                // Calculate response time with high precision
                const hrTime = process.hrtime(req._startTime);
                const responseTime = hrTime[0] * 1000 + hrTime[1] / 1e6; // Convert to ms
                
                // Update global stats
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    this.requestStats.successfulRequests++;
                } else {
                    this.requestStats.failedRequests++;
                }
                
                // Update endpoint stats
                endpointStat.totalTime += responseTime;
                endpointStat.averageTime = endpointStat.totalTime / endpointStat.count;
                endpointStat.minTime = Math.min(endpointStat.minTime, responseTime);
                endpointStat.maxTime = Math.max(endpointStat.maxTime, responseTime);
                
                if (res.statusCode >= 400) {
                    endpointStat.errors++;
                }
                
                // Update global average response time using Welford's algorithm for numerical stability
                const delta = responseTime - this.requestStats.averageResponseTime;
                this.requestStats.averageResponseTime += delta / this.requestStats.totalRequests;
                
                // Log response
                const statusColor = res.statusCode >= 500 ? '31' : // red
                                  res.statusCode >= 400 ? '33' :  // yellow
                                  res.statusCode >= 300 ? '36' :  // cyan
                                  res.statusCode >= 200 ? '32' :  // green
                                  '0';                            // reset
                
                this.logger.debug(
                    `📤 \x1b[${statusColor}m${req.method} ${path} - ${res.statusCode} (${responseTime.toFixed(2)}ms)\x1b[0m`
                );
                
                // Add response time header
                res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);
                
                // Call the original send function
                return originalSend.call(this, body);
            }.bind(this);
            
            // Handle errors in the middleware chain
            res.on('error', (err) => {
                this.logger.error(`Error in response for ${req.method} ${path}:`, err);
            });
            
            // Continue to the next middleware
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        const router = express.Router();

        // Health check
        router.get('/health', this.handleHealthCheck.bind(this));

        // Platform status
        router.get('/status', this.handleStatusCheck.bind(this));

        // Statistics
        router.get('/stats', this.handleStatsRequest.bind(this));

        // Chat/Query endpoints
        router.post('/chat',
            this.validateChatRequest(),
            this.handleChatRequest.bind(this)
        );

        router.post('/query',
            this.validateQueryRequest(),
            this.handleQueryRequest.bind(this)
        );

        // Knowledge management
        router.post('/knowledge/add',
            this.validateKnowledgeAdd(),
            this.handleKnowledgeAdd.bind(this)
        );

        router.delete('/knowledge/:id',
            this.handleKnowledgeDelete.bind(this)
        );

        router.get('/knowledge/search',
            this.validateKnowledgeSearch(),
            this.handleKnowledgeSearch.bind(this)
        );

        // Brain layer endpoints
        router.get('/brain/layers', this.handleBrainLayersStatus.bind(this));

        router.post('/brain/process',
            this.validateBrainProcess(),
            this.handleBrainProcess.bind(this)
        );

        // Agent council endpoints
        router.get('/agents/status', this.handleAgentsStatus.bind(this));

        router.post('/agents/collaborate',
            this.validateAgentCollaboration(),
            this.handleAgentCollaboration.bind(this)
        );

        // RAG system endpoints
        router.get('/rag/status', this.handleRagStatus.bind(this));

        router.post('/rag/retrieve',
            this.validateRagRetrieve(),
            this.handleRagRetrieve.bind(this)
        );

        // Configuration endpoints
        router.get('/config', this.handleConfigGet.bind(this));

        router.put('/config',
            this.validateConfigUpdate(),
            this.handleConfigUpdate.bind(this)
        );

        // Mount router with API prefix
        this.app.use(this.config.api_prefix, router);

        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                name: 'CAI Platform API',
                version: '1.0.0',
                status: 'running',
                endpoints: {
                    health: `${this.config.api_prefix}/health`,
                    chat: `${this.config.api_prefix}/chat`,
                    query: `${this.config.api_prefix}/query`,
                    docs: '/docs'
                }
            });
        });
    }

    /**
     * Validation middleware for chat requests
     */
    validateChatRequest() {
        return [
            body('message').notEmpty().withMessage('Message is required'),
            body('context').optional().isObject(),
            body('options').optional().isObject(),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for query requests
     */
    validateQueryRequest() {
        return [
            body('query').notEmpty().withMessage('Query is required'),
            body('type').optional().isIn(['semantic', 'keyword', 'hybrid']),
            body('limit').optional().isInt({ min: 1, max: 100 }),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for knowledge addition
     */
    validateKnowledgeAdd() {
        return [
            body('content').notEmpty().withMessage('Content is required'),
            body('metadata').optional().isObject(),
            body('source').optional().isString(),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for knowledge search
     */
    validateKnowledgeSearch() {
        return [
            query('q').notEmpty().withMessage('Search query is required'),
            query('limit').optional().isInt({ min: 1, max: 100 }),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for brain processing
     */
    validateBrainProcess() {
        return [
            body('input').notEmpty().withMessage('Input is required'),
            body('layers').optional().isArray(),
            body('mode').optional().isIn(['sequential', 'parallel']),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for agent collaboration
     */
    validateAgentCollaboration() {
        return [
            body('task').notEmpty().withMessage('Task is required'),
            body('agents').optional().isArray(),
            body('strategy').optional().isIn(['consensus', 'hierarchical', 'competitive']),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for RAG retrieval
     */
    validateRagRetrieve() {
        return [
            body('query').notEmpty().withMessage('Query is required'),
            body('k').optional().isInt({ min: 1, max: 50 }),
            body('threshold').optional().isFloat({ min: 0, max: 1 }),
            this.handleValidationErrors
        ];
    }

    /**
     * Validation middleware for config updates
     */
    validateConfigUpdate() {
        return [
            body('config').isObject().withMessage('Config object is required'),
            this.handleValidationErrors
        ];
    }

    /**
     * Handle validation errors
     */
    handleValidationErrors(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }
        next();
    }

    /**
     * Health check endpoint
     * Returns detailed system health and metrics
     */
    async handleHealthCheck(req, res) {
        const startTime = process.hrtime();
        const detailed = req.query.detailed === 'true';
        
        try {
            // Basic health check
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: require('../../../package.json').version,
                environment: process.env.NODE_ENV || 'development',
                platform: {
                    initialized: this.platform.isInitialized,
                    running: this.platform.isRunning,
                    startTime: this.platform.startTime?.toISOString()
                },
                // Add basic system metrics
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    loadavg: process.getLoadAvg ? process.getLoadAvg() : null
                },
                // Include database connection status if available
                database: this.platform.databaseManager?.getConnectionStatus ? 
                    await this.platform.databaseManager.getConnectionStatus() : 
                    { status: 'unknown', message: 'Database manager not available' },
                // Include component statuses if available
                components: {}
            };

            // Add detailed metrics if requested
            if (detailed) {
                // Get detailed metrics from system monitor if available
                if (this.platform.systemMonitor) {
                    health.metrics = await this.platform.systemMonitor.getMetrics();
                    health.alerts = this.platform.systemMonitor.alerts.slice(0, 10);
                }

                // Add request statistics
                health.requests = {
                    total: this.requestStats.totalRequests,
                    successful: this.requestStats.successfulRequests,
                    failed: this.requestStats.failedRequests,
                    averageResponseTime: this.requestStats.averageResponseTime,
                    endpoints: Object.fromEntries(this.requestStats.endpointStats)
                };

                // Add component statuses if available
                if (this.platform.cognitiveBrain) {
                    health.components.cognitiveBrain = await this.platform.cognitiveBrain.getStatus();
                }
                if (this.platform.agentCouncil) {
                    health.components.agentCouncil = await this.platform.agentCouncil.getStatus();
                }
                if (this.platform.ragSystem) {
                    health.components.ragSystem = await this.platform.ragSystem.getStatus();
                }
            }

            // Calculate response time
            const hrTime = process.hrtime(startTime);
            const responseTime = hrTime[0] * 1000 + hrTime[1] / 1e6; // Convert to ms
            
            // Add response time header
            res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
            
            // Return the health check response
            res.json(health);

        } catch (error) {
            this.logger.error('Health check failed:', error);
            res.status(500).json({
                status: 'unhealthy',
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * Status check endpoint
     * Returns detailed status of the platform and its components
     */
    async handleStatusCheck(req, res) {
        const startTime = process.hrtime();
        
        try {
            // Get basic platform status
            const status = await this.platform.getStatus();
            
            // Add system information
            status.system = {
                node: {
                    version: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    uptime: process.uptime(),
                    loadavg: process.getLoadAvg ? process.getLoadAvg() : null
                },
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
            };
            
            // Add database status if available
            if (this.platform.databaseManager?.getConnectionStatus) {
                status.database = await this.platform.databaseManager.getConnectionStatus();
            }
            
            // Add system monitor metrics if available
            if (this.platform.systemMonitor) {
                // Get metrics from system monitor
                status.metrics = await this.platform.systemMonitor.getMetrics();
                status.health = this.platform.systemMonitor.getSystemStatus();
                
                // Add performance statistics
                status.performance = this.platform.systemMonitor.getPerformanceStats();
                
                // Add recent alerts (last 10)
                status.alerts = this.platform.systemMonitor.alerts
                    .slice(-10)
                    .map(alert => ({
                        ...alert,
                        timestamp: alert.timestamp?.toISOString?.() || new Date(alert.timestamp).toISOString()
                    }));
            }
            
            // Add request statistics
            status.requests = {
                total: this.requestStats.totalRequests,
                successful: this.requestStats.successfulRequests,
                failed: this.requestStats.failedRequests,
                averageResponseTime: this.requestStats.averageResponseTime,
                endpoints: Object.fromEntries(this.requestStats.endpointStats)
            };
            
            // Calculate response time
            const hrTime = process.hrtime(startTime);
            const responseTime = hrTime[0] * 1000 + hrTime[1] / 1e6; // Convert to ms
            
            // Add response time header
            res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
            
            res.json(status);
            
        } catch (error) {
            this.logger.error('Status check failed:', error);
            res.status(500).json({
                status: 'error',
                error: 'Failed to get platform status',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Statistics endpoint
     * Returns detailed system and application metrics in the requested format
     * Supports both JSON and Prometheus formats
     */
    async handleStatsRequest(req, res) {
        const startTime = process.hrtime();
        const format = req.query.format || 'json';
        
        try {
            // Collect base statistics
            const stats = {
                api: {
                    requests: {
                        total: this.requestStats.totalRequests,
                        successful: this.requestStats.successfulRequests,
                        failed: this.requestStats.failedRequests,
                        ratePerMinute: this.requestStats.totalRequests / (process.uptime() / 60),
                        averageResponseTime: this.requestStats.averageResponseTime,
                        endpoints: Object.fromEntries(this.requestStats.endpointStats)
                    }
                },
                system: {
                    node: {
                        version: process.version,
                        platform: process.platform,
                        arch: process.arch,
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage(),
                        loadavg: process.getLoadAvg ? process.getLoadAvg() : null
                    },
                    environment: process.env.NODE_ENV || 'development',
                    timestamp: new Date().toISOString()
                },
                platform: await this.platform.getStats?.() || {}
            };
            
            // Add database metrics if available
            if (this.platform.databaseManager?.getStats) {
                stats.database = await this.platform.databaseManager.getStats();
            }
            
            // Add system monitor metrics if available
            if (this.platform.systemMonitor) {
                stats.metrics = await this.platform.systemMonitor.getMetrics();
                stats.health = this.platform.systemMonitor.getSystemStatus();
                stats.performance = this.platform.systemMonitor.getPerformanceStats();
                
                // Add recent alerts
                stats.alerts = this.platform.systemMonitor.alerts
                    .slice(-10)
                    .map(alert => ({
                        ...alert,
                        timestamp: alert.timestamp?.toISOString?.() || new Date(alert.timestamp).toISOString()
                    }));
            }
            
            // Calculate response time
            const hrTime = process.hrtime(startTime);
            const responseTime = hrTime[0] * 1000 + hrTime[1] / 1e6; // Convert to ms
            
            // Add response time header
            res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
            
            // Return in requested format
            if (format === 'prometheus') {
                this.sendPrometheusMetrics(res, stats);
            } else {
                res.json(stats);
            }
            
        } catch (error) {
            this.logger.error('Failed to generate statistics:', error);
            res.status(500).json({
                status: 'error',
                error: 'Failed to generate statistics',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Format metrics in Prometheus exposition format
     */
    sendPrometheusMetrics(res, stats) {
        try {
            const metrics = [];
            
            // Helper function to add metrics with labels
            const addMetric = (name, value, labels = {}) => {
                const labelStr = Object.entries(labels)
                    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
                    .join(',');
                
                const metricName = name.toLowerCase().replace(/\./g, '_');
                metrics.push(`# HELP ${metricName} ${name.replace(/_/g, ' ')}`);
                metrics.push(`# TYPE ${metricName} gauge`);
                metrics.push(`${metricName}${labelStr ? `{${labelStr}}` : ''} ${value}`);
            };
            
            // System metrics
            if (stats.system) {
                const { node } = stats.system;
                
                // Node.js metrics
                addMetric('nodejs_version_info', 1, { version: node.version });
                addMetric('process_cpu_seconds_total', node.cpu.user / 1e6);
                addMetric('process_resident_memory_bytes', node.memory.rss);
                addMetric('process_heap_bytes', node.memory.heapUsed);
                addMetric('process_heap_bytes_total', node.memory.heapTotal);
                addMetric('nodejs_external_memory_bytes', node.memory.external || 0);
                addMetric('nodejs_heap_size_total_bytes', node.memory.heapTotal);
                addMetric('nodejs_heap_size_used_bytes', node.memory.heapUsed);
                
                // System load
                if (node.loadavg) {
                    addMetric('nodejs_loadavg_1m', node.loadavg[0]);
                    addMetric('nodejs_loadavg_5m', node.loadavg[1]);
                    addMetric('nodejs_loadavg_15m', node.loadavg[2]);
                }
            }
            
            // API request metrics
            if (stats.api?.requests) {
                const { requests } = stats.api;
                
                addMetric('http_requests_total', requests.total, { status: 'total' });
                addMetric('http_requests_total', requests.successful, { status: 'success' });
                addMetric('http_requests_total', requests.failed, { status: 'error' });
                addMetric('http_request_duration_milliseconds', requests.averageResponseTime);
                
                // Per-endpoint metrics
                if (requests.endpoints) {
                    Object.entries(requests.endpoints).forEach(([endpoint, data]) => {
                        const [method, path] = endpoint.split(' ');
                        const labels = { method, path };
                        
                        addMetric('http_endpoint_requests_total', data.count, labels);
                        addMetric('http_endpoint_duration_milliseconds', data.averageTime, labels);
                        addMetric('http_endpoint_errors_total', data.errors, labels);
                    });
                }
            }
            
            // Platform-specific metrics
            if (stats.platform) {
                // Add platform-specific metrics here
                // Example: addMetric('platform_metric_name', stats.platform.someValue);
            }
            
            // Set content type and send response
            res.set('Content-Type', 'text/plain; version=0.0.4');
            res.send(metrics.join('\n'));
            
        } catch (error) {
            this.logger.error('Failed to generate Prometheus metrics:', error);
            res.status(500).send('# Error generating Prometheus metrics');
        }
    }

    /**
     * Chat request handler
     */
    async handleChatRequest(req, res) {
        try {
            const { message, context = {}, options = {} } = req.body;

            this.logger.debug(`💬 Chat request: ${message.substring(0, 100)}...`);

            const response = await this.platform.processRequest({
                type: 'chat',
                content: message,
                context,
                options
            });

            res.json({
                response: response.response,
                metadata: response.metadata,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ Chat request failed:', error);
            res.status(500).json({
                error: 'Chat request failed',
                details: error.message
            });
        }
    }

    /**
     * Query request handler
     */
    async handleQueryRequest(req, res) {
        try {
            const { query, type = 'hybrid', limit = 10 } = req.body;

            this.logger.debug(`🔍 Query request: ${query}`);

            const response = await this.platform.processRequest({
                type: 'query',
                content: query,
                options: { type, limit }
            });

            res.json({
                results: response.response,
                metadata: response.metadata,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ Query request failed:', error);
            res.status(500).json({
                error: 'Query request failed',
                details: error.message
            });
        }
    }

    /**
     * Knowledge addition handler
     */
    async handleKnowledgeAdd(req, res) {
        try {
            const { content, metadata = {}, source = 'api' } = req.body;

            this.logger.debug(`📚 Adding knowledge: ${content.substring(0, 100)}...`);

            const result = await this.platform.ragSystem?.addDocument?.({
                content,
                metadata: { ...metadata, source, addedAt: new Date().toISOString() }
            });

            if (!result) {
                throw new Error('RAG system not available');
            }

            res.json({
                success: true,
                documentId: result.id,
                message: 'Knowledge added successfully'
            });

        } catch (error) {
            this.logger.error('❌ Knowledge addition failed:', error);
            res.status(500).json({
                error: 'Failed to add knowledge',
                details: error.message
            });
        }
    }

    /**
     * Knowledge deletion handler
     */
    async handleKnowledgeDelete(req, res) {
        try {
            const { id } = req.params;

            this.logger.debug(`🗑️ Deleting knowledge: ${id}`);

            const result = await this.platform.ragSystem?.removeDocument?.(id);

            if (!result) {
                throw new Error('RAG system not available or document not found');
            }

            res.json({
                success: true,
                message: 'Knowledge deleted successfully'
            });

        } catch (error) {
            this.logger.error('❌ Knowledge deletion failed:', error);
            res.status(500).json({
                error: 'Failed to delete knowledge',
                details: error.message
            });
        }
    }

    /**
     * Knowledge search handler
     */
    async handleKnowledgeSearch(req, res) {
        try {
            const { q: query, limit = 10 } = req.query;

            this.logger.debug(`🔍 Knowledge search: ${query}`);

            const results = await this.platform.ragSystem?.search?.(query, {
                k: parseInt(limit)
            });

            if (!results) {
                throw new Error('RAG system not available');
            }

            res.json({
                results,
                query,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ Knowledge search failed:', error);
            res.status(500).json({
                error: 'Knowledge search failed',
                details: error.message
            });
        }
    }

    /**
     * Brain layers status handler
     */
    async handleBrainLayersStatus(req, res) {
        try {
            const status = await this.platform.cognitiveBrain?.getLayersStatus?.() || {};
            res.json(status);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get brain layers status',
                details: error.message
            });
        }
    }

    /**
     * Brain processing handler
     */
    async handleBrainProcess(req, res) {
        try {
            const { input, layers, mode = 'sequential' } = req.body;

            this.logger.debug(`🧠 Brain processing: ${input.substring(0, 100)}...`);

            const result = await this.platform.cognitiveBrain?.process?.(input, {
                layers,
                mode
            });

            if (!result) {
                throw new Error('Cognitive brain not available');
            }

            res.json({
                result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ Brain processing failed:', error);
            res.status(500).json({
                error: 'Brain processing failed',
                details: error.message
            });
        }
    }

    /**
     * Agents status handler
     */
    async handleAgentsStatus(req, res) {
        try {
            const status = await this.platform.multiAgentCouncil?.getAgentsStatus?.() || {};
            res.json(status);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get agents status',
                details: error.message
            });
        }
    }

    /**
     * Agent collaboration handler
     */
    async handleAgentCollaboration(req, res) {
        try {
            const { task, agents, strategy = 'consensus' } = req.body;

            this.logger.debug(`🤝 Agent collaboration: ${task.substring(0, 100)}...`);

            const result = await this.platform.multiAgentCouncil?.collaborate?.(task, {
                agents,
                strategy
            });

            if (!result) {
                throw new Error('Multi-agent council not available');
            }

            res.json({
                result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ Agent collaboration failed:', error);
            res.status(500).json({
                error: 'Agent collaboration failed',
                details: error.message
            });
        }
    }

    /**
     * RAG status handler
     */
    async handleRagStatus(req, res) {
        try {
            const status = await this.platform.ragSystem?.getStats?.() || {};
            res.json(status);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get RAG status',
                details: error.message
            });
        }
    }

    /**
     * RAG retrieval handler
     */
    async handleRagRetrieve(req, res) {
        try {
            const { query, k = 5, threshold = 0.7 } = req.body;

            this.logger.debug(`📖 RAG retrieval: ${query}`);

            const results = await this.platform.ragSystem?.retrieve?.(query, {
                k: parseInt(k),
                threshold: parseFloat(threshold)
            });

            if (!results) {
                throw new Error('RAG system not available');
            }

            res.json({
                results,
                query,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('❌ RAG retrieval failed:', error);
            res.status(500).json({
                error: 'RAG retrieval failed',
                details: error.message
            });
        }
    }

    /**
     * Configuration get handler
     */
    async handleConfigGet(req, res) {
        try {
            const config = await this.platform.getConfig?.() || {};
            res.json(config);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get configuration',
                details: error.message
            });
        }
    }

    /**
     * Configuration update handler
     */
    async handleConfigUpdate(req, res) {
        try {
            const { config } = req.body;

            this.logger.debug('⚙️ Updating configuration');

            const result = await this.platform.updateConfig?.(config);

            if (!result) {
                throw new Error('Configuration update not supported');
            }

            res.json({
                success: true,
                message: 'Configuration updated successfully'
            });

        } catch (error) {
            this.logger.error('❌ Configuration update failed:', error);
            res.status(500).json({
                error: 'Configuration update failed',
                details: error.message
            });
        }
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                path: req.path,
                method: req.method
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            this.logger.error('❌ Unhandled error:', error);

            res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });
    }

    /**
     * Start the REST API server
     */
    async start() {
        try {
            if (this.isRunning) {
                this.logger.warn('⚠️ REST API server is already running');
                return;
            }

            this.server = this.app.listen(this.config.port, () => {
                this.isRunning = true;
                this.logger.info(`🚀 REST API server started on port ${this.config.port}`);
                this.logger.info(`📡 API endpoints available at http://localhost:${this.config.port}${this.config.api_prefix}`);
            });

        } catch (error) {
            this.logger.error('❌ Failed to start REST API server:', error);
            throw error;
        }
    }

    /**
     * Stop the REST API server
     */
    async stop() {
        try {
            if (!this.isRunning || !this.server) {
                this.logger.warn('⚠️ REST API server is not running');
                return;
            }

            await new Promise((resolve) => {
                this.server.close(() => {
                    this.isRunning = false;
                    this.logger.info('✅ REST API server stopped');
                    resolve();
                });
            });

        } catch (error) {
            this.logger.error('❌ Error stopping REST API server:', error);
            throw error;
        }
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            ...this.requestStats,
            isRunning: this.isRunning,
            port: this.config.port,
            uptime: this.isRunning ? Date.now() - this.startTime : 0
        };
    }
}

module.exports = RestEndpoints;