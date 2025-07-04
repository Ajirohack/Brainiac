const { BaseProviderClient } = require('../BaseProviderClient');
const { ConfigurationError } = require('../../../utils/errors');
const config = require('../../../config/llmProviders').openai;

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
 * Client for interacting with the OpenAI API
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
    const requestId = uuidv4();
    const endpoint = '/chat/completions';
    
    try {
      // Prepare the request body
      const body = {
        model: model || this.defaultModel,
        messages: this._prepareMessages(messages),
        ...options,
      };
      
      // Handle streaming
      if (stream) {
        return this._handleStreamingRequest({
          endpoint,
          body: { ...body, stream: true },
          onData,
          requestId,
        });
      }
      
      // Make the request
      const response = await this._makeRequest({
        method: 'POST',
        endpoint,
        body,
      });
      
      // Transform the response to a standard format
      return this._transformChatCompletionResponse(response);
      
    } catch (error) {
      this.logger.error('OpenAI chat completion failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        model,
        messageCount: messages?.length,
      });
      
      throw this._enhanceError(error, {
        provider: 'openai',
        requestId,
        model,
        endpoint,
      });
    }
  }

  /**
   * Create embeddings
   * @param {Object} params - Embedding parameters
   * @param {string|string[]} params.input - The input text or array of texts
   * @param {string} [params.model] - The model to use (default: from config)
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding({ input, model = this.defaultEmbeddingModel }) {
    const requestId = uuidv4();
    const endpoint = '/embeddings';
    
    try {
      // Prepare the request body
      const body = {
        model,
        input: Array.isArray(input) ? input : [input],
      };
      
      // Make the request
      const response = await this._makeRequest({
        method: 'POST',
        endpoint,
        body,
      });
      
      // Transform the response to a standard format
      return this._transformEmbeddingResponse(response);
      
    } catch (error) {
      this.logger.error('OpenAI embedding creation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        model,
        inputType: Array.isArray(input) ? 'array' : 'string',
      });
      
      throw this._enhanceError(error, {
        provider: 'openai',
        requestId,
        model,
        endpoint,
      });
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
   * Handle streaming request
   * @private
   */
  async _handleStreamingRequest({ endpoint, body, onData, requestId }) {
    try {
      const response = await this._makeRequest({
        method: 'POST',
        endpoint,
        body,
        stream: true,
      });
      
      if (!response) {
        throw new Error('No response received from OpenAI API');
      }
      
      // Handle the stream
      const reader = response.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      // Process the stream
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // Process complete SSE events
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.trim() === '') continue;
              
              try {
                const event = this._parseSSEEvent(line);
                
                if (event.data === '[DONE]') {
                  // End of stream
                  if (onData) {
                    onData({ done: true });
                  }
                  return;
                }
                
                const data = JSON.parse(event.data);
                
                // Transform the chunk to a standard format
                const transformed = this._transformStreamingChunk(data);
                
                // Emit the chunk
                if (onData) {
                  onData({
                    ...transformed,
                    done: false,
                  });
                }
                
                this.emit('chunk', transformed);
                
              } catch (parseError) {
                this.logger.error('Error parsing SSE event', {
                  requestId,
                  error: parseError.message,
                  data: line,
                });
              }
            }
          }
          
          // Handle any remaining data in the buffer
          if (buffer.trim()) {
            try {
              const event = this._parseSSEEvent(buffer);
              if (event.data !== '[DONE]') {
                const data = JSON.parse(event.data);
                const transformed = this._transformStreamingChunk(data);
                
                if (onData) {
                  onData({
                    ...transformed,
                    done: true,
                  });
                }
                
                this.emit('chunk', {
                  ...transformed,
                  done: true,
                });
              }
            } catch (e) {
              this.logger.error('Error processing final chunk', {
                requestId,
                error: e.message,
                data: buffer,
              });
            }
          }
          
          // Signal completion
          if (onData) {
            onData({ done: true });
          }
          
        } catch (error) {
          this.logger.error('Error processing stream', {
            requestId,
            error: error.message,
            stack: error.stack,
          });
          
          if (onData) {
            onData({
              error: this._enhanceError(error, { requestId }),
              done: true,
            });
          }
          
          throw error;
        }
      };
      
      // Start processing the stream
      processStream().catch(error => {
        this.logger.error('Stream processing failed', {
          requestId,
          error: error.message,
          stack: error.stack,
        });
      });
      
      // Return a dummy response for streaming
      return {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [],
        usage: null,
        streaming: true,
      };
      
    } catch (error) {
      this.logger.error('Streaming request failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        endpoint,
      });
      
      throw this._enhanceError(error, { requestId });
    }
  }

  /**
   * Parse an SSE event
   * @private
   */
  _parseSSEEvent(data) {
    const event = {
      data: '',
      event: null,
      id: null,
      retry: null,
    };
    
    const lines = data.split(/\r?\n/);
    
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (!match) continue;
      
      const [, key, value] = match;
      
      switch (key.toLowerCase()) {
        case 'event':
          event.event = value;
          break;
        case 'data':
          event.data = value;
          break;
        case 'id':
          event.id = value;
          break;
        case 'retry':
          event.retry = parseInt(value, 10);
          break;
      }
    }
    
    return event;
  }

  /**
   * Transform chat completion response to standard format
   * @private
   */
  _transformChatCompletionResponse(response) {
    if (!response || !response.choices || !Array.isArray(response.choices)) {
      throw new Error('Invalid response format from OpenAI API');
    }
    
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content,
          function_call: choice.message.function_call,
        },
        finish_reason: choice.finish_reason,
      })),
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      } : null,
    };
  }

  /**
   * Transform streaming chunk to standard format
   * @private
   */
  _transformStreamingChunk(chunk) {
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      throw new Error('Invalid chunk format from OpenAI API');
    }
    
    return {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: chunk.choices.map(choice => ({
        index: choice.index,
        delta: {
          role: choice.delta.role,
          content: choice.delta.content || '',
          function_call: choice.delta.function_call,
        },
        finish_reason: choice.finish_reason,
      })),
    };
  }

  /**
   * Transform embedding response to standard format
   * @private
   */
  _transformEmbeddingResponse(response) {
    if (!response || !response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid embedding response format from OpenAI API');
    }
    
    return {
      object: response.object,
      data: response.data.map(item => ({
        object: item.object,
        embedding: item.embedding,
        index: item.index,
      })),
      model: response.model,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        total_tokens: response.usage.total_tokens,
      } : null,
    };
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

  /**
   * Prepare messages for the OpenAI API
   * @private
   */
  _prepareMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name }),
      ...(msg.function_call && { function_call: msg.function_call }),
    }));
  }
}

module.exports = OpenAIClient;
