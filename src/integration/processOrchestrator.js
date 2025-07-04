/**
 * Process Orchestrator - Coordinates workflow between Brain, Agents, and RAG
 * 
 * Manages the flow of information and processing between the three core systems:
 * - Routes requests to appropriate systems
 * - Coordinates multi-step processing workflows
 * - Manages system resource allocation
 * - Handles error recovery and fallback strategies
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');

class ProcessOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxConcurrentProcesses: 10,
            processTimeout: 30000, // 30 seconds
            retryAttempts: 3,
            retryDelay: 1000,
            enableMetrics: true,
            ...config
        };

        this.logger = new Logger('ProcessOrchestrator');
        
        // System references
        this.cognitiveBrain = null;
        this.agentCouncil = null;
        this.ragSystem = null;
        this.intelligentRouter = null;

        // Process management
        this.activeProcesses = new Map();
        this.processQueue = [];
        this.processHistory = [];
        
        // Performance metrics
        this.metrics = {
            totalProcesses: 0,
            successfulProcesses: 0,
            failedProcesses: 0,
            averageProcessingTime: 0,
            systemLoad: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the orchestrator with system components
     */
    async initialize(cognitiveBrain, agentCouncil, ragSystem, intelligentRouter) {
        try {
            this.logger.info('Initializing Process Orchestrator...');

            this.cognitiveBrain = cognitiveBrain;
            this.agentCouncil = agentCouncil;
            this.ragSystem = ragSystem;
            this.intelligentRouter = intelligentRouter;

            // Setup event listeners
            this.setupEventListeners();

            this.isInitialized = true;
            this.logger.info('Process Orchestrator initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize Process Orchestrator:', error);
            throw error;
        }
    }

    /**
     * Setup event listeners for system coordination
     */
    setupEventListeners() {
        // Listen for brain processing events
        if (this.cognitiveBrain) {
            this.cognitiveBrain.on('processing_complete', (data) => {
                this.handleBrainProcessingComplete(data);
            });

            this.cognitiveBrain.on('processing_error', (error) => {
                this.handleProcessingError('brain', error);
            });
        }

        // Listen for agent council events
        if (this.agentCouncil) {
            this.agentCouncil.on('consensus_reached', (data) => {
                this.handleAgentConsensus(data);
            });

            this.agentCouncil.on('collaboration_error', (error) => {
                this.handleProcessingError('agents', error);
            });
        }

        // Listen for RAG system events
        if (this.ragSystem) {
            this.ragSystem.on('retrieval_complete', (data) => {
                this.handleRAGRetrievalComplete(data);
            });

            this.ragSystem.on('retrieval_error', (error) => {
                this.handleProcessingError('rag', error);
            });
        }
    }

    /**
     * Process a user request through the appropriate systems
     */
    async processRequest(request) {
        const processId = this.generateProcessId();
        const startTime = Date.now();

        try {
            this.logger.info(`Starting process ${processId} for request type: ${request.type}`);

            // Create process context
            const processContext = {
                id: processId,
                request,
                startTime,
                status: 'processing',
                steps: [],
                results: {},
                metadata: {
                    userId: request.userId,
                    sessionId: request.sessionId,
                    priority: request.priority || 'normal'
                }
            };

            this.activeProcesses.set(processId, processContext);

            // Route request to appropriate system(s)
            const routingDecision = await this.intelligentRouter.routeRequest(request);
            processContext.steps.push({
                step: 'routing',
                timestamp: Date.now(),
                decision: routingDecision
            });

            // Execute processing workflow
            const result = await this.executeWorkflow(processContext, routingDecision);

            // Update metrics
            this.updateMetrics(processContext, true);

            this.logger.info(`Process ${processId} completed successfully`);
            return result;

        } catch (error) {
            this.logger.error(`Process ${processId} failed:`, error);
            this.updateMetrics({ id: processId }, false);
            throw error;
        } finally {
            this.activeProcesses.delete(processId);
        }
    }

    /**
     * Execute the processing workflow based on routing decision
     */
    async executeWorkflow(processContext, routingDecision) {
        const { request } = processContext;
        let result = {};

        try {
            // Sequential processing based on routing decision
            if (routingDecision.useRAG) {
                this.logger.debug(`Process ${processContext.id}: Retrieving knowledge`);
                const ragResult = await this.ragSystem.retrieveKnowledge(request.query, {
                    maxResults: routingDecision.ragConfig?.maxResults || 5,
                    threshold: routingDecision.ragConfig?.threshold || 0.7
                });
                
                processContext.results.rag = ragResult;
                processContext.steps.push({
                    step: 'rag_retrieval',
                    timestamp: Date.now(),
                    resultCount: ragResult.documents?.length || 0
                });
            }

            if (routingDecision.useBrain) {
                this.logger.debug(`Process ${processContext.id}: Processing through cognitive brain`);
                const brainInput = {
                    ...request,
                    context: processContext.results.rag || {}
                };
                
                const brainResult = await this.cognitiveBrain.process(brainInput);
                processContext.results.brain = brainResult;
                processContext.steps.push({
                    step: 'brain_processing',
                    timestamp: Date.now(),
                    layers_used: brainResult.layersUsed || []
                });
            }

            if (routingDecision.useAgents) {
                this.logger.debug(`Process ${processContext.id}: Consulting agent council`);
                const agentInput = {
                    ...request,
                    brainOutput: processContext.results.brain,
                    ragContext: processContext.results.rag
                };
                
                const agentResult = await this.agentCouncil.collaborate(agentInput);
                processContext.results.agents = agentResult;
                processContext.steps.push({
                    step: 'agent_collaboration',
                    timestamp: Date.now(),
                    agents_consulted: agentResult.participatingAgents || []
                });
            }

            // Synthesize final result
            result = await this.synthesizeResults(processContext);
            
            processContext.steps.push({
                step: 'synthesis',
                timestamp: Date.now(),
                final_result: true
            });

            return result;

        } catch (error) {
            this.logger.error(`Workflow execution failed for process ${processContext.id}:`, error);
            throw error;
        }
    }

    /**
     * Synthesize results from different systems into final response
     */
    async synthesizeResults(processContext) {
        const { results } = processContext;
        
        // Basic synthesis logic - can be enhanced
        const synthesizedResult = {
            processId: processContext.id,
            timestamp: Date.now(),
            processingTime: Date.now() - processContext.startTime,
            response: null,
            confidence: 0,
            sources: [],
            metadata: {
                systemsUsed: Object.keys(results),
                processingSteps: processContext.steps.length
            }
        };

        // Prioritize agent council result if available
        if (results.agents) {
            synthesizedResult.response = results.agents.consensus || results.agents.response;
            synthesizedResult.confidence = results.agents.confidence || 0.8;
            synthesizedResult.sources.push('agent_council');
        }
        // Fall back to brain result
        else if (results.brain) {
            synthesizedResult.response = results.brain.response || results.brain.output;
            synthesizedResult.confidence = results.brain.confidence || 0.7;
            synthesizedResult.sources.push('cognitive_brain');
        }
        // Use RAG result as last resort
        else if (results.rag) {
            synthesizedResult.response = this.formatRAGResponse(results.rag);
            synthesizedResult.confidence = 0.6;
            synthesizedResult.sources.push('rag_system');
        }

        // Add RAG sources if available
        if (results.rag && results.rag.documents) {
            synthesizedResult.sources.push(...results.rag.documents.map(doc => doc.source || 'unknown'));
        }

        return synthesizedResult;
    }

    /**
     * Format RAG results into a readable response
     */
    formatRAGResponse(ragResult) {
        if (!ragResult.documents || ragResult.documents.length === 0) {
            return "I couldn't find relevant information to answer your question.";
        }

        const topDocument = ragResult.documents[0];
        return `Based on available information: ${topDocument.content}`;
    }

    /**
     * Handle brain processing completion
     */
    handleBrainProcessingComplete(data) {
        this.emit('brain_processing_complete', data);
    }

    /**
     * Handle agent consensus
     */
    handleAgentConsensus(data) {
        this.emit('agent_consensus_reached', data);
    }

    /**
     * Handle RAG retrieval completion
     */
    handleRAGRetrievalComplete(data) {
        this.emit('rag_retrieval_complete', data);
    }

    /**
     * Handle processing errors
     */
    handleProcessingError(system, error) {
        this.logger.error(`Error in ${system} system:`, error);
        this.emit('processing_error', { system, error });
    }

    /**
     * Update performance metrics
     */
    updateMetrics(processContext, success) {
        this.metrics.totalProcesses++;
        
        if (success) {
            this.metrics.successfulProcesses++;
            if (processContext.startTime) {
                const processingTime = Date.now() - processContext.startTime;
                this.metrics.averageProcessingTime = 
                    (this.metrics.averageProcessingTime * (this.metrics.successfulProcesses - 1) + processingTime) / 
                    this.metrics.successfulProcesses;
            }
        } else {
            this.metrics.failedProcesses++;
        }

        this.metrics.systemLoad = this.activeProcesses.size / this.config.maxConcurrentProcesses;
    }

    /**
     * Generate unique process ID
     */
    generateProcessId() {
        return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeProcesses: this.activeProcesses.size,
            queueLength: this.processQueue.length
        };
    }

    /**
     * Get active processes
     */
    getActiveProcesses() {
        return Array.from(this.activeProcesses.values());
    }

    /**
     * Shutdown the orchestrator
     */
    async shutdown() {
        this.logger.info('Shutting down Process Orchestrator...');
        
        // Wait for active processes to complete or timeout
        const shutdownTimeout = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (this.activeProcesses.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.activeProcesses.size > 0) {
            this.logger.warn(`Forcing shutdown with ${this.activeProcesses.size} active processes`);
        }
        
        this.removeAllListeners();
        this.logger.info('Process Orchestrator shutdown complete');
    }
}

module.exports = ProcessOrchestrator;