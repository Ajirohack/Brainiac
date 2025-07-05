/**
 * HuggingFace Client - Implementation for HuggingFace Inference API integration
 * 
 * Provides chat completion, streaming, and embedding generation capabilities
 * using the HuggingFace Inference API with proper error handling and rate limiting.
 */

const axios = require('axios');
const BaseProviderClient = require('./BaseProviderClient');

class HuggingFaceClient extends BaseProviderClient {
  constructor(config) {
    super(config);
    
    // Initialize HuggingFace client
    this.baseURL = config.base_url || 'https://api-inference.huggingface.co';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 60000,
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json'
      }
    });

    // Provider-specific configuration
    this.defaultModel = config.default_model || 'meta-llama/Llama-2-7b-chat-hf';
    this.embeddingModel = config.embedding_model || 'sentence-transformers/all-MiniLM-L6-v2';
    this.maxTokens = config.max_tokens || 4000;
    this.temperature = config.temperature || 0.7;

    this.logger.info('🤖 HuggingFace client initialized');
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

      // Format messages for HuggingFace
      const formattedMessages = this.formatMessages(messages);
      const prompt = this.messagesToPrompt(formattedMessages);

      const requestOptions = {
        inputs: prompt,
        parameters: {
          max_new_tokens: options.max_tokens || this.maxTokens,
          temperature: options.temperature || this.temperature,
          do_sample: true,
          return_full_text: false,
          ...options
        }
      };

      if (stream && onData) {
        return await this.handleStreamingCompletion(model, requestOptions, onData);
      } else {
        const response = await this.client.post(`/models/${model}`, requestOptions);
        return this.formatCompletionResponse(response.data, model);
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

      const inputs = Array.isArray(input) ? input : [input];
      const embeddings = [];

      for (const text of inputs) {
        const response = await this.client.post(`/models/${model || this.embeddingModel}`, {
          inputs: text
        });

        embeddings.push({
          embedding: response.data,
          index: embeddings.length
        });
      }

      return this.formatEmbeddingResponse(embeddings, model || this.embeddingModel);

    } catch (error) {
      this.handleError(error, 'embedding generation');
    }
  }

  /**
   * Handle streaming completion
   * @param {string} model - Model name
   * @param {Object} options - Request options
   * @param {Function} onData - Data callback
   * @returns {Promise<Object>} Streaming response
   */
  async handleStreamingCompletion(model, options, onData) {
    try {
      // Note: HuggingFace streaming is limited and depends on the model
      // For now, we'll use regular completion and simulate streaming
      const response = await this.client.post(`/models/${model}`, options);
      const content = this.extractContentFromResponse(response.data);
      
      // Simulate streaming by sending content in chunks
      const chunks = content.split(' ');
      let fullContent = '';

      for (const chunk of chunks) {
        fullContent += chunk + ' ';
        
        if (onData) {
          onData({
            content: chunk + ' ',
            chunk: { content: chunk },
            isComplete: false
          });
          
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Send completion signal
      if (onData) {
        onData({
          content: '',
          chunk: null,
          isComplete: true,
          fullContent: fullContent.trim(),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        });
      }

      return {
        content: fullContent.trim(),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: model,
        streamed: true
      };

    } catch (error) {
      this.handleError(error, 'streaming completion');
    }
  }

  /**
   * Format messages for HuggingFace
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
   * Convert messages to prompt format
   * @param {Array} messages - Array of formatted messages
   * @returns {string} Formatted prompt
   */
  messagesToPrompt(messages) {
    let prompt = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `<|system|>\n${message.content}\n<|end|>\n`;
      } else if (message.role === 'user') {
        prompt += `<|user|>\n${message.content}\n<|end|>\n`;
      } else if (message.role === 'assistant') {
        prompt += `<|assistant|>\n${message.content}\n<|end|>\n`;
      }
    }
    
    prompt += '<|assistant|>\n';
    return prompt;
  }

  /**
   * Extract content from HuggingFace response
   * @param {Object} response - HuggingFace response
   * @returns {string} Extracted content
   */
  extractContentFromResponse(response) {
    if (Array.isArray(response)) {
      return response[0]?.generated_text || '';
    } else if (typeof response === 'string') {
      return response;
    } else if (response.generated_text) {
      return response.generated_text;
    }
    return '';
  }

  /**
   * Format completion response
   * @param {Object} response - HuggingFace response
   * @param {string} model - Model name
   * @returns {Object} Formatted response
   */
  formatCompletionResponse(response, model) {
    const content = this.extractContentFromResponse(response);
    
    return {
      content: content,
      model: model,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      finish_reason: 'stop',
      id: `hf_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion'
    };
  }

  /**
   * Format embedding response
   * @param {Array} embeddings - Array of embeddings
   * @param {string} model - Model name
   * @returns {Object} Formatted response
   */
  formatEmbeddingResponse(embeddings, model) {
    return {
      embeddings: embeddings,
      model: model,
      usage: {
        promptTokens: 0,
        totalTokens: 0
      },
      object: 'list'
    };
  }

  /**
   * Handle errors with provider-specific logic
   * @param {Error} error - The error object
   * @param {string} operation - The operation that failed
   */
  handleError(error, operation) {
    let errorMessage = `HuggingFace ${operation} failed`;
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = `Invalid request: ${error.response.data?.error || 'Bad request'}`;
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          errorMessage = 'Invalid API key or authentication failed';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          errorMessage = 'API key does not have permission for this operation';
          break;
        case 404:
          errorCode = 'MODEL_NOT_FOUND';
          errorMessage = 'Model not found or not available';
          break;
        case 429:
          errorCode = 'RATE_LIMIT_EXCEEDED';
          errorMessage = 'Rate limit exceeded. Please try again later.';
          break;
        case 503:
          errorCode = 'MODEL_LOADING';
          errorMessage = 'Model is currently loading. Please try again in a few moments.';
          break;
        case 500:
          errorCode = 'SERVER_ERROR';
          errorMessage = 'HuggingFace server error. Please try again later.';
          break;
        default:
          errorCode = `HTTP_${status}`;
          errorMessage = `HTTP ${status}: ${error.response.data?.error || 'Unknown error'}`;
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
      // Note: HuggingFace doesn't provide a simple API to list all models
      // This is a curated list of popular models
      return [
        {
          id: 'meta-llama/Llama-2-7b-chat-hf',
          name: 'Llama 2 7B Chat',
          object: 'model',
          created: 0,
          owned_by: 'meta'
        },
        {
          id: 'microsoft/DialoGPT-medium',
          name: 'DialoGPT Medium',
          object: 'model',
          created: 0,
          owned_by: 'microsoft'
        },
        {
          id: 'gpt2',
          name: 'GPT-2',
          object: 'model',
          created: 0,
          owned_by: 'openai'
        }
      ];
    } catch (error) {
      this.logger.error('❌ Failed to get HuggingFace models:', error.message);
      return [];
    }
  }

  /**
   * Get provider capabilities
   * @returns {Object} Provider capabilities
   */
  getCapabilities() {
    return {
      provider: 'huggingface',
      models: [
        'meta-llama/Llama-2-7b-chat-hf',
        'microsoft/DialoGPT-medium',
        'gpt2',
        'sentence-transformers/all-MiniLM-L6-v2',
        'sentence-transformers/all-mpnet-base-v2'
      ],
      features: {
        chat_completion: true,
        streaming: false, // Limited support
        embeddings: true,
        function_calling: false,
        tool_calling: false
      },
      limits: {
        max_tokens: 2048, // Depends on model
        max_requests_per_minute: 100,
        max_tokens_per_minute: 10000
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
   * Test the connection to HuggingFace
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      // Test with a simple model
      const response = await this.client.post('/models/gpt2', {
        inputs: 'Hello world'
      });
      
      this.logger.info('✅ HuggingFace connection test successful');
      return true;
    } catch (error) {
      this.logger.error('❌ HuggingFace connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = HuggingFaceClient; 