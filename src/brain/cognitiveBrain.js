/**
 * Cognitive Brain - 7-Layer Architecture
 * 
 * Implements human-like cognitive processing through sequential layers:
 * 1. Perception - Input understanding and parsing
 * 2. Attention - Focus identification and filtering
 * 3. Memory - Context retrieval and integration
 * 4. Reasoning - Logical processing and inference
 * 5. Emotion - Sentiment analysis and empathy modeling
 * 6. Decision - Option evaluation and choice making
 * 7. Action - Response generation and optimization
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');
const PerceptionLayer = require('./perceptionLayer');
const AttentionLayer = require('./layers/attentionLayer');
const MemoryLayer = require('./memoryLayer');
const ReasoningLayer = require('./reasoningLayer');
const EmotionLayer = require('./emotionLayer');
const DecisionLayer = require('./decisionLayer');
const ActionLayer = require('./actionLayer');
const MemoryManager = require('./memoryManager');
const PerformanceMonitor = require('./performanceMonitor');

class CognitiveBrain extends EventEmitter {
    constructor(config, databaseManager) {
        super();
        this.config = config;
        this.databaseManager = databaseManager;
        this.logger = new Logger('CognitiveBrain');

        // Processing layers
        this.layers = {
            perception: null,
            attention: null,
            memory: null,
            reasoning: null,
            emotion: null,
            decision: null,
            action: null
        };

        // Memory systems
        this.memoryManager = null;

        // Monitoring
        this.performanceMonitor = null;

        // State
        this.isInitialized = false;
        this.isProcessing = false;
        this.processingQueue = [];
        this.currentContext = null;
    }

    /**
     * Initialize the cognitive brain and all layers
     */
    async initialize() {
        try {
            this.logger.info('🧠 Initializing Cognitive Brain...');

            // Initialize memory manager
            await this.initializeMemoryManager();

            // Initialize performance monitor
            this.performanceMonitor = new PerformanceMonitor(this.config.performance);
            await this.performanceMonitor.initialize();

            // Initialize all cognitive layers
            await this.initializeLayers();

            // Setup layer connections
            this.setupLayerConnections();

            // Start monitoring
            this.performanceMonitor.startMonitoring();

            this.isInitialized = true;
            this.logger.info('✅ Cognitive Brain initialized successfully');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Cognitive Brain:', error);
            throw error;
        }
    }

    /**
     * Initialize memory management system
     */
    async initializeMemoryManager() {
        this.logger.info('💭 Initializing memory systems...');

        this.memoryManager = new MemoryManager(
            this.config.memory_systems,
            this.databaseManager
        );

        await this.memoryManager.initialize();
        this.logger.info('✅ Memory systems initialized');
    }

    /**
     * Initialize all cognitive processing layers
     */
    async initializeLayers() {
        this.logger.info('🔄 Initializing cognitive layers...');

        // Layer 1: Perception
        this.layers.perception = new PerceptionLayer(
            this.config.layers.perception,
            this.memoryManager
        );
        await this.layers.perception.initialize();

        // Layer 2: Attention
        this.layers.attention = new AttentionLayer(
            this.config.layers.attention,
            this.memoryManager
        );
        await this.layers.attention.initialize();

        // Layer 3: Memory
        this.layers.memory = new MemoryLayer(
            this.config.layers.memory,
            this.memoryManager
        );
        await this.layers.memory.initialize();

        // Layer 4: Reasoning
        this.layers.reasoning = new ReasoningLayer(
            this.config.layers.reasoning,
            this.memoryManager
        );
        await this.layers.reasoning.initialize();

        // Layer 5: Emotion
        this.layers.emotion = new EmotionLayer(
            this.config.layers.emotion,
            this.memoryManager
        );
        await this.layers.emotion.initialize();

        // Layer 6: Decision
        this.layers.decision = new DecisionLayer(
            this.config.layers.decision,
            this.memoryManager
        );
        await this.layers.decision.initialize();

        // Layer 7: Action
        this.layers.action = new ActionLayer(
            this.config.layers.action,
            this.memoryManager
        );
        await this.layers.action.initialize();

        this.logger.info('✅ All cognitive layers initialized');
    }

    /**
     * Setup connections and data flow between layers
     */
    setupLayerConnections() {
        this.logger.info('🔗 Setting up layer connections...');

        // Setup event listeners for layer communication
        Object.values(this.layers).forEach(layer => {
            layer.on('processing_complete', (data) => {
                this.emit('layer_complete', {
                    layer: layer.constructor.name,
                    data: data,
                    timestamp: new Date()
                });
            });

            layer.on('error', (error) => {
                this.emit('layer_error', {
                    layer: layer.constructor.name,
                    error: error,
                    timestamp: new Date()
                });
            });
        });

        this.logger.info('✅ Layer connections established');
    }

    /**
     * Process input through all cognitive layers sequentially
     */
    async process(input, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Cognitive Brain not initialized');
        }

        if (this.isProcessing && !this.config.architecture.parallel_processing) {
            // Queue the request if not in parallel mode
            return new Promise((resolve, reject) => {
                this.processingQueue.push({ input, context, resolve, reject });
            });
        }

        const processingId = this.generateProcessingId();
        this.logger.info(`🧠 Starting cognitive processing [${processingId}]`);

        try {
            this.isProcessing = true;
            this.currentContext = { ...context, processingId };

            // Start performance monitoring for this processing session
            const performanceSession = this.performanceMonitor.startSession(processingId);

            // Sequential processing through all 7 layers
            let layerInput = input;
            const layerResults = {};

            // Layer 1: Perception
            this.logger.debug(`👁️ Processing through Perception Layer [${processingId}]`);
            const perceptionResult = await this.processLayer(
                'perception',
                layerInput,
                this.currentContext
            );
            layerResults.perception = perceptionResult;
            layerInput = perceptionResult.output;

            // Layer 2: Attention
            this.logger.debug(`🎯 Processing through Attention Layer [${processingId}]`);
            const attentionResult = await this.processLayer(
                'attention',
                layerInput,
                { ...this.currentContext, perceptionResult }
            );
            layerResults.attention = attentionResult;
            layerInput = attentionResult.output;

            // Layer 3: Memory
            this.logger.debug(`💭 Processing through Memory Layer [${processingId}]`);
            const memoryResult = await this.processLayer(
                'memory',
                layerInput,
                { ...this.currentContext, perceptionResult, attentionResult }
            );
            layerResults.memory = memoryResult;
            layerInput = memoryResult.output;

            // Layer 4: Reasoning
            this.logger.debug(`🤔 Processing through Reasoning Layer [${processingId}]`);
            const reasoningResult = await this.processLayer(
                'reasoning',
                layerInput,
                { ...this.currentContext, ...layerResults }
            );
            layerResults.reasoning = reasoningResult;
            layerInput = reasoningResult.output;

            // Layer 5: Emotion
            this.logger.debug(`❤️ Processing through Emotion Layer [${processingId}]`);
            const emotionResult = await this.processLayer(
                'emotion',
                layerInput,
                { ...this.currentContext, ...layerResults }
            );
            layerResults.emotion = emotionResult;
            layerInput = emotionResult.output;

            // Layer 6: Decision
            this.logger.debug(`⚖️ Processing through Decision Layer [${processingId}]`);
            const decisionResult = await this.processLayer(
                'decision',
                layerInput,
                { ...this.currentContext, ...layerResults }
            );
            layerResults.decision = decisionResult;
            layerInput = decisionResult.output;

            // Layer 7: Action
            this.logger.debug(`⚡ Processing through Action Layer [${processingId}]`);
            const actionResult = await this.processLayer(
                'action',
                layerInput,
                { ...this.currentContext, ...layerResults }
            );
            layerResults.action = actionResult;

            // End performance monitoring
            const performanceMetrics = performanceSession.end();

            // Prepare final result
            const finalResult = {
                processingId,
                input: input,
                output: actionResult.output,
                layerResults,
                performance: performanceMetrics,
                timestamp: new Date(),
                processingTime: performanceMetrics.totalTime
            };

            // Store processing result in memory
            await this.memoryManager.storeProcessingResult(finalResult);

            this.logger.info(`✅ Cognitive processing completed [${processingId}] in ${performanceMetrics.totalTime}ms`);

            // Emit completion event
            this.emit('processing_complete', finalResult);

            return finalResult;

        } catch (error) {
            this.logger.error(`❌ Cognitive processing failed [${processingId}]:`, error);
            this.emit('processing_error', { processingId, error });
            throw error;

        } finally {
            this.isProcessing = false;
            this.currentContext = null;

            // Process next item in queue if any
            if (this.processingQueue.length > 0) {
                const nextRequest = this.processingQueue.shift();
                this.process(nextRequest.input, nextRequest.context)
                    .then(nextRequest.resolve)
                    .catch(nextRequest.reject);
            }
        }
    }

    /**
     * Process input through a specific layer with timeout and error handling
     */
    async processLayer(layerName, input, context) {
        const layer = this.layers[layerName];
        const layerConfig = this.config.layers[layerName];

        if (!layer || !layerConfig.enabled) {
            this.logger.warn(`⚠️ Layer ${layerName} is disabled or not found`);
            return { output: input, metadata: { skipped: true } };
        }

        const startTime = Date.now();

        try {
            // Process with timeout
            const result = await Promise.race([
                layer.process(input, context),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Layer ${layerName} timeout`)),
                        layerConfig.processing_time || 5000)
                )
            ]);

            const processingTime = Date.now() - startTime;

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    layer: layerName,
                    processingTime,
                    timestamp: new Date()
                }
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`❌ Error in ${layerName} layer:`, error);

            // Return input as fallback
            return {
                output: input,
                metadata: {
                    layer: layerName,
                    error: error.message,
                    processingTime,
                    timestamp: new Date(),
                    fallback: true
                }
            };
        }
    }

    /**
     * Get current brain status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isProcessing: this.isProcessing,
            queueLength: this.processingQueue.length,
            layers: Object.keys(this.layers).reduce((status, layerName) => {
                const layer = this.layers[layerName];
                status[layerName] = {
                    enabled: this.config.layers[layerName]?.enabled || false,
                    status: layer ? layer.getStatus() : 'not_initialized'
                };
                return status;
            }, {}),
            memory: this.memoryManager ? this.memoryManager.getStatus() : 'not_initialized',
            performance: this.performanceMonitor ? this.performanceMonitor.getMetrics() : null
        };
    }

    /**
     * Get processing history
     */
    async getProcessingHistory(limit = 10) {
        return await this.memoryManager.getProcessingHistory(limit);
    }

    /**
     * Clear memory systems
     */
    async clearMemory(memoryType = 'all') {
        await this.memoryManager.clearMemory(memoryType);
        this.logger.info(`🧹 Cleared ${memoryType} memory`);
    }

    /**
     * Generate unique processing ID
     */
    generateProcessingId() {
        return `brain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Shutdown the cognitive brain
     */
    async shutdown() {
        this.logger.info('🛑 Shutting down Cognitive Brain...');

        try {
            // Stop performance monitoring
            if (this.performanceMonitor) {
                await this.performanceMonitor.stop();
            }

            // Shutdown all layers
            for (const [layerName, layer] of Object.entries(this.layers)) {
                if (layer && typeof layer.shutdown === 'function') {
                    await layer.shutdown();
                    this.logger.debug(`✅ ${layerName} layer shutdown`);
                }
            }

            // Shutdown memory manager
            if (this.memoryManager) {
                await this.memoryManager.shutdown();
            }

            this.isInitialized = false;
            this.logger.info('✅ Cognitive Brain shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Cognitive Brain shutdown:', error);
            throw error;
        }
    }
}

module.exports = CognitiveBrain;