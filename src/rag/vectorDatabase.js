/**
 * Vector Database - High-performance vector storage and similarity search
 * 
 * Supports multiple vector database backends:
 * - FAISS (local, high-performance)
 * - Qdrant (production-ready)
 * - Pinecone (cloud-based)
 * - Chroma (open-source)
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('../core/utils/logger');
const { ChromaClient } = require('chromadb');

class VectorDatabase extends EventEmitter {
    constructor(config, databaseManager) {
        super();
        this.config = config;
        this.databaseManager = databaseManager;
        this.logger = new Logger('VectorDatabase');

        // Database backend
        this.backend = config.backend || 'faiss';
        this.client = null;
        this.index = null;

        // Configuration
        this.dimension = config.dimension || 1536; // OpenAI embedding dimension
        this.indexType = config.index_type || 'IndexFlatIP';
        this.collectionName = config.collection_name || 'knowledge_base';
        this.metricType = config.metric_type || 'cosine';

        // Storage
        this.documents = new Map();
        this.metadata = new Map();
        this.indexPath = config.index_path || 'data/embeddings/vector_index';

        // Performance tracking
        this.stats = {
            totalVectors: 0,
            totalDocuments: 0,
            indexSize: 0,
            searchCount: 0,
            averageSearchTime: 0,
            lastIndexUpdate: null
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the vector database
     */
    async initialize() {
        try {
            this.logger.info(`🗄️ Initializing Vector Database (${this.backend})...`);

            switch (this.backend) {
                case 'faiss':
                    await this.initializeFAISS();
                    break;
                case 'qdrant':
                    await this.initializeQdrant();
                    break;
                case 'pinecone':
                    await this.initializePinecone();
                    break;
                case 'chroma':
                    await this.initializeChroma();
                    break;
                default:
                    throw new Error(`Unsupported vector database backend: ${this.backend}`);
            }

            // Load existing index if available
            await this.loadIndex();

            this.isInitialized = true;
            this.logger.info('✅ Vector Database initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Vector Database:', error);
            throw error;
        }
    }

    /**
     * Initialize FAISS backend
     */
    async initializeFAISS() {
        try {
            // Note: In a real implementation, you would use the faiss-node package
            // For now, we'll create a mock implementation
            this.logger.info('📦 Initializing FAISS backend...');

            // Create index directory
            await fs.mkdir(path.dirname(this.indexPath), { recursive: true });

            // Initialize FAISS index (mock implementation)
            this.index = {
                dimension: this.dimension,
                vectors: [],
                ids: [],
                ntotal: 0
            };

            this.logger.info('✅ FAISS backend initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize FAISS:', error);
            throw error;
        }
    }

    /**
     * Initialize Qdrant backend
     */
    async initializeQdrant() {
        try {
            this.logger.info('🚀 Initializing Qdrant backend...');

            // Note: In a real implementation, you would use the @qdrant/js-client-rest package
            // Mock implementation for now
            this.client = {
                host: this.config.host || 'localhost',
                port: this.config.port || 6333,
                collections: new Map()
            };

            // Create collection if it doesn't exist
            await this.createCollection();

            this.logger.info('✅ Qdrant backend initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Qdrant:', error);
            throw error;
        }
    }

    /**
     * Initialize Pinecone backend
     */
    async initializePinecone() {
        try {
            this.logger.info('☁️ Initializing Pinecone backend...');

            // Note: In a real implementation, you would use the @pinecone-database/pinecone package
            // Mock implementation for now
            this.client = {
                apiKey: this.config.api_key,
                environment: this.config.environment,
                indexName: this.config.index_name || 'cai-knowledge-index'
            };

            this.logger.info('✅ Pinecone backend initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Pinecone:', error);
            throw error;
        }
    }

    /**
     * Initialize Chroma backend
     */
    async initializeChroma() {
        try {
            this.logger.info('🎨 Initializing Chroma backend...');

            // Note: In a real implementation, you would use the chromadb package
            // Mock implementation for now
            this.client = new ChromaClient({
                path: `http://${this.config.host || 'localhost'}:${this.config.port || 8000}`
            });

            this.logger.info('✅ Chroma backend initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Chroma:', error);
            throw error;
        }
    }

    /**
     * Create collection for vector storage
     */
    async createCollection() {
        try {
            switch (this.backend) {
                case 'qdrant':
                    // Mock collection creation
                    this.client.collections.set(this.collectionName, {
                        vectors: [],
                        config: {
                            size: this.dimension,
                            distance: this.metricType
                        }
                    });
                    break;

                case 'chroma':
                    // Mock collection creation
                    this.client.collections.set(this.collectionName, {
                        vectors: [],
                        metadata: [],
                        documents: []
                    });
                    break;
            }

            this.logger.debug(`📁 Collection '${this.collectionName}' created/verified`);

        } catch (error) {
            this.logger.error('❌ Failed to create collection:', error);
            throw error;
        }
    }

    /**
     * Add documents with their embeddings to the database
     */
    async addDocuments(documents, embeddings) {
        try {
            if (documents.length !== embeddings.length) {
                throw new Error('Documents and embeddings arrays must have the same length');
            }

            this.logger.debug(`📝 Adding ${documents.length} documents to vector database`);

            const startTime = Date.now();

            for (let i = 0; i < documents.length; i++) {
                const document = documents[i];
                const embedding = embeddings[i];

                const vectorId = this.generateVectorId();

                // Store document and metadata
                this.documents.set(vectorId, document);
                this.metadata.set(vectorId, {
                    id: vectorId,
                    documentId: document.id,
                    chunkIndex: document.chunkIndex || 0,
                    text: document.text,
                    source: document.source,
                    timestamp: new Date().toISOString(),
                    ...document.metadata
                });

                // Add to vector index
                await this.addVector(vectorId, embedding);
            }

            this.stats.totalDocuments += documents.length;
            this.stats.totalVectors += embeddings.length;
            this.stats.lastIndexUpdate = new Date().toISOString();

            const addTime = Date.now() - startTime;
            this.logger.debug(`✅ Added ${documents.length} documents in ${addTime}ms`);

            // Save index periodically
            if (this.stats.totalVectors % 100 === 0) {
                await this.saveIndex();
            }

            return {
                success: true,
                added: documents.length,
                time: addTime
            };

        } catch (error) {
            this.logger.error('❌ Failed to add documents:', error);
            throw error;
        }
    }

    /**
     * Add a single vector to the index
     */
    async addVector(id, embedding) {
        try {
            switch (this.backend) {
                case 'faiss':
                    this.index.vectors.push(embedding);
                    this.index.ids.push(id);
                    this.index.ntotal++;
                    break;

                case 'qdrant':
                    const collection = this.client.collections.get(this.collectionName);
                    collection.vectors.push({ id, vector: embedding });
                    break;

                case 'chroma':
                    const chromaCollection = this.client.collections.get(this.collectionName);
                    chromaCollection.vectors.push(embedding);
                    break;

                case 'pinecone':
                    // Mock Pinecone upsert
                    break;
            }

        } catch (error) {
            this.logger.error('❌ Failed to add vector:', error);
            throw error;
        }
    }

    /**
     * Search for similar vectors
     */
    async search(queryEmbedding, options = {}) {
        try {
            const startTime = Date.now();
            this.stats.searchCount++;

            const limit = options.limit || 10;
            const threshold = options.threshold || 0.7;

            this.logger.debug(`🔍 Searching for ${limit} similar vectors (threshold: ${threshold})`);

            let results = [];

            switch (this.backend) {
                case 'faiss':
                    results = await this.searchFAISS(queryEmbedding, limit, threshold);
                    break;

                case 'qdrant':
                    results = await this.searchQdrant(queryEmbedding, limit, threshold);
                    break;

                case 'chroma':
                    results = await this.searchChroma(queryEmbedding, limit, threshold);
                    break;

                case 'pinecone':
                    results = await this.searchPinecone(queryEmbedding, limit, threshold);
                    break;
            }

            const searchTime = Date.now() - startTime;
            this.stats.averageSearchTime =
                (this.stats.averageSearchTime * (this.stats.searchCount - 1) + searchTime) /
                this.stats.searchCount;

            this.logger.debug(`✅ Found ${results.length} similar vectors in ${searchTime}ms`);

            return results;

        } catch (error) {
            this.logger.error('❌ Failed to search vectors:', error);
            throw error;
        }
    }

    /**
     * Search using FAISS backend
     */
    async searchFAISS(queryEmbedding, limit, threshold) {
        const results = [];

        // Simple cosine similarity search (mock implementation)
        for (let i = 0; i < this.index.vectors.length; i++) {
            const vector = this.index.vectors[i];
            const similarity = this.cosineSimilarity(queryEmbedding, vector);

            if (similarity >= threshold) {
                const vectorId = this.index.ids[i];
                results.push({
                    id: vectorId,
                    score: similarity,
                    document: this.documents.get(vectorId),
                    metadata: this.metadata.get(vectorId)
                });
            }
        }

        // Sort by similarity and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Search using Qdrant backend
     */
    async searchQdrant(queryEmbedding, limit, threshold) {
        const collection = this.client.collections.get(this.collectionName);
        const results = [];

        // Mock Qdrant search
        for (const item of collection.vectors) {
            const similarity = this.cosineSimilarity(queryEmbedding, item.vector);

            if (similarity >= threshold) {
                results.push({
                    id: item.id,
                    score: similarity,
                    document: this.documents.get(item.id),
                    metadata: this.metadata.get(item.id)
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Search using Chroma backend
     */
    async searchChroma(queryEmbedding, limit, threshold) {
        const collection = this.client.collections.get(this.collectionName);
        const results = [];

        // Mock Chroma search
        for (let i = 0; i < collection.vectors.length; i++) {
            const vector = collection.vectors[i];
            const similarity = this.cosineSimilarity(queryEmbedding, vector);

            if (similarity >= threshold) {
                const vectorId = `chroma_${i}`;
                results.push({
                    id: vectorId,
                    score: similarity,
                    document: this.documents.get(vectorId),
                    metadata: this.metadata.get(vectorId)
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Search using Pinecone backend
     */
    async searchPinecone(queryEmbedding, limit, threshold) {
        // Mock Pinecone search
        return [];
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vectorA, vectorB) {
        if (vectorA.length !== vectorB.length) {
            throw new Error('Vectors must have the same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vectorA.length; i++) {
            dotProduct += vectorA[i] * vectorB[i];
            normA += vectorA[i] * vectorA[i];
            normB += vectorB[i] * vectorB[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Remove document from the database
     */
    async removeDocument(documentId) {
        try {
            this.logger.debug(`🗑️ Removing document: ${documentId}`);

            // Find and remove all vectors for this document
            const vectorsToRemove = [];

            for (const [vectorId, metadata] of this.metadata.entries()) {
                if (metadata.documentId === documentId) {
                    vectorsToRemove.push(vectorId);
                }
            }

            for (const vectorId of vectorsToRemove) {
                await this.removeVector(vectorId);
                this.documents.delete(vectorId);
                this.metadata.delete(vectorId);
            }

            this.stats.totalVectors -= vectorsToRemove.length;
            this.stats.totalDocuments--;

            this.logger.debug(`✅ Removed document ${documentId} (${vectorsToRemove.length} vectors)`);

            return {
                success: true,
                documentId,
                vectorsRemoved: vectorsToRemove.length
            };

        } catch (error) {
            this.logger.error(`❌ Failed to remove document ${documentId}:`, error);
            throw error;
        }
    }

    /**
     * Remove a vector from the index
     */
    async removeVector(vectorId) {
        switch (this.backend) {
            case 'faiss':
                const index = this.index.ids.indexOf(vectorId);
                if (index > -1) {
                    this.index.ids.splice(index, 1);
                    this.index.vectors.splice(index, 1);
                    this.index.ntotal--;
                }
                break;

            case 'qdrant':
                const collection = this.client.collections.get(this.collectionName);
                const vectorIndex = collection.vectors.findIndex(v => v.id === vectorId);
                if (vectorIndex > -1) {
                    collection.vectors.splice(vectorIndex, 1);
                }
                break;
        }
    }

    /**
     * Save index to disk
     */
    async saveIndex() {
        try {
            if (this.backend === 'faiss') {
                const indexData = {
                    index: this.index,
                    documents: Array.from(this.documents.entries()),
                    metadata: Array.from(this.metadata.entries()),
                    stats: this.stats
                };

                await fs.writeFile(
                    `${this.indexPath}.json`,
                    JSON.stringify(indexData, null, 2)
                );

                this.logger.debug('💾 Index saved to disk');
            }

        } catch (error) {
            this.logger.error('❌ Failed to save index:', error);
        }
    }

    /**
     * Load index from disk
     */
    async loadIndex() {
        try {
            if (this.backend === 'faiss') {
                const indexFile = `${this.indexPath}.json`;

                try {
                    const data = await fs.readFile(indexFile, 'utf8');
                    const indexData = JSON.parse(data);

                    this.index = indexData.index;
                    this.documents = new Map(indexData.documents);
                    this.metadata = new Map(indexData.metadata);
                    this.stats = { ...this.stats, ...indexData.stats };

                    this.logger.info(`📂 Loaded index with ${this.stats.totalVectors} vectors`);

                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                    this.logger.info('📂 No existing index found, starting fresh');
                }
            }

        } catch (error) {
            this.logger.error('❌ Failed to load index:', error);
        }
    }

    /**
     * Generate unique vector ID
     */
    generateVectorId() {
        return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get database statistics
     */
    getStats() {
        return {
            ...this.stats,
            backend: this.backend,
            dimension: this.dimension,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Shutdown the vector database
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Vector Database...');

            // Save index before shutdown
            await this.saveIndex();

            // Close connections based on backend
            if (this.client) {
                // Close client connections if needed
            }

            this.isInitialized = false;
            this.logger.info('✅ Vector Database shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Vector Database shutdown:', error);
            throw error;
        }
    }
}

module.exports = VectorDatabase;