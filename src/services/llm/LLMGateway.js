const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const path = require('path');
const AIProvider = fromRoot('models/AIProvider');
const AIModel = fromRoot('models/AIModel');
const ProviderRateLimit = fromRoot('models/ProviderRateLimit');
const Logger = fromRoot('utils/logger');
const { ValidationError, RateLimitError, ProviderError } = fromRoot('utils/errors');

// Import provider configurations
const providerConfigs = require('../../../config/llmProviders');

// Dynamically import provider clients
const PROVIDER_CLIENTS = {};

// Supported providers from config
const SUPPORTED_PROVIDERS = Object.keys(providerConfigs).filter(key => 
  typeof providerConfigs[key] === 'object' && providerConfigs[key] !== null
);

// Dynamically load provider clients
SUPPORTED_PROVIDERS.forEach(providerId => {
  try {
    const providerName = providerId.charAt(0).toUpperCase() + providerId.slice(1) + 'Client';
    PROVIDER_CLIENTS[providerId] = require(`./providers/${providerName}`);
  } catch (error) {
    console.warn(`Failed to load provider client for ${providerId}:`, error.message);
  }
});

class LLMGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = new Logger('LLMGateway');
    this.providerCache = new Map();
    this.modelCache = new Map();
    this.clients = new Map();
    
    // Set defaults from config or environment
    this.defaultProvider = options.defaultProvider || process.env.DEFAULT_LLM_PROVIDER || 'openai';
    
    // Get default model from config for the default provider
    const defaultProviderConfig = providerConfigs[this.defaultProvider];
    this.defaultModel = options.defaultModel || 
      (defaultProviderConfig ? defaultProviderConfig.defaultModel : 'gpt-4-turbo');
    
    this.initialize();
  }

  /**
   * Initialize the LLM Gateway
   */
  async initialize() {
    try {
      await this.loadProvidersAndModels();
      this.logger.info('LLM Gateway initialized');
    } catch (error) {
      this.logger.error('Failed to initialize LLM Gateway:', error);
      throw error;
    }
  }

  /**
   * Load all active providers and models from the database
   */
  async loadProvidersAndModels() {
    try {
      // Clear caches
      this.providerCache.clear();
      this.modelCache.clear();
      
      // Load active providers with their models
      const providers = await AIProvider.query()
        .where('is_active', true)
        .withGraphFetched('models')
        .orderBy('priority', 'desc');
      
      // Cache providers and models
      for (const provider of providers) {
        this.providerCache.set(provider.id, provider);
        
        // Cache models for this provider
        if (provider.models && provider.models.length > 0) {
          for (const model of provider.models) {
            const cacheKey = this.getModelCacheKey(provider.id, model.model_id);
            this.modelCache.set(cacheKey, {
              ...model,
              provider
            });
          }
        }
      }
      
      this.logger.debug(`Loaded ${providers.length} providers and ${this.modelCache.size} models`);
      this.emit('providers:updated');
      return providers;
    } catch (error) {
      this.logger.error('Failed to load providers and models:', error);
      throw error;
    }
  }

  /**
   * Get a provider client instance
   * @param {string} providerId - The provider ID
   * @returns {BaseProviderClient} The provider client instance
   */
  getProviderClient(providerId) {
    if (!providerId) {
      throw new ValidationError('Provider ID is required');
    }
    
    // Normalize provider ID (case-insensitive)
    providerId = providerId.toLowerCase();
    
    if (this.clients.has(providerId)) {
      return this.clients.get(providerId);
    }
    
    // Check if provider is supported
    if (!PROVIDER_CLIENTS[providerId]) {
      throw new ValidationError(`Unsupported provider: ${providerId}`);
    }

    const provider = this.providerCache.get(providerId);
    if (!provider) {
      throw new ProviderError(`Provider not found: ${providerId}`);
    }

    const ClientClass = PROVIDER_CLIENTS[provider.provider_type];
    if (!ClientClass) {
      throw new ProviderError(`Unsupported provider type: ${provider.provider_type}`);
    }

    const client = new ClientClass({
      provider,
      logger: this.logger.child({ provider: provider.name })
    });

    this.clients.set(providerId, client);
    return client;
  }

  /**
   * Get a model configuration
   * @param {string} modelId - The model ID
   * @param {string} [providerId] - Optional provider ID
   * @returns {Object} The model configuration
   */
  getModelConfig(modelId, providerId = null) {
    if (!modelId) {
      throw new ValidationError('Model ID is required');
    }

    // If provider is specified, try to get the model from that provider
    if (providerId) {
      const cacheKey = this.getModelCacheKey(providerId, modelId);
      const cached = this.modelCache.get(cacheKey);
      if (cached) return cached;
      
      // Check provider config if not in cache
      if (providerConfigs[providerId]?.models?.[modelId]) {
        return {
          ...providerConfigs[providerId].models[modelId],
          model_id: modelId,
          provider_id: providerId,
          is_active: true,
          is_default: providerConfigs[providerId].defaultModel === modelId
        };
      }
      
      throw new ValidationError(`Model not found: ${modelId} for provider ${providerId}`);
    }

    // Try to find the model in any provider cache
    for (const [key, model] of this.modelCache.entries()) {
      if (model.model_id === modelId) {
        return model;
      }
    }

    // If not found in cache, check all provider configs
    for (const [pid, config] of Object.entries(providerConfigs)) {
      if (config?.models?.[modelId]) {
        return {
          ...config.models[modelId],
          model_id: modelId,
          provider_id: pid,
          is_active: true,
          is_default: config.defaultModel === modelId
        };
      }
    }

    throw new ValidationError(`Model not found: ${modelId}`);
  }

  /**
   * Generate a response using the specified model
   * @param {Object} params - The request parameters
   * @param {string} [params.model] - The model ID
   * @param {string} [params.provider] - The provider ID (optional if model is specified)
   * @param {Array} params.messages - The conversation messages
   * @param {Object} [params.options] - Additional options for the request
   * @param {boolean} [params.stream=false] - Whether to stream the response
   * @param {Function} [params.onData] - Callback for streaming data
   * @returns {Promise<Object>} The completion response
   */
  async createChatCompletion(params) {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    try {
      const { model, provider, messages, options = {}, stream = false, onData } = params;
      
      // Validate input
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new ValidationError('Messages array is required');
      }
      
      // Get the model and provider
      let modelInfo;
      try {
        modelInfo = this.getModel(model || this.defaultModel, provider);
      } catch (error) {
        // If model not found and provider is specified, try to fetch models from provider
        if (provider && error.message.includes('not found')) {
          await this.syncProviderModels(provider);
          modelInfo = this.getModel(model || this.defaultModel, provider);
        } else {
          throw error;
        }
      }
      
      const { id: modelId, provider: providerInfo } = modelInfo;
      const providerClient = this.getProviderClient(providerInfo.id);
      
      // Check rate limits
      const rateLimitStatus = await ProviderRateLimit.getRateLimitStatus(providerInfo.id);
      const rpmStatus = rateLimitStatus.rpm;
      
      if (rpmStatus && rpmStatus.remaining <= 0) {
        throw new RateLimitError(
          `Rate limit exceeded for provider ${providerInfo.name}. ` +
          `Try again after ${new Date(rpmStatus.reset).toISOString()}`
        );
      }
      
      // Prepare request
      const request = {
        model: modelInfo.model_id,
        messages,
        stream,
        ...options
      };
      
      this.logger.debug('Sending chat completion request', {
        requestId,
        provider: providerInfo.name,
        model: modelInfo.model_id,
        messageCount: messages.length,
        stream
      });
      
      // Make the request
      let response;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let error = null;
      
      try {
        if (stream) {
          // Handle streaming response
          const streamResponse = await providerClient.createChatCompletion({
            ...request,
            onData: (data) => {
              // Update token counts if available
              if (data.usage) {
                promptTokens = data.usage.prompt_tokens || promptTokens;
                completionTokens = data.usage.completion_tokens || completionTokens;
                totalTokens = data.usage.total_tokens || totalTokens;
              }
              
              // Forward data to the client
              if (onData) {
                onData(data);
              }
            }
          });
          
          response = streamResponse;
        } else {
          // Handle non-streaming response
          response = await providerClient.createChatCompletion(request);
          
          // Update token counts
          if (response.usage) {
            promptTokens = response.usage.prompt_tokens || 0;
            completionTokens = response.usage.completion_tokens || 0;
            totalTokens = response.usage.total_tokens || 0;
          }
        }
        
        return response;
      } catch (err) {
        error = err;
        throw err;
      } finally {
        // Log the API usage
        const latencyMs = Date.now() - startTime;
        
        try {
          await providerInfo.logApiUsage({
            modelId: modelInfo.id,
            endpoint: 'chat/completions',
            statusCode: error ? (error.statusCode || 500) : 200,
            promptTokens,
            completionTokens,
            totalTokens,
            latencyMs,
            errorMessage: error ? error.message : null
          });
          
          this.logger.debug('Logged API usage', {
            requestId,
            provider: providerInfo.name,
            model: modelInfo.model_id,
            statusCode: error ? (error.statusCode || 500) : 200,
            latencyMs,
            promptTokens,
            completionTokens,
            totalTokens
          });
        } catch (logError) {
          this.logger.error('Failed to log API usage:', logError);
        }
      }
    } catch (error) {
      this.logger.error('Chat completion failed:', {
        requestId,
        error: error.message,
        stack: error.stack
      });
      
      // Re-throw with additional context if needed
      if (error instanceof ProviderError || error instanceof ValidationError || error instanceof RateLimitError) {
        throw error;
      }
      
      throw new ProviderError(
        `Failed to complete chat: ${error.message}`,
        error.statusCode || 500,
        error
      );
    }
  }

  /**
   * Generate embeddings for the given input
   * @param {Object} params - The request parameters
   * @param {string|string[]} params.input - The input text or array of texts to embed
   * @param {string} [params.model] - The embedding model ID (optional)
   * @param {string} [params.provider] - The provider ID (optional)
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding(params) {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    try {
      const { input, model, provider } = params;
      
      // Validate input
      if (!input) {
        throw new ValidationError('Input is required');
      }
      
      // Get the model and provider
      const modelInfo = this.getModel(model || 'text-embedding-3-small', provider);
      const { id: modelId, provider: providerInfo } = modelInfo;
      const providerClient = this.getProviderClient(providerInfo.id);
      
      // Check if the model supports embeddings
      const supportsEmbeddings = await modelInfo.supports('embeddings');
      if (!supportsEmbeddings) {
        throw new ValidationError(`Model ${modelInfo.model_id} does not support embeddings`);
      }
      
      // Prepare request
      const request = {
        model: modelInfo.model_id,
        input: Array.isArray(input) ? input : [input]
      };
      
      this.logger.debug('Sending embedding request', {
        requestId,
        provider: providerInfo.name,
        model: modelInfo.model_id,
        inputLength: Array.isArray(input) ? input.length : 1
      });
      
      // Make the request
      const response = await providerClient.createEmbedding(request);
      
      // Log the API usage
      const latencyMs = Date.now() - startTime;
      const tokenCount = Array.isArray(input) ? input.length : 1;
      
      try {
        await providerInfo.logApiUsage({
          modelId: modelInfo.id,
          endpoint: 'embeddings',
          statusCode: 200,
          promptTokens: tokenCount,
          completionTokens: 0,
          totalTokens: tokenCount,
          latencyMs,
          cost: null // TODO: Calculate cost based on provider pricing
        });
        
        this.logger.debug('Logged embedding usage', {
          requestId,
          provider: providerInfo.name,
          model: modelInfo.model_id,
          tokenCount,
          latencyMs
        });
      } catch (logError) {
        this.logger.error('Failed to log embedding usage:', logError);
      }
      
      return response;
    } catch (error) {
      this.logger.error('Embedding generation failed:', {
        requestId,
        error: error.message,
        stack: error.stack
      });
      
      // Re-throw with additional context if needed
      if (error instanceof ProviderError || error instanceof ValidationError) {
        throw error;
      }
      
      throw new ProviderError(
        `Failed to generate embeddings: ${error.message}`,
        error.statusCode || 500,
        error
      );
    }
  }

  /**
   * Sync models from a provider
   * @param {string} providerId - The provider ID
   * @returns {Promise<Array>} The synced models
   */
  async syncProviderModels(providerId) {
    const provider = this.providerCache.get(providerId);
    if (!provider) {
      throw new ValidationError(`Provider not found: ${providerId}`);
    }
    
    if (!provider.supports_dynamic_models) {
      this.logger.debug(`Provider ${provider.name} does not support dynamic model syncing`);
      return [];
    }
    
    const providerClient = this.getProviderClient(providerId);
    
    try {
      this.logger.debug(`Syncing models for provider: ${provider.name}`);
      const models = await providerClient.listModels();
      
      // Update the database with the latest models
      const updatedModels = [];
      
      for (const modelData of models) {
        const existingModel = await AIModel.findByProviderAndModelId(providerId, modelData.model_id);
        
        if (existingModel) {
          // Update existing model
          const updatedModel = await existingModel.$query().patchAndFetch({
            model_name: modelData.model_name || modelData.model_id,
            is_active: true,
            context_length: modelData.context_length,
            max_tokens: modelData.max_tokens,
            is_chat_model: modelData.is_chat_model !== false, // Default to true if not specified
            is_embedding_model: modelData.is_embedding_model || false,
            config: modelData.config || {},
            updated_at: new Date().toISOString()
          });
          
          updatedModels.push(updatedModel);
        } else {
          // Create new model
          const newModel = await AIModel.query().insert({
            provider_id: providerId,
            model_name: modelData.model_name || modelData.model_id,
            model_id: modelData.model_id,
            is_active: true,
            context_length: modelData.context_length,
            max_tokens: modelData.max_tokens,
            is_chat_model: modelData.is_chat_model !== false, // Default to true if not specified
            is_embedding_model: modelData.is_embedding_model || false,
            config: modelData.config || {}
          });
          
          updatedModels.push(newModel);
        }
      }
      
      // Reload the provider models cache
      await this.loadProvidersAndModels();
      
      this.logger.info(`Synced ${updatedModels.length} models for provider: ${provider.name}`);
      return updatedModels;
    } catch (error) {
      this.logger.error(`Failed to sync models for provider ${provider.name}:`, error);
      throw new ProviderError(
        `Failed to sync models: ${error.message}`,
        error.statusCode || 500,
        error
      );
    }
  }

  /**
   * Get all active providers
   * @returns {Array} List of active providers with their models
   */
  getActiveProviders() {
    return Array.from(this.providerCache.values());
  }

  /**
   * Get all active models
   * @param {string} [providerId] - Optional provider ID to filter by
   * @returns {Array} List of active models
   */
  getActiveModels(providerId) {
    const models = [];
    
    for (const [key, model] of this.modelCache.entries()) {
      if (!providerId || model.provider_id === providerId) {
        models.push(model);
      }
    }
    
    return models;
  }

  /**
   * Get the rate limit status for a provider
   * @param {string} providerId - The provider ID
   * @returns {Promise<Object>} The rate limit status
   */
  async getRateLimitStatus(providerId) {
    const provider = this.providerCache.get(providerId);
    if (!provider) {
      throw new ValidationError(`Provider not found: ${providerId}`);
    }
    
    return ProviderRateLimit.getRateLimitStatus(providerId);
  }

  /**
   * Get the model cache key
   * @private
   */
  getModelCacheKey(providerId, modelId) {
    return `${providerId}:${modelId}`;
  }
}

// Create a singleton instance
const llmGateway = new LLMGateway();

module.exports = llmGateway;
