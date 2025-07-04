const { HNSWLib } = require('@langchain/community/vectorstores/hnswlib');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');

class VectorStoreService {
  constructor() {
    this.vectorStore = null;
    this.embeddings = null;
    this.initialized = false;
    this.indexPath = path.join(process.cwd(), 'data', 'vector-store');
    
    // Ensure the data directory exists
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
  }

  /**
   * Initialize the vector store
   * @param {Object} options - Configuration options
   * @param {string} [options.modelName='text-embedding-3-small'] - Embedding model name
   * @param {string} [options.apiKey] - OpenAI API key (if not set in environment)
   * @returns {Promise<VectorStoreService>} Initialized vector store service
   */
  async init({ modelName = 'text-embedding-3-small', apiKey } = {}) {
    if (this.initialized) return this;
    
    try {
      // Initialize embeddings
      this.embeddings = new OpenAIEmbeddings({
        modelName,
        openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
      });
      
      // Try to load existing vector store
      try {
        this.vectorStore = await HNSWLib.load(
          this.indexPath,
          this.embeddings
        );
        logger.info('Loaded existing vector store', { 
          path: this.indexPath,
          numVectors: await this.vectorStore.memoryVectors?.size() || 0
        });
      } catch (error) {
        // If no existing index, create a new one
        if (error.code === 'ENOENT') {
          logger.info('No existing vector store found, creating a new one');
          this.vectorStore = await HNSWLib.fromTexts(
            ['Initial document'],
            [{ source: 'system' }],
            this.embeddings,
            { space: 'cosine' }
          );
          await this.vectorStore.save(this.indexPath);
        } else {
          throw error;
        }
      }
      
      this.initialized = true;
      return this;
    } catch (error) {
      logger.error('Failed to initialize vector store', { error: error.message });
      throw error;
    }
  }

  /**
   * Add documents to the vector store
   * @param {Array<Object>} documents - Array of document objects with content and metadata
   * @returns {Promise<Array<string>>} Array of document IDs
   */
  async addDocuments(documents) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // Split documents into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      
      const splitDocs = await textSplitter.splitDocuments(
        documents.map(doc => ({
          pageContent: doc.content,
          metadata: doc.metadata || {},
        }))
      );
      
      // Add to vector store
      const ids = await this.vectorStore.addDocuments(splitDocs);
      
      // Save the updated vector store
      await this.vectorStore.save(this.indexPath);
      
      logger.info('Added documents to vector store', { 
        count: documents.length,
        chunks: splitDocs.length,
        ids: ids.length
      });
      
      return ids;
    } catch (error) {
      logger.error('Failed to add documents to vector store', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Perform a similarity search
   * @param {string} query - The query string
   * @param {number} k - Number of results to return
   * @returns {Promise<Array>} Array of matching documents with scores
   */
  async similaritySearch(query, k = 4) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // If no documents in the store, return empty array
      const size = await this.vectorStore.memoryVectors?.size();
      if (size === 0) {
        return [];
      }
      
      // Perform similarity search
      const results = await this.vectorStore.similaritySearchWithScore(query, k);
      
      // Format results
      return results.map(([doc, score]) => ({
        pageContent: doc.pageContent,
        metadata: doc.metadata,
        score
      }));
    } catch (error) {
      logger.error('Similarity search failed', { 
        error: error.message,
        query,
        k
      });
      throw error;
    }
  }

  /**
   * Delete documents by metadata filter
   * @param {Object} filter - Metadata filter object
   * @returns {Promise<boolean>} True if documents were deleted
   */
  async delete(filter) {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      if (!this.vectorStore.delete) {
        throw new Error('Delete operation not supported by this vector store');
      }
      
      // Delete documents matching the filter
      await this.vectorStore.delete(filter);
      
      // Save the updated vector store
      await this.vectorStore.save(this.indexPath);
      
      logger.info('Deleted documents from vector store', { filter });
      return true;
    } catch (error) {
      logger.error('Failed to delete documents from vector store', { 
        error: error.message,
        filter
      });
      throw error;
    }
  }

  /**
   * Get the number of vectors in the store
   * @returns {Promise<number>} Number of vectors
   */
  async getVectorCount() {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      return await this.vectorStore.memoryVectors?.size() || 0;
    } catch (error) {
      logger.error('Failed to get vector count', { error: error.message });
      throw error;
    }
  }

  /**
   * Clear the entire vector store
   * @returns {Promise<boolean>} True if successful
   */
  async clear() {
    try {
      // Create a new empty vector store
      this.vectorStore = await HNSWLib.fromTexts(
        ['Initial document'],
        [{ source: 'system' }],
        this.embeddings,
        { space: 'cosine' }
      );
      
      // Save the empty store
      await this.vectorStore.save(this.indexPath);
      
      logger.info('Cleared vector store');
      return true;
    } catch (error) {
      logger.error('Failed to clear vector store', { error: error.message });
      throw error;
    }
  }
}

// Singleton instance
let vectorStoreService = null;

/**
 * Get or create the vector store service instance
 * @returns {Promise<VectorStoreService>} Vector store service instance
 */
async function getVectorStore() {
  if (!vectorStoreService) {
    vectorStoreService = new VectorStoreService();
    await vectorStoreService.init();
  }
  return vectorStoreService;
}

module.exports = {
  VectorStoreService,
  getVectorStore,
};
