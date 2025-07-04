/**
 * RAG System - Retrieval-Augmented Generation for knowledge integration
 * 
 * Combines vector database, embedding engine, and retrieval components
 * to provide intelligent knowledge retrieval and context assembly.
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const Logger = require('../core/utils/logger');
const VectorDatabase = require('./vectorDatabase');
const EmbeddingEngine = require('./embeddingEngine');
const DocumentProcessor = require('./documentProcessor');
const KnowledgeRetriever = require('./knowledgeRetriever');

class RAGSystem extends EventEmitter {
    constructor(config, databaseManager) {
        super();
        this.config = config;
        this.databaseManager = databaseManager;
        this.logger = new Logger('RAGSystem');

        // Core components
        this.vectorDatabase = null;
        this.embeddingEngine = null;
        this.documentProcessor = null;
        this.knowledgeRetriever = null;

        // Configuration
        this.isEnabled = config.enabled !== false;
        this.indexPath = config.index_path || 'data/embeddings';
        this.chunkSize = config.chunk_size || 1000;
        this.chunkOverlap = config.chunk_overlap || 200;

        // Document management
        this.documentStore = new Map();
        this.indexedDocuments = new Set();

        // Performance tracking
        this.stats = {
            documentsIndexed: 0,
            totalChunks: 0,
            queriesProcessed: 0,
            averageRetrievalTime: 0,
            indexSize: 0,
            lastIndexUpdate: null
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the RAG system
     */
    async initialize() {
        try {
            if (!this.isEnabled) {
                this.logger.info('📚 RAG System is disabled, skipping initialization');
                return;
            }

            this.logger.info('🚀 Initializing RAG System...');

            // Create index directory
            await fs.mkdir(this.indexPath, { recursive: true });

            // Initialize vector database
            this.vectorDatabase = new VectorDatabase(this.config.vector_db || {}, this.databaseManager);
            await this.vectorDatabase.initialize();

            // Initialize embedding engine
            this.embeddingEngine = new EmbeddingEngine(this.config.embedding || {});
            await this.embeddingEngine.initialize();

            // Initialize document processor
            this.documentProcessor = new DocumentProcessor({
                chunk_size: this.chunkSize,
                chunk_overlap: this.chunkOverlap,
                ...this.config.document_processing
            });
            await this.documentProcessor.initialize();

            // Initialize knowledge retriever
            this.knowledgeRetriever = new KnowledgeRetriever(
                this.config.retrieval || {},
                this.vectorDatabase,
                this.embeddingEngine
            );
            await this.knowledgeRetriever.initialize();

            // Load existing index if available
            await this.loadExistingIndex();

            this.isInitialized = true;
            this.logger.info('✅ RAG System initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize RAG System:', error);
            throw error;
        }
    }

    /**
     * Load existing vector index and document metadata
     */
    async loadExistingIndex() {
        try {
            // Load vector database index
            await this.vectorDatabase.loadIndex();

            // Load document store metadata
            const metadataPath = path.join(this.indexPath, 'documents.json');
            try {
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                const metadata = JSON.parse(metadataContent);

                this.documentStore = new Map(metadata.documents || []);
                this.indexedDocuments = new Set(metadata.indexedDocuments || []);
                this.stats = { ...this.stats, ...metadata.stats };

                this.logger.info(`📂 Loaded metadata for ${this.documentStore.size} documents`);

            } catch (error) {
                if (error.code !== 'ENOENT') {
                    this.logger.warn('⚠️ Failed to load document metadata:', error.message);
                }
            }

            const vectorStats = this.vectorDatabase.getStats();
            this.logger.info(`✅ Loaded index with ${vectorStats.totalDocuments} documents and ${vectorStats.totalVectors} vectors`);

        } catch (error) {
            this.logger.warn('⚠️ Failed to load existing index:', error.message);
        }
    }

    /**
     * Index a document for retrieval
     */
    async indexDocument(documentPath, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG System not initialized');
            }

            // Check if already indexed
            if (this.indexedDocuments.has(documentPath) && !options.forceReindex) {
                this.logger.debug(`📄 Document already indexed: ${documentPath}`);
                return { success: true, alreadyIndexed: true };
            }

            this.logger.debug(`📄 Indexing document: ${documentPath}`);
            const startTime = Date.now();

            // Process document
            const processResult = await this.documentProcessor.processFile(documentPath, options);
            const { document, chunks } = processResult;

            // Generate embeddings for chunks
            const chunkTexts = chunks.map(chunk => chunk.text);
            const embeddings = await this.embeddingEngine.generateEmbeddings(chunkTexts);

            // Store in vector database
            await this.vectorDatabase.addDocuments(chunks, embeddings);

            // Update document store
            this.documentStore.set(document.id, document);
            this.indexedDocuments.add(documentPath);

            // Update statistics
            this.stats.documentsIndexed++;
            this.stats.totalChunks += chunks.length;
            this.stats.lastIndexUpdate = new Date().toISOString();

            const indexingTime = Date.now() - startTime;
            this.logger.debug(`✅ Indexed document with ${chunks.length} chunks in ${indexingTime}ms`);

            // Save metadata periodically
            if (this.stats.documentsIndexed % 10 === 0) {
                await this.saveMetadata();
            }

            this.emit('documentIndexed', {
                documentPath,
                documentId: document.id,
                chunks: chunks.length,
                embeddings: embeddings.length,
                indexingTime
            });

            return {
                success: true,
                documentId: document.id,
                chunks: chunks.length,
                indexingTime
            };

        } catch (error) {
            this.logger.error(`❌ Failed to index document ${documentPath}:`, error);
            throw error;
        }
    }

    /**
     * Index multiple documents from a directory
     */
    async indexDirectory(directoryPath, options = {}) {
        try {
            this.logger.info(`📁 Indexing directory: ${directoryPath}`);

            // Get list of files to index
            const files = await this.getFilesToIndex(directoryPath, options);
            const results = [];

            for (const filePath of files) {
                try {
                    const result = await this.indexDocument(filePath, {
                        source: 'directory',
                        directory: directoryPath,
                        ...options
                    });
                    results.push({ filePath, ...result });
                } catch (error) {
                    this.logger.error(`❌ Failed to index document ${filePath}:`, error);
                    results.push({ filePath, error: error.message });
                }
            }

            const successful = results.filter(r => !r.error).length;
            this.logger.info(`✅ Indexed ${successful}/${files.length} documents from directory`);

            // Save metadata after batch indexing
            await this.saveMetadata();

            return {
                total: files.length,
                successful,
                failed: files.length - successful,
                results
            };

        } catch (error) {
            this.logger.error('❌ Failed to index directory:', error);
            throw error;
        }
    }

    /**
     * Get files to index from directory
     */
    async getFilesToIndex(directoryPath, options = {}) {
        const files = [];
        const extensions = options.extensions || ['.txt', '.md', '.js', '.py', '.json', '.html', '.css'];

        async function scanDirectory(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await scanDirectory(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        }

        await scanDirectory(directoryPath);
        return files;
    }

    /**
     * Save document metadata to disk
     */
    async saveMetadata() {
        try {
            const metadataPath = path.join(this.indexPath, 'documents.json');
            const metadata = {
                documents: Array.from(this.documentStore.entries()),
                indexedDocuments: Array.from(this.indexedDocuments),
                stats: this.stats,
                lastSaved: new Date().toISOString()
            };

            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            this.logger.debug('💾 Document metadata saved');

        } catch (error) {
            this.logger.error('❌ Failed to save metadata:', error);
        }
    }

    /**
     * Process and index documents
     */
    async indexDocuments(documents) {
        try {
            this.logger.info(`📄 Indexing ${documents.length} documents...`);

            const results = [];

            for (const document of documents) {
                try {
                    const result = await this.indexDocument(document.path || document.id, {
                        metadata: document.metadata || {},
                        forceReindex: true
                    });
                    results.push(result);
                } catch (error) {
                    this.logger.error(`Failed to index document ${document.id}:`, error);
                    results.push({ error: error.message, documentId: document.id });
                }
            }

            const successful = results.filter(r => !r.error).length;
            this.logger.info(`✅ Indexed ${successful}/${documents.length} documents`);

            return {
                success: true,
                processed: successful,
                total: documents.length,
                results
            };

        } catch (error) {
            this.logger.error('❌ Failed to index documents:', error);
            throw error;
        }
    }

    /**
     * Retrieve relevant documents for a query
     */
    async retrieve(query, options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('RAG System not initialized');
            }

            this.logger.debug(`🔍 Retrieving documents for query: "${query.substring(0, 100)}..."`);

            const startTime = Date.now();
            this.stats.queriesProcessed++;

            // Perform knowledge retrieval
            const retrievalResult = await this.knowledgeRetriever.retrieve(query, options);

            const retrievalTime = Date.now() - startTime;

            // Update statistics
            this.stats.averageRetrievalTime =
                (this.stats.averageRetrievalTime * (this.stats.queriesProcessed - 1) + retrievalTime) /
                this.stats.queriesProcessed;

            this.logger.debug(`✅ Retrieved ${retrievalResult.results.length} documents in ${retrievalTime}ms`);

            const result = {
                query: retrievalResult.query,
                results: retrievalResult.results,
                context: retrievalResult.context,
                metadata: {
                    ...retrievalResult.metadata,
                    retrievalTime,
                    totalQueries: this.stats.queriesProcessed
                }
            };

            this.emit('queryProcessed', result);
            return result;

        } catch (error) {
            this.logger.error('❌ Failed to retrieve documents:', error);
            throw error;
        }
    }

    /**
     * Update document in the index
     */
    async updateDocument(documentPath, options = {}) {
        try {
            this.logger.debug(`📝 Updating document: ${documentPath}`);

            // Remove old document first
            await this.removeDocument(documentPath);

            // Re-index with new content
            const result = await this.indexDocument(documentPath, {
                ...options,
                forceReindex: true
            });

            this.logger.debug(`✅ Updated document: ${documentPath}`);

            return result;

        } catch (error) {
            this.logger.error(`❌ Failed to update document ${documentPath}:`, error);
            throw error;
        }
    }

    /**
     * Remove document from index
     */
    async removeDocument(documentPath) {
        try {
            this.logger.debug(`🗑️ Removing document: ${documentPath}`);

            // Find document ID
            let documentId = null;
            for (const [id, doc] of this.documentStore.entries()) {
                if (doc.source === documentPath) {
                    documentId = id;
                    break;
                }
            }

            if (documentId) {
                // Remove from vector database
                await this.vectorDatabase.removeDocument(documentId);

                // Remove from local stores
                this.documentStore.delete(documentId);
                this.indexedDocuments.delete(documentPath);

                this.stats.documentsIndexed--;

                this.logger.debug(`✅ Removed document: ${documentPath}`);
                return { success: true, documentId };
            } else {
                this.logger.warn(`⚠️ Document not found in index: ${documentPath}`);
                return { success: false, reason: 'Document not found' };
            }

        } catch (error) {
            this.logger.error(`❌ Failed to remove document ${documentPath}:`, error);
            throw error;
        }
    }

    /**
     * Get system statistics
     */
    getStats() {
        const vectorDbStats = this.vectorDatabase?.getStats() || {};
        const embeddingStats = this.embeddingEngine?.getStats() || {};
        const retrieverStats = this.knowledgeRetriever?.getStats() || {};
        const processorStats = this.documentProcessor?.getStats() || {};

        return {
            system: {
                isInitialized: this.isInitialized,
                isEnabled: this.isEnabled,
                documentsIndexed: this.stats.documentsIndexed,
                totalChunks: this.stats.totalChunks,
                queriesProcessed: this.stats.queriesProcessed
            },
            performance: {
                ...this.stats,
                indexSize: this.documentStore.size
            },
            components: {
                vectorDatabase: vectorDbStats,
                embedding: embeddingStats,
                retriever: retrieverStats,
                processor: processorStats
            }
        };
    }

    /**
     * Get system status
     */
    getStatus() {
        if (!this.isEnabled) return 'disabled';
        if (!this.isInitialized) return 'not_initialized';
        return 'ready';
    }

    /**
     * Clear all indexed data
     */
    async clearIndex() {
        try {
            this.logger.info('🧹 Clearing RAG index...');

            // Clear vector database
            if (this.vectorDatabase) {
                // Note: This would need to be implemented in VectorDatabase
                // await this.vectorDatabase.clear();
            }

            // Clear local stores
            this.documentStore.clear();
            this.indexedDocuments.clear();

            // Reset statistics
            this.stats = {
                documentsIndexed: 0,
                totalChunks: 0,
                queriesProcessed: 0,
                averageRetrievalTime: 0,
                indexSize: 0,
                lastIndexUpdate: null
            };

            // Remove metadata file
            const metadataPath = path.join(this.indexPath, 'documents.json');
            try {
                await fs.unlink(metadataPath);
            } catch (error) {
                // Ignore if file doesn't exist
            }

            this.logger.info('✅ RAG index cleared');

        } catch (error) {
            this.logger.error('❌ Failed to clear index:', error);
            throw error;
        }
    }

    /**
     * Shutdown the RAG system
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down RAG System...');

            // Save metadata before shutdown
            await this.saveMetadata();

            // Shutdown components in reverse order
            if (this.knowledgeRetriever) {
                await this.knowledgeRetriever.shutdown();
            }

            if (this.documentProcessor) {
                await this.documentProcessor.shutdown();
            }

            if (this.embeddingEngine) {
                await this.embeddingEngine.shutdown();
            }

            if (this.vectorDatabase) {
                await this.vectorDatabase.shutdown();
            }

            this.isInitialized = false;
            this.logger.info('✅ RAG System shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during RAG System shutdown:', error);
            throw error;
        }
    }
}

module.exports = RAGSystem;