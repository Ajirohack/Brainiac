/**
 * Knowledge Retriever - Orchestrates search and retrieval across the RAG system
 * 
 * Provides intelligent knowledge retrieval with:
 * - Semantic search
 * - Hybrid search (semantic + keyword)
 * - Re-ranking
 * - Context assembly
 * - Query expansion
 * - Result filtering and scoring
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');

class KnowledgeRetriever extends EventEmitter {
    constructor(config, vectorDatabase, embeddingEngine) {
        super();
        this.config = config;
        this.vectorDatabase = vectorDatabase;
        this.embeddingEngine = embeddingEngine;
        this.logger = new Logger('KnowledgeRetriever');

        // Search configuration
        this.defaultLimit = config.default_limit || 10;
        this.maxLimit = config.max_limit || 100;
        this.similarityThreshold = config.similarity_threshold || 0.7;
        this.diversityThreshold = config.diversity_threshold || 0.8;

        // Search strategies
        this.searchStrategies = {
            semantic: config.enable_semantic !== false,
            keyword: config.enable_keyword !== false,
            hybrid: config.enable_hybrid !== false
        };

        // Re-ranking configuration
        this.enableReranking = config.enable_reranking !== false;
        this.rerankingModel = config.reranking_model || 'cross-encoder';
        this.rerankingThreshold = config.reranking_threshold || 0.5;

        // Query processing
        this.enableQueryExpansion = config.enable_query_expansion || false;
        this.enableQueryRewriting = config.enable_query_rewriting || false;
        this.maxQueryLength = config.max_query_length || 1000;

        // Context assembly
        this.maxContextLength = config.max_context_length || 4000;
        this.contextOverlap = config.context_overlap || 100;
        this.preserveChunkBoundaries = config.preserve_chunk_boundaries !== false;

        // Caching
        this.cache = new Map();
        this.cacheEnabled = config.cache_enabled !== false;
        this.maxCacheSize = config.max_cache_size || 1000;
        this.cacheTTL = config.cache_ttl || 3600000; // 1 hour

        // Performance tracking
        this.stats = {
            totalQueries: 0,
            totalResults: 0,
            averageLatency: 0,
            averageRelevanceScore: 0,
            cacheHits: 0,
            cacheMisses: 0,
            semanticSearches: 0,
            keywordSearches: 0,
            hybridSearches: 0,
            rerankedQueries: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the knowledge retriever
     */
    async initialize() {
        try {
            this.logger.info('🔍 Initializing Knowledge Retriever...');

            // Validate dependencies
            if (!this.vectorDatabase || !this.vectorDatabase.isInitialized) {
                throw new Error('Vector database must be initialized');
            }

            if (!this.embeddingEngine || !this.embeddingEngine.isInitialized) {
                throw new Error('Embedding engine must be initialized');
            }

            // Initialize search components
            await this.initializeSearchComponents();

            // Test retrieval functionality
            await this.testRetrieval();

            this.isInitialized = true;
            this.logger.info('✅ Knowledge Retriever initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Knowledge Retriever:', error);
            throw error;
        }
    }

    /**
     * Initialize search components
     */
    async initializeSearchComponents() {
        // Initialize keyword search (simple implementation)
        this.keywordSearcher = {
            search: (query, documents, limit) => {
                const queryTerms = query.toLowerCase().split(/\s+/);
                const scores = new Map();

                for (const [id, doc] of documents.entries()) {
                    const text = doc.text.toLowerCase();
                    let score = 0;

                    for (const term of queryTerms) {
                        const matches = (text.match(new RegExp(term, 'g')) || []).length;
                        score += matches / text.length * 1000; // Normalize by text length
                    }

                    if (score > 0) {
                        scores.set(id, score);
                    }
                }

                return Array.from(scores.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, limit)
                    .map(([id, score]) => ({ id, score: score / 1000 }));
            }
        };

        // Initialize re-ranker (mock implementation)
        this.reranker = {
            rerank: async (query, results) => {
                // Simple re-ranking based on query-result similarity
                const queryTerms = query.toLowerCase().split(/\s+/);

                return results.map(result => {
                    const text = result.document.text.toLowerCase();
                    let relevanceScore = result.score;

                    // Boost score for exact phrase matches
                    if (text.includes(query.toLowerCase())) {
                        relevanceScore *= 1.2;
                    }

                    // Boost score for multiple term matches
                    const termMatches = queryTerms.filter(term => text.includes(term)).length;
                    relevanceScore *= (1 + termMatches / queryTerms.length * 0.3);

                    return {
                        ...result,
                        relevanceScore,
                        originalScore: result.score
                    };
                }).sort((a, b) => b.relevanceScore - a.relevanceScore);
            }
        };

        this.logger.debug('🔧 Search components initialized');
    }

    /**
     * Test retrieval functionality
     */
    async testRetrieval() {
        try {
            this.logger.debug('🧪 Testing knowledge retrieval...');

            // Test with a simple query
            const testQuery = 'test query';
            const results = await this.retrieve(testQuery, { limit: 1 });

            this.logger.debug('✅ Knowledge retrieval test completed');

        } catch (error) {
            this.logger.warn('⚠️ Knowledge retrieval test failed (may be due to empty database):', error.message);
        }
    }

    /**
     * Main retrieval method
     */
    async retrieve(query, options = {}) {
        try {
            const startTime = Date.now();
            this.stats.totalQueries++;

            this.logger.debug(`🔍 Retrieving knowledge for query: "${query.substring(0, 100)}..."`);

            // Validate and process query
            const processedQuery = await this.processQuery(query, options);

            // Check cache
            if (this.cacheEnabled) {
                const cacheKey = this.getCacheKey(processedQuery, options);
                const cachedResult = this.getFromCache(cacheKey);
                if (cachedResult) {
                    this.stats.cacheHits++;
                    this.logger.debug('💾 Retrieved from cache');
                    return cachedResult;
                }
                this.stats.cacheMisses++;
            }

            // Determine search strategy
            const strategy = options.strategy || this.determineSearchStrategy(processedQuery, options);

            // Perform search
            let results = await this.performSearch(processedQuery, strategy, options);

            // Re-rank results if enabled
            if (this.enableReranking && results.length > 1) {
                results = await this.reranker.rerank(processedQuery, results);
                this.stats.rerankedQueries++;
            }

            // Filter and limit results
            results = this.filterResults(results, options);

            // Assemble context
            const context = await this.assembleContext(results, options);

            const latency = Date.now() - startTime;
            this.updateStats(results, latency);

            const retrievalResult = {
                query: processedQuery,
                strategy,
                results,
                context,
                metadata: {
                    totalResults: results.length,
                    searchTime: latency,
                    strategy,
                    timestamp: new Date().toISOString()
                }
            };

            // Cache the result
            if (this.cacheEnabled) {
                const cacheKey = this.getCacheKey(processedQuery, options);
                this.cacheResult(cacheKey, retrievalResult);
            }

            this.logger.debug(`✅ Retrieved ${results.length} results in ${latency}ms`);

            return retrievalResult;

        } catch (error) {
            this.logger.error('❌ Failed to retrieve knowledge:', error);
            throw error;
        }
    }

    /**
     * Process and enhance the query
     */
    async processQuery(query, options = {}) {
        let processedQuery = query.trim();

        // Validate query length
        if (processedQuery.length > this.maxQueryLength) {
            processedQuery = processedQuery.substring(0, this.maxQueryLength);
            this.logger.warn(`Query truncated to ${this.maxQueryLength} characters`);
        }

        if (processedQuery.length === 0) {
            throw new Error('Query cannot be empty');
        }

        // Query expansion
        if (this.enableQueryExpansion && !options.skipExpansion) {
            processedQuery = await this.expandQuery(processedQuery);
        }

        // Query rewriting
        if (this.enableQueryRewriting && !options.skipRewriting) {
            processedQuery = await this.rewriteQuery(processedQuery);
        }

        return processedQuery;
    }

    /**
     * Expand query with related terms
     */
    async expandQuery(query) {
        try {
            // Simple query expansion (in a real implementation, you might use WordNet or word embeddings)
            const expansions = {
                'AI': ['artificial intelligence', 'machine learning', 'neural network'],
                'ML': ['machine learning', 'artificial intelligence', 'deep learning'],
                'code': ['programming', 'software', 'development'],
                'function': ['method', 'procedure', 'routine']
            };

            let expandedQuery = query;
            const queryTerms = query.toLowerCase().split(/\s+/);

            for (const term of queryTerms) {
                if (expansions[term]) {
                    const expansion = expansions[term][0]; // Take first expansion
                    if (!expandedQuery.toLowerCase().includes(expansion)) {
                        expandedQuery += ` ${expansion}`;
                    }
                }
            }

            if (expandedQuery !== query) {
                this.logger.debug(`🔍 Query expanded: "${query}" -> "${expandedQuery}"`);
            }

            return expandedQuery;

        } catch (error) {
            this.logger.warn('⚠️ Query expansion failed:', error.message);
            return query;
        }
    }

    /**
     * Rewrite query for better search
     */
    async rewriteQuery(query) {
        try {
            // Simple query rewriting rules
            let rewritten = query;

            // Convert questions to statements
            rewritten = rewritten.replace(/^(what is|what are|how to|how do)/i, '');
            rewritten = rewritten.replace(/\?$/, '');

            // Remove filler words
            const fillerWords = ['please', 'can you', 'could you', 'would you', 'help me'];
            for (const filler of fillerWords) {
                rewritten = rewritten.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
            }

            // Clean up extra spaces
            rewritten = rewritten.replace(/\s+/g, ' ').trim();

            if (rewritten !== query) {
                this.logger.debug(`✏️ Query rewritten: "${query}" -> "${rewritten}"`);
            }

            return rewritten || query; // Fallback to original if rewritten is empty

        } catch (error) {
            this.logger.warn('⚠️ Query rewriting failed:', error.message);
            return query;
        }
    }

    /**
     * Determine the best search strategy
     */
    determineSearchStrategy(query, options) {
        if (options.strategy) {
            return options.strategy;
        }

        // Simple heuristics for strategy selection
        const queryLength = query.split(/\s+/).length;
        const hasSpecificTerms = /\b(function|class|method|variable|code|programming)\b/i.test(query);

        if (queryLength <= 3 && hasSpecificTerms) {
            return 'keyword';
        } else if (queryLength > 10) {
            return 'semantic';
        } else {
            return 'hybrid';
        }
    }

    /**
     * Perform search using the specified strategy
     */
    async performSearch(query, strategy, options) {
        const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);

        switch (strategy) {
            case 'semantic':
                this.stats.semanticSearches++;
                return await this.semanticSearch(query, limit, options);

            case 'keyword':
                this.stats.keywordSearches++;
                return await this.keywordSearch(query, limit, options);

            case 'hybrid':
                this.stats.hybridSearches++;
                return await this.hybridSearch(query, limit, options);

            default:
                throw new Error(`Unknown search strategy: ${strategy}`);
        }
    }

    /**
     * Semantic search using vector similarity
     */
    async semanticSearch(query, limit, options = {}) {
        try {
            // Generate query embedding
            const queryEmbedding = await this.embeddingEngine.generateEmbedding(query);

            // Search vector database
            const searchOptions = {
                limit: limit * 2, // Get more results for filtering
                threshold: options.threshold || this.similarityThreshold
            };

            const vectorResults = await this.vectorDatabase.search(queryEmbedding, searchOptions);

            // Convert to standard format
            return vectorResults.map(result => ({
                id: result.id,
                score: result.score,
                document: result.document,
                metadata: result.metadata,
                searchType: 'semantic'
            }));

        } catch (error) {
            this.logger.error('❌ Semantic search failed:', error);
            throw error;
        }
    }

    /**
     * Keyword search using text matching
     */
    async keywordSearch(query, limit, options = {}) {
        try {
            // Get all documents from vector database
            const allDocuments = this.vectorDatabase.documents;

            // Perform keyword search
            const keywordResults = this.keywordSearcher.search(query, allDocuments, limit);

            // Convert to standard format
            return keywordResults.map(result => {
                const document = allDocuments.get(result.id);
                const metadata = this.vectorDatabase.metadata.get(result.id);

                return {
                    id: result.id,
                    score: result.score,
                    document,
                    metadata,
                    searchType: 'keyword'
                };
            }).filter(result => result.document); // Filter out missing documents

        } catch (error) {
            this.logger.error('❌ Keyword search failed:', error);
            throw error;
        }
    }

    /**
     * Hybrid search combining semantic and keyword approaches
     */
    async hybridSearch(query, limit, options = {}) {
        try {
            // Perform both searches
            const semanticResults = await this.semanticSearch(query, Math.ceil(limit * 0.7), options);
            const keywordResults = await this.keywordSearch(query, Math.ceil(limit * 0.5), options);

            // Combine and deduplicate results
            const combinedResults = new Map();

            // Add semantic results with weight
            for (const result of semanticResults) {
                combinedResults.set(result.id, {
                    ...result,
                    hybridScore: result.score * 0.7,
                    searchType: 'hybrid'
                });
            }

            // Add keyword results with weight, combining scores if already present
            for (const result of keywordResults) {
                if (combinedResults.has(result.id)) {
                    const existing = combinedResults.get(result.id);
                    existing.hybridScore += result.score * 0.3;
                    existing.score = Math.max(existing.score, result.score);
                } else {
                    combinedResults.set(result.id, {
                        ...result,
                        hybridScore: result.score * 0.3,
                        searchType: 'hybrid'
                    });
                }
            }

            // Sort by hybrid score and limit
            return Array.from(combinedResults.values())
                .sort((a, b) => b.hybridScore - a.hybridScore)
                .slice(0, limit)
                .map(result => ({
                    ...result,
                    score: result.hybridScore
                }));

        } catch (error) {
            this.logger.error('❌ Hybrid search failed:', error);
            throw error;
        }
    }

    /**
     * Filter and post-process search results
     */
    filterResults(results, options = {}) {
        let filtered = results;

        // Apply similarity threshold
        const threshold = options.threshold || this.similarityThreshold;
        filtered = filtered.filter(result => result.score >= threshold);

        // Apply diversity filtering to avoid too similar results
        if (options.enableDiversity !== false) {
            filtered = this.applyDiversityFilter(filtered);
        }

        // Apply custom filters
        if (options.filters) {
            filtered = this.applyCustomFilters(filtered, options.filters);
        }

        // Final limit
        const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);
        filtered = filtered.slice(0, limit);

        return filtered;
    }

    /**
     * Apply diversity filter to avoid similar results
     */
    applyDiversityFilter(results) {
        if (results.length <= 1) {
            return results;
        }

        const diverse = [results[0]]; // Always include the top result

        for (let i = 1; i < results.length; i++) {
            const candidate = results[i];
            let isDiverse = true;

            // Check similarity with already selected results
            for (const selected of diverse) {
                const similarity = this.calculateTextSimilarity(
                    candidate.document.text,
                    selected.document.text
                );

                if (similarity > this.diversityThreshold) {
                    isDiverse = false;
                    break;
                }
            }

            if (isDiverse) {
                diverse.push(candidate);
            }
        }

        return diverse;
    }

    /**
     * Calculate text similarity for diversity filtering
     */
    calculateTextSimilarity(text1, text2) {
        // Simple Jaccard similarity
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Apply custom filters
     */
    applyCustomFilters(results, filters) {
        return results.filter(result => {
            for (const [key, value] of Object.entries(filters)) {
                if (result.metadata[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Assemble context from search results
     */
    async assembleContext(results, options = {}) {
        if (results.length === 0) {
            return {
                text: '',
                sources: [],
                totalLength: 0,
                chunkCount: 0
            };
        }

        const maxLength = options.maxContextLength || this.maxContextLength;
        let contextText = '';
        const sources = [];
        let currentLength = 0;

        for (const result of results) {
            const chunkText = result.document.text;
            const chunkLength = chunkText.length;

            // Check if adding this chunk would exceed the limit
            if (currentLength + chunkLength > maxLength && contextText.length > 0) {
                break;
            }

            // Add chunk to context
            if (contextText.length > 0) {
                contextText += '\n\n';
                currentLength += 2;
            }

            contextText += chunkText;
            currentLength += chunkLength;

            // Track source
            sources.push({
                id: result.id,
                source: result.metadata.source || 'unknown',
                score: result.score,
                chunkIndex: result.metadata.chunkIndex || 0
            });
        }

        return {
            text: contextText,
            sources,
            totalLength: currentLength,
            chunkCount: sources.length,
            truncated: results.length > sources.length
        };
    }

    /**
     * Cache management
     */
    getCacheKey(query, options) {
        const keyData = {
            query,
            limit: options.limit || this.defaultLimit,
            strategy: options.strategy,
            threshold: options.threshold || this.similarityThreshold
        };
        return JSON.stringify(keyData);
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key); // Remove expired entry
        }
        return null;
    }

    cacheResult(key, result) {
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data: result,
            timestamp: Date.now()
        });
    }

    /**
     * Update performance statistics
     */
    updateStats(results, latency) {
        this.stats.totalResults += results.length;

        // Update average latency
        this.stats.averageLatency =
            (this.stats.averageLatency * (this.stats.totalQueries - 1) + latency) /
            this.stats.totalQueries;

        // Update average relevance score
        if (results.length > 0) {
            const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
            this.stats.averageRelevanceScore =
                (this.stats.averageRelevanceScore * (this.stats.totalQueries - 1) + avgScore) /
                this.stats.totalQueries;
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.debug('🧹 Knowledge retrieval cache cleared');
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0,
            averageResultsPerQuery: this.stats.totalResults / this.stats.totalQueries || 0,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Shutdown the knowledge retriever
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Knowledge Retriever...');

            // Clear cache
            this.clearCache();

            this.isInitialized = false;
            this.logger.info('✅ Knowledge Retriever shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Knowledge Retriever shutdown:', error);
            throw error;
        }
    }
}

module.exports = KnowledgeRetriever;