/**
 * Configuration for LLM providers and their models
 * This file contains default configurations for all supported LLM providers
 * These can be overridden via environment variables or provider-specific configs
 */

// Base configuration that applies to all providers
const baseConfig = {
  // Default timeouts in milliseconds
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  
  // Default model parameters
  defaultTemperature: 0.7,
  defaultTopP: 1.0,
  defaultMaxTokens: 2048,
  defaultFrequencyPenalty: 0,
  defaultPresencePenalty: 0,
  
  // Default context sizes (in tokens)
  defaultContextSize: 4096,
  defaultMaxOutputTokens: 2048,
  
  // Feature flags
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsParallelFunctionCalls: false,
  supportsVision: false,
};

// Provider-specific configurations
module.exports = {
  // OpenAI configuration
  openai: {
    ...baseConfig,
    name: 'OpenAI',
    baseUrl: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    apiVersion: process.env.OPENAI_API_VERSION || '2023-05-15',
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4-turbo',
    defaultEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    
    // Model configurations
    models: {
      // GPT-4 models
      'gpt-4o': {
        name: 'GPT-4o',
        maxTokens: 128000,
        maxOutputTokens: 4096,
        supportsParallelFunctionCalls: true,
        supportsVision: true,
      },
      'gpt-4-turbo': {
        name: 'GPT-4 Turbo',
        maxTokens: 128000,
        maxOutputTokens: 4096,
        supportsParallelFunctionCalls: true,
      },
      'gpt-4': {
        name: 'GPT-4',
        maxTokens: 8192,
        maxOutputTokens: 4096,
        supportsParallelFunctionCalls: true,
      },
      
      // GPT-3.5 models
      'gpt-3.5-turbo': {
        name: 'GPT-3.5 Turbo',
        maxTokens: 16385,
        maxOutputTokens: 4096,
      },
      
      // Embedding models
      'text-embedding-3-large': {
        name: 'Text Embedding 3 Large',
        maxTokens: 8191,
        isEmbeddingModel: true,
      },
      'text-embedding-3-small': {
        name: 'Text Embedding 3 Small',
        maxTokens: 8191,
        isEmbeddingModel: true,
      },
      'text-embedding-ada-002': {
        name: 'Text Embedding Ada 002',
        maxTokens: 8191,
        isEmbeddingModel: true,
      },
    },
  },
  
  // Anthropic configuration
  anthropic: {
    ...baseConfig,
    name: 'Anthropic',
    baseUrl: process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com/v1',
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-opus-20240229',
    defaultEmbeddingModel: 'claude-3-opus-20240229', // Anthropic doesn't have dedicated embedding models
    
    models: {
      // Claude 3 models
      'claude-3-opus-20240229': {
        name: 'Claude 3 Opus',
        maxTokens: 200000,
        maxOutputTokens: 4096,
      },
      'claude-3-sonnet-20240229': {
        name: 'Claude 3 Sonnet',
        maxTokens: 200000,
        maxOutputTokens: 4096,
      },
      'claude-3-haiku-20240307': {
        name: 'Claude 3 Haiku',
        maxTokens: 200000,
        maxOutputTokens: 4096,
      },
      
      // Claude 2 models
      'claude-2.1': {
        name: 'Claude 2.1',
        maxTokens: 100000,
        maxOutputTokens: 4096,
      },
      'claude-2.0': {
        name: 'Claude 2',
        maxTokens: 100000,
        maxOutputTokens: 4096,
      },
      'claude-instant-1.2': {
        name: 'Claude Instant 1.2',
        maxTokens: 100000,
        maxOutputTokens: 4096,
      },
    },
  },
  
  // Mistral configuration
  mistral: {
    ...baseConfig,
    name: 'Mistral',
    baseUrl: process.env.MISTRAL_API_BASE || 'https://api.mistral.ai/v1',
    defaultModel: process.env.MISTRAL_DEFAULT_MODEL || 'mistral-large-latest',
    defaultEmbeddingModel: 'mistral-embed',
    
    models: {
      'mistral-large-latest': {
        name: 'Mistral Large',
        maxTokens: 32768,
        maxOutputTokens: 4096,
      },
      'mistral-medium': {
        name: 'Mistral Medium',
        maxTokens: 32768,
        maxOutputTokens: 4096,
      },
      'mistral-small': {
        name: 'Mistral Small',
        maxTokens: 32768,
        maxOutputTokens: 4096,
      },
      'mistral-embed': {
        name: 'Mistral Embed',
        maxTokens: 8192,
        isEmbeddingModel: true,
      },
    },
  },
  
  // Groq configuration
  groq: {
    ...baseConfig,
    name: 'Groq',
    baseUrl: process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1',
    defaultModel: process.env.GROQ_DEFAULT_MODEL || 'mixtral-8x7b-32768',
    
    models: {
      'mixtral-8x7b-32768': {
        name: 'Mixtral 8x7B',
        maxTokens: 32768,
        maxOutputTokens: 4096,
      },
      'llama2-70b-4096': {
        name: 'LLaMA 2 70B',
        maxTokens: 4096,
        maxOutputTokens: 4096,
      },
      'gemma-7b-it': {
        name: 'Gemma 7B',
        maxTokens: 8192,
        maxOutputTokens: 2048,
      },
    },
  },
  
  // Ollama configuration
  ollama: {
    ...baseConfig,
    name: 'Ollama',
    baseUrl: process.env.OLLAMA_API_BASE || 'http://localhost:11434/api',
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama2',
    
    models: {
      'llama2': {
        name: 'LLaMA 2',
        maxTokens: 4096,
        maxOutputTokens: 2048,
      },
      'mistral': {
        name: 'Mistral',
        maxTokens: 8192,
        maxOutputTokens: 2048,
      },
      'codellama': {
        name: 'Code LLaMA',
        maxTokens: 16384,
        maxOutputTokens: 4096,
      },
    },
  },
  
  // Hugging Face configuration
  huggingface: {
    ...baseConfig,
    name: 'Hugging Face',
    baseUrl: process.env.HF_API_BASE || 'https://api-inference.huggingface.co/models',
    defaultModel: process.env.HF_DEFAULT_MODEL || 'meta-llama/Llama-2-7b-chat-hf',
    
    models: {
      'meta-llama/Llama-2-7b-chat-hf': {
        name: 'LLaMA 2 7B Chat',
        maxTokens: 4096,
        maxOutputTokens: 1024,
      },
      'mistralai/Mistral-7B-Instruct-v0.1': {
        name: 'Mistral 7B Instruct',
        maxTokens: 8192,
        maxOutputTokens: 2048,
      },
      'google/gemma-7b-it': {
        name: 'Gemma 7B',
        maxTokens: 8192,
        maxOutputTokens: 2048,
      },
    },
  },
  
  // Add more providers as needed
};

// Helper function to get a provider's default model
function getDefaultModel(provider) {
  return this[provider]?.defaultModel || null;
}

// Helper function to get a model's configuration
function getModelConfig(provider, modelId) {
  return this[provider]?.models?.[modelId] || null;
}

// Add helper methods to the exports
module.exports.getDefaultModel = getDefaultModel.bind(module.exports);
module.exports.getModelConfig = getModelConfig.bind(module.exports);

// Validate configurations on load
Object.entries(module.exports).forEach(([provider, config]) => {
  if (typeof config === 'function') return; // Skip helper functions
  
  if (!config.name) {
    console.warn(`Provider ${provider} is missing a name`);
  }
  
  if (!config.baseUrl) {
    console.warn(`Provider ${provider} is missing a baseUrl`);
  }
  
  if (!config.defaultModel) {
    console.warn(`Provider ${provider} is missing a defaultModel`);
  } else if (!config.models?.[config.defaultModel]) {
    console.warn(`Default model ${config.defaultModel} for provider ${provider} is not defined in models`);
  }
  
  if (config.defaultEmbeddingModel && !config.models?.[config.defaultEmbeddingModel]?.isEmbeddingModel) {
    console.warn(`Default embedding model ${config.defaultEmbeddingModel} for provider ${provider} is not defined or not marked as an embedding model`);
  }
});
