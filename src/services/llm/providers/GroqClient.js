/**
 * Groq Client - Implementation for Groq API integration
 * 
 * Provides chat completion, streaming, and embedding generation capabilities
 * using the Groq API with proper error handling and rate limiting.
 */

const axios = require('axios');
const BaseProviderClient = require('./BaseProviderClient');

class GroqClient extends BaseProviderClient {
  constructor(config) {
    super(config);
    
    // Initialize Groq client
    this.baseURL = config.base_url || 'https://api.groq.com/openai/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 60000,
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json'
      }
    });

    // Provider-specific configuration
    this.defaultModel = config.default_model || 'llama3-8b-8192';
    this.embeddingModel = config.embedding_model || 'llama3-8b-8192';
    this.maxTokens = config.max_tokens || 4000;
    this.temperature = config.temperature || 0.7;

    this.logger.info('🤖 Groq client initialized');
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
        const response = await this.client.post('/chat/completions', requestOptions);
        return this.formatCompletionResponse(response.data);
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
      this.logger.debug(`🔍 Creating embeddings with model: ${model || this.embeddingModel}`);

      const response = await this.client.post('/embeddings', {
        model: model || this.embeddingModel,
        input: Array.isArray(input) ? input : [input]
      });

      return this.formatEmbeddingResponse(response.data);

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
      const response = await this.client.post('/chat/completions', options, {
        responseType: 'stream'
      });

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              // Stream complete
              if (onData) {
                onData({
                  content: '',
                  chunk: null,
                  isComplete: true,
                  fullContent: fullContent,
                  usage: usage
                });
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                const content = parsed.choices[0].delta.content || '';
                fullContent += content;

                // Call the data callback
                if (onData) {
                  onData({
                    content: content,
                    chunk: parsed,
                    isComplete: false
                  });
                }
              }

              // Update usage if available
              if (parsed.usage) {
                usage = parsed.usage;
              }

            } catch (parseError) {
              this.logger.warn('Failed to parse streaming chunk:', parseError.message);
            }
          }
        }
      });

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
   * Format messages for Groq API
   * @param {Array} messages - Array of message objects
   * @returns {Array} Formatted messages
   */
  formatMessages(messages) {
    return messages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  /**
   * Format completion response
   * @param {Object} response - Groq response
   * @returns {Object} Formatted response
   */
  formatCompletionResponse(response) {
    return {
      content: response.choices[0]?.message?.content || '',
      model: response.model,
      usage: response.usage,
      finish_reason: response.choices[0]?.finishReason,
      id: response.id,
      created: response.created,
      object: response.object
    };
  }

  /**
   * Format embedding response
   * @param {Object} response - Groq response
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
    let errorMessage = `Groq ${operation} failed`;
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = `Invalid request: ${error.response.data?.error?.message || 'Bad request'}`;
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
          errorMessage = 'Groq server error. Please try again later.';
          break;
        default:
          errorCode = `HTTP_${status}`;
          errorMessage = `HTTP ${status}: ${error.response.data?.error?.message || 'Unknown error'}`;
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
   * Get available models
   * @returns {Promise<Array>} List of available models
   */
  async getModels() {
    try {
      const response = await this.client.get('/models');
      return response.data.data.map(model => ({
        id: model.id,
        name: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by
      }));
    } catch (error) {
      this.logger.error('❌ Failed to get Groq models:', error.message);
      return [];
    }
  }

  /**
   * Get provider capabilities
   * @returns {Object} Provider capabilities
   */
  getCapabilities() {
    return {
      provider: 'groq',
      models: [
        'llama3-8b-8192',
        'llama3-70b-8192',
        'mixtral-8x7b-32768',
        'gemma-7b-it',
        'llama2-70b-4096'
      ],
      features: {
        chat_completion: true,
        streaming: true,
        embeddings: true,
        function_calling: false,
        tool_calling: false
      },
      limits: {
        max_tokens: 8192, // Depends on model
        max_requests_per_minute: 1000,
        max_tokens_per_minute: 50000
      }
    };
  }

  /**
   * Get authentication headers
   * @protected
   * @returns {Object} Headers for authentication
   */
  _getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.config.api_key}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test the connection to Groq
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      // Test with a minimal request
      const response = await this.client.post('/chat/completions', {
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1
      });
      
      this.logger.info('✅ Groq connection test successful');
      return true;
    } catch (error) {
      this.logger.error('❌ Groq connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = GroqClient; 