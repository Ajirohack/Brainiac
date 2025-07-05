const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { getProviderFactory } = require('./ProviderFactory');
const logger = require('../../utils/logger');

/**
 * Service for handling all LLM operations
 */
class LLMService extends EventEmitter {
  /**
   * Create a new LLMService
   * @param {Object} options - Configuration options
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.db - Database connection or ORM instance
   */
  constructor({ logger: loggerInstance, db } = {}) {
    super();
    // Ensure logger has required methods
    this.logger = loggerInstance || {
      info: console.log.bind(console, '[INFO]'),
      error: console.error.bind(console, '[ERROR]'),
      warn: console.warn.bind(console, '[WARN]'),
      debug: console.debug ? console.debug.bind(console, '[DEBUG]') : console.log.bind(console, '[DEBUG]'),
    };
    
    this.db = db;
    this.providerFactory = getProviderFactory({ logger: this.logger, db: this.db });
    this.initialized = false;
    this.initializationPromise = null;
    
    if (typeof this.logger.info === 'function') {
      this.logger.info('🤖 LLM Service initialized');
    } else {
      console.log('🤖 LLM Service initialized (fallback logger)');
    }
  }

  /**
   * Initialize the service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        this.logger.info('Initializing LLMService');
        
        // Initialize the provider factory
        await this.providerFactory.initialize();
        
        this.initialized = true;
        this.logger.info('LLMService initialized');
      } catch (error) {
        this.logger.error('Failed to initialize LLMService:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Get a chat completion
   * @param {Object} params - Completion parameters
   * @param {string} [params.providerId] - Specific provider ID to use
   * @param {string} [params.model] - The model to use
   * @param {Array} params.messages - Array of message objects
   * @param {Object} [params.options] - Additional options
   * @param {boolean} [params.stream] - Whether to stream the response
   * @param {Function} [params.onData] - Callback for streaming data
   * @returns {Promise<Object>} The completion response
   */
  async createChatCompletion({
    providerId,
    model,
    messages,
    options = {},
    stream = false,
    onData,
  }) {
    if (!this.initialized) {
      await this.initialize();
    }

    const requestId = `req_${uuidv4()}`;
    const startTime = Date.now();
    
    this.logger.debug('Creating chat completion', {
      requestId,
      providerId,
      model,
      messageCount: messages?.length,
      options: this._redactSensitiveData(options),
      stream,
    });

    try {
      // Delegate to provider factory
      const response = await this.providerFactory.createChatCompletion({
        providerId,
        model,
        messages,
        options,
        stream,
        onData: (chunk) => {
          try {
            // Emit chunk event
            this.emit('chunk', {
              requestId,
              providerId: chunk.providerId,
              model: chunk.model,
              chunk: chunk.data,
              timestamp: Date.now(),
            });

            // Forward to the original onData callback if provided
            if (onData) {
              onData(chunk);
            }
          } catch (error) {
            this.logger.error('Error in onData callback:', error);
          }
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log completion
      this.logger.info('Chat completion completed', {
        requestId,
        providerId: response.providerId,
        model: response.model,
        duration,
        usage: response.usage,
      });
      
      // Emit usage event
      this.emit('usage', {
        requestId,
        providerId: response.providerId,
        model: response.model,
        usage: response.usage,
        duration,
        timestamp: endTime,
      });
      
      return response;
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.logger.error('Chat completion failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration,
        providerId,
        model,
      });
      
      // Emit error event
      this.emit('error', {
        requestId,
        error,
        providerId,
        model,
        duration,
        timestamp: endTime,
      });
      
      throw this._enhanceError(error, { requestId });
    }
  }

  /**
   * Create embeddings
   * @param {Object} params - Embedding parameters
   * @param {string} [params.providerId] - Specific provider ID to use
   * @param {string|string[]} params.input - The input text or array of texts
   * @param {string} [params.model] - The model to use
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding({ providerId, input, model }) {
    if (!this.initialized) {
      await this.initialize();
    }

    const requestId = `emb_${uuidv4()}`;
    const startTime = Date.now();
    
    this.logger.debug('Creating embeddings', {
      requestId,
      providerId,
      model,
      inputType: Array.isArray(input) ? 'array' : 'string',
      inputLength: Array.isArray(input) ? input.length : 1,
    });

    try {
      // Delegate to provider factory
      const response = await this.providerFactory.createEmbedding({
        providerId,
        input,
        model,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log completion
      this.logger.info('Embedding creation completed', {
        requestId,
        providerId: response.providerId,
        model: response.model,
        duration,
        usage: response.usage,
      });
      
      // Emit usage event
      this.emit('usage', {
        requestId,
        providerId: response.providerId,
        model: response.model,
        usage: response.usage,
        duration,
        timestamp: endTime,
        type: 'embedding',
      });
      
      return response;
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.logger.error('Embedding creation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration,
        providerId,
        model,
      });
      
      // Emit error event
      this.emit('error', {
        requestId,
        error,
        providerId,
        model,
        duration,
        timestamp: endTime,
        type: 'embedding',
      });
      
      throw this._enhanceError(error, { requestId });
    }
  }

  /**
   * List available models across all providers
   * @param {Object} [options] - Options for filtering models
   * @param {string} [options.providerId] - Filter by provider ID
   * @param {boolean} [options.activeOnly=true] - Only return active models
   * @returns {Promise<Array>} List of available models
   */
  async listModels({ providerId, activeOnly = true } = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { AIModel } = require('../../models');
      
      let query = AIModel.query()
        .withGraphFetched('provider')
        .withGraphFetched('capabilities');
      
      if (providerId) {
        query = query.where('provider_id', providerId);
      }
      
      if (activeOnly) {
        query = query.where('is_active', true);
      }
      
      const models = await query;
      
      return models.map(model => ({
        id: model.model_id,
        name: model.name,
        provider: model.provider ? {
          id: model.provider.id,
          name: model.provider.name,
          provider_type: model.provider.provider_type,
        } : null,
        is_chat_model: model.is_chat_model,
        is_embedding_model: model.is_embedding_model,
        context_length: model.context_length,
        max_tokens: model.max_tokens,
        config: model.config || {},
        capabilities: model.capabilities ? model.capabilities.map(c => c.capability) : [],
        created_at: model.created_at,
        updated_at: model.updated_at,
      }));
      
    } catch (error) {
      this.logger.error('Failed to list models:', error);
      throw this._enhanceError(error);
    }
  }

  /**
   * Get a model by ID
   * @param {string} modelId - The ID of the model to find
   * @returns {Promise<Object|null>} The model, or null if not found
   */
  async getModel(modelId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const models = await this.listModels({ activeOnly: true });
      return models.find(m => m.id === modelId || m.name === modelId) || null;
    } catch (error) {
      this.logger.error(`Failed to get model ${modelId}:`, error);
      throw this._enhanceError(error);
    }
  }

  /**
   * List available providers
   * @param {Object} [options] - Options for filtering providers
   * @param {boolean} [options.activeOnly=true] - Only return active providers
   * @returns {Promise<Array>} List of available providers
   */
  async listProviders({ activeOnly = true } = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const { AIProvider } = require('../../models');
      
      let query = AIProvider.query();
      
      if (activeOnly) {
        query = query.where('is_active', true);
      }
      
      const providers = await query;
      
      return providers.map(provider => ({
        id: provider.id,
        name: provider.name,
        provider_type: provider.provider_type,
        base_url: provider.base_url,
        is_active: provider.is_active,
        config: provider.config || {},
        created_at: provider.created_at,
        updated_at: provider.updated_at,
      }));
      
    } catch (error) {
      this.logger.error('Failed to list providers:', error);
      throw this._enhanceError(error);
    }
  }

  /**
   * Get a provider by ID
   * @param {string} providerId - The ID of the provider to find
   * @returns {Promise<Object|null>} The provider, or null if not found
   */
  async getProvider(providerId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const providers = await this.listProviders({ activeOnly: false });
      return providers.find(p => p.id === providerId) || null;
    } catch (error) {
      this.logger.error(`Failed to get provider ${providerId}:`, error);
      throw this._enhanceError(error);
    }
  }

  /**
   * Sync models for a provider
   * @param {string} providerId - The ID of the provider to sync
   * @returns {Promise<Array>} List of synced models
   */
  async syncProviderModels(providerId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      return await this.providerFactory.syncProviderModels(providerId);
    } catch (error) {
      this.logger.error(`Failed to sync models for provider ${providerId}:`, error);
      throw this._enhanceError(error);
    }
  }

  /**
   * Close the service and clean up resources
   */
  async close() {
    this.logger.info('Closing LLMService');
    
    if (this.providerFactory) {
      await this.providerFactory.close();
    }
    
    this.initialized = false;
    this.initializationPromise = null;
    
    this.logger.info('LLMService closed');
  }

  /**
   * Enhance an error with additional context
   * @private
   */
  _enhanceError(error, context = {}) {
    if (!error) return error;
    
    const enhancedError = error instanceof Error 
      ? error 
      : new Error(typeof error === 'string' ? error : 'Unknown error');
    
    // Add context to the error
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined) {
        enhancedError[key] = value;
      }
    });
    
    return enhancedError;
  }

  /**
   * Redact sensitive data from logs
   * @private
   */
  _redactSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // Create a deep copy to avoid modifying the original
    const result = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive fields
      if (typeof key === 'string' && 
          (key.toLowerCase().includes('key') || 
           key.toLowerCase().includes('token') ||
           key.toLowerCase().includes('secret') ||
           key.toLowerCase().includes('password'))) {
        result[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        result[key] = this._redactSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
}

// Create a singleton instance
let instance = null;

/**
 * Get or create the singleton LLMService instance
 * @param {Object} options - Configuration options
 * @returns {LLMService} The singleton instance
 */
function getLLMService(options = {}) {
  if (!instance) {
    instance = new LLMService(options);
  }
  return instance;
}

module.exports = {
  LLMService,
  getLLMService,
};
