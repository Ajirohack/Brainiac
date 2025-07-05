const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

// Import provider clients
const OpenAIClient = require('./providers/OpenAIClient');
const AnthropicClient = require('./providers/AnthropicClient');
const MistralClient = require('./providers/MistralClient');
const OllamaClient = require('./providers/OllamaClient');
const GroqClient = require('./providers/GroqClient');
const HuggingFaceClient = require('./providers/HuggingFaceClient');

// Map of provider types to their client classes
const PROVIDER_CLIENTS = {
  openai: OpenAIClient,
  anthropic: AnthropicClient,
  mistral: MistralClient,
  ollama: OllamaClient,
  groq: GroqClient,
  huggingface: HuggingFaceClient,
  // Add other providers here as they are implemented
};

/**
 * Provider Factory - Manages LLM provider instances and configuration
 * 
 * Provides centralized provider management, registration, selection,
 * and configuration validation for all LLM providers in the CAI Platform.
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
    // Ensure logger has required methods
    this.logger = logger || {
      info: console.log.bind(console, '[INFO]'),
      error: console.error.bind(console, '[ERROR]'),
      warn: console.warn.bind(console, '[WARN]'),
      debug: console.debug ? console.debug.bind(console, '[DEBUG]') : console.log.bind(console, '[DEBUG]'),
    };
    
    this.db = db;
    this.providers = new Map(); // provider_id -> provider instance
    this.initialized = false;
    this.initializationPromise = null;
    this.config = {
      defaultProvider: 'openai',
      providers: {},
    };

    // Use safe logging
    if (typeof this.logger.info === 'function') {
      this.logger.info('🏭 Provider factory initialized');
    } else {
      console.log('🏭 Provider factory initialized (fallback logger)');
    }
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
   * Register a provider with configuration
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @returns {boolean} Registration success
   */
  registerProvider(providerName, config) {
    try {
      this.logger.debug(`📝 Registering provider: ${providerName}`);

      // Validate configuration
      const validatedConfig = this.validateProviderConfig(providerName, config);
      if (!validatedConfig) {
        throw new Error(`Invalid configuration for provider: ${providerName}`);
      }

      // Store provider configuration
      this.config.providers[providerName] = validatedConfig;

      // Create provider instance
      const provider = this.createProviderInstance(providerName, validatedConfig);
      if (!provider) {
        throw new Error(`Failed to create provider instance: ${providerName}`);
      }

      // Store provider instance
      this.providers.set(providerName, provider);

      // Set as active provider if it's the default
      if (providerName === this.config.defaultProvider) {
        this.activeProvider = provider;
        this.logger.info(`✅ Set ${providerName} as active provider`);
      }

      this.logger.info(`✅ Provider registered: ${providerName}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Failed to register provider: ${providerName}`, {
        error: error.message,
        providerName
      });
      return false;
    }
  }

  /**
   * Create provider instance based on provider name
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @returns {Object|null} Provider instance
   * @private
   */
  createProviderInstance(providerName, config) {
    try {
      const providerType = providerName.toLowerCase();
    const ProviderClient = PROVIDER_CLIENTS[providerType];
    
    if (!ProviderClient) {
      throw new Error(`Unsupported provider type: ${providerType}`);
    }
    
      // Create a new provider instance
      const providerInstance = new ProviderClient(config);
      
      // Store the provider
      this.providers.set(providerName, providerInstance);
      
      // Forward events from the provider
      providerInstance.on('error', (error) => {
        this.emit('error', { providerName, error });
      });
      
      providerInstance.on('usage', (usage) => {
        this.emit('usage', { providerName, ...usage });
      });
      
      this.logger.info(`Added provider: ${providerName} (${providerType})`);
      
      return providerInstance;
    } catch (error) {
      this.logger.error(`❌ Failed to create provider instance: ${providerName}`, {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Validate provider configuration
   * @param {string} providerName - Provider name
   * @param {Object} config - Provider configuration
   * @returns {Object|null} Validated configuration
   * @private
   */
  validateProviderConfig(providerName, config) {
    const requiredFields = this.getRequiredFields(providerName);
    
    for (const field of requiredFields) {
      if (!config[field]) {
        this.logger.error(`❌ Missing required field: ${field} for provider ${providerName}`);
        return null;
      }
    }

    // Provider-specific validation
    switch (providerName.toLowerCase()) {
      case 'openai':
        return this.validateOpenAIConfig(config);
      
      case 'anthropic':
        return this.validateAnthropicConfig(config);
      
      case 'mistral':
        return this.validateMistralConfig(config);
      
      case 'ollama':
        return this.validateOllamaConfig(config);
      
      case 'groq':
        return this.validateGroqConfig(config);
      
      case 'huggingface':
      case 'hf':
        return this.validateHuggingFaceConfig(config);
      
      default:
        return config;
    }
  }

  /**
   * Get required fields for provider
   * @param {string} providerName - Provider name
   * @returns {Array} Required fields
   * @private
   */
  getRequiredFields(providerName) {
    const fieldMap = {
      'openai': ['api_key'],
      'anthropic': ['api_key'],
      'mistral': ['api_key'],
      'ollama': ['base_url'],
      'groq': ['api_key'],
      'huggingface': ['api_key'],
      'hf': ['api_key']
    };

    return fieldMap[providerName.toLowerCase()] || ['api_key'];
  }

  /**
   * Validate OpenAI configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateOpenAIConfig(config) {
    return {
      api_key: config.api_key,
      base_url: config.base_url || 'https://api.openai.com/v1',
      default_model: config.default_model || 'gpt-3.5-turbo',
      embedding_model: config.embedding_model || 'text-embedding-ada-002',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      max_retries: config.max_retries || 3,
      timeout: config.timeout || 60000,
      organization: config.organization,
      project: config.project
    };
  }

  /**
   * Validate Anthropic configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateAnthropicConfig(config) {
    return {
      api_key: config.api_key,
      base_url: config.base_url || 'https://api.anthropic.com',
      default_model: config.default_model || 'claude-3-sonnet-20240229',
      embedding_model: config.embedding_model || 'claude-3-sonnet-20240229',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      max_retries: config.max_retries || 3,
      timeout: config.timeout || 60000
    };
  }

  /**
   * Validate Mistral configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateMistralConfig(config) {
    return {
      api_key: config.api_key,
      base_url: config.base_url || 'https://api.mistral.ai/v1',
      default_model: config.default_model || 'mistral-large-latest',
      embedding_model: config.embedding_model || 'mistral-embed',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      max_retries: config.max_retries || 3,
      timeout: config.timeout || 60000
    };
  }

  /**
   * Validate Ollama configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateOllamaConfig(config) {
    return {
      base_url: config.base_url || 'http://localhost:11434',
      default_model: config.default_model || 'llama2',
      embedding_model: config.embedding_model || 'llama2',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 60000,
      stream: config.stream !== false
    };
  }

  /**
   * Validate Groq configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateGroqConfig(config) {
    return {
      api_key: config.api_key,
      base_url: config.base_url || 'https://api.groq.com/openai/v1',
      default_model: config.default_model || 'llama3-8b-8192',
      embedding_model: config.embedding_model || 'llama3-8b-8192',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      max_retries: config.max_retries || 3,
      timeout: config.timeout || 60000
    };
  }

  /**
   * Validate HuggingFace configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Validated configuration
   * @private
   */
  validateHuggingFaceConfig(config) {
    return {
      api_key: config.api_key,
      base_url: config.base_url || 'https://api-inference.huggingface.co',
      default_model: config.default_model || 'meta-llama/Llama-2-7b-chat-hf',
      embedding_model: config.embedding_model || 'sentence-transformers/all-MiniLM-L6-v2',
      max_tokens: config.max_tokens || 4000,
      temperature: config.temperature || 0.7,
      max_retries: config.max_retries || 3,
      timeout: config.timeout || 60000
    };
  }

  /**
   * Get provider instance
   * @param {string} providerName - Provider name
   * @returns {Object|null} Provider instance
   */
  getProvider(providerName = null) {
    const name = providerName || this.activeProvider?.constructor.name?.toLowerCase().replace('client', '') || this.config.defaultProvider;
    
    const provider = this.providers.get(name);
    if (!provider) {
      this.logger.error(`❌ Provider not found: ${name}`);
      return null;
    }

    return provider;
  }

  /**
   * Set active provider
   * @param {string} providerName - Provider name
   * @returns {boolean} Success status
   */
  setActiveProvider(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      this.logger.error(`❌ Cannot set active provider: ${providerName} not found`);
      return false;
    }
    
    this.activeProvider = provider;
    this.logger.info(`✅ Active provider set to: ${providerName}`);
    return true;
  }

  /**
   * Get all registered providers
   * @returns {Array} Array of provider names
   */
  getRegisteredProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider capabilities
   * @param {string} providerName - Provider name
   * @returns {Object|null} Provider capabilities
   */
  getProviderCapabilities(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return null;
    }

    return provider.getCapabilities ? provider.getCapabilities() : {
      provider: providerName,
      features: {
        chat_completion: true,
        streaming: false,
        embeddings: false
      }
    };
  }

  /**
   * Test provider connection
   * @param {string} providerName - Provider name
   * @returns {Promise<boolean>} Connection status
   */
  async testProviderConnection(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      this.logger.error(`❌ Provider not found for testing: ${providerName}`);
      return false;
    }

    try {
      if (provider.testConnection) {
        return await provider.testConnection();
      }
      
      // Fallback test for providers without testConnection method
      const capabilities = this.getProviderCapabilities(providerName);
      return capabilities !== null;

    } catch (error) {
      this.logger.error(`❌ Provider connection test failed: ${providerName}`, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Test all provider connections
   * @returns {Promise<Object>} Connection test results
   */
  async testAllConnections() {
    const results = {};
    
    for (const [providerName, provider] of this.providers) {
      results[providerName] = await this.testProviderConnection(providerName);
    }

    return results;
  }

  /**
   * Get provider statistics
   * @returns {Object} Provider statistics
   */
  getStats() {
    return {
      totalProviders: this.providers.size,
      registeredProviders: this.getRegisteredProviders(),
      activeProvider: this.activeProvider ? this.activeProvider.constructor.name.replace('Client', '') : null,
      defaultProvider: this.config.defaultProvider
    };
  }

  /**
   * Remove provider
   * @param {string} providerName - Provider name
   * @returns {boolean} Removal success
   */
  removeProvider(providerName) {
    if (!this.providers.has(providerName)) {
      this.logger.warn(`⚠️ Provider not found for removal: ${providerName}`);
      return false;
    }

    // Don't remove if it's the active provider
    if (this.activeProvider === this.providers.get(providerName)) {
      this.logger.error(`❌ Cannot remove active provider: ${providerName}`);
      return false;
    }

    this.providers.delete(providerName);
    delete this.config.providers[providerName];
    
    this.logger.info(`✅ Provider removed: ${providerName}`);
    return true;
  }

  /**
   * Update provider configuration
   * @param {string} providerName - Provider name
   * @param {Object} newConfig - New configuration
   * @returns {boolean} Update success
   */
  updateProviderConfig(providerName, newConfig) {
    if (!this.providers.has(providerName)) {
      this.logger.error(`❌ Provider not found for update: ${providerName}`);
      return false;
    }

    try {
      // Validate new configuration
      const validatedConfig = this.validateProviderConfig(providerName, newConfig);
      if (!validatedConfig) {
        throw new Error(`Invalid configuration for provider: ${providerName}`);
      }

      // Update configuration
      this.config.providers[providerName] = validatedConfig;

      // Recreate provider instance with new config
      const newProvider = this.createProviderInstance(providerName, validatedConfig);
      if (!newProvider) {
        throw new Error(`Failed to recreate provider instance: ${providerName}`);
      }

      // Update provider instance
      this.providers.set(providerName, newProvider);

      // Update active provider if needed
      if (this.activeProvider === this.providers.get(providerName)) {
        this.activeProvider = newProvider;
      }

      this.logger.info(`✅ Provider configuration updated: ${providerName}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Failed to update provider configuration: ${providerName}`, {
        error: error.message
      });
      return false;
    }
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
    
    for (const [providerName, provider] of this.providers.entries()) {
      try {
        // Check if the provider has a getModel method
        if (typeof provider.getModel === 'function') {
          const model = await provider.getModel(modelId);
          if (model) {
            return { model, providerName, provider };
          }
        }
        
        // Fallback: Check if the provider has a listModels method
        if (typeof provider.listModels === 'function') {
          const models = await provider.listModels();
          const model = models.find(m => m.id === modelId || m.name === modelId);
          if (model) {
            return { model, providerName, provider };
          }
        }
      } catch (error) {
        this.logger.error(`Error getting model ${modelId} from provider ${providerName}:`, error);
      }
    }
    
    return null;
  }

  /**
   * Get a chat completion from the best available provider
   * @param {Object} params - Completion parameters
   * @param {string} [params.providerName] - Specific provider name to use
   * @param {string} [params.model] - The model to use
   * @param {Array} params.messages - Array of message objects
   * @param {Object} [params.options] - Additional options
   * @param {boolean} [params.stream] - Whether to stream the response
   * @param {Function} [params.onData] - Callback for streaming data
   * @returns {Promise<Object>} The completion response
   */
  async createChatCompletion({
    providerName,
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
    if (providerName) {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Provider not found: ${providerName}`);
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
    
    for (const [name, provider] of this.providers.entries()) {
      try {
        return await provider.createChatCompletion({
          model,
          messages,
          options,
          stream,
          onData,
        });
      } catch (error) {
        errors.push(`Provider ${name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`All providers failed: ${errors.join('; ')}`);
  }

  /**
   * Create embeddings
   * @param {Object} params - Embedding parameters
   * @param {string} [params.providerName] - Specific provider name to use
   * @param {string|string[]} params.input - The input text or array of texts
   * @param {string} [params.model] - The model to use
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding({ providerName, input, model }) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // If a specific provider is requested, use it
    if (providerName) {
      const provider = this.getProvider(providerName);
      if (!provider) {
        throw new Error(`Provider not found: ${providerName}`);
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
    
    for (const [name, provider] of this.providers.entries()) {
      try {
        return await provider.createEmbedding({ input, model });
      } catch (error) {
        errors.push(`Provider ${name}: ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`All providers failed: ${errors.join('; ')}`);
  }

  /**
   * Sync models for a provider
   * @param {string} providerName - The name of the provider to sync
   * @returns {Promise<Array>} List of synced models
   */
  async syncProviderModels(providerName) {
    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }
    
    if (typeof provider.listModels !== 'function') {
      throw new Error(`Provider ${providerName} does not support model syncing`);
    }
    
    try {
      const models = await provider.listModels();
      
      // Update the database with the latest models
      const { AIModel, ModelCapability } = require('../../models');
      const { transaction } = require('objection');
      
      return await transaction(AIModel.knex(), async (trx) => {
        // Mark all existing models as inactive
        await AIModel.query(trx)
          .where('provider_name', providerName)
          .patch({ is_active: false });
        
        const savedModels = [];
        
        // Add or update models
        for (const model of models) {
          const modelData = {
            provider_name: providerName,
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
            .onConflict(['provider_name', 'model_id'])
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
      this.logger.error(`Failed to sync models for provider ${providerName}:`, error);
      throw new Error(`Failed to sync models: ${error.message}`);
    }
  }

  /**
   * Close all provider connections and clean up resources
   */
  async close() {
    this.logger.info('Closing ProviderFactory');
    
    // Close all providers
    for (const [name, provider] of this.providers.entries()) {
      try {
        if (typeof provider.close === 'function') {
          await provider.close();
        }
      } catch (error) {
        this.logger.error(`Error closing provider ${name}:`, error);
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
