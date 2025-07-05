/**
 * Anthropic Client - Implementation for Anthropic API integration
 * 
 * Provides chat completion, streaming, and embedding generation capabilities
 * using the Anthropic Claude API with proper error handling and rate limiting.
 */

const Anthropic = require('@anthropic-ai/sdk');
const BaseProviderClient = require('./BaseProviderClient');

class AnthropicClient extends BaseProviderClient {
  constructor(config) {
    super(config);
    
    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: config.api_key,
      baseURL: config.base_url || 'https://api.anthropic.com',
      maxRetries: config.max_retries || 3,
      timeout: config.timeout || 60000
    });

    // Provider-specific configuration
    this.defaultModel = config.default_model || 'claude-3-sonnet-20240229';
    this.embeddingModel = config.embedding_model || 'claude-3-sonnet-20240229';
    this.maxTokens = config.max_tokens || 4000;
    this.temperature = config.temperature || 0.7;

    this.logger.info('🤖 Anthropic client initialized');
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
        max_tokens: options.max_tokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        messages: this.formatMessages(messages),
        stream: stream,
        ...options
      };

      if (stream && onData) {
        return await this.handleStreamingCompletion(requestOptions, onData);
      } else {
        const response = await this.client.messages.create(requestOptions);
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
      this.logger.debug(`🔍 Creating embeddings with model: ${model || this.embeddingModel}`);

      // Anthropic doesn't have a separate embeddings API, so we'll use the model for embeddings
      const response = await this.client.messages.create({
        model: model || this.embeddingModel,
        max_tokens: 1, // Minimal tokens for embedding
        messages: [
          {
            role: 'user',
            content: Array.isArray(input) ? input.join('\n') : input
          }
        ]
      });

      return this.formatEmbeddingResponse(response, input);

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
      const stream = await this.client.messages.create(options);
      
      let fullContent = '';
      let usage = { input_tokens: 0, output_tokens: 0 };

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          const content = chunk.delta.text || '';
          fullContent += content;

          // Call the data callback
          if (onData) {
            onData({
              content: content,
              chunk: chunk,
              isComplete: false
            });
          }
        } else if (chunk.type === 'message_delta') {
          // Update usage if available
          if (chunk.usage) {
            usage = chunk.usage;
          }
        } else if (chunk.type === 'message_stop') {
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
        }
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
   * Format messages for Anthropic API
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
   * @param {Object} response - Anthropic response
   * @returns {Object} Formatted response
   */
  formatCompletionResponse(response) {
    return {
      content: response.content[0]?.text || '',
      model: response.model,
      usage: response.usage,
      id: response.id,
      type: response.type,
      role: response.role,
      content_type: response.content[0]?.type || 'text'
    };
  }

  /**
   * Format embedding response
   * @param {Object} response - Anthropic response
   * @param {string|string[]} input - Original input
   * @returns {Object} Formatted response
   */
  formatEmbeddingResponse(response, input) {
    // Since Anthropic doesn't have embeddings API, we'll create a mock response
    // In a real implementation, you might want to use a different service for embeddings
    const inputs = Array.isArray(input) ? input : [input];
    
    return {
      embeddings: inputs.map((text, index) => ({
        embedding: this.generateMockEmbedding(text), // Placeholder
        index: index
      })),
      model: response.model,
      usage: response.usage,
      object: 'list'
    };
  }

  /**
   * Generate a mock embedding (placeholder)
   * @param {string} text - Input text
   * @returns {Array} Mock embedding vector
   */
  generateMockEmbedding(text) {
    // This is a placeholder - in production, you'd use a real embedding service
    const dimension = 1536; // Standard embedding dimension
    const embedding = new Array(dimension);
    
    // Simple hash-based embedding generation
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    for (let i = 0; i < dimension; i++) {
      embedding[i] = Math.sin(hash + i) * 0.1;
    }
    
    return embedding;
  }

  /**
   * Handle errors with provider-specific logic
   * @param {Error} error - The error object
   * @param {string} operation - The operation that failed
   */
  handleError(error, operation) {
    let errorMessage = `Anthropic ${operation} failed`;
    let errorCode = 'UNKNOWN_ERROR';

    if (error.status) {
      const status = error.status;

      switch (status) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = `Invalid request: ${error.message || 'Bad request'}`;
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
          errorMessage = 'Anthropic server error. Please try again later.';
          break;
        default:
          errorCode = `HTTP_${status}`;
          errorMessage = `HTTP ${status}: ${error.message || 'Unknown error'}`;
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
      provider: 'anthropic',
      models: [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-2.1',
        'claude-2.0',
        'claude-instant-1.2'
      ],
      features: {
        chat_completion: true,
        streaming: true,
        embeddings: false, // Anthropic doesn't have embeddings API
        function_calling: false,
        tool_calling: false
      },
      limits: {
        max_tokens: 4096, // Claude-3 models
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
      'x-api-key': this.config.api_key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test the connection to Anthropic
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      // Test with a minimal request
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hello' }]
      });
      
      this.logger.info('✅ Anthropic connection test successful');
      return true;
    } catch (error) {
      this.logger.error('❌ Anthropic connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = AnthropicClient;
