const EventEmitter = require('events');
const path = require('path');

/**
 * Orchestrator - Coordinates execution across multiple systems
 * Manages complex workflows and system interactions
 */
class Orchestrator extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            max_concurrent_tasks: 5,
            task_timeout: 30000,
            retry_attempts: 3,
            retry_delay: 1000,
            enable_parallel_execution: true,
            workflow_persistence: true,
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Task management
        this.activeTasks = new Map();
        this.taskQueue = [];
        this.completedTasks = new Map();
        this.workflows = new Map();

        // System references
        this.intelligentRouter = null;
        this.ragSystem = null;
        this.cognitiveBrain = null;
        this.multiAgentCouncil = null;

        // Performance tracking
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageExecutionTime: 0,
            concurrentPeak: 0,
            workflowsExecuted: 0,
            systemCalls: {
                rag: 0,
                cognitive_brain: 0,
                multi_agent: 0,
                hybrid: 0
            }
        };

        // Task execution strategies
        this.executionStrategies = new Map();
        this.initializeExecutionStrategies();
    }

    /**
     * Initialize the orchestrator
     */
    async initialize() {
        try {
            this.logger.info('🎼 Initializing Orchestrator...');

            // Setup task processing
            this.setupTaskProcessing();

            // Initialize workflow templates
            this.initializeWorkflowTemplates();

            this.isInitialized = true;
            this.logger.info('✅ Orchestrator initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Orchestrator:', error);
            throw error;
        }
    }

    /**
     * Initialize execution strategies
     */
    initializeExecutionStrategies() {
        // Single system execution
        this.executionStrategies.set('single', async (task, target) => {
            return await this.executeSingleSystem(task, target);
        });

        // Sequential execution across multiple systems
        this.executionStrategies.set('sequential', async (task, targets) => {
            return await this.executeSequential(task, targets);
        });

        // Parallel execution across multiple systems
        this.executionStrategies.set('parallel', async (task, targets) => {
            return await this.executeParallel(task, targets);
        });

        // Hybrid execution (RAG + Cognitive Brain)
        this.executionStrategies.set('hybrid', async (task) => {
            return await this.executeHybrid(task);
        });

        // Consensus execution (multiple systems vote)
        this.executionStrategies.set('consensus', async (task, targets) => {
            return await this.executeConsensus(task, targets);
        });
    }

    /**
     * Initialize workflow templates
     */
    initializeWorkflowTemplates() {
        // Research workflow: RAG -> Cognitive Brain -> Multi-Agent
        this.workflows.set('research', {
            name: 'Research Workflow',
            steps: [
                { system: 'rag', action: 'retrieve', parallel: false },
                { system: 'cognitive_brain', action: 'analyze', parallel: false },
                { system: 'multi_agent', action: 'synthesize', parallel: false }
            ],
            timeout: 60000
        });

        // Quick answer workflow: Router -> Single system
        this.workflows.set('quick_answer', {
            name: 'Quick Answer Workflow',
            steps: [
                { system: 'router', action: 'route', parallel: false },
                { system: 'dynamic', action: 'execute', parallel: false }
            ],
            timeout: 15000
        });

        // Comprehensive analysis: Parallel RAG + Cognitive Brain -> Multi-Agent
        this.workflows.set('comprehensive', {
            name: 'Comprehensive Analysis Workflow',
            steps: [
                {
                    systems: ['rag', 'cognitive_brain'],
                    action: 'analyze',
                    parallel: true
                },
                { system: 'multi_agent', action: 'synthesize', parallel: false }
            ],
            timeout: 90000
        });

        // Validation workflow: Multiple systems validate result
        this.workflows.set('validation', {
            name: 'Validation Workflow',
            steps: [
                { system: 'primary', action: 'execute', parallel: false },
                {
                    systems: ['rag', 'cognitive_brain'],
                    action: 'validate',
                    parallel: true
                }
            ],
            timeout: 45000
        });
    }

    /**
     * Execute a task using the orchestrator
     */
    async executeTask(request, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Orchestrator not initialized');
            }

            const taskId = this.generateTaskId();
            const startTime = Date.now();

            this.logger.debug(`🎼 Executing task ${taskId}: "${request.substring(0, 100)}..."`);

            // Create task object
            const task = {
                id: taskId,
                request,
                options,
                startTime,
                status: 'pending',
                steps: [],
                results: {},
                metadata: {
                    priority: options.priority || 'normal',
                    timeout: options.timeout || this.config.task_timeout,
                    retryAttempts: 0,
                    maxRetries: options.maxRetries || this.config.retry_attempts
                }
            };

            // Add to active tasks
            this.activeTasks.set(taskId, task);
            this.stats.totalTasks++;

            // Update concurrent peak
            if (this.activeTasks.size > this.stats.concurrentPeak) {
                this.stats.concurrentPeak = this.activeTasks.size;
            }

            // Determine execution strategy
            const strategy = await this.determineExecutionStrategy(task);

            // Execute task
            const result = await this.executeWithStrategy(task, strategy);

            // Complete task
            task.status = 'completed';
            task.endTime = Date.now();
            task.executionTime = task.endTime - task.startTime;
            task.result = result;

            // Move to completed tasks
            this.activeTasks.delete(taskId);
            this.completedTasks.set(taskId, task);

            // Update statistics
            this.updateTaskStats(task);

            this.logger.debug(`✅ Task ${taskId} completed in ${task.executionTime}ms`);

            this.emit('taskCompleted', {
                taskId,
                result,
                executionTime: task.executionTime
            });

            return {
                taskId,
                result,
                metadata: {
                    executionTime: task.executionTime,
                    strategy: strategy.name,
                    steps: task.steps.length,
                    systemsUsed: strategy.systems || [strategy.target]
                }
            };

        } catch (error) {
            this.logger.error(`❌ Task execution failed:`, error);

            // Handle task failure
            if (this.activeTasks.has(taskId)) {
                const task = this.activeTasks.get(taskId);
                task.status = 'failed';
                task.error = error.message;
                task.endTime = Date.now();

                this.activeTasks.delete(taskId);
                this.completedTasks.set(taskId, task);
                this.stats.failedTasks++;
            }

            throw error;
        }
    }

    /**
     * Execute a predefined workflow
     */
    async executeWorkflow(workflowName, request, options = {}) {
        try {
            if (!this.workflows.has(workflowName)) {
                throw new Error(`Workflow '${workflowName}' not found`);
            }

            const workflow = this.workflows.get(workflowName);
            const taskId = this.generateTaskId();
            const startTime = Date.now();

            this.logger.info(`🎼 Executing workflow '${workflow.name}' (${taskId})`);

            const task = {
                id: taskId,
                type: 'workflow',
                workflowName,
                request,
                options,
                startTime,
                status: 'running',
                steps: [],
                results: {},
                currentStep: 0
            };

            this.activeTasks.set(taskId, task);
            this.stats.workflowsExecuted++;

            // Execute workflow steps
            const result = await this.executeWorkflowSteps(task, workflow);

            // Complete workflow
            task.status = 'completed';
            task.endTime = Date.now();
            task.executionTime = task.endTime - task.startTime;
            task.result = result;

            this.activeTasks.delete(taskId);
            this.completedTasks.set(taskId, task);

            this.logger.info(`✅ Workflow '${workflow.name}' completed in ${task.executionTime}ms`);

            this.emit('workflowCompleted', {
                workflowName,
                taskId,
                result,
                executionTime: task.executionTime
            });

            return {
                taskId,
                workflowName,
                result,
                metadata: {
                    executionTime: task.executionTime,
                    stepsExecuted: task.steps.length,
                    workflowType: workflow.name
                }
            };

        } catch (error) {
            this.logger.error(`❌ Workflow '${workflowName}' failed:`, error);
            throw error;
        }
    }

    /**
     * Execute workflow steps
     */
    async executeWorkflowSteps(task, workflow) {
        let context = { request: task.request, options: task.options };

        for (let i = 0; i < workflow.steps.length; i++) {
            const step = workflow.steps[i];
            task.currentStep = i;

            this.logger.debug(`🔄 Executing workflow step ${i + 1}/${workflow.steps.length}`);

            const stepStartTime = Date.now();
            let stepResult;

            try {
                if (step.parallel && step.systems) {
                    // Parallel execution
                    stepResult = await this.executeParallelStep(step, context);
                } else if (step.system === 'router') {
                    // Router step
                    stepResult = await this.executeRouterStep(step, context);
                } else if (step.system === 'dynamic') {
                    // Dynamic system based on previous routing
                    stepResult = await this.executeDynamicStep(step, context);
                } else {
                    // Single system execution
                    stepResult = await this.executeSingleSystemStep(step, context);
                }

                // Record step
                const stepRecord = {
                    stepNumber: i + 1,
                    system: step.system || step.systems,
                    action: step.action,
                    executionTime: Date.now() - stepStartTime,
                    success: true,
                    result: stepResult
                };

                task.steps.push(stepRecord);

                // Update context for next step
                context = {
                    ...context,
                    previousResult: stepResult,
                    stepResults: task.steps.map(s => s.result)
                };

            } catch (error) {
                this.logger.error(`❌ Workflow step ${i + 1} failed:`, error);

                task.steps.push({
                    stepNumber: i + 1,
                    system: step.system || step.systems,
                    action: step.action,
                    executionTime: Date.now() - stepStartTime,
                    success: false,
                    error: error.message
                });

                throw error;
            }
        }

        // Return final result
        return context.previousResult || context;
    }

    /**
     * Determine execution strategy for a task
     */
    async determineExecutionStrategy(task) {
        // Use intelligent router to determine target system
        if (this.intelligentRouter) {
            const routingDecision = await this.intelligentRouter.route(
                task.request,
                task.options.context || {}
            );

            if (routingDecision.target === 'hybrid') {
                return {
                    name: 'hybrid',
                    systems: ['rag', 'cognitive_brain']
                };
            } else {
                return {
                    name: 'single',
                    target: routingDecision.target,
                    confidence: routingDecision.confidence
                };
            }
        }

        // Fallback strategy
        return {
            name: 'single',
            target: 'cognitive_brain'
        };
    }

    /**
     * Execute task with determined strategy
     */
    async executeWithStrategy(task, strategy) {
        const strategyFunction = this.executionStrategies.get(strategy.name);

        if (!strategyFunction) {
            throw new Error(`Unknown execution strategy: ${strategy.name}`);
        }

        return await strategyFunction(task, strategy.target || strategy.systems);
    }

    /**
     * Execute on a single system
     */
    async executeSingleSystem(task, target) {
        this.stats.systemCalls[target] = (this.stats.systemCalls[target] || 0) + 1;

        switch (target) {
            case 'rag':
                if (!this.ragSystem) throw new Error('RAG System not available');
                return await this.ragSystem.retrieve(task.request, task.options);

            case 'cognitive_brain':
                if (!this.cognitiveBrain) throw new Error('Cognitive Brain not available');
                return await this.cognitiveBrain.process(task.request, task.options);

            case 'multi_agent':
                if (!this.multiAgentCouncil) throw new Error('Multi-Agent Council not available');
                return await this.multiAgentCouncil.processRequest(task.request, task.options);

            default:
                throw new Error(`Unknown target system: ${target}`);
        }
    }

    /**
     * Execute sequentially across multiple systems
     */
    async executeSequential(task, targets) {
        const results = [];
        let context = task.request;

        for (const target of targets) {
            const result = await this.executeSingleSystem(
                { ...task, request: context },
                target
            );
            results.push({ system: target, result });

            // Use result as context for next system
            if (result.context) {
                context = result.context;
            } else if (typeof result === 'string') {
                context = result;
            }
        }

        return {
            type: 'sequential',
            results,
            finalResult: results[results.length - 1].result
        };
    }

    /**
     * Execute in parallel across multiple systems
     */
    async executeParallel(task, targets) {
        const promises = targets.map(target =>
            this.executeSingleSystem(task, target)
                .catch(error => ({ error: error.message, system: target }))
        );

        const results = await Promise.all(promises);

        return {
            type: 'parallel',
            results: targets.map((target, index) => ({
                system: target,
                result: results[index]
            })),
            successful: results.filter(r => !r.error).length
        };
    }

    /**
     * Execute hybrid approach (RAG + Cognitive Brain)
     */
    async executeHybrid(task) {
        this.stats.systemCalls.hybrid++;

        try {
            // Step 1: Retrieve relevant information using RAG
            const ragResult = await this.ragSystem.retrieve(task.request, {
                ...task.options,
                maxResults: 5
            });

            // Step 2: Process with Cognitive Brain using RAG context
            const cognitiveResult = await this.cognitiveBrain.process(task.request, {
                ...task.options,
                context: ragResult.context,
                sources: ragResult.results
            });

            return {
                type: 'hybrid',
                ragResult,
                cognitiveResult,
                finalAnswer: cognitiveResult.response || cognitiveResult,
                sources: ragResult.results,
                confidence: Math.min(
                    ragResult.metadata?.confidence || 0.8,
                    cognitiveResult.confidence || 0.8
                )
            };

        } catch (error) {
            this.logger.error('❌ Hybrid execution failed:', error);
            throw error;
        }
    }

    /**
     * Execute with consensus from multiple systems
     */
    async executeConsensus(task, targets) {
        // 1. Run all targets in parallel and gather results
        const results = await this.executeParallel(task, targets);

        // 2. Filter out errored results
        const valid = results.results.filter(r => !r.result.error);
        if (valid.length === 0) {
            throw new Error('No valid results from any system');
        }

        /*
         * Consensus strategy v1
         * ---------------------------------------------------
         * a) Majority identical answer (case-insensitive string match on finalAnswer/response/text)
         * b) If no majority, choose answer with highest confidence score
         * c) Provide agreement ratio for diagnostics
         */

        // Helper to extract answer text & confidence
        const extract = (res) => {
            const out = res.result;
            const text = (out.finalAnswer || out.answer || out.response || out.text || out).toString();
            const conf = typeof out.confidence === 'number' ? out.confidence : 0.5;
            return { text: text.trim(), confidence: conf, raw: out, system: res.system };
        };

        const processed = valid.map(extract);

        // Count occurrences of normalized answers
        const counts = new Map();
        processed.forEach(p => {
            const key = p.text.toLowerCase();
            const existing = counts.get(key) || { count: 0, items: [] };
            existing.count += 1;
            existing.items.push(p);
            counts.set(key, existing);
        });

        // Determine majority if any ( >50% of participants )
        let consensus = null;
        let agreement = 0;
        for (const [key, info] of counts.entries()) {
            if (info.count > processed.length / 2) {
                consensus = info.items[0];
                agreement = info.count / targets.length;
                break;
            }
        }

        // Fallback to highest confidence
        if (!consensus) {
            processed.sort((a, b) => b.confidence - a.confidence);
            consensus = processed[0];
            agreement = counts.get(consensus.text.toLowerCase()).count / targets.length;
        }

        return {
            type: 'consensus',
            method: 'majority_or_confidence',
            consensusResult: consensus.raw,
            allResults: results.results,
            agreement
        };
    }

    /**
     * Execute parallel workflow step
     */
    async executeParallelStep(step, context) {
        const promises = step.systems.map(system =>
            this.executeSingleSystemStep(
                { ...step, system },
                context
            ).catch(error => ({ error: error.message, system }))
        );

        const results = await Promise.all(promises);

        return {
            type: 'parallel_step',
            systems: step.systems,
            results,
            successful: results.filter(r => !r.error).length
        };
    }

    /**
     * Execute router step
     */
    async executeRouterStep(step, context) {
        if (!this.intelligentRouter) {
            throw new Error('Intelligent Router not available');
        }

        const routingDecision = await this.intelligentRouter.route(
            context.request,
            context.options?.context || {}
        );

        // Store routing decision in context for next step
        context.routingDecision = routingDecision;

        return routingDecision;
    }

    /**
     * Execute dynamic step based on previous routing
     */
    async executeDynamicStep(step, context) {
        if (!context.routingDecision) {
            throw new Error('No routing decision available for dynamic step');
        }

        const target = context.routingDecision.target;
        return await this.executeSingleSystem(
            { request: context.request, options: context.options },
            target
        );
    }

    /**
     * Execute single system workflow step
     */
    async executeSingleSystemStep(step, context) {
        return await this.executeSingleSystem(
            { request: context.request, options: context.options },
            step.system
        );
    }

    /**
     * Setup task processing
     */
    setupTaskProcessing() {
        // Process task queue periodically
        setInterval(() => {
            this.processTaskQueue();
        }, 1000);

        // Cleanup completed tasks periodically
        setInterval(() => {
            this.cleanupCompletedTasks();
        }, 60000); // Every minute
    }

    /**
     * Process queued tasks
     */
    async processTaskQueue() {
        if (this.taskQueue.length === 0) return;
        if (this.activeTasks.size >= this.config.max_concurrent_tasks) return;

        const task = this.taskQueue.shift();
        if (task) {
            try {
                await this.executeTask(task.request, task.options);
            } catch (error) {
                this.logger.error('❌ Queued task execution failed:', error);
            }
        }
    }

    /**
     * Cleanup old completed tasks
     */
    cleanupCompletedTasks() {
        const maxAge = 3600000; // 1 hour
        const now = Date.now();
        const toDelete = [];

        for (const [taskId, task] of this.completedTasks.entries()) {
            if (now - task.endTime > maxAge) {
                toDelete.push(taskId);
            }
        }

        toDelete.forEach(taskId => this.completedTasks.delete(taskId));

        if (toDelete.length > 0) {
            this.logger.debug(`🧹 Cleaned up ${toDelete.length} old completed tasks`);
        }
    }

    /**
     * Generate unique task ID
     */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update task statistics
     */
    updateTaskStats(task) {
        this.stats.completedTasks++;

        // Update average execution time
        this.stats.averageExecutionTime =
            (this.stats.averageExecutionTime * (this.stats.completedTasks - 1) + task.executionTime) /
            this.stats.completedTasks;
    }

    /**
     * Set system references
     */
    setSystemReferences(systems) {
        this.intelligentRouter = systems.intelligentRouter;
        this.ragSystem = systems.ragSystem;
        this.cognitiveBrain = systems.cognitiveBrain;
        this.multiAgentCouncil = systems.multiAgentCouncil;

        this.logger.debug('🔗 System references set for orchestrator');
    }

    /**
     * Get orchestrator statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeTasks: this.activeTasks.size,
            queuedTasks: this.taskQueue.length,
            completedTasksStored: this.completedTasks.size,
            workflowsAvailable: this.workflows.size,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get active tasks
     */
    getActiveTasks() {
        return Array.from(this.activeTasks.values()).map(task => ({
            id: task.id,
            status: task.status,
            startTime: task.startTime,
            currentStep: task.currentStep,
            type: task.type || 'task'
        }));
    }

    /**
     * Get task details
     */
    getTaskDetails(taskId) {
        return this.activeTasks.get(taskId) || this.completedTasks.get(taskId);
    }

    /**
     * Cancel active task
     */
    async cancelTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.status = 'cancelled';
            task.endTime = Date.now();

            this.activeTasks.delete(taskId);
            this.completedTasks.set(taskId, task);

            this.logger.debug(`🚫 Task ${taskId} cancelled`);

            this.emit('taskCancelled', { taskId });
            return true;
        }

        return false;
    }

    /**
     * Add custom workflow
     */
    addWorkflow(name, workflow) {
        this.workflows.set(name, workflow);
        this.logger.debug(`📋 Added custom workflow: ${name}`);
    }

    /**
     * Remove workflow
     */
    removeWorkflow(name) {
        const removed = this.workflows.delete(name);
        if (removed) {
            this.logger.debug(`🗑️ Removed workflow: ${name}`);
        }
        return removed;
    }

    /**
     * Get available workflows
     */
    getWorkflows() {
        return Array.from(this.workflows.entries()).map(([name, workflow]) => ({
            name,
            displayName: workflow.name,
            steps: workflow.steps.length,
            timeout: workflow.timeout
        }));
    }

    /**
     * Shutdown the orchestrator
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Orchestrator...');

            // Cancel all active tasks
            const activeTasks = Array.from(this.activeTasks.keys());
            for (const taskId of activeTasks) {
                await this.cancelTask(taskId);
            }

            // Clear queues
            this.taskQueue = [];
            this.completedTasks.clear();

            this.isInitialized = false;
            this.logger.info('✅ Orchestrator shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Orchestrator shutdown:', error);
            throw error;
        }
    }
}

module.exports = Orchestrator;