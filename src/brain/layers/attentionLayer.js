/**
 * Attention Layer - Layer 2 of Cognitive Brain
 * 
 * Handles focus identification and filtering:
 * - Priority assessment
 * - Relevance scoring
 * - Context filtering
 * - Information highlighting
 * - Attention allocation
 */

const EventEmitter = require('events');
const Logger = require('../../core/utils/logger');

class AttentionLayer extends EventEmitter {
    constructor(config, memoryManager) {
        super();
        this.config = config;
        this.memoryManager = memoryManager;
        this.logger = new Logger('AttentionLayer');
        
        // Attention mechanisms
        this.focusFilters = new Map();
        this.priorityWeights = new Map();
        this.contextualFilters = new Map();
        
        // Attention state
        this.currentFocus = null;
        this.attentionHistory = [];
        this.focusThreshold = 0.5;
        
        // Processing statistics
        this.stats = {
            totalProcessed: 0,
            focusedItems: 0,
            filteredItems: 0,
            averageAttentionScore: 0,
            averageProcessingTime: 0
        };
        
        this.isInitialized = false;
    }

    /**
     * Initialize the attention layer
     */
    async initialize() {
        try {
            this.logger.info('🎯 Initializing Attention Layer...');
            
            // Initialize focus filters
            await this.initializeFocusFilters();
            
            // Initialize priority weights
            await this.initializePriorityWeights();
            
            // Initialize contextual filters
            await this.initializeContextualFilters();
            
            // Set focus threshold from config
            this.focusThreshold = this.config.focus_threshold || 0.5;
            
            this.isInitialized = true;
            this.logger.info('✅ Attention Layer initialized successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize Attention Layer:', error);
            throw error;
        }
    }

    /**
     * Initialize focus filters for different types of content
     */
    async initializeFocusFilters() {
        this.logger.info('🔍 Initializing focus filters...');
        
        const defaultFilters = {
            urgency: {
                weight: 0.3,
                keywords: ['urgent', 'emergency', 'asap', 'immediately', 'critical', 'important'],
                patterns: [/!{2,}/, /urgent/i, /asap/i],
                scoreMultiplier: 2.0
            },
            questions: {
                weight: 0.25,
                keywords: ['what', 'how', 'when', 'where', 'why', 'who', 'which'],
                patterns: [/\?/, /^(what|how|when|where|why|who|which)\b/i],
                scoreMultiplier: 1.5
            },
            requests: {
                weight: 0.2,
                keywords: ['please', 'can you', 'could you', 'help', 'assist'],
                patterns: [/please/i, /can you/i, /help me/i],
                scoreMultiplier: 1.3
            },
            commands: {
                weight: 0.15,
                keywords: ['create', 'make', 'build', 'generate', 'start', 'stop'],
                patterns: [/^(create|make|build|generate|start|stop)\b/i],
                scoreMultiplier: 1.4
            },
            emotions: {
                weight: 0.1,
                keywords: ['frustrated', 'confused', 'excited', 'worried', 'happy', 'sad'],
                patterns: [/!+$/, /\b(very|extremely|really)\b/i],
                scoreMultiplier: 1.2
            }
        };
        
        // Load custom filters from config
        const customFilters = this.config.focus_filters || {};
        const allFilters = { ...defaultFilters, ...customFilters };
        
        for (const [filterName, filterData] of Object.entries(allFilters)) {
            this.focusFilters.set(filterName, filterData);
        }
        
        this.logger.info(`✅ Loaded ${this.focusFilters.size} focus filters`);
    }

    /**
     * Initialize priority weights for different content types
     */
    async initializePriorityWeights() {
        this.logger.info('⚖️ Initializing priority weights...');
        
        const defaultWeights = {
            intent_confidence: 0.25,
            entity_count: 0.15,
            sentiment_strength: 0.1,
            complexity: 0.15,
            context_relevance: 0.2,
            temporal_urgency: 0.15
        };
        
        // Load custom weights from config
        const customWeights = this.config.priority_weights || {};
        const allWeights = { ...defaultWeights, ...customWeights };
        
        for (const [weightName, weightValue] of Object.entries(allWeights)) {
            this.priorityWeights.set(weightName, weightValue);
        }
        
        this.logger.info(`✅ Loaded ${this.priorityWeights.size} priority weights`);
    }

    /**
     * Initialize contextual filters
     */
    async initializeContextualFilters() {
        this.logger.info('🎭 Initializing contextual filters...');
        
        const defaultContextFilters = {
            conversation_continuity: {
                enabled: true,
                weight: 0.3,
                lookback_turns: 3
            },
            topic_coherence: {
                enabled: true,
                weight: 0.25,
                similarity_threshold: 0.6
            },
            user_preferences: {
                enabled: true,
                weight: 0.2,
                adaptation_rate: 0.1
            },
            temporal_context: {
                enabled: true,
                weight: 0.15,
                time_decay_factor: 0.9
            },
            domain_focus: {
                enabled: true,
                weight: 0.1,
                domain_persistence: 0.8
            }
        };
        
        // Load custom contextual filters from config
        const customContextFilters = this.config.contextual_filters || {};
        const allContextFilters = { ...defaultContextFilters, ...customContextFilters };
        
        for (const [filterName, filterData] of Object.entries(allContextFilters)) {
            this.contextualFilters.set(filterName, filterData);
        }
        
        this.logger.info(`✅ Loaded ${this.contextualFilters.size} contextual filters`);
    }

    /**
     * Main processing method for the attention layer
     */
    async process(input, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Attention Layer not initialized');
        }
        
        const startTime = Date.now();
        const processingId = context.processingId || 'unknown';
        
        try {
            this.logger.debug(`🎯 Processing input through Attention Layer [${processingId}]`);
            
            // Extract perception results from input
            const perceptionData = input;
            
            // Calculate attention scores
            const attentionScores = await this.calculateAttentionScores(perceptionData, context);
            
            // Apply focus filters
            const focusResults = await this.applyFocusFilters(perceptionData, attentionScores, context);
            
            // Determine priority elements
            const priorityElements = await this.identifyPriorityElements(perceptionData, focusResults, context);
            
            // Apply contextual filtering
            const contextualResults = await this.applyContextualFiltering(perceptionData, priorityElements, context);
            
            // Generate attention map
            const attentionMap = await this.generateAttentionMap(perceptionData, contextualResults, context);
            
            // Update attention history
            await this.updateAttentionHistory(attentionMap, context);
            
            // Prepare focused output
            const focusedOutput = await this.prepareFocusedOutput(perceptionData, attentionMap, context);
            
            // Calculate overall attention score
            const overallAttentionScore = this.calculateOverallAttentionScore(attentionScores);
            
            // Prepare output
            const output = {
                ...perceptionData,
                attention: {
                    scores: attentionScores,
                    focus: focusResults,
                    priority: priorityElements,
                    contextual: contextualResults,
                    map: attentionMap,
                    overall_score: overallAttentionScore,
                    focused_elements: focusedOutput.focused_elements,
                    filtered_elements: focusedOutput.filtered_elements
                },
                focused_content: focusedOutput.content,
                metadata: {
                    layer: 'attention',
                    processingTime: Date.now() - startTime,
                    timestamp: new Date(),
                    attention_score: overallAttentionScore,
                    focus_applied: focusResults.focus_applied,
                    elements_focused: focusedOutput.focused_elements.length,
                    elements_filtered: focusedOutput.filtered_elements.length
                }
            };
            
            // Update statistics
            this.updateStats(Date.now() - startTime, overallAttentionScore, focusedOutput);
            
            this.logger.debug(`✅ Attention processing completed [${processingId}] - Score: ${overallAttentionScore.toFixed(3)}`);
            this.emit('processing_complete', output);
            
            return { output, metadata: output.metadata };
            
        } catch (error) {
            this.logger.error(`❌ Attention processing failed [${processingId}]:`, error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Calculate attention scores for different aspects of the input
     */
    async calculateAttentionScores(perceptionData, context) {
        const scores = {
            intent_confidence: perceptionData.intent.primary.confidence,
            entity_relevance: this.calculateEntityRelevance(perceptionData.entities),
            sentiment_strength: Math.abs(perceptionData.sentiment.score),
            complexity_score: this.calculateComplexityScore(perceptionData),
            urgency_score: this.calculateUrgencyScore(perceptionData),
            context_relevance: await this.calculateContextRelevance(perceptionData, context),
            novelty_score: await this.calculateNoveltyScore(perceptionData, context)
        };
        
        return scores;
    }

    /**
     * Apply focus filters to identify important elements
     */
    async applyFocusFilters(perceptionData, attentionScores, context) {
        const focusResults = {
            focus_applied: false,
            triggered_filters: [],
            focus_score: 0,
            focus_reasons: []
        };
        
        const text = perceptionData.processedText.toLowerCase();
        
        for (const [filterName, filterData] of this.focusFilters) {
            let filterScore = 0;
            let triggered = false;
            
            // Check keywords
            for (const keyword of filterData.keywords) {
                if (text.includes(keyword.toLowerCase())) {
                    filterScore += filterData.weight;
                    triggered = true;
                }
            }
            
            // Check patterns
            for (const pattern of filterData.patterns) {
                if (pattern.test(perceptionData.originalInput)) {
                    filterScore += filterData.weight;
                    triggered = true;
                }
            }
            
            if (triggered) {
                focusResults.triggered_filters.push({
                    filter: filterName,
                    score: filterScore * filterData.scoreMultiplier,
                    weight: filterData.weight
                });
                
                focusResults.focus_score += filterScore * filterData.scoreMultiplier;
                focusResults.focus_reasons.push(`${filterName} filter triggered`);
            }
        }
        
        focusResults.focus_applied = focusResults.focus_score > this.focusThreshold;
        
        return focusResults;
    }

    /**
     * Identify priority elements based on attention scores
     */
    async identifyPriorityElements(perceptionData, focusResults, context) {
        const elements = [];
        
        // Prioritize based on intent
        if (perceptionData.intent.primary.confidence > 0.7) {
            elements.push({
                type: 'intent',
                value: perceptionData.intent.primary.intent,
                priority: 'high',
                confidence: perceptionData.intent.primary.confidence,
                reason: 'High confidence intent detection'
            });
        }
        
        // Prioritize entities
        perceptionData.entities.forEach(entity => {
            if (entity.confidence > 0.8) {
                elements.push({
                    type: 'entity',
                    value: entity.value,
                    entityType: entity.type,
                    priority: entity.confidence > 0.9 ? 'high' : 'medium',
                    confidence: entity.confidence,
                    reason: 'High confidence entity extraction'
                });
            }
        });
        
        // Prioritize based on focus results
        if (focusResults.focus_applied) {
            elements.push({
                type: 'focus',
                value: focusResults.triggered_filters.map(f => f.filter).join(', '),
                priority: 'high',
                confidence: Math.min(focusResults.focus_score, 1.0),
                reason: 'Focus filters triggered'
            });
        }
        
        // Sort by priority and confidence
        elements.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.confidence - a.confidence;
        });
        
        return elements;
    }

    /**
     * Apply contextual filtering based on conversation history and user preferences
     */
    async applyContextualFiltering(perceptionData, priorityElements, context) {
        const contextualResults = {
            conversation_continuity: await this.assessConversationContinuity(perceptionData, context),
            topic_coherence: await this.assessTopicCoherence(perceptionData, context),
            user_preferences: await this.assessUserPreferences(perceptionData, context),
            temporal_relevance: this.assessTemporalRelevance(perceptionData, context),
            domain_consistency: this.assessDomainConsistency(perceptionData, context)
        };
        
        return contextualResults;
    }

    /**
     * Generate attention map highlighting important parts of the input
     */
    async generateAttentionMap(perceptionData, contextualResults, context) {
        const attentionMap = {
            tokens: [],
            sentences: [],
            entities: [],
            concepts: [],
            overall_focus: []
        };
        
        // Map attention to tokens
        perceptionData.tokens.forEach((token, index) => {
            let attentionScore = 0.1; // Base attention
            
            // Increase attention for entities
            perceptionData.entities.forEach(entity => {
                if (entity.value.toLowerCase().includes(token.toLowerCase())) {
                    attentionScore += 0.3 * entity.confidence;
                }
            });
            
            // Increase attention for important words
            const importantWords = ['what', 'how', 'when', 'where', 'why', 'who', 'please', 'help'];
            if (importantWords.includes(token.toLowerCase())) {
                attentionScore += 0.2;
            }
            
            attentionMap.tokens.push({
                token,
                index,
                attention: Math.min(attentionScore, 1.0)
            });
        });
        
        // Map attention to sentences
        perceptionData.sentences.forEach((sentence, index) => {
            let sentenceAttention = 0.1;
            
            // Check if sentence contains high-attention tokens
            const sentenceTokens = sentence.toLowerCase().split(/\s+/);
            const highAttentionTokens = attentionMap.tokens.filter(t => t.attention > 0.5);
            
            highAttentionTokens.forEach(token => {
                if (sentenceTokens.includes(token.token.toLowerCase())) {
                    sentenceAttention += token.attention * 0.5;
                }
            });
            
            attentionMap.sentences.push({
                sentence,
                index,
                attention: Math.min(sentenceAttention, 1.0)
            });
        });
        
        return attentionMap;
    }

    /**
     * Update attention history for learning and adaptation
     */
    async updateAttentionHistory(attentionMap, context) {
        const historyEntry = {
            timestamp: new Date(),
            processingId: context.processingId,
            attentionMap,
            context: {
                intent: context.perceptionResult?.intent?.primary?.intent,
                domain: context.perceptionResult?.context?.domain,
                urgency: context.perceptionResult?.context?.urgency
            }
        };
        
        this.attentionHistory.push(historyEntry);
        
        // Keep only recent history
        const maxHistorySize = this.config.max_history_size || 100;
        if (this.attentionHistory.length > maxHistorySize) {
            this.attentionHistory = this.attentionHistory.slice(-maxHistorySize);
        }
        
        // Store in memory manager if available
        if (this.memoryManager) {
            await this.memoryManager.storeAttentionHistory(historyEntry);
        }
    }

    /**
     * Prepare focused output with highlighted important elements
     */
    async prepareFocusedOutput(perceptionData, attentionMap, context) {
        const focusThreshold = 0.5;
        
        const focusedElements = [];
        const filteredElements = [];
        
        // Focus on high-attention tokens
        attentionMap.tokens.forEach(tokenData => {
            if (tokenData.attention > focusThreshold) {
                focusedElements.push({
                    type: 'token',
                    value: tokenData.token,
                    attention: tokenData.attention,
                    position: tokenData.index
                });
            } else {
                filteredElements.push({
                    type: 'token',
                    value: tokenData.token,
                    attention: tokenData.attention,
                    position: tokenData.index
                });
            }
        });
        
        // Focus on high-attention sentences
        attentionMap.sentences.forEach(sentenceData => {
            if (sentenceData.attention > focusThreshold) {
                focusedElements.push({
                    type: 'sentence',
                    value: sentenceData.sentence,
                    attention: sentenceData.attention,
                    position: sentenceData.index
                });
            }
        });
        
        // Create focused content
        const focusedContent = {
            primary_focus: focusedElements.filter(e => e.attention > 0.8),
            secondary_focus: focusedElements.filter(e => e.attention <= 0.8 && e.attention > 0.5),
            key_entities: perceptionData.entities.filter(e => e.confidence > 0.7),
            main_intent: perceptionData.intent.primary,
            important_concepts: perceptionData.analysis.topics.slice(0, 3)
        };
        
        return {
            content: focusedContent,
            focused_elements: focusedElements,
            filtered_elements: filteredElements
        };
    }

    /**
     * Calculate entity relevance score
     */
    calculateEntityRelevance(entities) {
        if (entities.length === 0) return 0;
        
        const totalConfidence = entities.reduce((sum, entity) => sum + entity.confidence, 0);
        const averageConfidence = totalConfidence / entities.length;
        const entityCountScore = Math.min(entities.length / 5, 1); // Normalize to max 5 entities
        
        return (averageConfidence * 0.7) + (entityCountScore * 0.3);
    }

    /**
     * Calculate complexity score
     */
    calculateComplexityScore(perceptionData) {
        const features = perceptionData.features;
        
        const complexityFactors = {
            lexicalDiversity: features.lexicalDiversity * 0.3,
            averageWordsPerSentence: Math.min(features.averageWordsPerSentence / 20, 1) * 0.3,
            uniqueWordRatio: (features.uniqueWords / features.wordCount) * 0.2,
            sentenceCount: Math.min(features.sentenceCount / 10, 1) * 0.2
        };
        
        return Object.values(complexityFactors).reduce((sum, score) => sum + score, 0);
    }

    /**
     * Calculate urgency score
     */
    calculateUrgencyScore(perceptionData) {
        let urgencyScore = 0;
        
        // Check for urgency indicators
        const urgencyKeywords = ['urgent', 'emergency', 'asap', 'immediately', 'now', 'quick'];
        const text = perceptionData.processedText.toLowerCase();
        
        urgencyKeywords.forEach(keyword => {
            if (text.includes(keyword)) {
                urgencyScore += 0.2;
            }
        });
        
        // Check for exclamation marks
        const exclamationCount = (perceptionData.originalInput.match(/!/g) || []).length;
        urgencyScore += Math.min(exclamationCount * 0.1, 0.3);
        
        // Check for capital letters (shouting)
        if (perceptionData.features.isUpperCase) {
            urgencyScore += 0.2;
        }
        
        return Math.min(urgencyScore, 1.0);
    }

    /**
     * Calculate context relevance
     */
    async calculateContextRelevance(perceptionData, context) {
        let relevanceScore = 0.5; // Base relevance
        
        // Check conversation continuity
        if (this.attentionHistory.length > 0) {
            const recentHistory = this.attentionHistory.slice(-3);
            const currentDomain = perceptionData.context.domain;
            
            const domainMatches = recentHistory.filter(h => 
                h.context.domain === currentDomain
            ).length;
            
            relevanceScore += (domainMatches / recentHistory.length) * 0.3;
        }
        
        return Math.min(relevanceScore, 1.0);
    }

    /**
     * Calculate novelty score
     */
    async calculateNoveltyScore(perceptionData, context) {
        let noveltyScore = 0.5; // Base novelty
        
        // Check against recent processing history
        if (this.attentionHistory.length > 0) {
            const recentInputs = this.attentionHistory.slice(-5);
            const currentTokens = new Set(perceptionData.tokens.map(t => t.toLowerCase()));
            
            let totalSimilarity = 0;
            recentInputs.forEach(history => {
                if (history.attentionMap && history.attentionMap.tokens) {
                    const historyTokens = new Set(history.attentionMap.tokens.map(t => t.token.toLowerCase()));
                    const intersection = new Set([...currentTokens].filter(x => historyTokens.has(x)));
                    const similarity = intersection.size / Math.max(currentTokens.size, historyTokens.size);
                    totalSimilarity += similarity;
                }
            });
            
            const averageSimilarity = totalSimilarity / recentInputs.length;
            noveltyScore = 1 - averageSimilarity; // Higher novelty for lower similarity
        }
        
        return Math.max(0, Math.min(noveltyScore, 1.0));
    }

    /**
     * Assess conversation continuity
     */
    async assessConversationContinuity(perceptionData, context) {
        const filter = this.contextualFilters.get('conversation_continuity');
        if (!filter || !filter.enabled) return { score: 0.5, reason: 'Filter disabled' };
        
        // Implementation would check conversation flow
        return { score: 0.7, reason: 'Good conversation flow' };
    }

    /**
     * Assess topic coherence
     */
    async assessTopicCoherence(perceptionData, context) {
        const filter = this.contextualFilters.get('topic_coherence');
        if (!filter || !filter.enabled) return { score: 0.5, reason: 'Filter disabled' };
        
        // Implementation would check topic consistency
        return { score: 0.6, reason: 'Moderate topic coherence' };
    }

    /**
     * Assess user preferences
     */
    async assessUserPreferences(perceptionData, context) {
        const filter = this.contextualFilters.get('user_preferences');
        if (!filter || !filter.enabled) return { score: 0.5, reason: 'Filter disabled' };
        
        // Implementation would check against user preference model
        return { score: 0.5, reason: 'No specific preferences detected' };
    }

    /**
     * Assess temporal relevance
     */
    assessTemporalRelevance(perceptionData, context) {
        const filter = this.contextualFilters.get('temporal_context');
        if (!filter || !filter.enabled) return { score: 0.5, reason: 'Filter disabled' };
        
        // Check for time-sensitive content
        const timeKeywords = ['today', 'now', 'current', 'latest', 'recent'];
        const text = perceptionData.processedText.toLowerCase();
        
        const timeRelevance = timeKeywords.some(keyword => text.includes(keyword)) ? 0.8 : 0.4;
        
        return { score: timeRelevance, reason: timeRelevance > 0.5 ? 'Time-sensitive content' : 'General content' };
    }

    /**
     * Assess domain consistency
     */
    assessDomainConsistency(perceptionData, context) {
        const filter = this.contextualFilters.get('domain_focus');
        if (!filter || !filter.enabled) return { score: 0.5, reason: 'Filter disabled' };
        
        // Check domain consistency with recent history
        const currentDomain = perceptionData.context.domain;
        
        if (this.attentionHistory.length > 0) {
            const recentDomains = this.attentionHistory.slice(-3).map(h => h.context.domain);
            const domainConsistency = recentDomains.filter(d => d === currentDomain).length / recentDomains.length;
            
            return {
                score: domainConsistency,
                reason: domainConsistency > 0.6 ? 'High domain consistency' : 'Domain shift detected'
            };
        }
        
        return { score: 0.5, reason: 'No domain history available' };
    }

    /**
     * Calculate overall attention score
     */
    calculateOverallAttentionScore(attentionScores) {
        let totalScore = 0;
        let totalWeight = 0;
        
        for (const [scoreName, scoreValue] of Object.entries(attentionScores)) {
            const weight = this.priorityWeights.get(scoreName) || 0.1;
            totalScore += scoreValue * weight;
            totalWeight += weight;
        }
        
        return totalWeight > 0 ? totalScore / totalWeight : 0.5;
    }

    /**
     * Update processing statistics
     */
    updateStats(processingTime, attentionScore, focusedOutput) {
        this.stats.totalProcessed++;
        this.stats.focusedItems += focusedOutput.focused_elements.length;
        this.stats.filteredItems += focusedOutput.filtered_elements.length;
        
        // Update average attention score
        this.stats.averageAttentionScore = (
            (this.stats.averageAttentionScore * (this.stats.totalProcessed - 1) + attentionScore) /
            this.stats.totalProcessed
        );
        
        // Update average processing time
        this.stats.averageProcessingTime = (
            (this.stats.averageProcessingTime * (this.stats.totalProcessed - 1) + processingTime) /
            this.stats.totalProcessed
        );
    }

    /**
     * Get layer status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            currentFocus: this.currentFocus,
            focusThreshold: this.focusThreshold,
            stats: this.stats,
            historySize: this.attentionHistory.length,
            config: {
                enabled: this.config.enabled,
                focusThreshold: this.focusThreshold,
                filtersCount: this.focusFilters.size
            }
        };
    }

    /**
     * Shutdown the layer
     */
    async shutdown() {
        this.logger.info('🛑 Shutting down Attention Layer...');
        this.isInitialized = false;
        this.attentionHistory = [];
        this.currentFocus = null;
        this.removeAllListeners();
        this.logger.info('✅ Attention Layer shutdown completed');
    }
}

module.exports = AttentionLayer;