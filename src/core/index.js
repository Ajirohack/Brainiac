/**
 * Cognitive Agentic Intelligence (CAI) Platform
 * Main Entry Point and System Coordinator
 * 
 * This file initializes and coordinates the three core systems:
 * 1. Cognitive Brain (7-layer architecture)
 * 2. Multi-Agent Council (collaborative processing)
 * 3. RAG System (knowledge retrieval)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Core System Imports
const Logger = require('./utils/logger');
const ConfigManager = require('./config/configManager');
const DatabaseManager = require('./database/databaseManager');
const IntelligentRouter = require('../integration/intelligentRouter');
const ProcessOrchestrator = require('../integration/processOrchestrator');
const ResponseSynthesizer = require('../integration/responseSynthesizer');
const SystemMonitor = require('./monitoring/systemMonitor');
const ErrorHandler = require('./middleware/errorHandler');
const RateLimiter = require('./middleware/rateLimiter');
const Authentication = require('./middleware/authentication');

// System Components
const CognitiveBrain = require('../brain/cognitiveBrain');
const AgentCouncil = require('../agents/agentCouncil');
const RAGSystem = require('../rag/ragSystem');

// API Routes
const apiRoutes = require('../api/routes');
const healthRoutes = require('../api/health');
const metricsRoutes = require('../api/metrics');

class CAIPlatform {
    constructor() {
        this.app = express();
        this.server = null;
        this.io = null;
        this.logger = new Logger('CAI-Platform');
        this.configManager = new ConfigManager();
        this.databaseManager = new DatabaseManager();
        this.systemMonitor = new SystemMonitor();

        // Core Systems
        this.cognitiveBrain = null;
        this.agentCouncil = null;
        this.ragSystem = null;

        // Integration Layer
        this.intelligentRouter = null;
        this.processOrchestrator = null;
        this.responseSynthesizer = null;

        // System State
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = null;
    }

    /**
     * Initialize the CAI Platform
     */
    async initialize() {
        try {
            this.logger.info('🚀 Initializing Cognitive Agentic Intelligence Platform...');
            this.startTime = new Date();

            // Load configurations
            await this.loadConfigurations();

            // Initialize databases
            await this.initializeDatabases();

            // Setup Express application
            this.setupExpressApp();

            // Initialize core systems
            await this.initializeCoreSystem();

            // Initialize integration layer
            await this.initializeIntegrationLayer();

            // Setup WebSocket server
            this.setupWebSocketServer();

            // Start system monitoring
            await this.startSystemMonitoring();

            this.isInitialized = true;
            this.logger.info('✅ CAI Platform initialization completed successfully');

        } catch (error) {
            this.logger.error('❌ Failed to initialize CAI Platform:', error);
            throw error;
        }
    }

    /**
     * Load system configurations
     */
    async loadConfigurations() {
        this.logger.info('📋 Loading system configurations...');

        await this.configManager.loadConfigurations([
            'brain_config.json',
            'agents_config.json',
            'rag_config.json',
            'integration_config.json'
        ]);

        this.logger.info('✅ Configurations loaded successfully');
    }

    /**
     * Initialize database connections
     */
    async initializeDatabases() {
        this.logger.info('🗄️ Initializing database connections...');

        await this.databaseManager.initialize({
            mongodb: {
                uri: process.env.MONGODB_URI,
                dbName: process.env.MONGODB_DB_NAME
            },
            redis: {
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT,
                password: process.env.REDIS_PASSWORD,
                db: process.env.REDIS_DB
            },
            neo4j: {
                uri: process.env.NEO4J_URI,
                username: process.env.NEO4J_USERNAME,
                password: process.env.NEO4J_PASSWORD
            }
        });

        this.logger.info('✅ Database connections established');
    }

    /**
     * Setup Express application middleware and routes
     */
    setupExpressApp() {
        this.logger.info('🌐 Setting up Express application...');

        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
            credentials: true
        }));

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Rate limiting
        this.app.use(RateLimiter.createLimiter());

        // Authentication middleware
        this.app.use('/api', Authentication.validateToken);

        // API routes
        this.app.use('/api/v1', apiRoutes);
        this.app.use('/health', healthRoutes);
        this.app.use('/metrics', metricsRoutes);

        // Static files
        this.app.use(express.static('public'));

        // Error handling middleware
        this.app.use(ErrorHandler.handleErrors);

        this.logger.info('✅ Express application configured');
    }

    /**
     * Initialize core AI systems
     */
    async initializeCoreSystem() {
        this.logger.info('🧠 Initializing core AI systems...');

        // Initialize Cognitive Brain
        this.cognitiveBrain = new CognitiveBrain(
            this.configManager.getConfig('brain'),
            this.databaseManager
        );
        await this.cognitiveBrain.initialize();
        this.logger.info('✅ Cognitive Brain initialized');

        // Initialize Agent Council
        this.agentCouncil = new AgentCouncil(
            this.configManager.getConfig('agents'),
            this.databaseManager
        );
        await this.agentCouncil.initialize();
        this.logger.info('✅ Agent Council initialized');

        // Initialize RAG System
        this.ragSystem = new RAGSystem(
            this.configManager.getConfig('rag'),
            this.databaseManager
        );
        await this.ragSystem.initialize();
        this.logger.info('✅ RAG System initialized');

        this.logger.info('✅ All core systems initialized successfully');
    }

    /**
     * Initialize integration layer
     */
    async initializeIntegrationLayer() {
        this.logger.info('🔗 Initializing integration layer...');

        const integrationConfig = this.configManager.getConfig('integration');

        // Initialize Intelligent Router
        this.intelligentRouter = new IntelligentRouter(
            integrationConfig.intelligent_router,
            {
                cognitiveBrain: this.cognitiveBrain,
                agentCouncil: this.agentCouncil,
                ragSystem: this.ragSystem
            }
        );
        await this.intelligentRouter.initialize();

        // Initialize Process Orchestrator
        this.processOrchestrator = new ProcessOrchestrator(
            integrationConfig.process_orchestrator,
            {
                cognitiveBrain: this.cognitiveBrain,
                agentCouncil: this.agentCouncil,
                ragSystem: this.ragSystem,
                router: this.intelligentRouter
            }
        );
        await this.processOrchestrator.initialize();

        // Initialize Response Synthesizer
        this.responseSynthesizer = new ResponseSynthesizer(
            integrationConfig.response_synthesizer,
            this.databaseManager
        );
        await this.responseSynthesizer.initialize();

        this.logger.info('✅ Integration layer initialized');
    }

    /**
     * Setup WebSocket server for real-time communication
     */
    setupWebSocketServer() {
        this.logger.info('⚡ Setting up WebSocket server...');

        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.WEBSOCKET_CORS_ORIGIN || 'http://localhost:3000',
                methods: ['GET', 'POST']
            }
        });

        // WebSocket event handlers
        this.io.on('connection', (socket) => {
            this.logger.info(`🔌 Client connected: ${socket.id}`);

            socket.on('process_request', async (data) => {
                try {
                    const result = await this.processRequest(data, socket);
                    socket.emit('process_response', result);
                } catch (error) {
                    socket.emit('process_error', { error: error.message });
                }
            });

            socket.on('disconnect', () => {
                this.logger.info(`🔌 Client disconnected: ${socket.id}`);
            });
        });

        this.logger.info('✅ WebSocket server configured');
    }

    /**
     * Start system monitoring
     */
    async startSystemMonitoring() {
        this.logger.info('📊 Starting system monitoring...');

        await this.systemMonitor.initialize({
            cognitiveBrain: this.cognitiveBrain,
            agentCouncil: this.agentCouncil,
            ragSystem: this.ragSystem,
            databaseManager: this.databaseManager
        });

        this.systemMonitor.startMonitoring();
        this.logger.info('✅ System monitoring started');
    }

    /**
     * Process incoming requests through the integrated system
     */
    async processRequest(request, socket = null) {
        try {
            // Route the request to appropriate processing system(s)
            const routingDecision = await this.intelligentRouter.route(request);

            // Orchestrate the processing
            const processingResult = await this.processOrchestrator.execute(
                routingDecision,
                request,
                socket
            );

            // Synthesize the final response
            const finalResponse = await this.responseSynthesizer.synthesize(
                processingResult,
                request
            );

            return finalResponse;

        } catch (error) {
            this.logger.error('Error processing request:', error);
            throw error;
        }
    }

    /**
     * Start the CAI Platform server
     */
    async start() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const port = process.env.PORT || 3000;
            const host = process.env.HOST || 'localhost';

            this.server.listen(port, host, () => {
                this.isRunning = true;
                this.logger.info(`🚀 CAI Platform server running on http://${host}:${port}`);
                this.logger.info(`📊 System Monitor: http://${host}:${port}/metrics`);
                this.logger.info(`🏥 Health Check: http://${host}:${port}/health`);
                this.logger.info(`📚 API Documentation: http://${host}:${port}/api/v1/docs`);
            });

        } catch (error) {
            this.logger.error('❌ Failed to start CAI Platform:', error);
            throw error;
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info('🛑 Initiating graceful shutdown...');

        try {
            // Stop accepting new connections
            if (this.server) {
                this.server.close();
            }

            // Stop system monitoring
            if (this.systemMonitor) {
                await this.systemMonitor.stop();
            }

            // Shutdown core systems
            if (this.cognitiveBrain) {
                await this.cognitiveBrain.shutdown();
            }

            if (this.agentCouncil) {
                await this.agentCouncil.shutdown();
            }

            if (this.ragSystem) {
                await this.ragSystem.shutdown();
            }

            // Close database connections
            if (this.databaseManager) {
                await this.databaseManager.close();
            }

            this.isRunning = false;
            this.logger.info('✅ CAI Platform shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during shutdown:', error);
            throw error;
        }
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            startTime: this.startTime,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
            version: require('../../package.json').version,
            systems: {
                cognitiveBrain: this.cognitiveBrain?.getStatus() || 'not_initialized',
                agentCouncil: this.agentCouncil?.getStatus() || 'not_initialized',
                ragSystem: this.ragSystem?.getStatus() || 'not_initialized'
            }
        };
    }
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal');
    if (global.caiPlatform) {
        await global.caiPlatform.shutdown();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT signal');
    if (global.caiPlatform) {
        await global.caiPlatform.shutdown();
    }
    process.exit(0);
});

// Start the platform if this file is run directly
if (require.main === module) {
    const platform = new CAIPlatform();
    global.caiPlatform = platform;

    platform.start().catch((error) => {
        console.error('Failed to start CAI Platform:', error);
        process.exit(1);
    });
}

module.exports = CAIPlatform;