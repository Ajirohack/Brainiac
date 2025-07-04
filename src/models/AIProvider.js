const { Model } = require('objection');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { DB_CONFIG } = require('../../config/database');

// Initialize knex if not already initialized
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(DB_CONFIG[environment]);

// Bind all models to the knex instance
Model.knex(knex);

class AIProvider extends Model {
    static get tableName() {
        return 'ai_providers';
    }

    static get idColumn() {
        return 'id';
    }

    static get jsonSchema() {
        return {
            type: 'object',
            required: ['name', 'provider_type'],
            properties: {
                id: { type: 'integer' },
                name: { type: 'string', minLength: 1, maxLength: 100 },
                provider_type: { type: 'string', minLength: 1, maxLength: 50 },
                base_url: { type: ['string', 'null'], maxLength: 255 },
                api_key_encrypted: { type: ['string', 'null'] },
                api_key_encryption_iv: { type: ['string', 'null'], maxLength: 100 },
                is_active: { type: 'boolean', default: true },
                supports_dynamic_models: { type: 'boolean', default: false },
                priority: { type: 'integer', default: 0 },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
                created_by: { type: 'string', default: 'system' },
                config: { type: ['object', 'null'] }
            }
        };
    }

    static get relationMappings() {
        const AIModel = require('./AIModel');
        const ProviderRateLimit = require('./ProviderRateLimit');
        
        return {
            models: {
                relation: Model.HasManyRelation,
                modelClass: AIModel,
                join: {
                    from: 'ai_providers.id',
                    to: 'ai_models.provider_id'
                }
            },
            rateLimits: {
                relation: Model.HasManyRelation,
                modelClass: ProviderRateLimit,
                join: {
                    from: 'ai_providers.id',
                    to: 'provider_rate_limits.provider_id'
                }
            }
        };
    }

    // Encrypt API key before saving
    async $beforeInsert(context) {
        await super.$beforeInsert(context);
        this.encryptApiKey();
        this.created_at = new Date().toISOString();
        this.updated_at = this.created_at;
    }

    async $beforeUpdate(opt, context) {
        await super.$beforeUpdate(opt, context);
        if (this.api_key_encrypted) {
            this.encryptApiKey();
        }
        this.updated_at = new Date().toISOString();
    }

    // Encrypt the API key using AES-256-CBC
    encryptApiKey() {
        if (!this.api_key_encrypted && !process.env.ENCRYPTION_KEY) {
            throw new Error('Encryption key not configured');
        }

        if (this.api_key_encrypted && !this.api_key_encrypted.startsWith('enc:')) {
            // Only encrypt if not already encrypted
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(
                'aes-256-cbc',
                Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
                iv
            );
            
            let encrypted = cipher.update(this.api_key_encrypted, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            this.api_key_encrypted = `enc:${encrypted}`;
            this.api_key_encryption_iv = iv.toString('hex');
        }
    }

    // Decrypt the API key
    decryptApiKey() {
        if (!this.api_key_encrypted || !this.api_key_encryption_iv) {
            return null;
        }

        if (this.api_key_encrypted.startsWith('enc:')) {
            try {
                const encryptedText = this.api_key_encrypted.substring(4);
                const iv = Buffer.from(this.api_key_encryption_iv, 'hex');
                const decipher = crypto.createDecipheriv(
                    'aes-256-cbc',
                    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
                    iv
                );
                
                let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            } catch (error) {
                console.error('Failed to decrypt API key:', error);
                return null;
            }
        }
        return this.api_key_encrypted; // Return as is if not encrypted
    }

    // Get decrypted API key (virtual field)
    get apiKey() {
        return this.decryptApiKey();
    }

    // Set API key (will be encrypted on save)
    set apiKey(value) {
        this.api_key_encrypted = value;
    }

    // Static methods for provider management
    static async getActiveProviders() {
        return this.query()
            .where('is_active', true)
            .orderBy('priority', 'desc')
            .withGraphFetched('models');
    }

    static async getProviderByName(name, providerType) {
        return this.query()
            .where('name', name)
            .where('provider_type', providerType)
            .first();
    }

    // Update provider rate limits
    async updateRateLimits(limits) {
        const { transaction } = this.constructor;
        
        // Delete existing rate limits
        await this.$relatedQuery('rateLimits').delete();
        
        // Add new rate limits
        const rateLimits = Object.entries(limits).map(([limitType, config]) => ({
            provider_id: this.id,
            limit_type: limitType,
            limit_value: config.limit,
            window_seconds: config.window
        }));
        
        if (rateLimits.length > 0) {
            await this.$relatedQuery('rateLimits').insert(rateLimits);
        }
    }

    // Check if the provider has available rate limit
    async checkRateLimit(limitType = 'rpm') {
        const rateLimit = await this.$relatedQuery('rateLimits')
            .where('limit_type', limitType)
            .first();
            
        if (!rateLimit) return true; // No rate limit configured
        
        // Get usage in the current window
        const usage = await this.constructor.knex('api_usage_logs')
            .where('provider_id', this.id)
            .where('created_at', '>=', 
                this.constructor.knex.raw(`NOW() - INTERVAL '${rateLimit.window_seconds} seconds'`)
            )
            .count('* as count')
            .first();
            
        return parseInt(usage.count) < rateLimit.limit_value;
    }

    // Log API usage
    async logApiUsage({
        modelId,
        endpoint,
        statusCode,
        promptTokens = 0,
        completionTokens = 0,
        totalTokens = 0,
        latencyMs = 0,
        cost = null,
        errorMessage = null
    }) {
        return this.constructor.knex('api_usage_logs').insert({
            provider_id: this.id,
            model_id: modelId,
            endpoint,
            status_code: statusCode,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            latency_ms: latencyMs,
            cost,
            error_message: errorMessage,
            created_at: new Date().toISOString()
        });
    }

    // Get provider statistics
    async getStats(timeRange = '24h') {
        let interval = '1 hour';
        let timeAgo = '24 hours';
        
        switch (timeRange) {
            case '1h':
                interval = '1 minute';
                timeAgo = '1 hour';
                break;
            case '24h':
                interval = '1 hour';
                timeAgo = '24 hours';
                break;
            case '7d':
                interval = '1 day';
                timeAgo = '7 days';
                break;
            case '30d':
                interval = '1 day';
                timeAgo = '30 days';
                break;
        }
        
        const stats = await this.constructor.knex.raw(`
            SELECT
                time_bucket(:interval, created_at) AS time,
                COUNT(*) AS request_count,
                SUM(total_tokens) AS total_tokens,
                AVG(latency_ms) AS avg_latency,
                SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS success_count,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
                SUM(cost) AS total_cost
            FROM api_usage_logs
            WHERE provider_id = ?
            AND created_at >= NOW() - INTERVAL ?
            GROUP BY time
            ORDER BY time
        `, [this.id, timeAgo]);
        
        return stats.rows;
    }
}

module.exports = AIProvider;
