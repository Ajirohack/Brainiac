const EventEmitter = require('events');

/**
 * Synthesizer - Combines and synthesizes results from multiple systems
 * Creates coherent, unified responses from diverse system outputs
 */
class Synthesizer extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            synthesis_strategy: 'weighted_merge', // weighted_merge, consensus, hierarchical
            confidence_weighting: true,
            source_attribution: true,
            max_response_length: 2000,
            enable_fact_checking: true,
            consistency_threshold: 0.7,
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Synthesis strategies
        this.synthesisStrategies = new Map();
        this.initializeSynthesisStrategies();

        // Quality metrics
        this.qualityMetrics = {
            coherence: 0,
            completeness: 0,
            accuracy: 0,
            relevance: 0
        };

        // Performance tracking
        this.stats = {
            totalSyntheses: 0,
            successfulSyntheses: 0,
            averageSynthesisTime: 0,
            averageQualityScore: 0,
            strategyUsage: {
                weighted_merge: 0,
                consensus: 0,
                hierarchical: 0,
                simple_merge: 0
            }
        };

        // Response templates
        this.responseTemplates = new Map();
        this.initializeResponseTemplates();
    }

    /**
     * Initialize the synthesizer
     */
    async initialize() {
        try {
            this.logger.info('🔬 Initializing Synthesizer...');

            // Initialize synthesis components
            this.initializeQualityAssessment();

            this.isInitialized = true;
            this.logger.info('✅ Synthesizer initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Synthesizer:', error);
            throw error;
        }
    }

    /**
     * Initialize synthesis strategies
     */
    initializeSynthesisStrategies() {
        // Weighted merge based on confidence scores
        this.synthesisStrategies.set('weighted_merge', (results) => {
            return this.weightedMergeSynthesis(results);
        });

        // Consensus-based synthesis
        this.synthesisStrategies.set('consensus', (results) => {
            return this.consensusSynthesis(results);
        });

        // Hierarchical synthesis (priority-based)
        this.synthesisStrategies.set('hierarchical', (results) => {
            return this.hierarchicalSynthesis(results);
        });

        // Simple merge (concatenation)
        this.synthesisStrategies.set('simple_merge', (results) => {
            return this.simpleMergeSynthesis(results);
        });
    }

    /**
     * Initialize response templates
     */
    initializeResponseTemplates() {
        this.responseTemplates.set('comprehensive', {
            structure: [
                'summary',
                'detailed_analysis',
                'supporting_evidence',
                'conclusions',
                'sources'
            ],
            minSections: 3
        });

        this.responseTemplates.set('concise', {
            structure: [
                'direct_answer',
                'key_points',
                'sources'
            ],
            minSections: 2
        });

        this.responseTemplates.set('analytical', {
            structure: [
                'problem_statement',
                'analysis',
                'findings',
                'recommendations',
                'sources'
            ],
            minSections: 4
        });
    }

    /**
     * Synthesize results from multiple systems
     */
    async synthesize(results, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Synthesizer not initialized');
            }

            const startTime = Date.now();
            this.stats.totalSyntheses++;

            this.logger.debug(`🔬 Synthesizing ${results.length} results`);

            // Validate and preprocess results
            const processedResults = this.preprocessResults(results);

            if (processedResults.length === 0) {
                throw new Error('No valid results to synthesize');
            }

            // Determine synthesis strategy
            const strategy = options.strategy || this.config.synthesis_strategy;

            // Perform synthesis
            const synthesisResult = await this.performSynthesis(
                processedResults,
                strategy,
                options
            );

            // Post-process and format response
            const finalResponse = await this.postProcessResponse(
                synthesisResult,
                options
            );

            // Assess quality
            const qualityScore = this.assessQuality(finalResponse, processedResults);

            const synthesisTime = Date.now() - startTime;

            // Update statistics
            this.updateSynthesisStats(strategy, synthesisTime, qualityScore);

            this.logger.debug(`✅ Synthesis completed in ${synthesisTime}ms (quality: ${qualityScore.overall})`);

            const result = {
                response: finalResponse.content,
                metadata: {
                    strategy,
                    synthesisTime,
                    qualityScore,
                    sourcesCount: processedResults.length,
                    confidence: finalResponse.confidence,
                    sources: finalResponse.sources
                }
            };

            this.emit('synthesisCompleted', result);
            return result;

        } catch (error) {
            this.logger.error('❌ Synthesis failed:', error);
            throw error;
        }
    }

    /**
     * Preprocess results for synthesis
     */
    preprocessResults(results) {
        const processed = [];

        for (const result of results) {
            try {
                const processedResult = this.normalizeResult(result);
                if (this.validateResult(processedResult)) {
                    processed.push(processedResult);
                }
            } catch (error) {
                this.logger.warn('⚠️ Failed to preprocess result:', error.message);
            }
        }

        return processed;
    }

    /**
     * Normalize result format
     */
    normalizeResult(result) {
        // Handle different result formats
        if (typeof result === 'string') {
            return {
                content: result,
                confidence: 0.5,
                source: 'unknown',
                type: 'text'
            };
        }

        if (result.result && typeof result.result === 'object') {
            // Handle orchestrator results
            return {
                content: result.result.response || result.result.context || JSON.stringify(result.result),
                confidence: result.result.confidence || 0.5,
                source: result.system || 'unknown',
                type: result.result.type || 'structured',
                metadata: result.result.metadata || {}
            };
        }

        return {
            content: result.content || result.response || result.text || JSON.stringify(result),
            confidence: result.confidence || result.score || 0.5,
            source: result.source || result.system || 'unknown',
            type: result.type || 'mixed',
            metadata: result.metadata || {}
        };
    }

    /**
     * Validate result for synthesis
     */
    validateResult(result) {
        if (!result.content || result.content.trim().length === 0) {
            return false;
        }

        if (result.confidence < 0 || result.confidence > 1) {
            result.confidence = Math.max(0, Math.min(1, result.confidence));
        }

        return true;
    }

    /**
     * Perform synthesis using specified strategy
     */
    async performSynthesis(results, strategy, options) {
        const synthesisFunction = this.synthesisStrategies.get(strategy);

        if (!synthesisFunction) {
            this.logger.warn(`⚠️ Unknown synthesis strategy: ${strategy}, using weighted_merge`);
            return this.weightedMergeSynthesis(results, options);
        }

        this.stats.strategyUsage[strategy]++;
        return synthesisFunction(results, options);
    }

    /**
     * Weighted merge synthesis
     */
    weightedMergeSynthesis(results, options = {}) {
        // Sort by confidence
        const sortedResults = results.sort((a, b) => b.confidence - a.confidence);

        // Calculate weights
        const totalConfidence = sortedResults.reduce((sum, r) => sum + r.confidence, 0);
        const weights = sortedResults.map(r => r.confidence / totalConfidence);

        // Merge content based on weights
        let mergedContent = '';
        let sources = [];
        let overallConfidence = 0;

        for (let i = 0; i < sortedResults.length; i++) {
            const result = sortedResults[i];
            const weight = weights[i];

            // Add content with weight consideration
            if (weight > 0.1) { // Only include significant contributions
                if (mergedContent.length > 0) {
                    mergedContent += '\n\n';
                }

                // Add source attribution if enabled
                if (this.config.source_attribution && result.source !== 'unknown') {
                    mergedContent += `**From ${result.source}:** `;
                }

                mergedContent += result.content;

                sources.push({
                    source: result.source,
                    confidence: result.confidence,
                    weight: weight
                });

                overallConfidence += result.confidence * weight;
            }
        }

        return {
            content: mergedContent,
            confidence: overallConfidence,
            sources,
            strategy: 'weighted_merge',
            metadata: {
                totalSources: results.length,
                usedSources: sources.length,
                weights
            }
        };
    }

    /**
     * Consensus synthesis
     */
    consensusSynthesis(results, options = {}) {
        // Find common themes and agreements
        const themes = this.extractCommonThemes(results);
        const agreements = this.findAgreements(results);

        let consensusContent = '';
        let sources = [];
        let confidence = 0;

        // Build consensus response
        if (agreements.length > 0) {
            consensusContent += '**Consensus Points:**\n';
            for (const agreement of agreements) {
                consensusContent += `• ${agreement.content} (${agreement.sources.length} sources agree)\n`;
            }
            consensusContent += '\n';
        }

        if (themes.length > 0) {
            consensusContent += '**Common Themes:**\n';
            for (const theme of themes) {
                consensusContent += `• ${theme.description}\n`;
            }
        }

        // Calculate consensus confidence
        confidence = agreements.length > 0 ?
            agreements.reduce((sum, a) => sum + a.confidence, 0) / agreements.length :
            0.3;

        // Collect all sources
        sources = results.map(r => ({
            source: r.source,
            confidence: r.confidence
        }));

        return {
            content: consensusContent || 'No clear consensus found among sources.',
            confidence,
            sources,
            strategy: 'consensus',
            metadata: {
                agreements: agreements.length,
                themes: themes.length,
                consensusStrength: confidence
            }
        };
    }

    /**
     * Hierarchical synthesis
     */
    hierarchicalSynthesis(results, options = {}) {
        // Define system hierarchy (can be customized)
        const hierarchy = options.hierarchy || [
            'multi_agent',
            'cognitive_brain',
            'rag',
            'unknown'
        ];

        // Sort results by hierarchy and confidence
        const sortedResults = results.sort((a, b) => {
            const aIndex = hierarchy.indexOf(a.source);
            const bIndex = hierarchy.indexOf(b.source);

            if (aIndex !== bIndex) {
                return (aIndex === -1 ? hierarchy.length : aIndex) -
                    (bIndex === -1 ? hierarchy.length : bIndex);
            }

            return b.confidence - a.confidence;
        });

        // Build hierarchical response
        let hierarchicalContent = '';
        let sources = [];
        let confidence = 0;

        for (let i = 0; i < sortedResults.length; i++) {
            const result = sortedResults[i];
            const priority = hierarchy.length - (hierarchy.indexOf(result.source) + 1);

            if (i === 0) {
                // Primary response
                hierarchicalContent = result.content;
                confidence = result.confidence;
            } else {
                // Supporting information
                hierarchicalContent += `\n\n**Additional Context (${result.source}):**\n${result.content}`;
            }

            sources.push({
                source: result.source,
                confidence: result.confidence,
                priority
            });
        }

        return {
            content: hierarchicalContent,
            confidence,
            sources,
            strategy: 'hierarchical',
            metadata: {
                hierarchy,
                primarySource: sortedResults[0]?.source
            }
        };
    }

    /**
     * Simple merge synthesis
     */
    simpleMergeSynthesis(results, options = {}) {
        const mergedContent = results
            .map((result, index) => {
                let content = result.content;
                if (this.config.source_attribution && result.source !== 'unknown') {
                    content = `**${result.source}:** ${content}`;
                }
                return content;
            })
            .join('\n\n');

        const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

        const sources = results.map(r => ({
            source: r.source,
            confidence: r.confidence
        }));

        return {
            content: mergedContent,
            confidence: averageConfidence,
            sources,
            strategy: 'simple_merge',
            metadata: {
                totalLength: mergedContent.length
            }
        };
    }

    /**
     * Extract common themes from results
     */
    extractCommonThemes(results) {
        // Simple keyword-based theme extraction
        const themes = [];
        const keywords = new Map();

        // Extract keywords from all results
        for (const result of results) {
            const words = result.content.toLowerCase()
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 4);

            for (const word of words) {
                keywords.set(word, (keywords.get(word) || 0) + 1);
            }
        }

        // Find common keywords (appearing in multiple results)
        const commonKeywords = Array.from(keywords.entries())
            .filter(([word, count]) => count >= Math.min(2, results.length))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        for (const [keyword, count] of commonKeywords) {
            themes.push({
                keyword,
                frequency: count,
                description: `Common topic: ${keyword}`
            });
        }

        return themes;
    }

    /**
     * Find agreements between results
     */
    findAgreements(results) {
        const agreements = [];

        // Simple sentence-based agreement detection
        for (let i = 0; i < results.length; i++) {
            const sentences1 = this.extractSentences(results[i].content);

            for (const sentence1 of sentences1) {
                const agreingSources = [results[i].source];
                let totalConfidence = results[i].confidence;

                for (let j = i + 1; j < results.length; j++) {
                    const sentences2 = this.extractSentences(results[j].content);

                    for (const sentence2 of sentences2) {
                        if (this.sentencesSimilar(sentence1, sentence2)) {
                            agreingSources.push(results[j].source);
                            totalConfidence += results[j].confidence;
                            break;
                        }
                    }
                }

                if (agreingSources.length > 1) {
                    agreements.push({
                        content: sentence1,
                        sources: agreingSources,
                        confidence: totalConfidence / agreingSources.length
                    });
                }
            }
        }

        // Remove duplicates and sort by confidence
        const uniqueAgreements = agreements
            .filter((agreement, index, arr) =>
                arr.findIndex(a => a.content === agreement.content) === index
            )
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3); // Top 3 agreements

        return uniqueAgreements;
    }

    /**
     * Extract sentences from text
     */
    extractSentences(text) {
        return text.split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 20); // Minimum sentence length
    }

    /**
     * Check if two sentences are similar
     */
    sentencesSimilar(sentence1, sentence2) {
        // Simple word overlap similarity
        const words1 = new Set(sentence1.toLowerCase().split(/\s+/));
        const words2 = new Set(sentence2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        const similarity = intersection.size / union.size;
        return similarity > 0.3; // 30% word overlap threshold
    }

    /**
     * Post-process and format response
     */
    async postProcessResponse(synthesisResult, options) {
        let content = synthesisResult.content;

        // Apply length limits
        if (content.length > this.config.max_response_length) {
            content = this.truncateResponse(content, this.config.max_response_length);
        }

        // Apply response template if specified
        if (options.template && this.responseTemplates.has(options.template)) {
            content = this.applyResponseTemplate(content, options.template);
        }

        // Add source citations if enabled
        if (this.config.source_attribution && synthesisResult.sources.length > 0) {
            content += this.generateSourceCitations(synthesisResult.sources);
        }

        return {
            content,
            confidence: synthesisResult.confidence,
            sources: synthesisResult.sources,
            metadata: synthesisResult.metadata
        };
    }

    /**
     * Truncate response to specified length
     */
    truncateResponse(content, maxLength) {
        if (content.length <= maxLength) return content;

        // Try to truncate at sentence boundary
        const truncated = content.substring(0, maxLength);
        const lastSentence = truncated.lastIndexOf('.');

        if (lastSentence > maxLength * 0.8) {
            return truncated.substring(0, lastSentence + 1);
        }

        return truncated + '...';
    }

    /**
     * Apply response template
     */
    applyResponseTemplate(content, templateName) {
        const template = this.responseTemplates.get(templateName);
        if (!template) return content;

        // Simple template application (could be enhanced)
        return `**Response (${templateName} format):**\n\n${content}`;
    }

    /**
     * Generate source citations
     */
    generateSourceCitations(sources) {
        if (sources.length === 0) return '';

        let citations = '\n\n**Sources:**\n';

        const uniqueSources = sources.filter((source, index, arr) =>
            arr.findIndex(s => s.source === source.source) === index
        );

        for (let i = 0; i < uniqueSources.length; i++) {
            const source = uniqueSources[i];
            citations += `${i + 1}. ${source.source} (confidence: ${(source.confidence * 100).toFixed(1)}%)\n`;
        }

        return citations;
    }

    /**
     * Initialize quality assessment
     */
    initializeQualityAssessment() {
        // Quality assessment metrics and methods
        this.qualityAssessors = {
            coherence: (response, sources) => this.assessCoherence(response),
            completeness: (response, sources) => this.assessCompleteness(response, sources),
            accuracy: (response, sources) => this.assessAccuracy(response, sources),
            relevance: (response, sources) => this.assessRelevance(response, sources)
        };
    }

    /**
     * Assess overall quality of synthesized response
     */
    assessQuality(response, sources) {
        const scores = {};
        let totalScore = 0;

        for (const [metric, assessor] of Object.entries(this.qualityAssessors)) {
            try {
                scores[metric] = assessor(response, sources);
                totalScore += scores[metric];
            } catch (error) {
                this.logger.warn(`⚠️ Quality assessment failed for ${metric}:`, error.message);
                scores[metric] = 0.5; // Default score
                totalScore += 0.5;
            }
        }

        scores.overall = totalScore / Object.keys(this.qualityAssessors).length;
        return scores;
    }

    /**
     * Assess response coherence
     */
    assessCoherence(response) {
        // Simple coherence metrics
        const sentences = this.extractSentences(response.content);

        if (sentences.length === 0) return 0;
        if (sentences.length === 1) return 0.8;

        // Check for logical flow (simple heuristics)
        let coherenceScore = 0.5;

        // Penalize very short or very long responses
        const avgSentenceLength = response.content.length / sentences.length;
        if (avgSentenceLength > 20 && avgSentenceLength < 200) {
            coherenceScore += 0.2;
        }

        // Reward proper structure
        if (response.content.includes('**') || response.content.includes('•')) {
            coherenceScore += 0.1;
        }

        return Math.min(coherenceScore, 1.0);
    }

    /**
     * Assess response completeness
     */
    assessCompleteness(response, sources) {
        // Check if response addresses multiple aspects
        let completenessScore = 0.3;

        // Length factor
        if (response.content.length > 200) completenessScore += 0.2;
        if (response.content.length > 500) completenessScore += 0.2;

        // Source utilization
        if (sources.length > 1) completenessScore += 0.2;
        if (sources.length > 2) completenessScore += 0.1;

        return Math.min(completenessScore, 1.0);
    }

    /**
     * Assess response accuracy
     */
    assessAccuracy(response, sources) {
        // Use source confidence as accuracy proxy
        if (sources.length === 0) return 0.3;

        const avgSourceConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;
        return avgSourceConfidence;
    }

    /**
     * Assess response relevance
     */
    assessRelevance(response, sources) {
        // Simple relevance assessment
        return response.confidence || 0.7;
    }

    /**
     * Update synthesis statistics
     */
    updateSynthesisStats(strategy, synthesisTime, qualityScore) {
        this.stats.successfulSyntheses++;

        // Update average synthesis time
        this.stats.averageSynthesisTime =
            (this.stats.averageSynthesisTime * (this.stats.successfulSyntheses - 1) + synthesisTime) /
            this.stats.successfulSyntheses;

        // Update average quality score
        this.stats.averageQualityScore =
            (this.stats.averageQualityScore * (this.stats.successfulSyntheses - 1) + qualityScore.overall) /
            this.stats.successfulSyntheses;
    }

    /**
     * Get synthesizer statistics
     */
    getStats() {
        return {
            ...this.stats,
            strategiesAvailable: this.synthesisStrategies.size,
            templatesAvailable: this.responseTemplates.size,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Add custom synthesis strategy
     */
    addSynthesisStrategy(name, strategyFunction) {
        this.synthesisStrategies.set(name, strategyFunction);
        this.stats.strategyUsage[name] = 0;
        this.logger.debug(`📋 Added custom synthesis strategy: ${name}`);
    }

    /**
     * Add custom response template
     */
    addResponseTemplate(name, template) {
        this.responseTemplates.set(name, template);
        this.logger.debug(`📋 Added custom response template: ${name}`);
    }

    /**
     * Shutdown the synthesizer
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Synthesizer...');

            this.isInitialized = false;
            this.logger.info('✅ Synthesizer shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Synthesizer shutdown:', error);
            throw error;
        }
    }
}

module.exports = Synthesizer;