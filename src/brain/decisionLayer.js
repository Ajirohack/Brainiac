const EventEmitter = require('events');

/**
 * Decision Layer - Handles decision-making processes, choice evaluation, and strategic planning
 * Manages decision trees, risk assessment, and outcome prediction
 */
class DecisionLayer extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            enabled: true,
            processing_time: 200,
            decision_strategy: 'hybrid', // rational, intuitive, hybrid
            risk_assessment: true,
            outcome_prediction: true,
            confidence_tracking: true,
            decision_history: true,
            multi_criteria_analysis: true,
            uncertainty_handling: true,
            bias_mitigation: true,
            collaborative_decisions: false,
            decision_timeout: 30000, // 30 seconds
            confidence_threshold: 0.6,
            risk_tolerance: 0.3,
            max_alternatives: 10,
            max_criteria: 15,
            decision_tree_depth: 5,
            learning_rate: 0.1,
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Decision components
        this.decisionEngine = null;
        this.riskAssessor = null;
        this.outcomePredictor = null;
        this.criteriaAnalyzer = null;
        this.biasDetector = null;

        // Decision state
        this.currentDecision = null;
        this.decisionQueue = [];
        this.activeDecisions = new Map();

        // Decision history and learning
        this.decisionHistory = [];
        this.decisionOutcomes = new Map();
        this.decisionPatterns = new Map();
        this.learnedPreferences = new Map();

        // Decision models and strategies
        this.decisionModels = new Map();
        this.evaluationCriteria = new Map();
        this.decisionStrategies = new Map();

        // Statistics
        this.stats = {
            totalDecisions: 0,
            successfulDecisions: 0,
            averageConfidence: 0,
            averageDecisionTime: 0,
            riskAssessments: 0,
            biasDetections: 0,
            strategyUsage: {},
            criteriaUsage: {},
            outcomeAccuracy: 0,
            decisionComplexity: 0
        };
    }

    /**
     * Initialize the decision layer
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.logger.info('🎯 Decision Layer is disabled');
                return;
            }

            this.logger.info('🎯 Initializing Decision Layer...');

            // Initialize decision components
            this.initializeDecisionEngine();
            this.initializeRiskAssessor();
            this.initializeOutcomePredictor();
            this.initializeCriteriaAnalyzer();
            this.initializeBiasDetector();

            // Initialize decision models and strategies
            this.initializeDecisionModels();
            this.initializeEvaluationCriteria();
            this.initializeDecisionStrategies();

            // Load learned preferences
            this.loadLearnedPreferences();

            this.isInitialized = true;
            this.logger.info('✅ Decision Layer initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Decision Layer:', error);
            throw error;
        }
    }

    /**
     * Process decision request
     */
    async process(input, context = {}) {
        try {
            if (!this.isInitialized || !this.config.enabled) {
                return {
                    success: false,
                    error: 'Decision layer not initialized or disabled'
                };
            }

            const startTime = Date.now();

            this.logger.debug('🎯 Processing decision request...');

            // Parse decision request
            const decisionRequest = this.parseDecisionRequest(input, context);

            // Validate decision request
            const validation = this.validateDecisionRequest(decisionRequest);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error
                };
            }

            // Create decision instance
            const decision = this.createDecisionInstance(decisionRequest, context);

            // Process the decision
            const decisionResult = await this.makeDecision(decision);

            const processingTime = Date.now() - startTime;

            // Update statistics
            this.updateStats(decision, decisionResult, processingTime);

            // Store decision in history
            if (this.config.decision_history) {
                this.storeDecisionHistory(decision, decisionResult);
            }

            this.logger.debug(`✅ Decision processing completed in ${processingTime}ms`);

            return {
                success: true,
                result: decisionResult,
                processingTime,
                decisionStats: this.getDecisionStats()
            };

        } catch (error) {
            this.logger.error('❌ Decision processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse decision request
     */
    parseDecisionRequest(input, context) {
        const request = {
            type: 'general',
            question: '',
            alternatives: [],
            criteria: [],
            constraints: [],
            preferences: {},
            urgency: 'normal',
            riskTolerance: this.config.risk_tolerance,
            requiredConfidence: this.config.confidence_threshold,
            strategy: this.config.decision_strategy,
            context: {}
        };

        if (typeof input === 'string') {
            request.question = input;
            request.type = this.inferDecisionType(input);
        } else if (typeof input === 'object') {
            Object.assign(request, input);
        }

        // Extract alternatives if not provided
        if (request.alternatives.length === 0) {
            request.alternatives = this.extractAlternatives(request.question, context);
        }

        // Extract criteria if not provided
        if (request.criteria.length === 0) {
            request.criteria = this.extractCriteria(request.question, request.type, context);
        }

        // Apply context
        request.context = { ...context, ...request.context };

        return request;
    }

    /**
     * Infer decision type from question
     */
    inferDecisionType(question) {
        const questionLower = question.toLowerCase();

        if (questionLower.includes('choose') || questionLower.includes('select')) {
            return 'selection';
        }
        if (questionLower.includes('should i') || questionLower.includes('whether')) {
            return 'binary';
        }
        if (questionLower.includes('prioritize') || questionLower.includes('rank')) {
            return 'ranking';
        }
        if (questionLower.includes('allocate') || questionLower.includes('distribute')) {
            return 'allocation';
        }
        if (questionLower.includes('plan') || questionLower.includes('strategy')) {
            return 'planning';
        }

        return 'general';
    }

    /**
     * Extract alternatives from question
     */
    extractAlternatives(question, context) {
        const alternatives = [];

        // Simple pattern matching for alternatives
        const patterns = [
            /(?:between|among)\s+([^?]+?)(?:\s+and\s+([^?]+?))?/i,
            /(?:either)\s+([^?]+?)\s+or\s+([^?]+?)/i,
            /(?:options?|choices?)\s*:?\s*([^?]+)/i
        ];

        for (const pattern of patterns) {
            const match = question.match(pattern);
            if (match) {
                const options = match[1].split(/\s+(?:or|and)\s+/);
                alternatives.push(...options.map(opt => opt.trim()));
                break;
            }
        }

        // If no alternatives found, create generic ones
        if (alternatives.length === 0) {
            alternatives.push('Option A', 'Option B');
        }

        return alternatives.slice(0, this.config.max_alternatives);
    }

    /**
     * Extract criteria from question and context
     */
    extractCriteria(question, type, context) {
        const criteria = [];

        // Default criteria based on decision type
        const defaultCriteria = {
            selection: ['effectiveness', 'cost', 'feasibility', 'risk'],
            binary: ['pros', 'cons', 'probability', 'impact'],
            ranking: ['importance', 'urgency', 'effort', 'value'],
            allocation: ['priority', 'resources', 'return', 'constraints'],
            planning: ['timeline', 'resources', 'risks', 'outcomes'],
            general: ['benefit', 'cost', 'risk', 'feasibility']
        };

        criteria.push(...(defaultCriteria[type] || defaultCriteria.general));

        // Extract criteria from question
        const criteriaKeywords = [
            'cost', 'price', 'expense', 'budget',
            'time', 'speed', 'duration', 'timeline',
            'quality', 'effectiveness', 'performance',
            'risk', 'safety', 'security',
            'effort', 'difficulty', 'complexity',
            'value', 'benefit', 'return', 'profit',
            'feasibility', 'practicality', 'viability'
        ];

        const questionLower = question.toLowerCase();
        for (const keyword of criteriaKeywords) {
            if (questionLower.includes(keyword) && !criteria.includes(keyword)) {
                criteria.push(keyword);
            }
        }

        return criteria.slice(0, this.config.max_criteria);
    }

    /**
     * Validate decision request
     */
    validateDecisionRequest(request) {
        if (!request.question || request.question.trim().length === 0) {
            return { valid: false, error: 'Decision question is required' };
        }

        if (request.alternatives.length < 2) {
            return { valid: false, error: 'At least two alternatives are required' };
        }

        if (request.criteria.length === 0) {
            return { valid: false, error: 'At least one criterion is required' };
        }

        if (request.requiredConfidence < 0 || request.requiredConfidence > 1) {
            return { valid: false, error: 'Required confidence must be between 0 and 1' };
        }

        return { valid: true };
    }

    /**
     * Create decision instance
     */
    createDecisionInstance(request, context) {
        const decisionId = `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const decision = {
            id: decisionId,
            timestamp: new Date().toISOString(),
            request,
            status: 'processing',
            strategy: request.strategy,
            alternatives: request.alternatives.map((alt, index) => ({
                id: `alt_${index}`,
                name: alt,
                scores: new Map(),
                totalScore: 0,
                confidence: 0,
                risks: [],
                benefits: []
            })),
            criteria: request.criteria.map((crit, index) => ({
                id: `crit_${index}`,
                name: crit,
                weight: 1 / request.criteria.length, // Equal weights initially
                type: 'benefit', // benefit or cost
                scale: 'numeric' // numeric, ordinal, binary
            })),
            evaluation: {
                matrix: new Map(),
                weights: new Map(),
                scores: new Map(),
                rankings: []
            },
            riskAssessment: null,
            outcomesPrediction: null,
            biasAnalysis: null,
            confidence: 0,
            recommendation: null,
            reasoning: [],
            context
        };

        this.activeDecisions.set(decisionId, decision);

        return decision;
    }

    /**
     * Make decision using selected strategy
     */
    async makeDecision(decision) {
        try {
            this.currentDecision = decision;

            // Apply decision strategy
            const strategyResult = await this.applyDecisionStrategy(decision);

            // Perform risk assessment
            if (this.config.risk_assessment) {
                decision.riskAssessment = await this.assessRisks(decision);
            }

            // Predict outcomes
            if (this.config.outcome_prediction) {
                decision.outcomesPrediction = await this.predictOutcomes(decision);
            }

            // Detect biases
            if (this.config.bias_mitigation) {
                decision.biasAnalysis = await this.detectBiases(decision);
            }

            // Calculate final recommendation
            const recommendation = this.calculateRecommendation(decision);

            // Update decision with results
            decision.status = 'completed';
            decision.recommendation = recommendation;
            decision.confidence = this.calculateDecisionConfidence(decision);

            // Generate reasoning
            decision.reasoning = this.generateReasoning(decision);

            this.currentDecision = null;

            return {
                decision: decision.recommendation,
                confidence: decision.confidence,
                reasoning: decision.reasoning,
                alternatives: decision.alternatives,
                riskAssessment: decision.riskAssessment,
                outcomesPrediction: decision.outcomesPrediction,
                biasAnalysis: decision.biasAnalysis,
                decisionId: decision.id,
                strategy: decision.strategy
            };

        } catch (error) {
            decision.status = 'failed';
            decision.error = error.message;
            throw error;
        } finally {
            this.activeDecisions.delete(decision.id);
        }
    }

    /**
     * Apply decision strategy
     */
    async applyDecisionStrategy(decision) {
        const strategy = this.decisionStrategies.get(decision.strategy);

        if (!strategy) {
            throw new Error(`Unknown decision strategy: ${decision.strategy}`);
        }

        return await strategy.apply(decision);
    }

    /**
     * Rational decision strategy
     */
    async applyRationalStrategy(decision) {
        // Multi-criteria decision analysis (MCDA)

        // Step 1: Normalize criteria weights
        this.normalizeCriteriaWeights(decision);

        // Step 2: Score alternatives against criteria
        await this.scoreAlternatives(decision);

        // Step 3: Calculate weighted scores
        this.calculateWeightedScores(decision);

        // Step 4: Rank alternatives
        this.rankAlternatives(decision);

        return {
            method: 'rational_mcda',
            matrix: decision.evaluation.matrix,
            weights: decision.evaluation.weights,
            scores: decision.evaluation.scores
        };
    }

    /**
     * Intuitive decision strategy
     */
    async applyIntuitiveStrategy(decision) {
        // Simplified heuristic-based approach

        for (const alternative of decision.alternatives) {
            // Simple heuristic scoring
            let intuitiveScore = 0;

            // Favor familiar options
            if (this.isAlternativeFamiliar(alternative.name)) {
                intuitiveScore += 0.2;
            }

            // Apply gut feeling (random with bias toward positive)
            intuitiveScore += Math.random() * 0.6 + 0.2;

            // Consider emotional factors
            if (decision.context.emotions) {
                const emotionalBias = this.calculateEmotionalBias(alternative, decision.context.emotions);
                intuitiveScore += emotionalBias;
            }

            alternative.totalScore = Math.min(1, intuitiveScore);
        }

        this.rankAlternatives(decision);

        return {
            method: 'intuitive_heuristic',
            factors: ['familiarity', 'gut_feeling', 'emotional_bias']
        };
    }

    /**
     * Hybrid decision strategy
     */
    async applyHybridStrategy(decision) {
        // Combine rational and intuitive approaches

        // Apply rational strategy
        const rationalResult = await this.applyRationalStrategy(decision);

        // Store rational scores
        const rationalScores = new Map();
        for (const alternative of decision.alternatives) {
            rationalScores.set(alternative.id, alternative.totalScore);
        }

        // Apply intuitive strategy
        const intuitiveResult = await this.applyIntuitiveStrategy(decision);

        // Store intuitive scores
        const intuitiveScores = new Map();
        for (const alternative of decision.alternatives) {
            intuitiveScores.set(alternative.id, alternative.totalScore);
        }

        // Combine scores (70% rational, 30% intuitive)
        for (const alternative of decision.alternatives) {
            const rationalScore = rationalScores.get(alternative.id) || 0;
            const intuitiveScore = intuitiveScores.get(alternative.id) || 0;
            alternative.totalScore = rationalScore * 0.7 + intuitiveScore * 0.3;
        }

        this.rankAlternatives(decision);

        return {
            method: 'hybrid',
            rational: rationalResult,
            intuitive: intuitiveResult,
            combination: '70% rational, 30% intuitive'
        };
    }

    /**
     * Normalize criteria weights
     */
    normalizeCriteriaWeights(decision) {
        const totalWeight = decision.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);

        if (totalWeight > 0) {
            for (const criterion of decision.criteria) {
                criterion.weight = criterion.weight / totalWeight;
                decision.evaluation.weights.set(criterion.id, criterion.weight);
            }
        }
    }

    /**
     * Score alternatives against criteria
     */
    async scoreAlternatives(decision) {
        for (const alternative of decision.alternatives) {
            for (const criterion of decision.criteria) {
                const score = await this.scoreAlternativeOnCriterion(alternative, criterion, decision);
                alternative.scores.set(criterion.id, score);

                const matrixKey = `${alternative.id}_${criterion.id}`;
                decision.evaluation.matrix.set(matrixKey, score);
            }
        }
    }

    /**
     * Score alternative on specific criterion
     */
    async scoreAlternativeOnCriterion(alternative, criterion, decision) {
        // This is a simplified scoring mechanism
        // In a real implementation, this would involve more sophisticated evaluation

        let score = 0.5; // Default neutral score

        // Apply learned preferences
        const preference = this.learnedPreferences.get(`${alternative.name}_${criterion.name}`);
        if (preference) {
            score = preference.score;
        } else {
            // Generate score based on heuristics
            score = this.generateHeuristicScore(alternative, criterion, decision);
        }

        // Add some randomness to simulate uncertainty
        score += (Math.random() - 0.5) * 0.2;

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Generate heuristic score
     */
    generateHeuristicScore(alternative, criterion, decision) {
        let score = 0.5;

        // Simple keyword-based scoring
        const altName = alternative.name.toLowerCase();
        const critName = criterion.name.toLowerCase();

        // Positive associations
        const positiveKeywords = {
            cost: ['cheap', 'affordable', 'low', 'budget'],
            quality: ['high', 'premium', 'excellent', 'best'],
            speed: ['fast', 'quick', 'rapid', 'immediate'],
            risk: ['safe', 'secure', 'stable', 'reliable']
        };

        // Negative associations
        const negativeKeywords = {
            cost: ['expensive', 'costly', 'high', 'premium'],
            quality: ['low', 'poor', 'bad', 'cheap'],
            speed: ['slow', 'delayed', 'long', 'extended'],
            risk: ['risky', 'dangerous', 'unstable', 'uncertain']
        };

        // Check for positive keywords
        const positiveWords = positiveKeywords[critName] || [];
        for (const word of positiveWords) {
            if (altName.includes(word)) {
                score += 0.3;
                break;
            }
        }

        // Check for negative keywords
        const negativeWords = negativeKeywords[critName] || [];
        for (const word of negativeWords) {
            if (altName.includes(word)) {
                score -= 0.3;
                break;
            }
        }

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Calculate weighted scores
     */
    calculateWeightedScores(decision) {
        for (const alternative of decision.alternatives) {
            let weightedScore = 0;

            for (const criterion of decision.criteria) {
                const score = alternative.scores.get(criterion.id) || 0;
                const weight = criterion.weight;
                weightedScore += score * weight;
            }

            alternative.totalScore = weightedScore;
            decision.evaluation.scores.set(alternative.id, weightedScore);
        }
    }

    /**
     * Rank alternatives
     */
    rankAlternatives(decision) {
        decision.alternatives.sort((a, b) => b.totalScore - a.totalScore);

        decision.evaluation.rankings = decision.alternatives.map((alt, index) => ({
            rank: index + 1,
            alternative: alt.name,
            score: alt.totalScore,
            confidence: alt.confidence
        }));
    }

    /**
     * Assess risks for decision
     */
    async assessRisks(decision) {
        const riskAssessment = {
            overallRisk: 0,
            riskFactors: [],
            mitigation: [],
            riskMatrix: new Map()
        };

        for (const alternative of decision.alternatives) {
            const risks = await this.identifyRisks(alternative, decision);
            alternative.risks = risks;

            let alternativeRisk = 0;
            for (const risk of risks) {
                alternativeRisk += risk.probability * risk.impact;
            }

            riskAssessment.riskMatrix.set(alternative.id, alternativeRisk);
            riskAssessment.overallRisk = Math.max(riskAssessment.overallRisk, alternativeRisk);
        }

        // Identify common risk factors
        riskAssessment.riskFactors = this.identifyCommonRiskFactors(decision);

        // Generate mitigation strategies
        riskAssessment.mitigation = this.generateMitigationStrategies(riskAssessment.riskFactors);

        this.stats.riskAssessments++;

        return riskAssessment;
    }

    /**
     * Identify risks for alternative
     */
    async identifyRisks(alternative, decision) {
        const risks = [];

        // Common risk categories
        const riskCategories = [
            { name: 'implementation', probability: 0.3, impact: 0.6 },
            { name: 'cost_overrun', probability: 0.4, impact: 0.5 },
            { name: 'timeline_delay', probability: 0.5, impact: 0.4 },
            { name: 'quality_issues', probability: 0.2, impact: 0.7 },
            { name: 'resource_constraints', probability: 0.3, impact: 0.6 }
        ];

        // Assess each risk category
        for (const category of riskCategories) {
            const riskScore = this.calculateRiskScore(alternative, category, decision);

            if (riskScore > 0.3) {
                risks.push({
                    category: category.name,
                    probability: category.probability * riskScore,
                    impact: category.impact,
                    severity: category.probability * category.impact * riskScore,
                    description: this.generateRiskDescription(category.name, alternative)
                });
            }
        }

        return risks;
    }

    /**
     * Calculate risk score for alternative
     */
    calculateRiskScore(alternative, riskCategory, decision) {
        let riskScore = 0.5; // Base risk

        // Adjust based on alternative characteristics
        const altName = alternative.name.toLowerCase();

        // Higher risk for complex or unfamiliar options
        if (altName.includes('new') || altName.includes('experimental')) {
            riskScore += 0.3;
        }

        if (altName.includes('complex') || altName.includes('advanced')) {
            riskScore += 0.2;
        }

        // Lower risk for proven or simple options
        if (altName.includes('proven') || altName.includes('established')) {
            riskScore -= 0.2;
        }

        if (altName.includes('simple') || altName.includes('basic')) {
            riskScore -= 0.1;
        }

        return Math.max(0, Math.min(1, riskScore));
    }

    /**
     * Generate risk description
     */
    generateRiskDescription(riskCategory, alternative) {
        const descriptions = {
            implementation: `Implementation challenges may arise with ${alternative.name}`,
            cost_overrun: `${alternative.name} may exceed budget expectations`,
            timeline_delay: `${alternative.name} might face schedule delays`,
            quality_issues: `Quality concerns may emerge with ${alternative.name}`,
            resource_constraints: `${alternative.name} may strain available resources`
        };

        return descriptions[riskCategory] || `Potential risks associated with ${alternative.name}`;
    }

    /**
     * Identify common risk factors
     */
    identifyCommonRiskFactors(decision) {
        const factors = [];

        // Analyze decision context for risk factors
        if (decision.request.urgency === 'high') {
            factors.push({
                factor: 'time_pressure',
                description: 'High urgency may lead to rushed decisions',
                impact: 0.6
            });
        }

        if (decision.alternatives.length > 5) {
            factors.push({
                factor: 'choice_overload',
                description: 'Too many alternatives may cause decision paralysis',
                impact: 0.4
            });
        }

        if (decision.criteria.length > 8) {
            factors.push({
                factor: 'complexity',
                description: 'Multiple criteria increase decision complexity',
                impact: 0.5
            });
        }

        return factors;
    }

    /**
     * Generate mitigation strategies
     */
    generateMitigationStrategies(riskFactors) {
        const strategies = [];

        for (const factor of riskFactors) {
            switch (factor.factor) {
                case 'time_pressure':
                    strategies.push('Consider setting intermediate deadlines and checkpoints');
                    strategies.push('Identify critical decision points that cannot be rushed');
                    break;
                case 'choice_overload':
                    strategies.push('Narrow down alternatives using elimination criteria');
                    strategies.push('Focus on the top 3-5 most viable options');
                    break;
                case 'complexity':
                    strategies.push('Prioritize the most important criteria');
                    strategies.push('Use a phased decision-making approach');
                    break;
            }
        }

        return strategies;
    }

    /**
     * Predict outcomes for decision
     */
    async predictOutcomes(decision) {
        const prediction = {
            scenarios: [],
            confidence: 0,
            timeHorizon: 'medium_term',
            uncertaintyFactors: []
        };

        // Generate scenarios for top alternatives
        const topAlternatives = decision.alternatives.slice(0, 3);

        for (const alternative of topAlternatives) {
            const scenarios = await this.generateScenarios(alternative, decision);
            prediction.scenarios.push(...scenarios);
        }

        // Calculate prediction confidence
        prediction.confidence = this.calculatePredictionConfidence(decision);

        // Identify uncertainty factors
        prediction.uncertaintyFactors = this.identifyUncertaintyFactors(decision);

        return prediction;
    }

    /**
     * Generate scenarios for alternative
     */
    async generateScenarios(alternative, decision) {
        const scenarios = [];

        // Generate optimistic, realistic, and pessimistic scenarios
        const scenarioTypes = [
            { name: 'optimistic', probability: 0.2, modifier: 1.3 },
            { name: 'realistic', probability: 0.6, modifier: 1.0 },
            { name: 'pessimistic', probability: 0.2, modifier: 0.7 }
        ];

        for (const scenarioType of scenarioTypes) {
            scenarios.push({
                alternative: alternative.name,
                type: scenarioType.name,
                probability: scenarioType.probability,
                expectedOutcome: alternative.totalScore * scenarioType.modifier,
                description: this.generateScenarioDescription(alternative, scenarioType),
                keyFactors: this.identifyKeyFactors(alternative, decision)
            });
        }

        return scenarios;
    }

    /**
     * Generate scenario description
     */
    generateScenarioDescription(alternative, scenarioType) {
        const descriptions = {
            optimistic: `Best-case scenario for ${alternative.name}: All factors align favorably`,
            realistic: `Most likely scenario for ${alternative.name}: Expected performance`,
            pessimistic: `Worst-case scenario for ${alternative.name}: Challenges and setbacks occur`
        };

        return descriptions[scenarioType.name];
    }

    /**
     * Identify key factors affecting outcomes
     */
    identifyKeyFactors(alternative, decision) {
        const factors = [];

        // Extract factors from criteria
        for (const criterion of decision.criteria) {
            if (criterion.weight > 0.2) { // High-weight criteria
                factors.push({
                    factor: criterion.name,
                    importance: criterion.weight,
                    impact: 'high'
                });
            }
        }

        return factors;
    }

    /**
     * Calculate prediction confidence
     */
    calculatePredictionConfidence(decision) {
        let confidence = 0.7; // Base confidence

        // Adjust based on decision characteristics
        if (decision.alternatives.length <= 3) {
            confidence += 0.1; // Fewer alternatives = higher confidence
        }

        if (decision.criteria.length <= 5) {
            confidence += 0.1; // Fewer criteria = higher confidence
        }

        // Reduce confidence for high uncertainty
        const uncertaintyFactors = this.identifyUncertaintyFactors(decision);
        confidence -= uncertaintyFactors.length * 0.05;

        return Math.max(0.1, Math.min(1, confidence));
    }

    /**
     * Identify uncertainty factors
     */
    identifyUncertaintyFactors(decision) {
        const factors = [];

        // Check for uncertainty indicators
        if (decision.request.question.toLowerCase().includes('uncertain')) {
            factors.push('explicit_uncertainty');
        }

        if (decision.alternatives.some(alt => alt.name.toLowerCase().includes('new'))) {
            factors.push('novel_alternatives');
        }

        if (decision.criteria.length > 8) {
            factors.push('high_complexity');
        }

        return factors;
    }

    /**
     * Detect biases in decision
     */
    async detectBiases(decision) {
        const biasAnalysis = {
            detectedBiases: [],
            severity: 'low',
            recommendations: []
        };

        // Check for common biases
        const biases = await this.checkForBiases(decision);
        biasAnalysis.detectedBiases = biases;

        // Calculate overall bias severity
        biasAnalysis.severity = this.calculateBiasSeverity(biases);

        // Generate recommendations to mitigate biases
        biasAnalysis.recommendations = this.generateBiasMitigation(biases);

        if (biases.length > 0) {
            this.stats.biasDetections++;
        }

        return biasAnalysis;
    }

    /**
     * Check for common decision biases
     */
    async checkForBiases(decision) {
        const biases = [];

        // Anchoring bias - over-reliance on first alternative
        if (this.detectAnchoringBias(decision)) {
            biases.push({
                type: 'anchoring',
                description: 'May be over-influenced by the first alternative presented',
                confidence: 0.6
            });
        }

        // Confirmation bias - favoring familiar options
        if (this.detectConfirmationBias(decision)) {
            biases.push({
                type: 'confirmation',
                description: 'May be favoring alternatives that confirm existing beliefs',
                confidence: 0.5
            });
        }

        // Availability bias - overweighting recent or memorable information
        if (this.detectAvailabilityBias(decision)) {
            biases.push({
                type: 'availability',
                description: 'May be influenced by easily recalled information',
                confidence: 0.4
            });
        }

        // Status quo bias - preference for current state
        if (this.detectStatusQuoBias(decision)) {
            biases.push({
                type: 'status_quo',
                description: 'May be biased toward maintaining the current situation',
                confidence: 0.5
            });
        }

        return biases;
    }

    /**
     * Detect anchoring bias
     */
    detectAnchoringBias(decision) {
        if (decision.alternatives.length < 2) return false;

        const firstAlt = decision.alternatives[0];
        const avgScore = decision.alternatives.reduce((sum, alt) => sum + alt.totalScore, 0) / decision.alternatives.length;

        // If first alternative scores significantly higher than average
        return firstAlt.totalScore > avgScore * 1.2;
    }

    /**
     * Detect confirmation bias
     */
    detectConfirmationBias(decision) {
        // Check if familiar alternatives are consistently scored higher
        let familiarCount = 0;
        let familiarScoreSum = 0;
        let unfamiliarScoreSum = 0;
        let unfamiliarCount = 0;

        for (const alternative of decision.alternatives) {
            if (this.isAlternativeFamiliar(alternative.name)) {
                familiarCount++;
                familiarScoreSum += alternative.totalScore;
            } else {
                unfamiliarCount++;
                unfamiliarScoreSum += alternative.totalScore;
            }
        }

        if (familiarCount > 0 && unfamiliarCount > 0) {
            const familiarAvg = familiarScoreSum / familiarCount;
            const unfamiliarAvg = unfamiliarScoreSum / unfamiliarCount;
            return familiarAvg > unfamiliarAvg * 1.15;
        }

        return false;
    }

    /**
     * Detect availability bias
     */
    detectAvailabilityBias(decision) {
        // Simple heuristic: check if decision context mentions recent events
        const contextText = JSON.stringify(decision.context).toLowerCase();
        const recentKeywords = ['recent', 'lately', 'just', 'yesterday', 'last week'];

        return recentKeywords.some(keyword => contextText.includes(keyword));
    }

    /**
     * Detect status quo bias
     */
    detectStatusQuoBias(decision) {
        // Check if alternatives mentioning "current" or "existing" score higher
        const statusQuoAlts = decision.alternatives.filter(alt =>
            alt.name.toLowerCase().includes('current') ||
            alt.name.toLowerCase().includes('existing') ||
            alt.name.toLowerCase().includes('keep')
        );

        if (statusQuoAlts.length === 0) return false;

        const statusQuoAvg = statusQuoAlts.reduce((sum, alt) => sum + alt.totalScore, 0) / statusQuoAlts.length;
        const otherAlts = decision.alternatives.filter(alt => !statusQuoAlts.includes(alt));

        if (otherAlts.length === 0) return false;

        const otherAvg = otherAlts.reduce((sum, alt) => sum + alt.totalScore, 0) / otherAlts.length;

        return statusQuoAvg > otherAvg * 1.1;
    }

    /**
     * Check if alternative is familiar
     */
    isAlternativeFamiliar(alternativeName) {
        // Simple heuristic based on decision history
        return this.decisionHistory.some(decision =>
            decision.alternatives.some(alt =>
                alt.name.toLowerCase().includes(alternativeName.toLowerCase()) ||
                alternativeName.toLowerCase().includes(alt.name.toLowerCase())
            )
        );
    }

    /**
     * Calculate bias severity
     */
    calculateBiasSeverity(biases) {
        if (biases.length === 0) return 'none';
        if (biases.length === 1) return 'low';
        if (biases.length === 2) return 'medium';
        return 'high';
    }

    /**
     * Generate bias mitigation recommendations
     */
    generateBiasMitigation(biases) {
        const recommendations = [];

        for (const bias of biases) {
            switch (bias.type) {
                case 'anchoring':
                    recommendations.push('Consider evaluating alternatives in random order');
                    recommendations.push('Focus on objective criteria rather than first impressions');
                    break;
                case 'confirmation':
                    recommendations.push('Actively seek information that challenges your preferences');
                    recommendations.push('Consider the merits of unfamiliar alternatives');
                    break;
                case 'availability':
                    recommendations.push('Gather comprehensive information beyond recent events');
                    recommendations.push('Consider long-term patterns rather than recent occurrences');
                    break;
                case 'status_quo':
                    recommendations.push('Explicitly consider the costs of maintaining the current state');
                    recommendations.push('Evaluate change alternatives with fresh perspective');
                    break;
            }
        }

        return recommendations;
    }

    /**
     * Calculate emotional bias
     */
    calculateEmotionalBias(alternative, emotions) {
        let bias = 0;

        // Positive emotions boost score
        const positiveEmotions = ['joy', 'trust', 'anticipation'];
        for (const emotion of positiveEmotions) {
            if (emotions[emotion]) {
                bias += emotions[emotion] * 0.1;
            }
        }

        // Negative emotions reduce score
        const negativeEmotions = ['fear', 'sadness', 'anger'];
        for (const emotion of negativeEmotions) {
            if (emotions[emotion]) {
                bias -= emotions[emotion] * 0.1;
            }
        }

        return Math.max(-0.3, Math.min(0.3, bias));
    }

    /**
     * Calculate final recommendation
     */
    calculateRecommendation(decision) {
        if (decision.alternatives.length === 0) {
            return null;
        }

        // Sort alternatives by score
        const sortedAlternatives = [...decision.alternatives].sort((a, b) => b.totalScore - a.totalScore);

        const topAlternative = sortedAlternatives[0];

        return {
            alternative: topAlternative.name,
            score: topAlternative.totalScore,
            rank: 1,
            confidence: this.calculateAlternativeConfidence(topAlternative, decision),
            reasons: this.generateRecommendationReasons(topAlternative, decision)
        };
    }

    /**
     * Calculate alternative confidence
     */
    calculateAlternativeConfidence(alternative, decision) {
        let confidence = alternative.totalScore;

        // Adjust based on score distribution
        const scores = decision.alternatives.map(alt => alt.totalScore);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const scoreVariance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;

        // Higher variance = lower confidence
        confidence *= (1 - scoreVariance * 0.5);

        // Adjust for risks
        if (alternative.risks && alternative.risks.length > 0) {
            const avgRisk = alternative.risks.reduce((sum, risk) => sum + risk.severity, 0) / alternative.risks.length;
            confidence *= (1 - avgRisk * 0.3);
        }

        return Math.max(0.1, Math.min(1, confidence));
    }

    /**
     * Generate recommendation reasons
     */
    generateRecommendationReasons(alternative, decision) {
        const reasons = [];

        // Highest scoring criteria
        const topCriteria = [...alternative.scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        for (const [criterionId, score] of topCriteria) {
            const criterion = decision.criteria.find(c => c.id === criterionId);
            if (criterion && score > 0.7) {
                reasons.push(`Scores highly on ${criterion.name} (${(score * 100).toFixed(0)}%)`);
            }
        }

        // Overall performance
        if (alternative.totalScore > 0.8) {
            reasons.push('Demonstrates strong overall performance across criteria');
        }

        // Risk considerations
        if (alternative.risks && alternative.risks.length === 0) {
            reasons.push('Presents minimal identified risks');
        }

        return reasons;
    }

    /**
     * Calculate decision confidence
     */
    calculateDecisionConfidence(decision) {
        if (!decision.recommendation) return 0;

        let confidence = decision.recommendation.confidence;

        // Adjust based on bias analysis
        if (decision.biasAnalysis && decision.biasAnalysis.detectedBiases.length > 0) {
            const biasImpact = decision.biasAnalysis.detectedBiases.length * 0.1;
            confidence *= (1 - biasImpact);
        }

        // Adjust based on risk assessment
        if (decision.riskAssessment && decision.riskAssessment.overallRisk > 0.5) {
            confidence *= (1 - decision.riskAssessment.overallRisk * 0.2);
        }

        return Math.max(0.1, Math.min(1, confidence));
    }

    /**
     * Generate reasoning for decision
     */
    generateReasoning(decision) {
        const reasoning = [];

        // Strategy used
        reasoning.push(`Applied ${decision.strategy} decision-making strategy`);

        // Top alternative and why
        if (decision.recommendation) {
            reasoning.push(`Recommended ${decision.recommendation.alternative} based on:`);
            reasoning.push(...decision.recommendation.reasons.map(reason => `  • ${reason}`));
        }

        // Risk considerations
        if (decision.riskAssessment && decision.riskAssessment.riskFactors.length > 0) {
            reasoning.push('Risk factors considered:');
            reasoning.push(...decision.riskAssessment.riskFactors.map(factor => `  • ${factor.description}`));
        }

        // Bias warnings
        if (decision.biasAnalysis && decision.biasAnalysis.detectedBiases.length > 0) {
            reasoning.push('Potential biases detected:');
            reasoning.push(...decision.biasAnalysis.detectedBiases.map(bias => `  • ${bias.description}`));
        }

        // Confidence level
        reasoning.push(`Decision confidence: ${(decision.confidence * 100).toFixed(0)}%`);

        return reasoning;
    }

    /**
     * Store decision in history
     */
    storeDecisionHistory(decision, result) {
        const historyEntry = {
            id: decision.id,
            timestamp: decision.timestamp,
            question: decision.request.question,
            alternatives: decision.alternatives.map(alt => alt.name),
            criteria: decision.criteria.map(crit => crit.name),
            strategy: decision.strategy,
            recommendation: result.decision,
            confidence: result.confidence,
            outcome: null // To be updated later
        };

        this.decisionHistory.push(historyEntry);

        // Limit history size
        if (this.decisionHistory.length > 100) {
            this.decisionHistory.shift();
        }
    }

    /**
     * Initialize decision models
     */
    initializeDecisionModels() {
        // Multi-Criteria Decision Analysis (MCDA)
        this.decisionModels.set('mcda', {
            name: 'Multi-Criteria Decision Analysis',
            description: 'Systematic evaluation using weighted criteria',
            apply: this.applyMCDA.bind(this)
        });

        // Decision Tree
        this.decisionModels.set('decision_tree', {
            name: 'Decision Tree',
            description: 'Sequential decision-making with branching outcomes',
            apply: this.applyDecisionTree.bind(this)
        });

        // Cost-Benefit Analysis
        this.decisionModels.set('cost_benefit', {
            name: 'Cost-Benefit Analysis',
            description: 'Comparison of costs and benefits',
            apply: this.applyCostBenefit.bind(this)
        });
    }

    /**
     * Initialize evaluation criteria
     */
    initializeEvaluationCriteria() {
        const defaultCriteria = [
            { name: 'cost', weight: 0.2, type: 'cost', scale: 'numeric' },
            { name: 'benefit', weight: 0.3, type: 'benefit', scale: 'numeric' },
            { name: 'risk', weight: 0.2, type: 'cost', scale: 'numeric' },
            { name: 'feasibility', weight: 0.15, type: 'benefit', scale: 'numeric' },
            { name: 'timeline', weight: 0.15, type: 'cost', scale: 'numeric' }
        ];

        for (const criterion of defaultCriteria) {
            this.evaluationCriteria.set(criterion.name, criterion);
        }
    }

    /**
     * Initialize decision strategies
     */
    initializeDecisionStrategies() {
        this.decisionStrategies.set('rational', {
            name: 'Rational Strategy',
            description: 'Systematic, analytical approach',
            apply: this.applyRationalStrategy.bind(this)
        });

        this.decisionStrategies.set('intuitive', {
            name: 'Intuitive Strategy',
            description: 'Heuristic-based, gut feeling approach',
            apply: this.applyIntuitiveStrategy.bind(this)
        });

        this.decisionStrategies.set('hybrid', {
            name: 'Hybrid Strategy',
            description: 'Combination of rational and intuitive approaches',
            apply: this.applyHybridStrategy.bind(this)
        });
    }

    /**
     * Load learned preferences
     */
    loadLearnedPreferences() {
        // In a real implementation, this would load from persistent storage
        // For now, we'll start with empty preferences
        this.learnedPreferences.clear();
    }

    /**
     * Apply MCDA model
     */
    async applyMCDA(decision) {
        return await this.applyRationalStrategy(decision);
    }

    /**
     * Apply Decision Tree model
     */
    async applyDecisionTree(decision) {
        // Simplified decision tree implementation
        // In practice, this would build and traverse a proper decision tree
        return await this.applyRationalStrategy(decision);
    }

    /**
     * Apply Cost-Benefit model
     */
    async applyCostBenefit(decision) {
        // Focus on cost and benefit criteria
        const costBenefitCriteria = decision.criteria.filter(c =>
            c.name.toLowerCase().includes('cost') ||
            c.name.toLowerCase().includes('benefit')
        );

        if (costBenefitCriteria.length === 0) {
            // Fall back to rational strategy
            return await this.applyRationalStrategy(decision);
        }

        // Weight cost and benefit criteria more heavily
        for (const criterion of decision.criteria) {
            if (costBenefitCriteria.includes(criterion)) {
                criterion.weight *= 2;
            }
        }

        // Normalize weights
        this.normalizeCriteriaWeights(decision);

        // Apply rational strategy with adjusted weights
        return await this.applyRationalStrategy(decision);
    }

    /**
     * Update statistics
     */
    updateStats(decision, result, processingTime) {
        this.stats.totalDecisions++;

        if (result.confidence >= this.config.confidence_threshold) {
            this.stats.successfulDecisions++;
        }

        // Update averages
        this.stats.averageConfidence =
            (this.stats.averageConfidence * (this.stats.totalDecisions - 1) + result.confidence) /
            this.stats.totalDecisions;

        this.stats.averageDecisionTime =
            (this.stats.averageDecisionTime * (this.stats.totalDecisions - 1) + processingTime) /
            this.stats.totalDecisions;

        // Update strategy usage
        const strategy = decision.strategy;
        this.stats.strategyUsage[strategy] = (this.stats.strategyUsage[strategy] || 0) + 1;

        // Update criteria usage
        for (const criterion of decision.criteria) {
            this.stats.criteriaUsage[criterion.name] = (this.stats.criteriaUsage[criterion.name] || 0) + 1;
        }

        // Update complexity
        const complexity = (decision.alternatives.length + decision.criteria.length) / 10;
        this.stats.decisionComplexity =
            (this.stats.decisionComplexity * (this.stats.totalDecisions - 1) + complexity) /
            this.stats.totalDecisions;
    }

    /**
     * Get decision statistics
     */
    getDecisionStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalDecisions > 0 ?
                this.stats.successfulDecisions / this.stats.totalDecisions : 0,
            activeDecisions: this.activeDecisions.size,
            decisionHistorySize: this.decisionHistory.length,
            learnedPreferences: this.learnedPreferences.size
        };
    }

    /**
     * Get layer status
     */
    getStatus() {
        return {
            name: 'Decision Layer',
            enabled: this.config.enabled,
            initialized: this.isInitialized,
            decisionStats: this.getDecisionStats(),
            currentState: {
                activeDecisions: this.activeDecisions.size,
                currentDecision: this.currentDecision ? this.currentDecision.id : null,
                queueSize: this.decisionQueue.length
            },
            configuration: {
                strategy: this.config.decision_strategy,
                riskAssessment: this.config.risk_assessment,
                outcomePrediction: this.config.outcome_prediction,
                biasDetection: this.config.bias_mitigation,
                confidenceThreshold: this.config.confidence_threshold
            }
        };
    }

    /**
     * Shutdown the decision layer
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Decision Layer...');

            // Cancel active decisions
            for (const [id, decision] of this.activeDecisions) {
                decision.status = 'cancelled';
            }
            this.activeDecisions.clear();

            this.isInitialized = false;

            this.logger.info('✅ Decision Layer shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Decision Layer shutdown:', error);
            throw error;
        }
    }
}

module.exports = DecisionLayer;