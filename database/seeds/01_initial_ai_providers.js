const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Helper function to encrypt API keys
function encryptApiKey(apiKey, encryptionKey) {
  if (!apiKey) return { encrypted: null, iv: null };
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(encryptionKey, 'hex'),
    iv
  );
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted: `enc:${encrypted}`,
    iv: iv.toString('hex')
  };
}

// Get encryption key from environment or use a default for development
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 
  '3a7d2f8e1b5c9f0a4d6e8b2c5f7a9e1d3b6c8a0e4f7d2b5c8e1a3d6f9b2e5c8';

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('api_usage_logs').del();
  await knex('provider_rate_limits').del();
  await knex('model_capabilities').del();
  await knex('ai_models').del();
  await knex('ai_providers').del();

  // Insert AI Providers
  const providers = [
    {
      name: 'OpenAI',
      provider_type: 'openai',
      base_url: 'https://api.openai.com/v1',
      is_active: true,
      supports_dynamic_models: true,
      priority: 100,
      config: {
        supports_streaming: true,
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: true
      }
    },
    {
      name: 'Anthropic',
      provider_type: 'anthropic',
      base_url: 'https://api.anthropic.com/v1',
      is_active: true,
      supports_dynamic_models: true,
      priority: 90,
      config: {
        supports_streaming: true,
        supports_tools: true,
        supports_vision: false
      }
    },
    {
      name: 'Mistral',
      provider_type: 'mistral',
      base_url: 'https://api.mistral.ai/v1',
      is_active: true,
      supports_dynamic_models: true,
      priority: 80,
      config: {
        supports_streaming: true,
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: false
      }
    },
    {
      name: 'Ollama',
      provider_type: 'ollama',
      base_url: 'http://localhost:11434/api',
      is_active: false, // Disabled by default as it requires local setup
      supports_dynamic_models: true,
      priority: 70,
      config: {
        requires_local_setup: true,
        supports_streaming: true,
        supports_vision: false
      }
    },
    {
      name: 'Groq',
      provider_type: 'groq',
      base_url: 'https://api.groq.com/openai/v1',
      is_active: true,
      supports_dynamic_models: true,
      priority: 85,
      config: {
        supports_streaming: true,
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: false
      }
    },
    {
      name: 'HuggingFace',
      provider_type: 'huggingface',
      base_url: 'https://api-inference.huggingface.co/models',
      is_active: true,
      supports_dynamic_models: false, // Models are specific to endpoints
      priority: 60,
      config: {
        supports_streaming: false,
        supports_vision: true
      }
    }
  ];

  // Encrypt API keys from environment variables
  const openaiKey = encryptApiKey(process.env.OPENAI_API_KEY, ENCRYPTION_KEY);
  const anthropicKey = encryptApiKey(process.env.ANTHROPIC_API_KEY, ENCRYPTION_KEY);
  const mistralKey = encryptApiKey(process.env.MISTRAL_API_KEY, ENCRYPTION_KEY);
  const groqKey = encryptApiKey(process.env.GROQ_API_KEY, ENCRYPTION_KEY);
  const hfKey = encryptApiKey(process.env.HUGGINGFACE_API_KEY, ENCRYPTION_KEY);

  // Map providers with their API keys
  const providerKeys = {
    openai: openaiKey,
    anthropic: anthropicKey,
    mistral: mistralKey,
    groq: groqKey,
    huggingface: hfKey
  };

  // Insert providers and collect their IDs
  const providerIds = {};
  for (const provider of providers) {
    const [id] = await knex('ai_providers')
      .insert({
        ...provider,
        api_key_encrypted: providerKeys[provider.provider_type]?.encrypted || null,
        api_key_encryption_iv: providerKeys[provider.provider_type]?.iv || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .returning('id');
    
    providerIds[provider.provider_type] = id;
  }

  // Define models for each provider
  const models = [
    // OpenAI Models
    {
      provider_id: providerIds.openai,
      model_name: 'GPT-4o',
      model_id: 'gpt-4o',
      is_active: true,
      context_length: 128000,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: true,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.openai,
      model_name: 'GPT-4 Turbo',
      model_id: 'gpt-4-turbo',
      is_active: true,
      context_length: 128000,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: true,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.openai,
      model_name: 'GPT-3.5 Turbo',
      model_id: 'gpt-3.5-turbo',
      is_active: true,
      context_length: 16385,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.openai,
      model_name: 'Text Embedding 3 Small',
      model_id: 'text-embedding-3-small',
      is_active: true,
      context_length: 8191,
      is_chat_model: false,
      is_embedding_model: true,
      config: {
        embedding_dimensions: 1536
      }
    },
    
    // Anthropic Models
    {
      provider_id: providerIds.anthropic,
      model_name: 'Claude 3 Opus',
      model_id: 'claude-3-opus-20240229',
      is_active: true,
      context_length: 200000,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_tools: true,
        supports_vision: true,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.anthropic,
      model_name: 'Claude 3 Sonnet',
      model_id: 'claude-3-sonnet-20240229',
      is_active: true,
      context_length: 200000,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_tools: true,
        supports_vision: true,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.anthropic,
      model_name: 'Claude 3 Haiku',
      model_id: 'claude-3-haiku-20240307',
      is_active: true,
      context_length: 200000,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_tools: true,
        supports_vision: true,
        max_output_tokens: 4096
      }
    },
    
    // Mistral Models
    {
      provider_id: providerIds.mistral,
      model_name: 'Mistral Large',
      model_id: 'mistral-large-latest',
      is_active: true,
      context_length: 32768,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_parallel_tool_calls: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.mistral,
      model_name: 'Mistral Medium',
      model_id: 'mistral-medium-latest',
      is_active: true,
      context_length: 32768,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.mistral,
      model_name: 'Mistral Small',
      model_id: 'mistral-small-latest',
      is_active: true,
      context_length: 32768,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    
    // Groq Models
    {
      provider_id: providerIds.groq,
      model_name: 'LLaMA 3 70B',
      model_id: 'llama3-70b-8192',
      is_active: true,
      context_length: 8192,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    {
      provider_id: providerIds.groq,
      model_name: 'Mixtral 8x7B',
      model_id: 'mixtral-8x7b-32768',
      is_active: true,
      context_length: 32768,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        supports_functions: true,
        supports_vision: false,
        max_output_tokens: 4096
      }
    },
    
    // HuggingFace Models (example models, actual models depend on deployment)
    {
      provider_id: providerIds.huggingface,
      model_name: 'Llama 2 70B Chat',
      model_id: 'meta-llama/Llama-2-70b-chat-hf',
      is_active: true,
      context_length: 4096,
      max_tokens: 4096,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        endpoint: 'https://api-inference.huggingface.co/models/meta-llama/Llama-2-70b-chat-hf',
        supports_vision: false
      }
    },
    {
      provider_id: providerIds.huggingface,
      model_name: 'MPT-7B-Instruct',
      model_id: 'mosaicml/mpt-7b-instruct',
      is_active: true,
      context_length: 2048,
      max_tokens: 2048,
      is_chat_model: true,
      is_embedding_model: false,
      config: {
        endpoint: 'https://api-inference.huggingface.co/models/mosaicml/mpt-7b-instruct',
        supports_vision: false
      }
    },
    {
      provider_id: providerIds.huggingface,
      model_name: 'BAAI/bge-large-en',
      model_id: 'BAAI/bge-large-en',
      is_active: true,
      context_length: 512,
      is_chat_model: false,
      is_embedding_model: true,
      config: {
        endpoint: 'https://api-inference.huggingface.co/models/BAAI/bge-large-en',
        embedding_dimensions: 1024
      }
    }
  ];

  // Insert models and collect their IDs
  const modelIds = {};
  for (const model of models) {
    const [id] = await knex('ai_models')
      .insert({
        ...model,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .returning('id');
    
    const modelKey = `${model.provider_id}_${model.model_id}`;
    modelIds[modelKey] = id;
  }

  // Define model capabilities
  const capabilities = [
    // OpenAI GPT-4o
    { model_id: modelIds[`${providerIds.openai}_gpt-4o`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4o`], capability: 'function_calling', details: { parallel_tool_calls: true } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4o`], capability: 'vision', details: { image_understanding: true } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4o`], capability: 'json_mode', details: {} },
    
    // OpenAI GPT-4 Turbo
    { model_id: modelIds[`${providerIds.openai}_gpt-4-turbo`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4-turbo`], capability: 'function_calling', details: { parallel_tool_calls: true } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4-turbo`], capability: 'vision', details: { image_understanding: true } },
    { model_id: modelIds[`${providerIds.openai}_gpt-4-turbo`], capability: 'json_mode', details: {} },
    
    // OpenAI GPT-3.5 Turbo
    { model_id: modelIds[`${providerIds.openai}_gpt-3.5-turbo`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.openai}_gpt-3.5-turbo`], capability: 'function_calling', details: { parallel_tool_calls: true } },
    { model_id: modelIds[`${providerIds.openai}_gpt-3.5-turbo`], capability: 'json_mode', details: {} },
    
    // OpenAI Text Embedding
    { model_id: modelIds[`${providerIds.openai}_text-embedding-3-small`], capability: 'embeddings', details: { dimensions: 1536 } },
    
    // Anthropic Claude 3 Opus
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-opus-20240229`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-opus-20240229`], capability: 'tool_use', details: {} },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-opus-20240229`], capability: 'vision', details: { image_understanding: true } },
    
    // Anthropic Claude 3 Sonnet
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-sonnet-20240229`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-sonnet-20240229`], capability: 'tool_use', details: {} },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-sonnet-20240229`], capability: 'vision', details: { image_understanding: true } },
    
    // Anthropic Claude 3 Haiku
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-haiku-20240307`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-haiku-20240307`], capability: 'tool_use', details: {} },
    { model_id: modelIds[`${providerIds.anthropic}_claude-3-haiku-20240307`], capability: 'vision', details: { image_understanding: true } },
    
    // Mistral Large
    { model_id: modelIds[`${providerIds.mistral}_mistral-large-latest`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.mistral}_mistral-large-latest`], capability: 'function_calling', details: { parallel_tool_calls: true } },
    { model_id: modelIds[`${providerIds.mistral}_mistral-large-latest`], capability: 'json_mode', details: {} },
    
    // Mistral Medium
    { model_id: modelIds[`${providerIds.mistral}_mistral-medium-latest`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.mistral}_mistral-medium-latest`], capability: 'function_calling', details: {} },
    
    // Mistral Small
    { model_id: modelIds[`${providerIds.mistral}_mistral-small-latest`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.mistral}_mistral-small-latest`], capability: 'function_calling', details: {} },
    
    // Groq LLaMA 3 70B
    { model_id: modelIds[`${providerIds.groq}_llama3-70b-8192`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.groq}_llama3-70b-8192`], capability: 'function_calling', details: {} },
    
    // Groq Mixtral 8x7B
    { model_id: modelIds[`${providerIds.groq}_mixtral-8x7b-32768`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    { model_id: modelIds[`${providerIds.groq}_mixtral-8x7b-32768`], capability: 'function_calling', details: {} },
    
    // HuggingFace Llama 2 70B Chat
    { model_id: modelIds[`${providerIds.huggingface}_meta-llama/Llama-2-70b-chat-hf`], capability: 'chat_completion', details: { max_tokens: 4096 } },
    
    // HuggingFace MPT-7B-Instruct
    { model_id: modelIds[`${providerIds.huggingface}_mosaicml/mpt-7b-instruct`], capability: 'chat_completion', details: { max_tokens: 2048 } },
    
    // HuggingFace BAAI/bge-large-en
    { model_id: modelIds[`${providerIds.huggingface}_BAAI/bge-large-en`], capability: 'embeddings', details: { dimensions: 1024 } }
  ];

  // Insert model capabilities
  await knex('model_capabilities').insert(capabilities);

  // Define rate limits for providers (requests per minute)
  const rateLimits = [
    // OpenAI
    { provider_id: providerIds.openai, limit_type: 'rpm', limit_value: 3500, window_seconds: 60 },
    { provider_id: providerIds.openai, limit_type: 'tpm', limit_value: 90000, window_seconds: 60 },
    
    // Anthropic
    { provider_id: providerIds.anthropic, limit_type: 'rpm', limit_value: 1000, window_seconds: 60 },
    { provider_id: providerIds.anthropic, limit_type: 'tpm', limit_value: 40000, window_seconds: 60 },
    
    // Mistral
    { provider_id: providerIds.mistral, limit_type: 'rpm', limit_value: 500, window_seconds: 60 },
    { provider_id: providerIds.mistral, limit_type: 'tpm', limit_value: 20000, window_seconds: 60 },
    
    // Groq
    { provider_id: providerIds.groq, limit_type: 'rpm', limit_value: 1000, window_seconds: 60 },
    { provider_id: providerIds.groq, limit_type: 'tpm', limit_value: 30000, window_seconds: 60 },
    
    // HuggingFace
    { provider_id: providerIds.huggingface, limit_type: 'rpm', limit_value: 300, window_seconds: 60 },
    { provider_id: providerIds.huggingface, limit_type: 'tpm', limit_value: 15000, window_seconds: 60 }
  ];

  // Insert rate limits
  await knex('provider_rate_limits').insert(rateLimits);

  console.log('✅ Successfully seeded AI providers, models, and capabilities');
};
