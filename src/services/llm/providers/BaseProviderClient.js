const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Base class for all LLM provider clients
 */
class BaseProviderClient extends EventEmitter {
  /**
   * Create a new provider client
   * @param {Object} config - Provider configuration
   * @param {Object} logger - Logger instance
   */
  constructor({ provider, logger }) {
    super();
    this.provider = provider;
    this.logger = logger || console;
    this.name = provider.name;
    this.providerType = provider.provider_type;
    this.baseUrl = provider.base_url;
    this.apiKey = provider.api_key_encrypted; // Note: Should be decrypted when used
    this.config = provider.config || {};
    this.requestId = uuidv4();
    this.initialize();
  }

  /**
   * Initialize the client
   * Can be overridden by subclasses
   */
  initialize() {
    this.logger.debug(`Initializing ${this.name} client`);
  }

  /**
   * Create a chat completion
   * Must be implemented by subclasses
   * @param {Object} params - Completion parameters
   * @param {string} params.model - The model to use
   * @param {Array} params.messages - Array of message objects
   * @param {Object} [params.options] - Additional options
   * @param {boolean} [params.stream] - Whether to stream the response
   * @param {Function} [params.onData] - Callback for streaming data
   * @returns {Promise<Object>} The completion response
   */
  async createChatCompletion({ model, messages, options = {}, stream = false, onData }) {
    throw new Error('Method not implemented');
  }

  /**
   * Create embeddings
   * Must be implemented by subclasses
   * @param {Object} params - Embedding parameters
   * @param {string|string[]} params.input - The input text or array of texts
   * @param {string} [params.model] - The model to use
   * @returns {Promise<Object>} The embeddings response
   */
  async createEmbedding({ input, model }) {
    throw new Error('Method not implemented');
  }

  /**
   * List available models
   * Can be overridden by providers that support dynamic model discovery
   * @returns {Promise<Array>} List of available models
   */
  async listModels() {
    // Default implementation returns an empty array
    // Providers that support dynamic model discovery should override this
    return [];
  }

  /**
   * Make an API request to the provider
   * Common implementation that can be used by all providers
   * @param {Object} options - Request options
   * @param {string} options.endpoint - The API endpoint
   * @param {string} [options.method='GET'] - The HTTP method
   * @param {Object} [options.headers={}] - Additional headers
   * @param {Object} [options.body] - The request body
   * @param {Object} [options.query] - Query parameters
   * @param {boolean} [options.stream=false] - Whether to stream the response
   * @returns {Promise<Object>} The response data
   */
  async _makeRequest({
    endpoint,
    method = 'GET',
    headers = {},
    body,
    query,
    stream = false,
  }) {
    const url = new URL(endpoint, this.baseUrl);
    
    // Add query parameters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value);
        }
      });
    }
    
    // Prepare headers
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'BrainiacAI/1.0',
      'X-Request-ID': this.requestId,
    };
    
    // Add provider-specific headers (e.g., API key)
    const authHeaders = this._getAuthHeaders();
    
    const requestOptions = {
      method,
      headers: {
        ...defaultHeaders,
        ...authHeaders,
        ...headers,
      },
      redirect: 'follow',
    };
    
    // Add body for non-GET requests
    if (method !== 'GET' && method !== 'HEAD' && body) {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    
    // Handle streaming
    if (stream) {
      requestOptions.signal = AbortSignal.timeout(this.config.timeout || 30000);
    }
    
    this.logger.debug('Making request to provider', {
      provider: this.name,
      url: url.toString(),
      method,
      headers: { ...requestOptions.headers, 'Authorization': 'Bearer ***' }, // Redact auth header
      body: body ? '[REDACTED]' : undefined,
      stream,
    });
    
    try {
      const response = await fetch(url.toString(), requestOptions);
      
      if (!response.ok) {
        const errorData = await this._parseErrorResponse(response);
        throw this._createError({
          message: errorData.message || 'Request failed',
          statusCode: response.status,
          code: errorData.code,
          type: errorData.type,
          provider: this.name,
          requestId: this.requestId,
        });
      }
      
      if (stream) {
        return response.body;
      }
      
      // Parse JSON response
      const data = await response.json();
      
      this.logger.debug('Received response from provider', {
        provider: this.name,
        status: response.status,
        statusText: response.statusText,
        data: this._redactSensitiveData(data),
      });
      
      return data;
    } catch (error) {
      this.logger.error('Request to provider failed', {
        provider: this.name,
        error: error.message,
        stack: error.stack,
        url: url.toString(),
        method,
      });
      
      throw this._createError({
        message: error.message,
        statusCode: error.statusCode || 500,
        code: error.code,
        type: error.type,
        provider: this.name,
        requestId: this.requestId,
        originalError: error,
      });
    }
  }

  /**
   * Get authentication headers
   * Must be implemented by subclasses
   * @protected
   * @returns {Object} Headers for authentication
   */
  _getAuthHeaders() {
    // Default implementation, should be overridden by subclasses
    return {};
  }

  /**
   * Parse error response from the provider
   * @param {Response} response - The fetch Response object
   * @returns {Promise<Object>} The parsed error data
   * @private
   */
  async _parseErrorResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      const text = await response.text();
      return { message: text || 'Unknown error' };
    } catch (error) {
      return { message: `Failed to parse error response: ${error.message}` };
    }
  }

  /**
   * Create a standardized error object
   * @param {Object} options - Error options
   * @returns {Error} The error object
   * @private
   */
  _createError({
    message,
    statusCode = 500,
    code,
    type,
    provider,
    requestId,
    originalError,
  }) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.type = type;
    error.provider = provider;
    error.requestId = requestId;
    
    if (originalError) {
      error.originalError = originalError;
      error.stack = originalError.stack;
    }
    
    return error;
  }

  /**
   * Redact sensitive data from logs
   * @param {*} data - The data to redact
   * @returns {*} The redacted data
   * @private
   */
  _redactSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // Create a deep copy to avoid modifying the original
    const result = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive fields
      if (typeof key === 'string' && 
          (key.toLowerCase().includes('key') || 
           key.toLowerCase().includes('token') ||
           key.toLowerCase().includes('secret') ||
           key.toLowerCase().includes('password'))) {
        result[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        result[key] = this._redactSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Convert provider-specific message format to standard format
   * @param {Array} messages - Messages in provider format
   * @returns {Array} Messages in standard format
   */
  _normalizeMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
      function_call: msg.function_call,
    }));
  }

  /**
   * Convert standard message format to provider-specific format
   * @param {Array} messages - Messages in standard format
   * @returns {Array} Messages in provider format
   */
  _denormalizeMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name }),
      ...(msg.function_call && { function_call: msg.function_call }),
    }));
  }
}

module.exports = BaseProviderClient;
