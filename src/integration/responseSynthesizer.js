/**
 * Response Synthesizer - Combines and optimizes outputs from multiple systems
 * 
 * Takes results from Brain, Agents, and RAG systems and creates coherent,
 * contextually appropriate responses with proper formatting and optimization.
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');

class ResponseSynthesizer extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxResponseLength: 4000,
            enableFormatting: true,
            enableOptimization: true,
            confidenceThreshold: 0.5,
            synthesisStrategy: 'weighted', // 'weighted', 'priority', 'consensus'
            ...config
        };

        this.logger = new Logger('ResponseSynthesizer');
        
        // Synthesis strategies
        this.strategies = {
            weighted: this.weightedSynthesis.bind(this),
            priority: this.prioritySynthesis.bind(this),
            consensus: this.consensusSynthesis.bind(this)
        };

        // Response templates
        this.templates = {
            standard: this.standardTemplate.bind(this),
            detailed: this.detailedTemplate.bind(this),
            concise: this.conciseTemplate.bind(this),
            technical: this.technicalTemplate.bind(this)
        };

        // Performance metrics
        this.metrics = {
            totalSyntheses: 0,
            averageSynthesisTime: 0,
            qualityScores: [],
            strategyUsage: new Map()
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the synthesizer
     */
    async initialize() {
        try {
            this.logger.info('Initializing Response Synthesizer...');
            
            // Initialize strategy usage tracking
            Object.keys(this.strategies).forEach(strategy => {
                this.metrics.strategyUsage.set(strategy, 0);
            });

            this.isInitialized = true;
            this.logger.info('Response Synthesizer initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize Response Synthesizer:', error);
            throw error;
        }
    }

    /**
     * Synthesize response from multiple system outputs
     */
    async synthesizeResponse(inputs, options = {}) {
        const startTime = Date.now();
        
        try {
            this.logger.debug('Starting response synthesis');

            // Validate inputs
            if (!inputs || typeof inputs !== 'object') {
                throw new Error('Invalid inputs provided for synthesis');
            }

            // Prepare synthesis context
            const context = {
                inputs,
                options: {
                    strategy: options.strategy || this.config.synthesisStrategy,
                    template: options.template || 'standard',
                    maxLength: options.maxLength || this.config.maxResponseLength,
                    includeMetadata: options.includeMetadata || false,
                    ...options
                },
                metadata: {
                    synthesisId: this.generateSynthesisId(),
                    timestamp: Date.now(),
                    systemsInvolved: Object.keys(inputs)
                }
            };

            // Extract and normalize system outputs
            const normalizedInputs = this.normalizeInputs(inputs);
            
            // Select synthesis strategy
            const strategy = this.strategies[context.options.strategy];
            if (!strategy) {
                throw new Error(`Unknown synthesis strategy: ${context.options.strategy}`);
            }

            // Perform synthesis
            const synthesizedContent = await strategy(normalizedInputs, context);
            
            // Apply template formatting
            const formattedResponse = await this.applyTemplate(
                synthesizedContent, 
                context.options.template, 
                context
            );

            // Optimize response
            const optimizedResponse = this.config.enableOptimization ? 
                await this.optimizeResponse(formattedResponse, context) : 
                formattedResponse;

            // Build final response
            const finalResponse = {
                content: optimizedResponse.content || optimizedResponse,
                confidence: optimizedResponse.confidence || this.calculateConfidence(normalizedInputs),
                sources: this.extractSources(normalizedInputs),
                metadata: {
                    ...context.metadata,
                    synthesisTime: Date.now() - startTime,
                    strategy: context.options.strategy,
                    template: context.options.template,
                    systemsUsed: Object.keys(inputs),
                    qualityScore: optimizedResponse.qualityScore || 0.8
                }
            };

            // Include detailed metadata if requested
            if (context.options.includeMetadata) {
                finalResponse.detailedMetadata = {
                    inputSummary: this.summarizeInputs(normalizedInputs),
                    synthesisSteps: optimizedResponse.steps || [],
                    confidenceBreakdown: this.getConfidenceBreakdown(normalizedInputs)
                };
            }

            // Update metrics
            this.updateMetrics(context.options.strategy, Date.now() - startTime, finalResponse.metadata.qualityScore);

            this.logger.debug(`Response synthesis completed in ${Date.now() - startTime}ms`);
            return finalResponse;

        } catch (error) {
            this.logger.error('Response synthesis failed:', error);
            throw error;
        }
    }

    /**
     * Normalize inputs from different systems
     */
    normalizeInputs(inputs) {
        const normalized = {};

        // Normalize brain output
        if (inputs.brain) {
            normalized.brain = {
                content: inputs.brain.response || inputs.brain.output || inputs.brain.content,
                confidence: inputs.brain.confidence || 0.7,
                reasoning: inputs.brain.reasoning || inputs.brain.explanation,
                emotions: inputs.brain.emotions || {},
                layersUsed: inputs.brain.layersUsed || []
            };
        }

        // Normalize agent council output
        if (inputs.agents) {
            normalized.agents = {
                content: inputs.agents.consensus || inputs.agents.response || inputs.agents.recommendation,
                confidence: inputs.agents.confidence || 0.8,
                participatingAgents: inputs.agents.participatingAgents || [],
                reasoning: inputs.agents.reasoning || inputs.agents.explanation,
                alternatives: inputs.agents.alternatives || []
            };
        }

        // Normalize RAG output
        if (inputs.rag) {
            normalized.rag = {
                content: this.extractRAGContent(inputs.rag),
                confidence: inputs.rag.confidence || 0.6,
                documents: inputs.rag.documents || [],
                sources: inputs.rag.sources || [],
                relevanceScores: inputs.rag.relevanceScores || []
            };
        }

        return normalized;
    }

    /**
     * Extract content from RAG results
     */
    extractRAGContent(ragOutput) {
        if (ragOutput.summary) return ragOutput.summary;
        if (ragOutput.content) return ragOutput.content;
        
        if (ragOutput.documents && ragOutput.documents.length > 0) {
            return ragOutput.documents
                .slice(0, 3) // Top 3 documents
                .map(doc => doc.content || doc.text)
                .join(' ');
        }
        
        return '';
    }

    /**
     * Weighted synthesis strategy - combines outputs based on confidence scores
     */
    async weightedSynthesis(inputs, context) {
        const weights = this.calculateWeights(inputs);
        let synthesizedContent = '';
        let totalWeight = 0;

        // Combine content based on weights
        Object.entries(inputs).forEach(([system, data]) => {
            if (data.content && weights[system] > 0) {
                const weight = weights[system];
                synthesizedContent += this.weightContent(data.content, weight);
                totalWeight += weight;
            }
        });

        // Normalize and clean up
        if (totalWeight > 0) {
            synthesizedContent = this.cleanupContent(synthesizedContent);
        }

        return {
            content: synthesizedContent,
            confidence: totalWeight / Object.keys(inputs).length,
            method: 'weighted',
            weights
        };
    }

    /**
     * Priority synthesis strategy - uses highest confidence output as primary
     */
    async prioritySynthesis(inputs, context) {
        // Find highest confidence system
        let primarySystem = null;
        let highestConfidence = 0;

        Object.entries(inputs).forEach(([system, data]) => {
            if (data.confidence > highestConfidence) {
                highestConfidence = data.confidence;
                primarySystem = system;
            }
        });

        if (!primarySystem) {
            throw new Error('No valid system output found for priority synthesis');
        }

        const primaryContent = inputs[primarySystem].content;
        
        // Enhance with supporting information from other systems
        const supportingInfo = this.extractSupportingInfo(inputs, primarySystem);
        
        return {
            content: this.enhanceWithSupporting(primaryContent, supportingInfo),
            confidence: highestConfidence,
            method: 'priority',
            primarySystem,
            supportingSystems: Object.keys(inputs).filter(s => s !== primarySystem)
        };
    }

    /**
     * Consensus synthesis strategy - finds common themes and agreements
     */
    async consensusSynthesis(inputs, context) {
        const themes = this.extractCommonThemes(inputs);
        const agreements = this.findAgreements(inputs);
        
        let consensusContent = '';
        
        // Build response from consensus points
        if (agreements.length > 0) {
            consensusContent = this.buildConsensusResponse(agreements, themes);
        } else {
            // Fall back to weighted approach if no clear consensus
            return await this.weightedSynthesis(inputs, context);
        }

        return {
            content: consensusContent,
            confidence: this.calculateConsensusConfidence(agreements),
            method: 'consensus',
            agreements,
            themes
        };
    }

    /**
     * Apply response template
     */
    async applyTemplate(synthesizedContent, templateName, context) {
        const template = this.templates[templateName];
        if (!template) {
            this.logger.warn(`Unknown template: ${templateName}, using standard`);
            return this.templates.standard(synthesizedContent, context);
        }

        return template(synthesizedContent, context);
    }

    /**
     * Standard response template
     */
    standardTemplate(content, context) {
        return {
            content: content.content || content,
            confidence: content.confidence,
            format: 'standard'
        };
    }

    /**
     * Detailed response template
     */
    detailedTemplate(content, context) {
        const detailed = {
            content: content.content || content,
            confidence: content.confidence,
            format: 'detailed'
        };

        // Add reasoning if available
        if (content.reasoning) {
            detailed.reasoning = content.reasoning;
        }

        // Add method information
        if (content.method) {
            detailed.synthesisMethod = content.method;
        }

        return detailed;
    }

    /**
     * Concise response template
     */
    conciseTemplate(content, context) {
        const conciseContent = this.truncateContent(
            content.content || content, 
            Math.min(500, context.options.maxLength)
        );

        return {
            content: conciseContent,
            confidence: content.confidence,
            format: 'concise'
        };
    }

    /**
     * Technical response template
     */
    technicalTemplate(content, context) {
        return {
            content: content.content || content,
            confidence: content.confidence,
            format: 'technical',
            technicalDetails: {
                synthesisMethod: content.method,
                systemsInvolved: context.metadata.systemsInvolved,
                processingTime: context.metadata.synthesisTime || 0
            }
        };
    }

    /**
     * Optimize response for quality and readability
     */
    async optimizeResponse(response, context) {
        let optimized = { ...response };

        // Remove redundancy
        optimized.content = this.removeRedundancy(optimized.content);
        
        // Improve readability
        optimized.content = this.improveReadability(optimized.content);
        
        // Ensure length constraints
        if (optimized.content.length > context.options.maxLength) {
            optimized.content = this.truncateContent(optimized.content, context.options.maxLength);
        }

        // Calculate quality score
        optimized.qualityScore = this.calculateQualityScore(optimized, context);

        return optimized;
    }

    /**
     * Calculate synthesis weights based on confidence and system reliability
     */
    calculateWeights(inputs) {
        const weights = {};
        const systemReliability = {
            agents: 0.9,
            brain: 0.8,
            rag: 0.7
        };

        Object.entries(inputs).forEach(([system, data]) => {
            const confidence = data.confidence || 0.5;
            const reliability = systemReliability[system] || 0.6;
            weights[system] = confidence * reliability;
        });

        return weights;
    }

    /**
     * Calculate overall confidence score
     */
    calculateConfidence(inputs) {
        const confidences = Object.values(inputs)
            .map(data => data.confidence || 0.5)
            .filter(conf => conf > 0);

        if (confidences.length === 0) return 0.5;
        
        return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    }

    /**
     * Extract sources from all inputs
     */
    extractSources(inputs) {
        const sources = new Set();
        
        Object.values(inputs).forEach(data => {
            if (data.sources) {
                data.sources.forEach(source => sources.add(source));
            }
        });

        return Array.from(sources);
    }

    /**
     * Helper methods for content processing
     */
    weightContent(content, weight) {
        // Simple implementation - can be enhanced with NLP
        return weight > 0.7 ? content : content.substring(0, Math.floor(content.length * weight));
    }

    cleanupContent(content) {
        return content
            .replace(/\s+/g, ' ')
            .replace(/\.\s*\./g, '.')
            .trim();
    }

    truncateContent(content, maxLength) {
        if (content.length <= maxLength) return content;
        
        const truncated = content.substring(0, maxLength - 3);
        const lastSpace = truncated.lastIndexOf(' ');
        
        return (lastSpace > maxLength * 0.8 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }

    removeRedundancy(content) {
        // Basic redundancy removal - can be enhanced
        const sentences = content.split('. ');
        const unique = [...new Set(sentences)];
        return unique.join('. ');
    }

    improveReadability(content) {
        // Basic readability improvements
        return content
            .replace(/([.!?])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
    }

    calculateQualityScore(response, context) {
        let score = 0.5;
        
        // Length appropriateness
        const lengthRatio = response.content.length / context.options.maxLength;
        if (lengthRatio > 0.3 && lengthRatio < 0.9) score += 0.2;
        
        // Confidence factor
        score += (response.confidence || 0.5) * 0.3;
        
        return Math.min(1.0, score);
    }

    /**
     * Update performance metrics
     */
    updateMetrics(strategy, synthesisTime, qualityScore) {
        this.metrics.totalSyntheses++;
        this.metrics.averageSynthesisTime = 
            (this.metrics.averageSynthesisTime * (this.metrics.totalSyntheses - 1) + synthesisTime) / 
            this.metrics.totalSyntheses;
        
        this.metrics.qualityScores.push(qualityScore);
        if (this.metrics.qualityScores.length > 100) {
            this.metrics.qualityScores.shift();
        }
        
        const currentCount = this.metrics.strategyUsage.get(strategy) || 0;
        this.metrics.strategyUsage.set(strategy, currentCount + 1);
    }

    /**
     * Generate unique synthesis ID
     */
    generateSynthesisId() {
        return `synth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        const avgQuality = this.metrics.qualityScores.length > 0 ?
            this.metrics.qualityScores.reduce((sum, score) => sum + score, 0) / this.metrics.qualityScores.length :
            0;

        return {
            ...this.metrics,
            averageQualityScore: avgQuality,
            strategyUsage: Object.fromEntries(this.metrics.strategyUsage)
        };
    }

    /**
     * Shutdown the synthesizer
     */
    async shutdown() {
        this.logger.info('Shutting down Response Synthesizer...');
        this.removeAllListeners();
        this.logger.info('Response Synthesizer shutdown complete');
    }

    // Placeholder methods for advanced features
    extractSupportingInfo(inputs, primarySystem) { return {}; }
    enhanceWithSupporting(primary, supporting) { return primary; }
    extractCommonThemes(inputs) { return []; }
    findAgreements(inputs) { return []; }
    buildConsensusResponse(agreements, themes) { return 'Consensus response'; }
    calculateConsensusConfidence(agreements) { return 0.8; }
    summarizeInputs(inputs) { return {}; }
    getConfidenceBreakdown(inputs) { return {}; }
}

module.exports = ResponseSynthesizer;