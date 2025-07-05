/**
 * Ollama Configuration
 * 
 * This file contains configuration for the Ollama LLM service integration.
 * It loads environment variables and exports configuration objects for different components.
 */

require('dotenv').config();

const ollamaConfig = {
  // Base URL for the Ollama API
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  
  // Default model to use for text generation
  model: process.env.OLLAMA_MODEL || 'llama2',
  
  // Model to use for embeddings
  embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'llama2',
  
  // API request timeout in milliseconds
  timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10),
  
  // Maximum number of tokens to generate
  maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2000', 10),
  
  // Sampling temperature (0.0 to 1.0)
  temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
  
  // Whether to stream responses
  stream: process.env.OLLAMA_STREAM === 'true' || false,
  
  // Additional model parameters
  modelOptions: {
    // Add any model-specific options here
    num_ctx: 4096,  // Context window size
    num_predict: 2000,  // Max tokens to predict
    repeat_penalty: 1.1,  // Penalize repetition
    top_k: 40,  // Top-k sampling
    top_p: 0.9,  // Nucleus sampling
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
  },
  
  // Logging configuration
  logging: {
    enabled: process.env.NODE_ENV !== 'production',
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate configuration
if (!ollamaConfig.baseUrl) {
  console.warn('OLLAMA_BASE_URL is not set. Using default: http://localhost:11434');
}

if (!ollamaConfig.model) {
  throw new Error('OLLAMA_MODEL is required but not set in environment variables');
}

module.exports = ollamaConfig;
