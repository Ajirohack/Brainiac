/**
 * Ollama Client - Implementation for Ollama API integration
 * 
 * Provides chat completion, streaming, and embedding generation capabilities
 * using the local Ollama API with proper error handling and configuration.
 */

const axios = require('axios');
const BaseProviderClient = require('./BaseProviderClient');

class OllamaClient extends BaseProviderClient {
  constructor(config) {
    super(config);
    
    // Initialize Ollama client
    this.baseURL = config.base_url || 'http://localhost:11434';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Provider-specific configuration
    this.defaultModel = config.default_model || 'llama2';
    this.embeddingModel = config.embedding_model || 'llama2';
    this.maxTokens = config.max_tokens || 4000;
    this.temperature = config.temperature || 0.7;
    this.stream = config.stream !== false;

    this.logger.info('🤖 Ollama client initialized');
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
        options: {
          num_predict: options.max_tokens || this.maxTokens,
          temperature: options.temperature || this.temperature,
          ...options
        },
        stream: stream || this.stream
      };

      if (stream && onData) {
        return await this.handleStreamingCompletion(requestOptions, onData);
      } else {
        const response = await this.client.post('/api/chat', requestOptions);
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

      const inputs = Array.isArray(input) ? input : [input];
      const embeddings = [];

      for (const text of inputs) {
        const response = await this.client.post('/api/embeddings', {
          model: model || this.embeddingModel,
          prompt: text
        });

        embeddings.push({
          embedding: response.data.embedding,
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
   * @param {Object} options - Request options
   * @param {Function} onData - Data callback
   * @returns {Promise<Object>} Streaming response
   */
  async handleStreamingCompletion(options, onData) {
    try {
      const response = await this.client.post('/api/chat', options, {
        responseType: 'stream'
      });

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const data = JSON.parse(line);
            
            if (data.done) {
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

            if (data.message && data.message.content) {
              const content = data.message.content;
              fullContent += content;

              // Call the data callback
              if (onData) {
                onData({
                  content: content,
                  chunk: data,
                  isComplete: false
                });
              }
            }

            // Update usage if available
            if (data.eval_count) {
              usage.completionTokens = data.eval_count;
            }

          } catch (parseError) {
            this.logger.warn('Failed to parse streaming chunk:', parseError.message);
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
   * Format messages for Ollama API
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
   * @param {Object} response - Ollama response
   * @returns {Object} Formatted response
   */
  formatCompletionResponse(response) {
    return {
      content: response.message?.content || '',
      model: response.model,
      usage: {
        promptTokens: response.prompt_eval_count || 0,
        completionTokens: response.eval_count || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
      },
      finish_reason: response.done ? 'stop' : null,
      id: `ollama_${Date.now()}`,
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
    let errorMessage = `Ollama ${operation} failed`;
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 400:
          errorCode = 'BAD_REQUEST';
          errorMessage = `Invalid request: ${error.response.data?.error || 'Bad request'}`;
          break;
        case 404:
          errorCode = 'MODEL_NOT_FOUND';
          errorMessage = 'Model not found. Please ensure the model is installed.';
          break;
        case 500:
          errorCode = 'SERVER_ERROR';
          errorMessage = 'Ollama server error. Please check if Ollama is running.';
          break;
        default:
          errorCode = `HTTP_${status}`;
          errorMessage = `HTTP ${status}: ${error.response.data?.error || 'Unknown error'}`;
      }
    } else if (error.code) {
      switch (error.code) {
        case 'ECONNREFUSED':
          errorCode = 'CONNECTION_REFUSED';
          errorMessage = 'Cannot connect to Ollama. Please ensure Ollama is running on the specified URL.';
          break;
        case 'ECONNRESET':
        case 'ETIMEDOUT':
          errorCode = 'NETWORK_ERROR';
          errorMessage = 'Network connection failed. Please check your connection to Ollama.';
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
      const response = await this.client.get('/api/tags');
      return response.data.models.map(model => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modified_at: model.modified_at,
        digest: model.digest
      }));
    } catch (error) {
      this.logger.error('❌ Failed to get Ollama models:', error.message);
      return [];
    }
  }

  /**
   * Pull a model
   * @param {string} modelName - Name of the model to pull
   * @returns {Promise<boolean>} Pull success
   */
  async pullModel(modelName) {
    try {
      this.logger.info(`📥 Pulling model: ${modelName}`);
      
      const response = await this.client.post('/api/pull', {
        name: modelName
      });

      this.logger.info(`✅ Model pulled successfully: ${modelName}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Failed to pull model: ${modelName}`, error.message);
      return false;
    }
  }

  /**
   * Get provider capabilities
   * @returns {Object} Provider capabilities
   */
  getCapabilities() {
    return {
      provider: 'ollama',
      models: [
        'llama2',
        'llama2:7b',
        'llama2:13b',
        'llama2:70b',
        'codellama',
        'mistral',
        'neural-chat',
        'orca-mini',
        'vicuna',
        'wizard-vicuna-uncensored'
      ],
      features: {
        chat_completion: true,
        streaming: true,
        embeddings: true,
        function_calling: false,
        tool_calling: false
      },
      limits: {
        max_tokens: 4096, // Depends on model
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
      'Content-Type': 'application/json'
    };
  }

  /**
   * Test the connection to Ollama
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      // Test with a simple API call
      const response = await this.client.get('/api/tags');
      
      this.logger.info('✅ Ollama connection test successful');
      return true;
    } catch (error) {
      this.logger.error('❌ Ollama connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = OllamaClient; 