-- AI Providers Table
CREATE TABLE IF NOT EXISTS ai_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- openai, anthropic, mistral, etc.
    base_url VARCHAR(255),
    api_key_encrypted TEXT,
    api_key_encryption_iv VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    supports_dynamic_models BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'system',
    config JSONB,
    UNIQUE(name, provider_type)
);

-- AI Models Table
CREATE TABLE IF NOT EXISTS ai_models (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    context_length INTEGER,
    max_tokens INTEGER,
    is_chat_model BOOLEAN DEFAULT true,
    is_embedding_model BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    config JSONB,
    UNIQUE(provider_id, model_id)
);

-- Model Capabilities
CREATE TABLE IF NOT EXISTS model_capabilities (
    id SERIAL PRIMARY KEY,
    model_id INTEGER REFERENCES ai_models(id) ON DELETE CASCADE,
    capability VARCHAR(50) NOT NULL, -- 'chat', 'completion', 'embedding', 'vision', etc.
    is_supported BOOLEAN DEFAULT true,
    details JSONB,
    UNIQUE(model_id, capability)
);

-- API Rate Limits
CREATE TABLE IF NOT EXISTS provider_rate_limits (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES ai_providers(id) ON DELETE CASCADE,
    limit_type VARCHAR(50) NOT NULL, -- 'rpm' (requests per minute), 'tpm' (tokens per minute), etc.
    limit_value INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, limit_type)
);

-- API Usage Logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES ai_providers(id) ON DELETE SET NULL,
    model_id INTEGER REFERENCES ai_models(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    status_code INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    cost NUMERIC(10, 6),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_providers_active ON ai_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_model ON api_usage_logs(provider_id, model_id);
