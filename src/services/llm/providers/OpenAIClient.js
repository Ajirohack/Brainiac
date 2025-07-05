const BaseProviderClient = require('./BaseProviderClient');
const { ConfigurationError } = require('../../../utils/errors');
const config = require('../../../config/llmProviders').openai;
const { OpenAI } = require('openai');

// Default model configurations
const DEFAULT_CONFIG = {
  defaultModel: 'gpt-4-turbo',
  defaultEmbeddingModel: 'text-embedding-3-small',
  models: {
    'gpt-4o': { maxTokens: 128000, maxOutputTokens: 4096 },
    'gpt-4-turbo': { maxTokens: 128000, maxOutputTokens: 4096 },
    'gpt-4': { maxTokens: 8192, maxOutputTokens: 4096 },
    'gpt-3.5-turbo': { maxTokens: 16385, maxOutputTokens: 4096 },
    'text-embedding-3-small': { maxTokens: 8191 },
    'text-embedding-3-large': { maxTokens: 8191 }
  }
};

/**
 * OpenAI Client - Implementation for OpenAI API integration
 * 
 * Provides chat completion, embedding generation, and streaming capabilities
 * using the OpenAI API with proper error handling and rate limiting.
 */

class OpenAIClient extends BaseProviderClient {
  /**
   * Create a new OpenAI client
   * @param {Object} config - Configuration options
   * @param {Object} config.provider - Provider configuration from database
   * @param {Object} logger - Logger instance
   */
  constructor({ provider, logger }) {
    super({ provider, logger });
    this.name = provider.name || 'OpenAI';
    this.baseUrl = provider.base_url || config?.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = provider.api_key || process.env.OPENAI_API_KEY;
    this.organization = provider.organization_id || process.env.OPENAI_ORGANIZATION_ID;
    this.project = provider.project_id || process.env.OPENAI_PROJECT_ID;
    this.apiVersion = provider.api_version || config?.apiVersion || '2023-05-15';
    
    // Merge provider config with defaults
    const providerConfig = { ...DEFAULT_CONFIG, ...(provider.config || {}) };
    this.defaultModel = provider.config?.default_model || providerConfig.defaultModel;
    this.defaultEmbeddingModel = provider.config?.default_embedding_model || providerConfig.defaultEmbeddingModel;
    this.timeout = provider.config?.timeout || 30000; // 30 seconds
    this.maxRetries = provider.config?.max_retries || 3;
    this.temperature = provider.config?.temperature ?? 0.7;
    this.maxTokens = provider.config?.max_tokens;
    this.topP = provider.config?.top_p ?? 1;
    this.frequencyPenalty = provider.config?.frequency_penalty ?? 0;
    this.presencePenalty = provider.config?.presence_penalty ?? 0;
    this.stopSequences = provider.config?.stop_sequences || [];
    this.stream = provider.config?.stream ?? false;
    this.supportsParallelFunctionCalls = true;
    this.supportsFunctionCalling = true;
    this.supportsStreaming = true;
    
    // Initialize models from config
    this.models = new Map();
    const modelConfigs = { ...DEFAULT_CONFIG.models, ...(provider.config?.models || {}) };
    
    for (const [modelId, modelConfig] of Object.entries(modelConfigs)) {
      this.models.set(modelId, {
        id: modelId,
        name: modelConfig.name || modelId,
        maxTokens: modelConfig.maxTokens || 4096,
        maxOutputTokens: modelConfig.maxOutputTokens || 4096,
        isChatModel: !modelId.includes('embedding') && !modelId.includes('instruct'),
        isInstructModel: modelId.includes('instruct'),
        isEmbeddingModel: modelId.includes('embedding'),
        supportsFunctionCalling: modelConfig.supportsFunctionCalling !== false,
        supportsParallelFunctionCalls: modelConfig.supportsParallelFunctionCalls !== false,
        supportsVision: modelConfig.supportsVision || modelId.includes('vision') || modelId.includes('4o'),
        ...modelConfig
      });
    }

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      maxRetries: this.maxRetries,
      timeout: this.timeout
    });

    this.logger.info('🤖 OpenAI client initialized');
  }

  /**
   * Create a chat completion
   * @param {Object} params - Completion parameters
   * @param {string} params.model - The model to use
   * @param {Array} params.messages - Array of message objects
   * @param {Object} [params.options] - Additional options
   * @param {boolean} [params.stream] - Whether to stream the response
   * @param {Function} [params.onData] - Callback for streaming data
   * @returns {Promise<Object>} The completion response
   */
  async createChatCompletion({ model, messages, options = {}, stream = false, onData }) {
    try {
      this.logger.debug(`📝 Creating chat completion with model: ${model}`);

      const requestOptions = {
        model: model || this.defaultModel,
        messages: this.formatMessages(messages),
        max_tokens: options.max_tokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        stream: stream,
        ...options
      };

      if (stream && onData) {
        return await this.handleStreamingCompletion(requestOptions, onData);
      } else {
        const response = await this.client.chat.completions.create(requestOptions);
        return this.formatCompletionResponse(response);
      }

    } catch (error) {
      this.handleError(error, 'chat completion');
    }
  }

  /**
   * Create embeddings
   * @param {Object} params - Embedding parameters
   * @param {string|string[]} params.input - The input text or array of texts
   * @param {string} [params.model] - The model to use
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding({ input, model }) {
    try {
      this.logger.debug(`🔍 Creating embeddings with model: ${model || this.defaultEmbeddingModel}`);

      const response = await this.client.embeddings.create({
        input: Array.isArray(input) ? input : [input],
        model: model || this.defaultEmbeddingModel
      });

      return this.formatEmbeddingResponse(response);

    } catch (error) {
      this.handleError(error, 'embedding generation');
    }
  }

  /**
   * Handle streaming completion
   * @param {Object} options - Request options
   * @param {Function} onData - Data callback
   * @returns {Promise<Object>} Streaming response
   */
  async handleStreamingCompletion(options, onData) {
    try {
      const stream = await this.client.chat.completions.create(options);
      
      let fullContent = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullContent += content;

        // Update usage if available
        if (chunk.usage) {
          usage = chunk.usage;
        }

        // Call the data callback
        if (onData) {
          onData({
            content: content,
            chunk: chunk,
            isComplete: false
          });
        }
      }

      // Send completion signal
      if (onData) {
        onData({
          content: '',
          chunk: null,
          isComplete: true,
          fullContent: fullContent,
          usage: usage
        });
      }

      return {
        content: fullContent,
        usage: usage,
        model: options.model,
        streamed: true
      };

    } catch (error) {
      this.handleError(error, 'streaming completion');
    }
  }

  /**
   * Format messages for OpenAI API
   * @param {Array} messages - Array of message objects
   * @returns {Array} Formatted messages
   */
  formatMessages(messages) {
    return messages.map(message => ({
      role: message.role,
      content: message.content,
      ...(message.name && { name: message.name }),
      ...(message.function_call && { function_call: message.function_call }),
      ...(message.tool_calls && { tool_calls: message.tool_calls })
    }));
  }

  /**
   * Format completion response
   * @param {Object} response - OpenAI response
   * @returns {Object} Formatted response
   */
  formatCompletionResponse(response) {
    return {
      content: response.choices[0]?.message?.content || '',
      model: response.model,
      usage: response.usage,
      finish_reason: response.choices[0]?.finish_reason,
      id: response.id,
      created: response.created,
      object: response.object
    };
  }

  /**
   * Format embedding response
   * @param {Object} response - OpenAI response
   * @returns {Object} Formatted response
   */
  formatEmbeddingResponse(response) {
    return {
      embeddings: response.data.map(item => ({
        embedding: item.embedding,
        index: item.index
      })),
      model: response.model,
      usage: response.usage,
      object: response.object
    };
  }

  /**
   * Handle errors with provider-specific logic
   * @param {Error} error - The error object
   * @param {string} operation - The operation that failed
   */
  handleError(error, operation) {
    let errorMessage = `OpenAI ${operation} failed`;
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = `Invalid request: ${data.error?.message || 'Bad request'}`;
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          errorMessage = 'Invalid API key or authentication failed';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          errorMessage = 'API key does not have permission for this operation';
          break;
        case 429:
          errorCode = 'RATE_LIMIT_EXCEEDED';
          errorMessage = 'Rate limit exceeded. Please try again later.';
          break;
        case 500:
          errorCode = 'SERVER_ERROR';
          errorMessage = 'OpenAI server error. Please try again later.';
          break;
        default:
          errorCode = `HTTP_${status}`;
          errorMessage = `HTTP ${status}: ${data.error?.message || 'Unknown error'}`;
      }
    } else if (error.code) {
      switch (error.code) {
        case 'ECONNRESET':
        case 'ETIMEDOUT':
          errorCode = 'NETWORK_ERROR';
          errorMessage = 'Network connection failed. Please check your internet connection.';
          break;
        default:
          errorCode = error.code;
          errorMessage = error.message;
      }
    } else {
      errorMessage = error.message;
    }

    this.logger.error(`❌ ${errorMessage}`, {
      errorCode,
      operation,
      timestamp: new Date().toISOString()
    });

    const enhancedError = new Error(errorMessage);
    enhancedError.code = errorCode;
    enhancedError.originalError = error;
    enhancedError.operation = operation;

    throw enhancedError;
  }

  /**
   * Get provider capabilities
   * @returns {Object} Provider capabilities
   */
  getCapabilities() {
    return {
      provider: 'openai',
      models: [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k'
      ],
      features: {
        chat_completion: true,
        streaming: true,
        embeddings: true,
        function_calling: true,
        tool_calling: true
      },
      limits: {
        max_tokens: 128000, // GPT-4 Turbo
        max_requests_per_minute: 3500,
        max_tokens_per_minute: 90000
      }
    };
  }

  /**
   * Get authentication headers
   * @protected
   * @returns {Object} Headers for authentication
   */
  _getAuthHeaders() {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
    };
    
    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }
    
    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }
    
    return headers;
  }

  /**
   * Test the connection to OpenAI
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      const response = await this.client.models.list();
      this.logger.info('✅ OpenAI connection test successful');
      return true;
    } catch (error) {
      this.logger.error('❌ OpenAI connection test failed:', error.message);
      return false;
    }
  }

  /**
   * List available models
   * @returns {Promise<Array>} List of available models
   */
  async listModels() {
    const requestId = uuidv4();
    const endpoint = '/models';
    
    try {
      const response = await this._makeRequest({
        method: 'GET',
        endpoint,
      });
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from OpenAI API');
      }
      
      return response.data.map(model => ({
        id: model.id,
        name: model.id,
        provider: 'openai',
        model_id: model.id,
        is_active: true,
        is_chat_model: model.id.startsWith('gpt-'),
        is_embedding_model: model.id.includes('embedding'),
        context_length: this._getModelContextSize(model.id),
        max_tokens: this._getModelMaxTokens(model.id),
        config: {
          supports_function_calling: model.id.startsWith('gpt-'),
          supports_vision: model.id.includes('vision') || model.id.includes('gpt-4-vision'),
        },
      }));
      
    } catch (error) {
      this.logger.error('Failed to list OpenAI models', {
        requestId,
        error: error.message,
        stack: error.stack,
      });
      
      throw this._enhanceError(error, {
        provider: 'openai',
        requestId,
        endpoint,
      });
    }
  }

  /**
   * Get model information
   * @param {string} [modelId] - The model ID to get information for (optional)
   * @returns {Promise<Object|Object[]>} Model information
   */
  async getModels(modelId = null) {
    try {
      // If we have a specific model ID, return just that model
      if (modelId) {
        const model = this.models.get(modelId);
        if (!model) {
          throw new Error(`Model ${modelId} not found`);
        }
        return this._formatModelInfo(model);
      }

      // Otherwise return all models
      return Array.from(this.models.values()).map(model => this._formatModelInfo(model));
    } catch (error) {
      this.logger.error('Failed to get models', { error: error.message, stack: error.stack });
      
      // Fallback to a default set of models if available in config
      if (this.config?.models) {
        this.logger.warn('Using fallback models from config');
        return Object.entries(this.config.models).map(([id, config]) => ({
          id,
          name: config.name || id,
          provider: 'openai',
          is_chat_model: !id.includes('embedding') && !id.includes('instruct'),
          is_embedding_model: id.includes('embedding'),
          is_instruct_model: id.includes('instruct'),
          max_tokens: config.maxTokens || 4096,
          max_output_tokens: config.maxOutputTokens || 4096,
          supports_function_calling: config.supportsFunctionCalling !== false,
          supports_parallel_function_calls: config.supportsParallelFunctionCalls !== false,
          supports_vision: config.supportsVision || id.includes('vision') || id.includes('4o'),
          ...config
        }));
      }
      
      throw error;
    }
  }

  /**
   * Get the context window size for a model
   * @param {string} modelId - The model ID
   * @returns {number} The context window size in tokens
   */
  _getModelContextSize(modelId) {
    const model = this.models.get(modelId);
    return model?.maxTokens || this.config?.defaultContextSize || 4096; // Default to 4k tokens
  }

  /**
   * Get the maximum output tokens for a model
   * @param {string} modelId - The model ID
   * @returns {number} The maximum output tokens
   */
  _getModelMaxOutputTokens(modelId) {
    const model = this.models.get(modelId);
    return model?.maxOutputTokens || this.config?.defaultMaxOutputTokens || 2048; // Default to 2k tokens
  }

  /**
   * Decrypt the API key
   * @private
   */
  _decryptApiKey(encryptedKey, iv) {
    if (!encryptedKey) {
      throw new Error('No API key provided');
    }
    
    // In a real implementation, you would decrypt the key here
    // For security reasons, we'll just return the key as-is in this example
    // In production, use proper encryption/decryption with the IV
    return encryptedKey;
  }
}

module.exports = OpenAIClient;
