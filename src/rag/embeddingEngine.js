/**
 * Embedding Engine - Text-to-vector conversion using various embedding models
 * 
 * Supports multiple embedding providers:
 * - OpenAI (text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large)
 * - Hugging Face (sentence-transformers)
 * - Cohere (embed-english-v3.0, embed-multilingual-v3.0)
 * - Local models (SentenceTransformers)
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');

class EmbeddingEngine extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.logger = new Logger('EmbeddingEngine');

        // Provider configuration
        this.provider = config.provider || 'openai';
        this.model = config.model || 'text-embedding-ada-002';
        this.apiKey = config.api_key;
        this.baseUrl = config.base_url;

        // Model specifications
        this.modelSpecs = {
            'text-embedding-ada-002': { dimension: 1536, maxTokens: 8191 },
            'text-embedding-3-small': { dimension: 1536, maxTokens: 8191 },
            'text-embedding-3-large': { dimension: 3072, maxTokens: 8191 },
            'sentence-transformers/all-MiniLM-L6-v2': { dimension: 384, maxTokens: 512 },
            'sentence-transformers/all-mpnet-base-v2': { dimension: 768, maxTokens: 514 },
            'cohere-embed-english-v3.0': { dimension: 1024, maxTokens: 512 },
            'cohere-embed-multilingual-v3.0': { dimension: 1024, maxTokens: 512 }
        };

        // Caching
        this.cache = new Map();
        this.cacheEnabled = config.cache_enabled !== false;
        this.maxCacheSize = config.max_cache_size || 10000;

        // Batch processing
        this.batchSize = config.batch_size || 100;
        this.maxRetries = config.max_retries || 3;
        this.retryDelay = config.retry_delay || 1000;

        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            tokens: 0,
            resetTime: Date.now() + 60000, // Reset every minute
            maxRequests: config.max_requests_per_minute || 3000,
            maxTokens: config.max_tokens_per_minute || 1000000
        };

        // Performance tracking
        this.stats = {
            totalEmbeddings: 0,
            totalTokens: 0,
            totalRequests: 0,
            averageLatency: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the embedding engine
     */
    async initialize() {
        try {
            this.logger.info(`🧠 Initializing Embedding Engine (${this.provider}/${this.model})...`);

            // Validate configuration
            await this.validateConfig();

            // Initialize provider-specific settings
            switch (this.provider) {
                case 'openai':
                    await this.initializeOpenAI();
                    break;
                case 'huggingface':
                    await this.initializeHuggingFace();
                    break;
                case 'cohere':
                    await this.initializeCohere();
                    break;
                case 'local':
                    await this.initializeLocal();
                    break;
                default:
                    throw new Error(`Unsupported embedding provider: ${this.provider}`);
            }

            // Test embedding generation
            await this.testEmbedding();

            this.isInitialized = true;
            this.logger.info('✅ Embedding Engine initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Embedding Engine:', error);
            throw error;
        }
    }

    /**
     * Validate configuration
     */
    async validateConfig() {
        if (!this.modelSpecs[this.model]) {
            throw new Error(`Unsupported model: ${this.model}`);
        }

        if (this.provider === 'openai' && !this.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        if (this.provider === 'cohere' && !this.apiKey) {
            throw new Error('Cohere API key is required');
        }
    }

    /**
     * Initialize OpenAI provider
     */
    async initializeOpenAI() {
        this.logger.info('🤖 Initializing OpenAI embedding provider...');

        // Note: In a real implementation, you would use the openai package
        this.client = {
            apiKey: this.apiKey,
            baseURL: this.baseUrl || 'https://api.openai.com/v1',
            model: this.model
        };

        this.logger.info('✅ OpenAI provider initialized');
    }

    /**
     * Initialize Hugging Face provider
     */
    async initializeHuggingFace() {
        this.logger.info('🤗 Initializing Hugging Face embedding provider...');

        // Note: In a real implementation, you would use the @huggingface/inference package
        this.client = {
            apiKey: this.apiKey,
            model: this.model,
            baseURL: this.baseUrl || 'https://api-inference.huggingface.co'
        };

        this.logger.info('✅ Hugging Face provider initialized');
    }

    /**
     * Initialize Cohere provider
     */
    async initializeCohere() {
        this.logger.info('🔮 Initializing Cohere embedding provider...');

        // Note: In a real implementation, you would use the cohere-ai package
        this.client = {
            apiKey: this.apiKey,
            model: this.model,
            baseURL: this.baseUrl || 'https://api.cohere.ai'
        };

        this.logger.info('✅ Cohere provider initialized');
    }

    /**
     * Initialize local embedding provider
     */
    async initializeLocal() {
        this.logger.info('🏠 Initializing local embedding provider...');

        // Note: In a real implementation, you would use a local model runner
        // like transformers.js or onnxruntime-node
        this.client = {
            model: this.model,
            modelPath: this.config.model_path
        };

        this.logger.info('✅ Local provider initialized');
    }

    /**
     * Test embedding generation
     */
    async testEmbedding() {
        try {
            this.logger.debug('🧪 Testing embedding generation...');

            const testText = 'This is a test sentence for embedding generation.';
            const embedding = await this.generateEmbedding(testText);

            const expectedDimension = this.modelSpecs[this.model].dimension;
            if (embedding.length !== expectedDimension) {
                throw new Error(
                    `Expected embedding dimension ${expectedDimension}, got ${embedding.length}`
                );
            }

            this.logger.debug('✅ Embedding test passed');

        } catch (error) {
            this.logger.error('❌ Embedding test failed:', error);
            throw error;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text, options = {}) {
        try {
            // Check cache first
            if (this.cacheEnabled) {
                const cacheKey = this.getCacheKey(text);
                if (this.cache.has(cacheKey)) {
                    this.stats.cacheHits++;
                    return this.cache.get(cacheKey);
                }
                this.stats.cacheMisses++;
            }

            // Check rate limits
            await this.checkRateLimit();

            // Preprocess text
            const processedText = this.preprocessText(text);

            // Generate embedding
            const startTime = Date.now();
            let embedding;

            switch (this.provider) {
                case 'openai':
                    embedding = await this.generateOpenAIEmbedding(processedText, options);
                    break;
                case 'huggingface':
                    embedding = await this.generateHuggingFaceEmbedding(processedText, options);
                    break;
                case 'cohere':
                    embedding = await this.generateCohereEmbedding(processedText, options);
                    break;
                case 'local':
                    embedding = await this.generateLocalEmbedding(processedText, options);
                    break;
            }

            const latency = Date.now() - startTime;

            // Update statistics
            this.updateStats(latency, processedText);

            // Cache the result
            if (this.cacheEnabled) {
                this.cacheEmbedding(text, embedding);
            }

            return embedding;

        } catch (error) {
            this.stats.errors++;
            this.logger.error('❌ Failed to generate embedding:', error);
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts in batches
     */
    async generateEmbeddings(texts, options = {}) {
        try {
            this.logger.debug(`🔄 Generating embeddings for ${texts.length} texts...`);

            const embeddings = [];
            const batchSize = options.batchSize || this.batchSize;

            // Process in batches
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize);
                const batchEmbeddings = await this.processBatch(batch, options);
                embeddings.push(...batchEmbeddings);

                // Add delay between batches to respect rate limits
                if (i + batchSize < texts.length) {
                    await this.delay(100);
                }
            }

            this.logger.debug(`✅ Generated ${embeddings.length} embeddings`);
            return embeddings;

        } catch (error) {
            this.logger.error('❌ Failed to generate batch embeddings:', error);
            throw error;
        }
    }

    /**
     * Process a batch of texts
     */
    async processBatch(texts, options = {}) {
        const embeddings = [];

        // Check if provider supports batch processing
        if (this.provider === 'openai' && texts.length > 1) {
            // OpenAI supports batch embedding
            return await this.generateOpenAIBatchEmbedding(texts, options);
        } else {
            // Process individually
            for (const text of texts) {
                const embedding = await this.generateEmbedding(text, options);
                embeddings.push(embedding);
            }
        }

        return embeddings;
    }

    /**
     * Generate OpenAI embedding
     */
    async generateOpenAIEmbedding(text, options = {}) {
        try {
            // Mock OpenAI API call
            // In a real implementation, you would use:
            // const response = await openai.embeddings.create({
            //     model: this.model,
            //     input: text
            // });

            // For now, return a mock embedding
            const dimension = this.modelSpecs[this.model].dimension;
            const embedding = Array.from({ length: dimension }, () => Math.random() - 0.5);

            // Normalize the embedding
            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            return embedding.map(val => val / norm);

        } catch (error) {
            throw new Error(`OpenAI embedding failed: ${error.message}`);
        }
    }

    /**
     * Generate OpenAI batch embedding
     */
    async generateOpenAIBatchEmbedding(texts, options = {}) {
        try {
            // Mock batch processing
            const embeddings = [];

            for (const text of texts) {
                const embedding = await this.generateOpenAIEmbedding(text, options);
                embeddings.push(embedding);
            }

            return embeddings;

        } catch (error) {
            throw new Error(`OpenAI batch embedding failed: ${error.message}`);
        }
    }

    /**
     * Generate Hugging Face embedding
     */
    async generateHuggingFaceEmbedding(text, options = {}) {
        try {
            // Mock Hugging Face API call
            const dimension = this.modelSpecs[this.model].dimension;
            const embedding = Array.from({ length: dimension }, () => Math.random() - 0.5);

            // Normalize the embedding
            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            return embedding.map(val => val / norm);

        } catch (error) {
            throw new Error(`Hugging Face embedding failed: ${error.message}`);
        }
    }

    /**
     * Generate Cohere embedding
     */
    async generateCohereEmbedding(text, options = {}) {
        try {
            // Mock Cohere API call
            const dimension = this.modelSpecs[this.model].dimension;
            const embedding = Array.from({ length: dimension }, () => Math.random() - 0.5);

            // Normalize the embedding
            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            return embedding.map(val => val / norm);

        } catch (error) {
            throw new Error(`Cohere embedding failed: ${error.message}`);
        }
    }

    /**
     * Generate local embedding
     */
    async generateLocalEmbedding(text, options = {}) {
        try {
            // Mock local model inference
            const dimension = this.modelSpecs[this.model].dimension;
            const embedding = Array.from({ length: dimension }, () => Math.random() - 0.5);

            // Normalize the embedding
            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            return embedding.map(val => val / norm);

        } catch (error) {
            throw new Error(`Local embedding failed: ${error.message}`);
        }
    }

    /**
     * Preprocess text before embedding
     */
    preprocessText(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text must be a non-empty string');
        }

        // Basic preprocessing
        let processed = text.trim();

        // Remove excessive whitespace
        processed = processed.replace(/\s+/g, ' ');

        // Check token limits
        const maxTokens = this.modelSpecs[this.model].maxTokens;
        if (processed.length > maxTokens * 4) { // Rough estimate: 1 token ≈ 4 characters
            processed = processed.substring(0, maxTokens * 4);
            this.logger.warn(`Text truncated to ${maxTokens * 4} characters`);
        }

        return processed;
    }

    /**
     * Check rate limits
     */
    async checkRateLimit() {
        const now = Date.now();

        // Reset counters if time window has passed
        if (now >= this.rateLimiter.resetTime) {
            this.rateLimiter.requests = 0;
            this.rateLimiter.tokens = 0;
            this.rateLimiter.resetTime = now + 60000;
        }

        // Check limits
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.resetTime - now;
            this.logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
            await this.delay(waitTime);
        }

        this.rateLimiter.requests++;
    }

    /**
     * Update performance statistics
     */
    updateStats(latency, text) {
        this.stats.totalEmbeddings++;
        this.stats.totalRequests++;
        this.stats.totalTokens += Math.ceil(text.length / 4); // Rough token estimate

        // Update average latency
        this.stats.averageLatency =
            (this.stats.averageLatency * (this.stats.totalEmbeddings - 1) + latency) /
            this.stats.totalEmbeddings;
    }

    /**
     * Cache embedding result
     */
    cacheEmbedding(text, embedding) {
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entry (simple LRU)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        const cacheKey = this.getCacheKey(text);
        this.cache.set(cacheKey, embedding);
    }

    /**
     * Generate cache key for text
     */
    getCacheKey(text) {
        // Simple hash function for cache key
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `${this.model}_${hash}`;
    }

    /**
     * Clear embedding cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.debug('🧹 Embedding cache cleared');
    }

    /**
     * Get model information
     */
    getModelInfo() {
        return {
            provider: this.provider,
            model: this.model,
            ...this.modelSpecs[this.model]
        };
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Shutdown the embedding engine
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Embedding Engine...');

            // Clear cache
            this.clearCache();

            // Close any open connections
            if (this.client) {
                // Close client connections if needed
            }

            this.isInitialized = false;
            this.logger.info('✅ Embedding Engine shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Embedding Engine shutdown:', error);
            throw error;
        }
    }
}

module.exports = EmbeddingEngine;