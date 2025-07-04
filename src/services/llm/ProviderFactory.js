const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

// Import provider clients
const OpenAIClient = require('./providers/OpenAIClient');
const AnthropicClient = require('./providers/AnthropicClient');

// Map of provider types to their client classes
const PROVIDER_CLIENTS = {
  openai: OpenAIClient,
  anthropic: AnthropicClient,
  // Add other providers here as they are implemented
};

/**
 * Factory for creating and managing LLM provider clients
 */
class ProviderFactory extends EventEmitter {
  /**
   * Create a new ProviderFactory
   * @param {Object} options - Configuration options
   * @param {Object} options.logger - Logger instance
   * @param {Object} options.db - Database connection or ORM instance
   */
  constructor({ logger, db } = {}) {
    super();
    this.logger = logger || console;
    this.db = db;
    this.providers = new Map(); // provider_id -> provider instance
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Initialize the factory by loading all active providers from the database
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
        this.logger.info('Initializing ProviderFactory');
        
        if (!this.db) {
          throw new Error('Database connection is required for ProviderFactory');
        }

        // Load all active providers from the database
        const { AIProvider } = require('../../models');
        const providers = await AIProvider.query()
          .where('is_active', true)
          .withGraphFetched('models');

        // Initialize each provider
        for (const provider of providers) {
          try {
            await this.addProvider(provider);
            this.logger.info(`Initialized provider: ${provider.name} (${provider.provider_type})`);
          } catch (error) {
            this.logger.error(`Failed to initialize provider ${provider.name}:`, error);
          }
        }

        this.initialized = true;
        this.logger.info(`ProviderFactory initialized with ${this.providers.size} providers`);
      } catch (error) {
        this.logger.error('Failed to initialize ProviderFactory:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Add a new provider to the factory
   * @param {Object} provider - Provider configuration from database
   * @returns {Promise<BaseProviderClient>} The created provider client
   */
  async addProvider(provider) {
    const providerId = provider.id || provider.provider_id;
    
    if (!providerId) {
      throw new Error('Provider ID is required');
    }
    
    if (this.providers.has(providerId)) {
      this.logger.warn(`Provider with ID ${providerId} already exists`);
      return this.providers.get(providerId);
    }
    
    const providerType = provider.provider_type.toLowerCase();
    const ProviderClient = PROVIDER_CLIENTS[providerType];
    
    if (!ProviderClient) {
      throw new Error(`Unsupported provider type: ${providerType}`);
    }
    
    try {
      // Create a new provider instance
      const providerInstance = new ProviderClient({
        provider,
        logger: this.logger,
      });
      
      // Store the provider
      this.providers.set(providerId, providerInstance);
      
      // Forward events from the provider
      providerInstance.on('error', (error) => {
        this.emit('error', { providerId, error });
      });
      
      providerInstance.on('usage', (usage) => {
        this.emit('usage', { providerId, ...usage });
      });
      
      this.logger.info(`Added provider: ${provider.name} (${providerType})`);
      
      return providerInstance;
    } catch (error) {
      this.logger.error(`Failed to create provider ${provider.name}:`, error);
      throw new Error(`Failed to create provider ${provider.name}: ${error.message}`);
    }
  }

  /**
   * Remove a provider from the factory
   * @param {string} providerId - The ID of the provider to remove
   * @returns {boolean} True if the provider was removed, false otherwise
   */
  removeProvider(providerId) {
    if (!this.providers.has(providerId)) {
      return false;
    }
    
    // Clean up event listeners
    const provider = this.providers.get(providerId);
    provider.removeAllListeners();
    
    // Remove the provider
    this.providers.delete(providerId);
    this.logger.info(`Removed provider: ${providerId}`);
    
    return true;
  }

  /**
   * Get a provider by ID
   * @param {string} providerId - The ID of the provider to get
   * @returns {BaseProviderClient|undefined} The provider client, or undefined if not found
   */
  getProvider(providerId) {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers
   * @returns {Map<string, BaseProviderClient>} Map of provider ID to provider instance
   */
  getProviders() {
    return new Map(this.providers);
  }

  /**
   * Get a model by ID across all providers
   * @param {string} modelId - The ID of the model to find
   * @returns {Object|null} The model and its provider, or null if not found
   */
  async getModel(modelId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    for (const [providerId, provider] of this.providers.entries()) {
      try {
        // Check if the provider has a getModel method
        if (typeof provider.getModel === 'function') {
          const model = await provider.getModel(modelId);
          if (model) {
            return { model, providerId, provider };
          }
        }
        
        // Fallback: Check if the provider has a listModels method
        if (typeof provider.listModels === 'function') {
          const models = await provider.listModels();
          const model = models.find(m => m.id === modelId || m.name === modelId);
          if (model) {
            return { model, providerId, provider };
          }
        }
      } catch (error) {
        this.logger.error(`Error getting model ${modelId} from provider ${providerId}:`, error);
      }
    }
    
    return null;
  }

  /**
   * Get a chat completion from the best available provider
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
    
    // If a specific provider is requested, use it
    if (providerId) {
      const provider = this.getProvider(providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
      }
      
      return provider.createChatCompletion({
        model,
        messages,
        options,
        stream,
        onData,
      });
    }
    
    // If a specific model is requested, find its provider
    if (model) {
      const modelInfo = await this.getModel(model);
      if (modelInfo) {
        return modelInfo.provider.createChatCompletion({
          model,
          messages,
          options,
          stream,
          onData,
        });
      }
    }
    
    // No specific provider or model requested, try each provider in order
    const errors = [];
    
    for (const [id, provider] of this.providers.entries()) {
      try {
        return await provider.createChatCompletion({
          model,
          messages,
          options,
          stream,
          onData,
        });
      } catch (error) {
        errors.push(`Provider ${id}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`All providers failed: ${errors.join('; ')}`);
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
    
    // If a specific provider is requested, use it
    if (providerId) {
      const provider = this.getProvider(providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
      }
      
      return provider.createEmbedding({ input, model });
    }
    
    // If a specific model is requested, find its provider
    if (model) {
      const modelInfo = await this.getModel(model);
      if (modelInfo) {
        return modelInfo.provider.createEmbedding({ input, model });
      }
    }
    
    // No specific provider or model requested, try each provider in order
    const errors = [];
    
    for (const [id, provider] of this.providers.entries()) {
      try {
        return await provider.createEmbedding({ input, model });
      } catch (error) {
        errors.push(`Provider ${id}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`All providers failed: ${errors.join('; ')}`);
  }

  /**
   * Sync models for a provider
   * @param {string} providerId - The ID of the provider to sync
   * @returns {Promise<Array>} List of synced models
   */
  async syncProviderModels(providerId) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    
    if (typeof provider.listModels !== 'function') {
      throw new Error(`Provider ${providerId} does not support model syncing`);
    }
    
    try {
      const models = await provider.listModels();
      
      // Update the database with the latest models
      const { AIModel, ModelCapability } = require('../../models');
      const { transaction } = require('objection');
      
      return await transaction(AIModel.knex(), async (trx) => {
        // Mark all existing models as inactive
        await AIModel.query(trx)
          .where('provider_id', providerId)
          .patch({ is_active: false });
        
        const savedModels = [];
        
        // Add or update models
        for (const model of models) {
          const modelData = {
            provider_id: providerId,
            name: model.name || model.id,
            model_id: model.id,
            description: model.description || '',
            is_active: true,
            is_chat_model: model.is_chat_model || false,
            is_embedding_model: model.is_embedding_model || false,
            context_length: model.context_length || 0,
            max_tokens: model.max_tokens || 0,
            config: model.config || {},
          };
          
          // Insert or update the model
          const [savedModel] = await AIModel.query(trx)
            .insert(modelData)
            .onConflict(['provider_id', 'model_id'])
            .merge()
            .returning('*');
          
          // Update capabilities if provided
          if (model.capabilities && Array.isArray(model.capabilities)) {
            // Delete existing capabilities
            await ModelCapability.query(trx)
              .where('model_id', savedModel.id)
              .delete();
            
            // Add new capabilities
            const capabilities = model.capabilities.map(capability => ({
              model_id: savedModel.id,
              capability,
            }));
            
            if (capabilities.length > 0) {
              await ModelCapability.query(trx).insert(capabilities);
            }
            
            savedModel.capabilities = capabilities;
          }
          
          savedModels.push(savedModel);
        }
        
        return savedModels;
      });
    } catch (error) {
      this.logger.error(`Failed to sync models for provider ${providerId}:`, error);
      throw new Error(`Failed to sync models: ${error.message}`);
    }
  }

  /**
   * Close all provider connections and clean up resources
   */
  async close() {
    this.logger.info('Closing ProviderFactory');
    
    // Close all providers
    for (const [id, provider] of this.providers.entries()) {
      try {
        if (typeof provider.close === 'function') {
          await provider.close();
        }
      } catch (error) {
        this.logger.error(`Error closing provider ${id}:`, error);
      }
    }
    
    this.providers.clear();
    this.initialized = false;
    this.initializationPromise = null;
    
    this.logger.info('ProviderFactory closed');
  }
}

// Create a singleton instance
let instance = null;

/**
 * Get or create the singleton ProviderFactory instance
 * @param {Object} options - Configuration options
 * @returns {ProviderFactory} The singleton instance
 */
function getProviderFactory(options = {}) {
  if (!instance) {
    instance = new ProviderFactory(options);
  }
  return instance;
}

module.exports = {
  ProviderFactory,
  getProviderFactory,
};
