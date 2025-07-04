const EventEmitter = require('events');

/**
 * Action Layer - Handles action planning, execution, monitoring, and feedback
 * Manages task decomposition, execution strategies, and performance tracking
 */
class ActionLayer extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            enabled: true,
            processing_time: 100,
            execution_strategy: 'sequential', // sequential, parallel, adaptive
            action_planning: true,
            execution_monitoring: true,
            feedback_processing: true,
            error_recovery: true,
            performance_tracking: true,
            adaptive_execution: true,
            action_validation: true,
            rollback_support: true,
            max_concurrent_actions: 5,
            action_timeout: 60000, // 60 seconds
            retry_attempts: 3,
            retry_delay: 1000, // 1 second
            success_threshold: 0.8,
            planning_depth: 3,
            monitoring_interval: 1000, // 1 second
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Action components
        this.actionPlanner = null;
        this.executionEngine = null;
        this.monitoringSystem = null;
        this.feedbackProcessor = null;
        this.errorRecovery = null;

        // Action state
        this.currentActions = new Map();
        this.actionQueue = [];
        this.completedActions = [];
        this.failedActions = [];

        // Action plans and strategies
        this.actionPlans = new Map();
        this.executionStrategies = new Map();
        this.actionTemplates = new Map();
        this.recoveryStrategies = new Map();

        // Monitoring and feedback
        this.performanceMetrics = new Map();
        this.feedbackHistory = [];
        this.executionPatterns = new Map();

        // Statistics
        this.stats = {
            totalActions: 0,
            successfulActions: 0,
            failedActions: 0,
            averageExecutionTime: 0,
            averageSuccessRate: 0,
            retryCount: 0,
            rollbackCount: 0,
            strategyUsage: {},
            actionTypeDistribution: {},
            errorDistribution: {},
            performanceScore: 0
        };
    }

    /**
     * Initialize the action layer
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.logger.info('⚡ Action Layer is disabled');
                return;
            }

            this.logger.info('⚡ Initializing Action Layer...');

            // Initialize action components
            this.initializeActionPlanner();
            this.initializeExecutionEngine();
            this.initializeMonitoringSystem();
            this.initializeFeedbackProcessor();
            this.initializeErrorRecovery();

            // Initialize strategies and templates
            this.initializeExecutionStrategies();
            this.initializeActionTemplates();
            this.initializeRecoveryStrategies();

            // Start monitoring system
            if (this.config.execution_monitoring) {
                this.startMonitoring();
            }

            this.isInitialized = true;
            this.logger.info('✅ Action Layer initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Action Layer:', error);
            throw error;
        }
    }

    /**
     * Process action request
     */
    async process(input, context = {}) {
        try {
            if (!this.isInitialized || !this.config.enabled) {
                return {
                    success: false,
                    error: 'Action layer not initialized or disabled'
                };
            }

            const startTime = Date.now();

            this.logger.debug('⚡ Processing action request...');

            // Parse action request
            const actionRequest = this.parseActionRequest(input, context);

            // Validate action request
            const validation = this.validateActionRequest(actionRequest);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error
                };
            }

            // Plan actions
            const actionPlan = await this.planActions(actionRequest, context);

            // Execute action plan
            const executionResult = await this.executeActionPlan(actionPlan);

            const processingTime = Date.now() - startTime;

            // Update statistics
            this.updateStats(actionPlan, executionResult, processingTime);

            this.logger.debug(`✅ Action processing completed in ${processingTime}ms`);

            return {
                success: true,
                result: executionResult,
                processingTime,
                actionStats: this.getActionStats()
            };

        } catch (error) {
            this.logger.error('❌ Action processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse action request
     */
    parseActionRequest(input, context) {
        const request = {
            type: 'general',
            goal: '',
            actions: [],
            constraints: [],
            priority: 'normal',
            deadline: null,
            dependencies: [],
            resources: {},
            strategy: this.config.execution_strategy,
            validation: true,
            rollback: false,
            context: {}
        };

        if (typeof input === 'string') {
            request.goal = input;
            request.type = this.inferActionType(input);
        } else if (typeof input === 'object') {
            Object.assign(request, input);
        }

        // Extract actions if not provided
        if (request.actions.length === 0) {
            request.actions = this.extractActions(request.goal, request.type, context);
        }

        // Apply context
        request.context = { ...context, ...request.context };

        return request;
    }

    /**
     * Infer action type from goal
     */
    inferActionType(goal) {
        const goalLower = goal.toLowerCase();

        if (goalLower.includes('create') || goalLower.includes('build') || goalLower.includes('make')) {
            return 'creation';
        }
        if (goalLower.includes('update') || goalLower.includes('modify') || goalLower.includes('change')) {
            return 'modification';
        }
        if (goalLower.includes('delete') || goalLower.includes('remove') || goalLower.includes('destroy')) {
            return 'deletion';
        }
        if (goalLower.includes('analyze') || goalLower.includes('process') || goalLower.includes('compute')) {
            return 'analysis';
        }
        if (goalLower.includes('send') || goalLower.includes('notify') || goalLower.includes('communicate')) {
            return 'communication';
        }
        if (goalLower.includes('search') || goalLower.includes('find') || goalLower.includes('retrieve')) {
            return 'retrieval';
        }

        return 'general';
    }

    /**
     * Extract actions from goal
     */
    extractActions(goal, type, context) {
        const actions = [];

        // Default action templates based on type
        const actionTemplates = {
            creation: [
                { name: 'prepare_resources', type: 'preparation' },
                { name: 'create_structure', type: 'execution' },
                { name: 'validate_creation', type: 'validation' }
            ],
            modification: [
                { name: 'backup_current', type: 'preparation' },
                { name: 'apply_changes', type: 'execution' },
                { name: 'verify_changes', type: 'validation' }
            ],
            deletion: [
                { name: 'backup_target', type: 'preparation' },
                { name: 'remove_target', type: 'execution' },
                { name: 'cleanup_references', type: 'cleanup' }
            ],
            analysis: [
                { name: 'gather_data', type: 'preparation' },
                { name: 'process_data', type: 'execution' },
                { name: 'generate_results', type: 'finalization' }
            ],
            communication: [
                { name: 'prepare_message', type: 'preparation' },
                { name: 'send_message', type: 'execution' },
                { name: 'confirm_delivery', type: 'validation' }
            ],
            retrieval: [
                { name: 'define_search', type: 'preparation' },
                { name: 'execute_search', type: 'execution' },
                { name: 'format_results', type: 'finalization' }
            ],
            general: [
                { name: 'prepare', type: 'preparation' },
                { name: 'execute', type: 'execution' },
                { name: 'finalize', type: 'finalization' }
            ]
        };

        const template = actionTemplates[type] || actionTemplates.general;

        for (let i = 0; i < template.length; i++) {
            const actionTemplate = template[i];
            actions.push({
                id: `action_${i}`,
                name: actionTemplate.name,
                type: actionTemplate.type,
                description: this.generateActionDescription(actionTemplate.name, goal),
                status: 'pending',
                dependencies: i > 0 ? [`action_${i - 1}`] : [],
                parameters: {},
                timeout: this.config.action_timeout,
                retryCount: 0,
                maxRetries: this.config.retry_attempts
            });
        }

        return actions;
    }

    /**
     * Generate action description
     */
    generateActionDescription(actionName, goal) {
        const descriptions = {
            prepare_resources: `Prepare necessary resources for: ${goal}`,
            create_structure: `Create the required structure for: ${goal}`,
            validate_creation: `Validate the creation result for: ${goal}`,
            backup_current: `Backup current state before: ${goal}`,
            apply_changes: `Apply changes for: ${goal}`,
            verify_changes: `Verify changes made for: ${goal}`,
            backup_target: `Backup target before: ${goal}`,
            remove_target: `Remove target for: ${goal}`,
            cleanup_references: `Cleanup references after: ${goal}`,
            gather_data: `Gather data for: ${goal}`,
            process_data: `Process data for: ${goal}`,
            generate_results: `Generate results for: ${goal}`,
            prepare_message: `Prepare message for: ${goal}`,
            send_message: `Send message for: ${goal}`,
            confirm_delivery: `Confirm delivery for: ${goal}`,
            define_search: `Define search parameters for: ${goal}`,
            execute_search: `Execute search for: ${goal}`,
            format_results: `Format search results for: ${goal}`,
            prepare: `Prepare for: ${goal}`,
            execute: `Execute: ${goal}`,
            finalize: `Finalize: ${goal}`
        };

        return descriptions[actionName] || `Perform ${actionName} for: ${goal}`;
    }

    /**
     * Validate action request
     */
    validateActionRequest(request) {
        if (!request.goal || request.goal.trim().length === 0) {
            return { valid: false, error: 'Action goal is required' };
        }

        if (request.actions.length === 0) {
            return { valid: false, error: 'At least one action is required' };
        }

        // Validate action dependencies
        for (const action of request.actions) {
            for (const dependency of action.dependencies || []) {
                const dependentAction = request.actions.find(a => a.id === dependency);
                if (!dependentAction) {
                    return { valid: false, error: `Invalid dependency: ${dependency}` };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Plan actions
     */
    async planActions(request, context) {
        const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const actionPlan = {
            id: planId,
            timestamp: new Date().toISOString(),
            goal: request.goal,
            type: request.type,
            strategy: request.strategy,
            actions: this.optimizeActionSequence(request.actions),
            constraints: request.constraints,
            resources: request.resources,
            deadline: request.deadline,
            priority: request.priority,
            validation: request.validation,
            rollback: request.rollback,
            status: 'planned',
            executionOrder: [],
            parallelGroups: [],
            estimatedDuration: 0,
            riskAssessment: null,
            context
        };

        // Calculate execution order
        actionPlan.executionOrder = this.calculateExecutionOrder(actionPlan.actions);

        // Identify parallel execution groups
        if (request.strategy === 'parallel' || request.strategy === 'adaptive') {
            actionPlan.parallelGroups = this.identifyParallelGroups(actionPlan.actions);
        }

        // Estimate duration
        actionPlan.estimatedDuration = this.estimateExecutionDuration(actionPlan);

        // Assess risks
        if (this.config.action_planning) {
            actionPlan.riskAssessment = await this.assessActionRisks(actionPlan);
        }

        this.actionPlans.set(planId, actionPlan);

        return actionPlan;
    }

    /**
     * Optimize action sequence
     */
    optimizeActionSequence(actions) {
        // Sort actions by dependencies and priority
        const optimizedActions = [...actions];

        // Simple topological sort for dependencies
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (action) => {
            if (visiting.has(action.id)) {
                throw new Error(`Circular dependency detected: ${action.id}`);
            }

            if (visited.has(action.id)) {
                return;
            }

            visiting.add(action.id);

            for (const depId of action.dependencies || []) {
                const depAction = optimizedActions.find(a => a.id === depId);
                if (depAction) {
                    visit(depAction);
                }
            }

            visiting.delete(action.id);
            visited.add(action.id);
            sorted.push(action);
        };

        for (const action of optimizedActions) {
            if (!visited.has(action.id)) {
                visit(action);
            }
        }

        return sorted;
    }

    /**
     * Calculate execution order
     */
    calculateExecutionOrder(actions) {
        return actions.map((action, index) => ({
            step: index + 1,
            actionId: action.id,
            actionName: action.name,
            dependencies: action.dependencies || []
        }));
    }

    /**
     * Identify parallel execution groups
     */
    identifyParallelGroups(actions) {
        const groups = [];
        const processed = new Set();

        for (const action of actions) {
            if (processed.has(action.id)) continue;

            const group = [action];
            processed.add(action.id);

            // Find actions that can run in parallel (no dependencies between them)
            for (const otherAction of actions) {
                if (processed.has(otherAction.id)) continue;

                const canRunInParallel = this.canRunInParallel(action, otherAction, actions);
                if (canRunInParallel) {
                    group.push(otherAction);
                    processed.add(otherAction.id);
                }
            }

            groups.push({
                groupId: `group_${groups.length}`,
                actions: group.map(a => a.id),
                canParallelize: group.length > 1
            });
        }

        return groups;
    }

    /**
     * Check if two actions can run in parallel
     */
    canRunInParallel(action1, action2, allActions) {
        // Check if there's a dependency path between the actions
        const hasDependencyPath = (from, to, visited = new Set()) => {
            if (visited.has(from.id)) return false;
            visited.add(from.id);

            if (from.dependencies && from.dependencies.includes(to.id)) {
                return true;
            }

            for (const depId of from.dependencies || []) {
                const depAction = allActions.find(a => a.id === depId);
                if (depAction && hasDependencyPath(depAction, to, visited)) {
                    return true;
                }
            }

            return false;
        };

        return !hasDependencyPath(action1, action2) && !hasDependencyPath(action2, action1);
    }

    /**
     * Estimate execution duration
     */
    estimateExecutionDuration(actionPlan) {
        let totalDuration = 0;

        if (actionPlan.strategy === 'sequential') {
            // Sum all action durations
            for (const action of actionPlan.actions) {
                totalDuration += this.estimateActionDuration(action);
            }
        } else if (actionPlan.strategy === 'parallel') {
            // Maximum duration of parallel groups
            for (const group of actionPlan.parallelGroups) {
                const groupActions = group.actions.map(id =>
                    actionPlan.actions.find(a => a.id === id)
                ).filter(Boolean);

                const groupDuration = Math.max(...groupActions.map(a => this.estimateActionDuration(a)));
                totalDuration += groupDuration;
            }
        } else {
            // Adaptive: estimate based on critical path
            totalDuration = this.calculateCriticalPath(actionPlan.actions);
        }

        return totalDuration;
    }

    /**
     * Estimate action duration
     */
    estimateActionDuration(action) {
        // Base duration by action type
        const baseDurations = {
            preparation: 2000,
            execution: 5000,
            validation: 1000,
            cleanup: 1000,
            finalization: 1500
        };

        const baseDuration = baseDurations[action.type] || 3000;

        // Adjust based on action complexity (simplified)
        let complexity = 1;
        if (action.parameters && Object.keys(action.parameters).length > 5) {
            complexity += 0.5;
        }

        return Math.round(baseDuration * complexity);
    }

    /**
     * Calculate critical path duration
     */
    calculateCriticalPath(actions) {
        const durations = new Map();

        const calculatePath = (action) => {
            if (durations.has(action.id)) {
                return durations.get(action.id);
            }

            let maxDependencyDuration = 0;
            for (const depId of action.dependencies || []) {
                const depAction = actions.find(a => a.id === depId);
                if (depAction) {
                    maxDependencyDuration = Math.max(maxDependencyDuration, calculatePath(depAction));
                }
            }

            const actionDuration = this.estimateActionDuration(action);
            const totalDuration = maxDependencyDuration + actionDuration;

            durations.set(action.id, totalDuration);
            return totalDuration;
        };

        let criticalPathDuration = 0;
        for (const action of actions) {
            criticalPathDuration = Math.max(criticalPathDuration, calculatePath(action));
        }

        return criticalPathDuration;
    }

    /**
     * Assess action risks
     */
    async assessActionRisks(actionPlan) {
        const riskAssessment = {
            overallRisk: 0,
            actionRisks: new Map(),
            riskFactors: [],
            mitigation: []
        };

        for (const action of actionPlan.actions) {
            const actionRisk = this.calculateActionRisk(action, actionPlan);
            riskAssessment.actionRisks.set(action.id, actionRisk);
            riskAssessment.overallRisk = Math.max(riskAssessment.overallRisk, actionRisk.severity);
        }

        // Identify risk factors
        riskAssessment.riskFactors = this.identifyRiskFactors(actionPlan);

        // Generate mitigation strategies
        riskAssessment.mitigation = this.generateRiskMitigation(riskAssessment.riskFactors);

        return riskAssessment;
    }

    /**
     * Calculate action risk
     */
    calculateActionRisk(action, actionPlan) {
        let riskScore = 0.2; // Base risk

        // Risk factors
        const riskFactors = [];

        // Complexity risk
        if (action.parameters && Object.keys(action.parameters).length > 5) {
            riskScore += 0.2;
            riskFactors.push('high_complexity');
        }

        // Dependency risk
        if (action.dependencies && action.dependencies.length > 2) {
            riskScore += 0.15;
            riskFactors.push('multiple_dependencies');
        }

        // Timeout risk
        if (action.timeout && action.timeout > 30000) {
            riskScore += 0.1;
            riskFactors.push('long_execution_time');
        }

        // Resource risk
        if (actionPlan.resources && Object.keys(actionPlan.resources).length === 0) {
            riskScore += 0.15;
            riskFactors.push('insufficient_resources');
        }

        return {
            severity: Math.min(1, riskScore),
            factors: riskFactors,
            probability: Math.min(1, riskScore * 1.2)
        };
    }

    /**
     * Identify risk factors
     */
    identifyRiskFactors(actionPlan) {
        const factors = [];

        if (actionPlan.actions.length > 10) {
            factors.push({
                factor: 'plan_complexity',
                description: 'Large number of actions increases failure risk',
                severity: 0.3
            });
        }

        if (actionPlan.deadline && new Date(actionPlan.deadline) < new Date(Date.now() + actionPlan.estimatedDuration)) {
            factors.push({
                factor: 'tight_deadline',
                description: 'Deadline may be difficult to meet',
                severity: 0.4
            });
        }

        if (actionPlan.strategy === 'parallel' && actionPlan.parallelGroups.length > 3) {
            factors.push({
                factor: 'parallel_complexity',
                description: 'Multiple parallel groups increase coordination risk',
                severity: 0.25
            });
        }

        return factors;
    }

    /**
     * Generate risk mitigation strategies
     */
    generateRiskMitigation(riskFactors) {
        const strategies = [];

        for (const factor of riskFactors) {
            switch (factor.factor) {
                case 'plan_complexity':
                    strategies.push('Consider breaking down the plan into smaller phases');
                    strategies.push('Implement additional checkpoints and validation steps');
                    break;
                case 'tight_deadline':
                    strategies.push('Prioritize critical actions and consider parallel execution');
                    strategies.push('Prepare contingency plans for potential delays');
                    break;
                case 'parallel_complexity':
                    strategies.push('Implement robust coordination mechanisms');
                    strategies.push('Add synchronization points between parallel groups');
                    break;
            }
        }

        return strategies;
    }

    /**
     * Execute action plan
     */
    async executeActionPlan(actionPlan) {
        try {
            actionPlan.status = 'executing';
            const startTime = Date.now();

            this.logger.info(`⚡ Executing action plan: ${actionPlan.id}`);

            let executionResult;

            // Execute based on strategy
            switch (actionPlan.strategy) {
                case 'sequential':
                    executionResult = await this.executeSequential(actionPlan);
                    break;
                case 'parallel':
                    executionResult = await this.executeParallel(actionPlan);
                    break;
                case 'adaptive':
                    executionResult = await this.executeAdaptive(actionPlan);
                    break;
                default:
                    executionResult = await this.executeSequential(actionPlan);
            }

            const executionTime = Date.now() - startTime;

            // Update plan status
            actionPlan.status = executionResult.success ? 'completed' : 'failed';
            actionPlan.executionTime = executionTime;
            actionPlan.result = executionResult;

            // Process feedback
            if (this.config.feedback_processing) {
                await this.processFeedback(actionPlan, executionResult);
            }

            this.logger.info(`✅ Action plan execution completed: ${actionPlan.id}`);

            return {
                planId: actionPlan.id,
                success: executionResult.success,
                executionTime,
                completedActions: executionResult.completedActions,
                failedActions: executionResult.failedActions,
                results: executionResult.results,
                feedback: executionResult.feedback
            };

        } catch (error) {
            actionPlan.status = 'failed';
            actionPlan.error = error.message;

            this.logger.error(`❌ Action plan execution failed: ${actionPlan.id}`, error);

            return {
                planId: actionPlan.id,
                success: false,
                error: error.message,
                completedActions: [],
                failedActions: actionPlan.actions.map(a => a.id)
            };
        }
    }

    /**
     * Execute actions sequentially
     */
    async executeSequential(actionPlan) {
        const result = {
            success: true,
            completedActions: [],
            failedActions: [],
            results: new Map(),
            feedback: []
        };

        for (const action of actionPlan.actions) {
            try {
                const actionResult = await this.executeAction(action, actionPlan);

                if (actionResult.success) {
                    result.completedActions.push(action.id);
                    result.results.set(action.id, actionResult);
                } else {
                    result.failedActions.push(action.id);

                    // Handle failure based on error recovery strategy
                    if (this.config.error_recovery) {
                        const recoveryResult = await this.handleActionFailure(action, actionResult, actionPlan);
                        if (!recoveryResult.recovered) {
                            result.success = false;
                            break; // Stop execution on unrecoverable failure
                        }
                    } else {
                        result.success = false;
                        break;
                    }
                }

            } catch (error) {
                result.failedActions.push(action.id);
                result.success = false;
                this.logger.error(`Action execution failed: ${action.id}`, error);
                break;
            }
        }

        return result;
    }

    /**
     * Execute actions in parallel
     */
    async executeParallel(actionPlan) {
        const result = {
            success: true,
            completedActions: [],
            failedActions: [],
            results: new Map(),
            feedback: []
        };

        // Execute parallel groups sequentially, but actions within groups in parallel
        for (const group of actionPlan.parallelGroups) {
            const groupActions = group.actions.map(id =>
                actionPlan.actions.find(a => a.id === id)
            ).filter(Boolean);

            if (group.canParallelize && groupActions.length > 1) {
                // Execute actions in parallel
                const promises = groupActions.map(action =>
                    this.executeAction(action, actionPlan).catch(error => ({ success: false, error: error.message }))
                );

                const groupResults = await Promise.all(promises);

                // Process group results
                for (let i = 0; i < groupActions.length; i++) {
                    const action = groupActions[i];
                    const actionResult = groupResults[i];

                    if (actionResult.success) {
                        result.completedActions.push(action.id);
                        result.results.set(action.id, actionResult);
                    } else {
                        result.failedActions.push(action.id);

                        if (this.config.error_recovery) {
                            await this.handleActionFailure(action, actionResult, actionPlan);
                        }
                    }
                }
            } else {
                // Execute single action
                const action = groupActions[0];
                if (action) {
                    try {
                        const actionResult = await this.executeAction(action, actionPlan);

                        if (actionResult.success) {
                            result.completedActions.push(action.id);
                            result.results.set(action.id, actionResult);
                        } else {
                            result.failedActions.push(action.id);
                        }
                    } catch (error) {
                        result.failedActions.push(action.id);
                        this.logger.error(`Action execution failed: ${action.id}`, error);
                    }
                }
            }
        }

        // Check overall success
        result.success = result.failedActions.length === 0;

        return result;
    }

    /**
     * Execute actions adaptively
     */
    async executeAdaptive(actionPlan) {
        // Start with parallel execution, fall back to sequential on failures
        let result = await this.executeParallel(actionPlan);

        // If parallel execution had failures, retry failed actions sequentially
        if (!result.success && result.failedActions.length > 0) {
            this.logger.info('Adaptive execution: Retrying failed actions sequentially');

            const failedActions = result.failedActions.map(id =>
                actionPlan.actions.find(a => a.id === id)
            ).filter(Boolean);

            for (const action of failedActions) {
                try {
                    const retryResult = await this.executeAction(action, actionPlan);

                    if (retryResult.success) {
                        // Move from failed to completed
                        result.failedActions = result.failedActions.filter(id => id !== action.id);
                        result.completedActions.push(action.id);
                        result.results.set(action.id, retryResult);
                    }
                } catch (error) {
                    this.logger.error(`Adaptive retry failed: ${action.id}`, error);
                }
            }

            result.success = result.failedActions.length === 0;
        }

        return result;
    }

    /**
     * Execute individual action
     */
    async executeAction(action, actionPlan) {
        const startTime = Date.now();

        try {
            action.status = 'executing';
            action.startTime = startTime;

            this.currentActions.set(action.id, action);

            this.logger.debug(`⚡ Executing action: ${action.name} (${action.id})`);

            // Validate action before execution
            if (this.config.action_validation) {
                const validation = await this.validateAction(action, actionPlan);
                if (!validation.valid) {
                    throw new Error(`Action validation failed: ${validation.error}`);
                }
            }

            // Execute the action (this is where actual work would be done)
            const executionResult = await this.performAction(action, actionPlan);

            const executionTime = Date.now() - startTime;

            action.status = 'completed';
            action.executionTime = executionTime;
            action.result = executionResult;

            this.currentActions.delete(action.id);
            this.completedActions.push(action);

            this.logger.debug(`✅ Action completed: ${action.name} (${executionTime}ms)`);

            return {
                success: true,
                actionId: action.id,
                executionTime,
                result: executionResult
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;

            action.status = 'failed';
            action.executionTime = executionTime;
            action.error = error.message;

            this.currentActions.delete(action.id);
            this.failedActions.push(action);

            this.logger.error(`❌ Action failed: ${action.name}`, error);

            return {
                success: false,
                actionId: action.id,
                executionTime,
                error: error.message
            };
        }
    }

    /**
     * Validate action before execution
     */
    async validateAction(action, actionPlan) {
        // Check dependencies
        for (const depId of action.dependencies || []) {
            const depAction = actionPlan.actions.find(a => a.id === depId);
            if (!depAction || depAction.status !== 'completed') {
                return {
                    valid: false,
                    error: `Dependency not satisfied: ${depId}`
                };
            }
        }

        // Check resources
        if (action.parameters && action.parameters.requiredResources) {
            for (const resource of action.parameters.requiredResources) {
                if (!actionPlan.resources[resource]) {
                    return {
                        valid: false,
                        error: `Required resource not available: ${resource}`
                    };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Perform the actual action
     */
    async performAction(action, actionPlan) {
        // This is a simulation of action execution
        // In a real implementation, this would interface with external systems

        const simulationDelay = this.estimateActionDuration(action) * 0.1; // 10% of estimated time
        await new Promise(resolve => setTimeout(resolve, simulationDelay));

        // Simulate success/failure based on action characteristics
        const successProbability = this.calculateSuccessProbability(action, actionPlan);
        const isSuccess = Math.random() < successProbability;

        if (!isSuccess) {
            throw new Error(`Action execution failed: ${action.name}`);
        }

        return {
            actionType: action.type,
            actionName: action.name,
            output: `Successfully executed ${action.name}`,
            metadata: {
                timestamp: new Date().toISOString(),
                duration: simulationDelay,
                successProbability
            }
        };
    }

    /**
     * Calculate success probability for action
     */
    calculateSuccessProbability(action, actionPlan) {
        let probability = 0.9; // Base success rate

        // Adjust based on action complexity
        if (action.parameters && Object.keys(action.parameters).length > 5) {
            probability -= 0.1;
        }

        // Adjust based on retry count
        probability -= action.retryCount * 0.05;

        // Adjust based on plan risk
        if (actionPlan.riskAssessment) {
            const actionRisk = actionPlan.riskAssessment.actionRisks.get(action.id);
            if (actionRisk) {
                probability -= actionRisk.severity * 0.2;
            }
        }

        return Math.max(0.1, Math.min(1, probability));
    }

    /**
     * Handle action failure
     */
    async handleActionFailure(action, actionResult, actionPlan) {
        const recovery = {
            recovered: false,
            strategy: null,
            attempts: 0
        };

        // Determine recovery strategy
        const strategy = this.selectRecoveryStrategy(action, actionResult, actionPlan);
        recovery.strategy = strategy;

        // Apply recovery strategy
        switch (strategy) {
            case 'retry':
                recovery.recovered = await this.retryAction(action, actionPlan);
                break;
            case 'skip':
                recovery.recovered = await this.skipAction(action, actionPlan);
                break;
            case 'rollback':
                recovery.recovered = await this.rollbackAction(action, actionPlan);
                break;
            case 'alternative':
                recovery.recovered = await this.executeAlternativeAction(action, actionPlan);
                break;
            default:
                recovery.recovered = false;
        }

        return recovery;
    }

    /**
     * Select recovery strategy
     */
    selectRecoveryStrategy(action, actionResult, actionPlan) {
        // Simple strategy selection based on action and failure characteristics

        if (action.retryCount < action.maxRetries) {
            return 'retry';
        }

        if (action.type === 'validation' || action.type === 'cleanup') {
            return 'skip';
        }

        if (actionPlan.rollback && action.type === 'execution') {
            return 'rollback';
        }

        return 'alternative';
    }

    /**
     * Retry action
     */
    async retryAction(action, actionPlan) {
        if (action.retryCount >= action.maxRetries) {
            return false;
        }

        action.retryCount++;
        this.stats.retryCount++;

        this.logger.info(`🔄 Retrying action: ${action.name} (attempt ${action.retryCount})`);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * action.retryCount));

        try {
            const retryResult = await this.executeAction(action, actionPlan);
            return retryResult.success;
        } catch (error) {
            this.logger.error(`Retry failed: ${action.name}`, error);
            return false;
        }
    }

    /**
     * Skip action
     */
    async skipAction(action, actionPlan) {
        this.logger.info(`⏭️ Skipping action: ${action.name}`);

        action.status = 'skipped';

        // Check if skipping this action affects dependent actions
        const dependentActions = actionPlan.actions.filter(a =>
            a.dependencies && a.dependencies.includes(action.id)
        );

        if (dependentActions.length > 0) {
            this.logger.warn(`Skipping ${action.name} may affect ${dependentActions.length} dependent actions`);
        }

        return true; // Skipping is always "successful"
    }

    /**
     * Rollback action
     */
    async rollbackAction(action, actionPlan) {
        this.logger.info(`↩️ Rolling back action: ${action.name}`);

        this.stats.rollbackCount++;

        try {
            // Simulate rollback operation
            const rollbackDelay = this.estimateActionDuration(action) * 0.5;
            await new Promise(resolve => setTimeout(resolve, rollbackDelay));

            action.status = 'rolled_back';

            return true;
        } catch (error) {
            this.logger.error(`Rollback failed: ${action.name}`, error);
            return false;
        }
    }

    /**
     * Execute alternative action
     */
    async executeAlternativeAction(action, actionPlan) {
        this.logger.info(`🔀 Executing alternative for action: ${action.name}`);

        // Create a simplified alternative action
        const alternativeAction = {
            ...action,
            id: `${action.id}_alt`,
            name: `${action.name}_alternative`,
            type: 'alternative',
            parameters: { ...action.parameters, simplified: true },
            retryCount: 0
        };

        try {
            const altResult = await this.executeAction(alternativeAction, actionPlan);
            return altResult.success;
        } catch (error) {
            this.logger.error(`Alternative action failed: ${alternativeAction.name}`, error);
            return false;
        }
    }

    /**
     * Process feedback from execution
     */
    async processFeedback(actionPlan, executionResult) {
        const feedback = {
            planId: actionPlan.id,
            timestamp: new Date().toISOString(),
            overallSuccess: executionResult.success,
            executionTime: actionPlan.executionTime,
            completedActions: executionResult.completedActions.length,
            failedActions: executionResult.failedActions.length,
            performance: this.calculatePerformanceScore(actionPlan, executionResult),
            lessons: this.extractLessons(actionPlan, executionResult),
            improvements: this.suggestImprovements(actionPlan, executionResult)
        };

        this.feedbackHistory.push(feedback);

        // Limit feedback history
        if (this.feedbackHistory.length > 50) {
            this.feedbackHistory.shift();
        }

        // Update performance metrics
        this.updatePerformanceMetrics(feedback);

        return feedback;
    }

    /**
     * Calculate performance score
     */
    calculatePerformanceScore(actionPlan, executionResult) {
        let score = 0;

        // Success rate (40%)
        const successRate = executionResult.completedActions.length / actionPlan.actions.length;
        score += successRate * 0.4;

        // Time efficiency (30%)
        const timeEfficiency = actionPlan.estimatedDuration > 0 ?
            Math.min(1, actionPlan.estimatedDuration / actionPlan.executionTime) : 0.5;
        score += timeEfficiency * 0.3;

        // Error rate (20%)
        const errorRate = 1 - (executionResult.failedActions.length / actionPlan.actions.length);
        score += errorRate * 0.2;

        // Strategy effectiveness (10%)
        const strategyBonus = this.calculateStrategyEffectiveness(actionPlan, executionResult);
        score += strategyBonus * 0.1;

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Calculate strategy effectiveness
     */
    calculateStrategyEffectiveness(actionPlan, executionResult) {
        // Simple heuristic based on strategy and results
        if (actionPlan.strategy === 'parallel' && executionResult.success) {
            return 1; // Parallel execution succeeded
        }

        if (actionPlan.strategy === 'adaptive' && executionResult.success) {
            return 0.9; // Adaptive execution succeeded
        }

        if (actionPlan.strategy === 'sequential' && executionResult.success) {
            return 0.8; // Sequential execution succeeded
        }

        return 0.5; // Default
    }

    /**
     * Extract lessons from execution
     */
    extractLessons(actionPlan, executionResult) {
        const lessons = [];

        if (executionResult.failedActions.length > 0) {
            lessons.push(`${executionResult.failedActions.length} actions failed - review error handling`);
        }

        if (actionPlan.executionTime > actionPlan.estimatedDuration * 1.5) {
            lessons.push('Execution took longer than estimated - improve time estimation');
        }

        if (actionPlan.strategy === 'parallel' && executionResult.failedActions.length > 0) {
            lessons.push('Parallel execution had failures - consider sequential fallback');
        }

        if (actionPlan.riskAssessment && actionPlan.riskAssessment.overallRisk > 0.5) {
            lessons.push('High-risk plan executed - validate risk mitigation strategies');
        }

        return lessons;
    }

    /**
     * Suggest improvements
     */
    suggestImprovements(actionPlan, executionResult) {
        const improvements = [];

        if (executionResult.failedActions.length > actionPlan.actions.length * 0.2) {
            improvements.push('Consider breaking down complex actions into smaller steps');
        }

        if (actionPlan.executionTime > actionPlan.estimatedDuration * 2) {
            improvements.push('Improve duration estimation accuracy');
        }

        if (actionPlan.strategy === 'sequential' && actionPlan.actions.length > 5) {
            improvements.push('Consider parallel execution for independent actions');
        }

        if (this.stats.retryCount > this.stats.totalActions * 0.1) {
            improvements.push('High retry rate - improve action reliability');
        }

        return improvements;
    }

    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(feedback) {
        const metricKey = `${feedback.planId}_${Date.now()}`;
        this.performanceMetrics.set(metricKey, feedback);

        // Limit metrics size
        if (this.performanceMetrics.size > 100) {
            const oldestKey = Array.from(this.performanceMetrics.keys())[0];
            this.performanceMetrics.delete(oldestKey);
        }
    }

    /**
     * Start monitoring system
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.monitorActiveActions();
        }, this.config.monitoring_interval);
    }

    /**
     * Monitor active actions
     */
    monitorActiveActions() {
        const now = Date.now();

        for (const [actionId, action] of this.currentActions) {
            const executionTime = now - action.startTime;

            // Check for timeout
            if (executionTime > action.timeout) {
                this.logger.warn(`Action timeout: ${action.name} (${actionId})`);
                action.status = 'timeout';
                this.currentActions.delete(actionId);
                this.failedActions.push(action);
            }
        }
    }

    /**
     * Initialize action components
     */
    initializeActionPlanner() {
        this.actionPlanner = {
            plan: this.planActions.bind(this),
            optimize: this.optimizeActionSequence.bind(this)
        };
    }

    initializeExecutionEngine() {
        this.executionEngine = {
            execute: this.executeActionPlan.bind(this),
            executeAction: this.executeAction.bind(this)
        };
    }

    initializeMonitoringSystem() {
        this.monitoringSystem = {
            monitor: this.monitorActiveActions.bind(this),
            start: this.startMonitoring.bind(this)
        };
    }

    initializeFeedbackProcessor() {
        this.feedbackProcessor = {
            process: this.processFeedback.bind(this),
            analyze: this.extractLessons.bind(this)
        };
    }

    initializeErrorRecovery() {
        this.errorRecovery = {
            handle: this.handleActionFailure.bind(this),
            retry: this.retryAction.bind(this),
            rollback: this.rollbackAction.bind(this)
        };
    }

    /**
     * Initialize execution strategies
     */
    initializeExecutionStrategies() {
        this.executionStrategies.set('sequential', {
            name: 'Sequential Execution',
            description: 'Execute actions one after another',
            execute: this.executeSequential.bind(this)
        });

        this.executionStrategies.set('parallel', {
            name: 'Parallel Execution',
            description: 'Execute independent actions simultaneously',
            execute: this.executeParallel.bind(this)
        });

        this.executionStrategies.set('adaptive', {
            name: 'Adaptive Execution',
            description: 'Dynamically adjust execution strategy',
            execute: this.executeAdaptive.bind(this)
        });
    }

    /**
     * Initialize action templates
     */
    initializeActionTemplates() {
        const templates = [
            {
                type: 'creation',
                actions: ['prepare_resources', 'create_structure', 'validate_creation']
            },
            {
                type: 'modification',
                actions: ['backup_current', 'apply_changes', 'verify_changes']
            },
            {
                type: 'deletion',
                actions: ['backup_target', 'remove_target', 'cleanup_references']
            }
        ];

        for (const template of templates) {
            this.actionTemplates.set(template.type, template);
        }
    }

    /**
     * Initialize recovery strategies
     */
    initializeRecoveryStrategies() {
        this.recoveryStrategies.set('retry', {
            name: 'Retry Strategy',
            description: 'Retry failed action with delay',
            apply: this.retryAction.bind(this)
        });

        this.recoveryStrategies.set('skip', {
            name: 'Skip Strategy',
            description: 'Skip failed action and continue',
            apply: this.skipAction.bind(this)
        });

        this.recoveryStrategies.set('rollback', {
            name: 'Rollback Strategy',
            description: 'Undo changes and restore previous state',
            apply: this.rollbackAction.bind(this)
        });
    }

    /**
     * Update statistics
     */
    updateStats(actionPlan, executionResult, processingTime) {
        this.stats.totalActions += actionPlan.actions.length;
        this.stats.successfulActions += executionResult.completedActions.length;
        this.stats.failedActions += executionResult.failedActions.length;

        // Update averages
        const totalPlans = this.actionPlans.size;
        this.stats.averageExecutionTime =
            (this.stats.averageExecutionTime * (totalPlans - 1) + processingTime) / totalPlans;

        const currentSuccessRate = executionResult.completedActions.length / actionPlan.actions.length;
        this.stats.averageSuccessRate =
            (this.stats.averageSuccessRate * (totalPlans - 1) + currentSuccessRate) / totalPlans;

        // Update strategy usage
        const strategy = actionPlan.strategy;
        this.stats.strategyUsage[strategy] = (this.stats.strategyUsage[strategy] || 0) + 1;

        // Update action type distribution
        for (const action of actionPlan.actions) {
            this.stats.actionTypeDistribution[action.type] =
                (this.stats.actionTypeDistribution[action.type] || 0) + 1;
        }

        // Update performance score
        if (executionResult.feedback && executionResult.feedback.performance) {
            this.stats.performanceScore =
                (this.stats.performanceScore * (totalPlans - 1) + executionResult.feedback.performance) / totalPlans;
        }
    }

    /**
     * Get action statistics
     */
    getActionStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalActions > 0 ?
                this.stats.successfulActions / this.stats.totalActions : 0,
            failureRate: this.stats.totalActions > 0 ?
                this.stats.failedActions / this.stats.totalActions : 0,
            retryRate: this.stats.totalActions > 0 ?
                this.stats.retryCount / this.stats.totalActions : 0,
            activeActions: this.currentActions.size,
            queuedActions: this.actionQueue.length,
            completedPlans: this.actionPlans.size,
            feedbackEntries: this.feedbackHistory.length
        };
    }

    /**
     * Get layer status
     */
    getStatus() {
        return {
            name: 'Action Layer',
            enabled: this.config.enabled,
            initialized: this.isInitialized,
            actionStats: this.getActionStats(),
            currentState: {
                activeActions: this.currentActions.size,
                queuedActions: this.actionQueue.length,
                activePlans: this.actionPlans.size
            },
            configuration: {
                executionStrategy: this.config.execution_strategy,
                actionPlanning: this.config.action_planning,
                executionMonitoring: this.config.execution_monitoring,
                errorRecovery: this.config.error_recovery,
                maxConcurrentActions: this.config.max_concurrent_actions
            }
        };
    }

    /**
     * Shutdown the action layer
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Action Layer...');

            // Stop monitoring
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
            }

            // Cancel active actions
            for (const [actionId, action] of this.currentActions) {
                action.status = 'cancelled';
            }
            this.currentActions.clear();

            this.isInitialized = false;

            this.logger.info('✅ Action Layer shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Action Layer shutdown:', error);
            throw error;
        }
    }
}

module.exports = ActionLayer;