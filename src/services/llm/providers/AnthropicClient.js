const { BaseProviderClient } = require('../BaseProviderClient');
const { ConfigurationError } = require('../../../utils/errors');
const config = require('../../../config/llmProviders').anthropic;

// Default configuration
const DEFAULT_CONFIG = {
  defaultModel: 'claude-3-opus-20240229',
  apiVersion: '2023-06-01',
  maxRetries: 3,
  timeout: 30000, // 30 seconds
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  topK: null,
  stopSequences: [],
};

/**
 * Client for interacting with the Anthropic API
 */
class AnthropicClient extends BaseProviderClient {
  /**
   * Create a new Anthropic client
   * @param {Object} config - Configuration options
   * @param {Object} config.provider - Provider configuration from database
   * @param {Object} logger - Logger instance
   */
  constructor({ provider, logger }) {
    super({ provider, logger });
    
    // Merge provider config with defaults
    const providerConfig = { 
      ...DEFAULT_CONFIG, 
      ...(provider.config || {}) 
    };
    
    this.name = provider.name || config?.name || 'Anthropic';
    this.baseUrl = provider.base_url || config?.baseUrl || 'https://api.anthropic.com/v1';
    this.apiKey = provider.api_key || process.env.ANTHROPIC_API_KEY;
    this.apiVersion = provider.api_version || config?.apiVersion || '2023-06-01';
    
    // Set model configurations
    this.defaultModel = provider.config?.default_model || config?.defaultModel || 'claude-3-opus-20240229';
    this.defaultEmbeddingModel = this.defaultModel; // Anthropic doesn't have dedicated embedding models
    
    // Set request parameters
    this.timeout = provider.config?.timeout || providerConfig.timeout;
    this.maxRetries = provider.config?.max_retries || providerConfig.maxRetries;
    this.temperature = provider.config?.temperature ?? providerConfig.temperature;
    this.maxTokens = provider.config?.max_tokens ?? providerConfig.maxTokens;
    this.topP = provider.config?.top_p ?? providerConfig.topP;
    this.topK = provider.config?.top_k ?? providerConfig.topK;
    this.stopSequences = provider.config?.stop_sequences || providerConfig.stopSequences;
    this.stream = provider.config?.stream ?? false;
    
    // Initialize models from config
    this.models = new Map();
    const modelConfigs = { 
      ...(config?.models || {}), 
      ...(provider.config?.models || {}) 
    };
    
    for (const [modelId, modelConfig] of Object.entries(modelConfigs)) {
      this.models.set(modelId, {
        id: modelId,
        name: modelConfig.name || modelId,
        maxTokens: modelConfig.maxTokens || 100000, // Default to 100k for Claude models
        maxOutputTokens: modelConfig.maxOutputTokens || 4096,
        isChatModel: true, // All Anthropic models are chat models
        isInstructModel: false,
        isEmbeddingModel: false, // Anthropic doesn't have dedicated embedding models
        supportsFunctionCalling: modelConfig.supportsFunctionCalling !== false,
        supportsParallelFunctionCalls: modelConfig.supportsParallelFunctionCalls === true,
        supportsVision: modelConfig.supportsVision === true,
        ...modelConfig
      });
    }
    
    // Set feature flags
    this.supportsParallelFunctionCalls = false; // As of Claude 3, check docs for updates
    this.supportsFunctionCalling = true;
    this.supportsStreaming = true;
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
    const endpoint = '/messages';
    
    try {
      // Prepare the request body
      const body = {
        model: model || this.defaultModel,
        messages: this._prepareMessages(messages),
        ...this._mapOptionsToAnthropic(options),
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
      this.logger.error('Anthropic chat completion failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        model,
        messageCount: messages?.length,
      });
      
      throw this._enhanceError(error, {
        provider: 'anthropic',
        requestId,
        model,
        endpoint,
      });
    }
  }

  /**
   * Create an embedding for the given input
   * @param {Object} params - The parameters for creating an embedding
   * @param {string|string[]} params.input - The input text or array of texts to embed
   * @param {string} [params.model] - The model to use (default: from config)
   * @returns {Promise<Object>} The embedding response
   */
  async createEmbedding({ input, model = this.defaultEmbeddingModel }) {
    // Anthropic doesn't have a dedicated embeddings endpoint as of Claude 3
    // We'll simulate it by using the chat completion API
    const requestId = uuidv4();
    const endpoint = '/messages';
    
    try {
      const texts = Array.isArray(input) ? input : [input];
      const embeddings = [];
      
      // Process each text individually
      for (const text of texts) {
        const response = await this._makeRequest({
          method: 'POST',
          endpoint,
          body: {
            model,
            messages: [
              {
                role: 'user',
                content: `Return a numerical embedding vector for the following text. The embedding should capture the semantic meaning of the text. Only return the comma-separated numbers, nothing else.\n\nText: ${text}`
              }
            ],
            max_tokens: 1000,
            temperature: 0,
          },
        });
        
        if (response.content && response.content[0] && response.content[0].text) {
          // Parse the comma-separated numbers into an array of floats
          const embedding = response.content[0].text
            .split(',')
            .map(num => parseFloat(num.trim()))
            .filter(num => !isNaN(num));
          
          if (embedding.length > 0) {
            embeddings.push(embedding);
          } else {
            embeddings.push(Array(1536).fill(0)); // Fallback to zero vector
          }
        } else {
          embeddings.push(Array(1536).fill(0)); // Fallback to zero vector
        }
      }
      
      // Return in a format similar to OpenAI's embeddings
      return {
        object: 'list',
        data: embeddings.map((embedding, index) => ({
          object: 'embedding',
          embedding,
          index,
        })),
        model,
        usage: {
          prompt_tokens: 0, // Not available in this simulation
          total_tokens: 0, // Not available in this simulation
        },
      };
      
    } catch (error) {
      this.logger.error('Anthropic embedding creation failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        model,
        inputType: Array.isArray(input) ? 'array' : 'string',
      });
      
      throw this._enhanceError(error, {
        provider: 'anthropic',
        requestId,
        model,
        endpoint,
      });
    }
  }

  /**
   * Get available models
   * @param {string} [modelId] - Optional model ID to get details for a specific model
   * @returns {Promise<Array|Object>} List of available models or details for a specific model
   */
  async getModels(modelId = null) {
    try {
      // If a specific model ID is requested, return just that model
      if (modelId) {
        const model = this.models.get(modelId);
        if (!model) {
          throw new Error(`Model ${modelId} not found`);
        }
        return this._formatModelInfo(model);
      }
      
      // Return all models as an array
      return Array.from(this.models.values()).map(model => this._formatModelInfo(model));
    } catch (error) {
      this.logger.error('Failed to get models', { error: error.message, stack: error.stack });
      
      // Fallback to a default set of models if available in config
      if (config?.models) {
        this.logger.warn('Using fallback models from config');
        return Object.entries(config.models).map(([id, modelConfig]) => ({
          id,
          name: modelConfig.name || id,
          provider: 'anthropic',
          is_chat_model: true, // All Anthropic models are chat models
          is_embedding_model: false, // Anthropic doesn't have dedicated embedding models
          max_tokens: modelConfig.maxTokens || 100000,
          max_output_tokens: modelConfig.maxOutputTokens || 4096,
          supports_function_calling: modelConfig.supportsFunctionCalling !== false,
          supports_parallel_function_calls: modelConfig.supportsParallelFunctionCalls === true,
          supports_vision: modelConfig.supportsVision === true,
          ...modelConfig
        }));
      }
      
      // If no config is available, return a minimal set of known models
      this.logger.warn('No model config available, returning minimal model info');
      return [
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          provider: 'anthropic',
          is_chat_model: true,
          is_embedding_model: false,
          max_tokens: 200000,
          max_output_tokens: 4096,
          supports_function_calling: true,
          supports_parallel_function_calls: false,
          supports_vision: true,
        }
      ];
    }
  }
  
  /**
   * Format model information for consistency
   * @private
   */
  _formatModelInfo(model) {
    return {
      id: model.id,
      name: model.name || model.id,
      provider: 'anthropic',
      is_chat_model: model.isChatModel !== false,
      is_embedding_model: model.isEmbeddingModel === true,
      max_tokens: model.maxTokens || 100000,
      max_output_tokens: model.maxOutputTokens || 4096,
      context_length: model.maxTokens || 100000,
      supports_function_calling: model.supportsFunctionCalling !== false,
      supports_parallel_function_calls: model.supportsParallelFunctionCalls === true,
      supports_vision: model.supportsVision === true,
      config: {
        supports_function_calling: model.supportsFunctionCalling !== false,
        supports_vision: model.supportsVision === true,
      },
      ...model
    };
  }

  /**
   * Get authentication headers
   * @protected
   * @returns {Object} Headers for authentication
   */
  _getAuthHeaders() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  /**
   * Map standard options to Anthropic-specific options
   * @private
   */
  _mapOptionsToAnthropic(options) {
    const {
      temperature = 1.0,
      max_tokens = 4096,
      top_p = 1.0,
      top_k,
      stop_sequences = [],
      ...rest
    } = options;
    
    const mapped = {
      temperature,
      max_tokens: Math.min(max_tokens, 4096), // Claude has a max of 4096 tokens
      top_p,
      ...rest,
    };
    
    if (top_k) {
      mapped.top_k = top_k;
    }
    
    // Limit stop sequences to max allowed by Anthropic
    if (stop_sequences && stop_sequences.length > 0) {
      mapped.stop_sequences = stop_sequences.slice(0, this.maxStopSequences);
    }
    
    return mapped;
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
        throw new Error('No response received from Anthropic API');
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
        id: `msg_${requestId.replace(/-/g, '')}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: body.model,
        stop_reason: null,
        stop_sequence: null,
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
      }
    }
    
    return event;
  }

  /**
   * Transform chat completion response to standard format
   * @private
   */
  _transformChatCompletionResponse(response) {
    if (!response || !response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format from Anthropic API');
    }
    
    // Combine all text content from the response
    const content = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n\n');
    
    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: response.stop_reason,
      }],
      usage: response.usage ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      } : null,
    };
  }

  /**
   * Transform streaming chunk to standard format
   * @private
   */
  _transformStreamingChunk(chunk) {
    // Handle different types of chunks
    if (chunk.type === 'message_start') {
      return {
        id: chunk.message.id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: chunk.message.model,
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            content: '',
          },
        }],
      };
    } else if (chunk.type === 'content_block_delta' && chunk.delta && chunk.delta.text) {
      return {
        id: chunk.message_id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: chunk.model,
        choices: [{
          index: 0,
          delta: {
            content: chunk.delta.text,
          },
        }],
      };
    } else if (chunk.type === 'message_delta') {
      return {
        id: chunk.message_id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: chunk.model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: chunk.delta.stop_reason || null,
        }],
        usage: chunk.usage ? {
          prompt_tokens: chunk.usage.input_tokens,
          completion_tokens: chunk.usage.output_tokens,
          total_tokens: chunk.usage.input_tokens + chunk.usage.output_tokens,
        } : null,
      };
    } else if (chunk.type === 'message_stop') {
      return { done: true };
    }
    
    // Return a no-op for other chunk types
    return {
      id: chunk.message_id || `chunk_${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chunk.model || 'unknown',
      choices: [],
    };
  }

  /**
   * Prepare messages for the Anthropic API
   * @private
   */
  _prepareMessages(messages) {
    return messages.map(msg => {
      // Skip system messages in the middle of the conversation
      if (msg.role === 'system' && messages.indexOf(msg) > 0) {
        return null;
      }
      
      // Convert to Anthropic message format
      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };
      } else if (msg.role === 'system') {
        // System messages should be part of the first user message
        return {
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
          ],
        };
      } else {
        // User or function messages
        return {
          role: 'user',
          content: typeof msg.content === 'string' 
            ? msg.content 
            : JSON.stringify(msg.content),
        };
      }
    }).filter(Boolean); // Remove any null entries
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

module.exports = AnthropicClient;
