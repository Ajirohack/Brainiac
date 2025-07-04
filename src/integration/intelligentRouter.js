const EventEmitter = require('events');
const path = require('path');

/**
 * Intelligent Router - Routes requests to appropriate systems
 * Handles decision making for which system should process each request
 */
class IntelligentRouter extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            routing_strategy: 'adaptive', // adaptive, rule_based, ml_based
            confidence_threshold: 0.7,
            fallback_strategy: 'cognitive_brain',
            max_routing_time: 5000,
            enable_caching: true,
            cache_ttl: 300000, // 5 minutes
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Routing components
        this.routingRules = new Map();
        this.routingCache = new Map();
        this.systemCapabilities = new Map();
        this.routingHistory = [];

        // Performance tracking
        this.stats = {
            totalRequests: 0,
            successfulRoutes: 0,
            failedRoutes: 0,
            averageRoutingTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            systemUsage: {
                rag: 0,
                cognitive_brain: 0,
                multi_agent: 0,
                hybrid: 0
            }
        };

        // System references (to be injected)
        this.ragSystem = null;
        this.cognitiveBrain = null;
        this.multiAgentCouncil = null;
    }

    /**
     * Initialize the intelligent router
     */
    async initialize() {
        try {
            this.logger.info('🧭 Initializing Intelligent Router...');

            // Initialize routing rules
            this.initializeRoutingRules();

            // Initialize system capabilities mapping
            this.initializeSystemCapabilities();

            // Setup cache cleanup
            this.setupCacheCleanup();

            this.isInitialized = true;
            this.logger.info('✅ Intelligent Router initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Intelligent Router:', error);
            throw error;
        }
    }

    /**
     * Initialize routing rules
     */
    initializeRoutingRules() {
        // Knowledge retrieval patterns
        this.routingRules.set('knowledge_query', {
            patterns: [
                /what is|what are|define|explain|describe/i,
                /how to|how do|tutorial|guide/i,
                /find|search|lookup|retrieve/i
            ],
            target: 'rag',
            confidence: 0.8
        });

        // Complex reasoning patterns
        this.routingRules.set('complex_reasoning', {
            patterns: [
                /analyze|compare|evaluate|assess/i,
                /why|because|reason|logic/i,
                /solve|problem|solution|approach/i
            ],
            target: 'cognitive_brain',
            confidence: 0.7
        });

        // Multi-step tasks
        this.routingRules.set('multi_step_task', {
            patterns: [
                /plan|strategy|steps|process/i,
                /coordinate|organize|manage/i,
                /multiple|several|various|different/i
            ],
            target: 'multi_agent',
            confidence: 0.6
        });

        // Hybrid tasks (require multiple systems)
        this.routingRules.set('hybrid_task', {
            patterns: [
                /research and analyze/i,
                /find and explain/i,
                /comprehensive|detailed analysis/i
            ],
            target: 'hybrid',
            confidence: 0.9
        });
    }

    /**
     * Initialize system capabilities
     */
    initializeSystemCapabilities() {
        this.systemCapabilities.set('rag', {
            strengths: ['knowledge_retrieval', 'fact_finding', 'document_search'],
            weaknesses: ['complex_reasoning', 'multi_step_planning'],
            responseTime: 'fast',
            accuracy: 'high',
            contextLimit: 'medium'
        });

        this.systemCapabilities.set('cognitive_brain', {
            strengths: ['reasoning', 'analysis', 'decision_making', 'context_understanding'],
            weaknesses: ['knowledge_retrieval', 'real_time_data'],
            responseTime: 'medium',
            accuracy: 'very_high',
            contextLimit: 'high'
        });

        this.systemCapabilities.set('multi_agent', {
            strengths: ['complex_tasks', 'multi_step_planning', 'coordination'],
            weaknesses: ['simple_queries', 'speed'],
            responseTime: 'slow',
            accuracy: 'high',
            contextLimit: 'very_high'
        });
    }

    /**
     * Route a request to the appropriate system
     */
    async route(request, context = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Intelligent Router not initialized');
            }

            const startTime = Date.now();
            this.stats.totalRequests++;

            this.logger.debug(`🧭 Routing request: "${request.substring(0, 100)}..."`);

            // Check cache first
            const cacheKey = this.generateCacheKey(request, context);
            if (this.config.enable_caching && this.routingCache.has(cacheKey)) {
                this.stats.cacheHits++;
                const cachedRoute = this.routingCache.get(cacheKey);
                this.logger.debug(`📋 Cache hit for routing decision: ${cachedRoute.target}`);
                return cachedRoute;
            }

            this.stats.cacheMisses++;

            // Analyze request
            const analysis = await this.analyzeRequest(request, context);

            // Determine routing strategy
            const routingDecision = await this.makeRoutingDecision(analysis, context);

            // Cache the decision
            if (this.config.enable_caching) {
                this.routingCache.set(cacheKey, {
                    ...routingDecision,
                    timestamp: Date.now()
                });
            }

            // Update statistics
            const routingTime = Date.now() - startTime;
            this.updateRoutingStats(routingDecision, routingTime);

            // Store in history
            this.routingHistory.push({
                request: request.substring(0, 200),
                decision: routingDecision,
                timestamp: new Date().toISOString(),
                routingTime
            });

            // Keep history manageable
            if (this.routingHistory.length > 1000) {
                this.routingHistory = this.routingHistory.slice(-500);
            }

            this.logger.debug(`✅ Routed to ${routingDecision.target} (confidence: ${routingDecision.confidence})`);

            this.emit('requestRouted', {
                request,
                decision: routingDecision,
                routingTime
            });

            return routingDecision;

        } catch (error) {
            this.stats.failedRoutes++;
            this.logger.error('❌ Failed to route request:', error);

            // Return fallback routing
            return {
                target: this.config.fallback_strategy,
                confidence: 0.1,
                reasoning: 'Fallback due to routing error',
                error: error.message
            };
        }
    }

    /**
     * Analyze request to understand intent and complexity
     */
    async analyzeRequest(request, context) {
        const analysis = {
            text: request,
            length: request.length,
            complexity: this.assessComplexity(request),
            intent: this.detectIntent(request),
            keywords: this.extractKeywords(request),
            questionType: this.classifyQuestion(request),
            contextClues: this.analyzeContext(context),
            urgency: this.assessUrgency(request, context)
        };

        return analysis;
    }

    /**
     * Assess request complexity
     */
    assessComplexity(request) {
        let complexity = 0;

        // Length factor
        if (request.length > 500) complexity += 0.3;
        else if (request.length > 200) complexity += 0.2;
        else if (request.length > 100) complexity += 0.1;

        // Question words
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
        const questionCount = questionWords.filter(word =>
            request.toLowerCase().includes(word)
        ).length;
        complexity += questionCount * 0.1;

        // Complex terms
        const complexTerms = ['analyze', 'compare', 'evaluate', 'synthesize', 'integrate'];
        const complexCount = complexTerms.filter(term =>
            request.toLowerCase().includes(term)
        ).length;
        complexity += complexCount * 0.2;

        // Multiple sentences
        const sentences = request.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length > 3) complexity += 0.2;
        else if (sentences.length > 1) complexity += 0.1;

        return Math.min(complexity, 1.0);
    }

    /**
     * Detect request intent
     */
    detectIntent(request) {
        const intents = {
            'information_seeking': /what is|what are|define|explain|tell me about/i,
            'how_to': /how to|how do|how can|steps to/i,
            'comparison': /compare|versus|vs|difference between/i,
            'analysis': /analyze|examine|evaluate|assess/i,
            'problem_solving': /solve|fix|resolve|troubleshoot/i,
            'planning': /plan|strategy|approach|method/i,
            'creative': /create|generate|design|build/i
        };

        for (const [intent, pattern] of Object.entries(intents)) {
            if (pattern.test(request)) {
                return intent;
            }
        }

        return 'general';
    }

    /**
     * Extract keywords from request
     */
    extractKeywords(request) {
        // Simple keyword extraction (could be enhanced with NLP)
        const words = request.toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);

        // Remove common stop words
        const stopWords = new Set([
            'this', 'that', 'with', 'have', 'will', 'from', 'they', 'know',
            'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when',
            'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over',
            'such', 'take', 'than', 'them', 'well', 'were'
        ]);

        return words.filter(word => !stopWords.has(word));
    }

    /**
     * Classify question type
     */
    classifyQuestion(request) {
        if (/^what/i.test(request)) return 'factual';
        if (/^how/i.test(request)) return 'procedural';
        if (/^why/i.test(request)) return 'causal';
        if (/^when/i.test(request)) return 'temporal';
        if (/^where/i.test(request)) return 'spatial';
        if (/^who/i.test(request)) return 'personal';
        if (/\?$/.test(request)) return 'interrogative';
        return 'statement';
    }

    /**
     * Analyze context for routing hints
     */
    analyzeContext(context) {
        const clues = {
            hasHistory: context.conversationHistory && context.conversationHistory.length > 0,
            hasDocuments: context.documents && context.documents.length > 0,
            hasDeadline: context.deadline !== undefined,
            requiresAccuracy: context.accuracy === 'high',
            requiresSpeed: context.priority === 'urgent',
            multiStep: context.multiStep === true
        };

        return clues;
    }

    /**
     * Assess request urgency
     */
    assessUrgency(request, context) {
        let urgency = 0;

        // Explicit urgency indicators
        if (/urgent|asap|immediately|quickly|fast/i.test(request)) {
            urgency += 0.5;
        }

        // Context urgency
        if (context.priority === 'urgent') urgency += 0.3;
        if (context.deadline) {
            const deadline = new Date(context.deadline);
            const now = new Date();
            const timeLeft = deadline - now;
            if (timeLeft < 3600000) urgency += 0.4; // Less than 1 hour
            else if (timeLeft < 86400000) urgency += 0.2; // Less than 1 day
        }

        return Math.min(urgency, 1.0);
    }

    /**
     * Make routing decision based on analysis
     */
    async makeRoutingDecision(analysis, context) {
        const candidates = [];

        // Rule-based routing
        for (const [ruleName, rule] of this.routingRules.entries()) {
            let score = 0;

            // Pattern matching
            for (const pattern of rule.patterns) {
                if (pattern.test(analysis.text)) {
                    score += rule.confidence;
                    break;
                }
            }

            // Adjust score based on analysis
            score = this.adjustScoreByAnalysis(score, analysis, rule.target);

            if (score > 0) {
                candidates.push({
                    target: rule.target,
                    confidence: Math.min(score, 1.0),
                    reasoning: `Matched rule: ${ruleName}`,
                    rule: ruleName
                });
            }
        }

        // If no candidates, use fallback
        if (candidates.length === 0) {
            return {
                target: this.config.fallback_strategy,
                confidence: 0.3,
                reasoning: 'No specific patterns matched, using fallback'
            };
        }

        // Sort by confidence and return best match
        candidates.sort((a, b) => b.confidence - a.confidence);
        const bestCandidate = candidates[0];

        // Check if confidence meets threshold
        if (bestCandidate.confidence < this.config.confidence_threshold) {
            return {
                target: this.config.fallback_strategy,
                confidence: bestCandidate.confidence,
                reasoning: `Confidence ${bestCandidate.confidence} below threshold ${this.config.confidence_threshold}`
            };
        }

        return bestCandidate;
    }

    /**
     * Adjust routing score based on analysis
     */
    adjustScoreByAnalysis(baseScore, analysis, target) {
        let adjustedScore = baseScore;

        // Complexity adjustments
        if (target === 'rag' && analysis.complexity > 0.7) {
            adjustedScore *= 0.7; // RAG less suitable for complex tasks
        }

        if (target === 'cognitive_brain' && analysis.complexity > 0.5) {
            adjustedScore *= 1.2; // Cognitive brain better for complex tasks
        }

        if (target === 'multi_agent' && analysis.complexity > 0.8) {
            adjustedScore *= 1.3; // Multi-agent best for very complex tasks
        }

        // Intent adjustments
        if (analysis.intent === 'information_seeking' && target === 'rag') {
            adjustedScore *= 1.3;
        }

        if (analysis.intent === 'analysis' && target === 'cognitive_brain') {
            adjustedScore *= 1.2;
        }

        if (analysis.intent === 'planning' && target === 'multi_agent') {
            adjustedScore *= 1.2;
        }

        // Urgency adjustments
        if (analysis.urgency > 0.7) {
            if (target === 'rag') adjustedScore *= 1.2; // RAG is fastest
            if (target === 'multi_agent') adjustedScore *= 0.8; // Multi-agent is slowest
        }

        return adjustedScore;
    }

    /**
     * Generate cache key for request
     */
    generateCacheKey(request, context) {
        const contextKey = JSON.stringify({
            intent: context.intent,
            priority: context.priority,
            accuracy: context.accuracy
        });

        // Simple hash of request + context
        const combined = request + contextKey;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return `route_${Math.abs(hash)}`;
    }

    /**
     * Update routing statistics
     */
    updateRoutingStats(decision, routingTime) {
        this.stats.successfulRoutes++;

        // Update average routing time
        this.stats.averageRoutingTime =
            (this.stats.averageRoutingTime * (this.stats.successfulRoutes - 1) + routingTime) /
            this.stats.successfulRoutes;

        // Update system usage
        if (this.stats.systemUsage[decision.target] !== undefined) {
            this.stats.systemUsage[decision.target]++;
        }
    }

    /**
     * Setup cache cleanup
     */
    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            const expiredKeys = [];

            for (const [key, value] of this.routingCache.entries()) {
                if (now - value.timestamp > this.config.cache_ttl) {
                    expiredKeys.push(key);
                }
            }

            expiredKeys.forEach(key => this.routingCache.delete(key));

            if (expiredKeys.length > 0) {
                this.logger.debug(`🧹 Cleaned up ${expiredKeys.length} expired cache entries`);
            }
        }, this.config.cache_ttl / 2);
    }

    /**
     * Set system references
     */
    setSystemReferences(systems) {
        this.ragSystem = systems.ragSystem;
        this.cognitiveBrain = systems.cognitiveBrain;
        this.multiAgentCouncil = systems.multiAgentCouncil;

        this.logger.debug('🔗 System references set for intelligent router');
    }

    /**
     * Get routing statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.routingCache.size,
            historySize: this.routingHistory.length,
            rulesCount: this.routingRules.size,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get routing history
     */
    getHistory(limit = 50) {
        return this.routingHistory.slice(-limit);
    }

    /**
     * Clear routing cache
     */
    clearCache() {
        this.routingCache.clear();
        this.logger.debug('🧹 Routing cache cleared');
    }

    /**
     * Add custom routing rule
     */
    addRoutingRule(name, rule) {
        this.routingRules.set(name, rule);
        this.logger.debug(`📋 Added custom routing rule: ${name}`);
    }

    /**
     * Remove routing rule
     */
    removeRoutingRule(name) {
        const removed = this.routingRules.delete(name);
        if (removed) {
            this.logger.debug(`🗑️ Removed routing rule: ${name}`);
        }
        return removed;
    }

    /**
     * Shutdown the router
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Intelligent Router...');

            // Clear cache and history
            this.routingCache.clear();
            this.routingHistory = [];

            this.isInitialized = false;
            this.logger.info('✅ Intelligent Router shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Intelligent Router shutdown:', error);
            throw error;
        }
    }
}

module.exports = IntelligentRouter;