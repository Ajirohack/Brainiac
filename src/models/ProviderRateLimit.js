const { Model } = require('objection');
const { DB_CONFIG } = require('../config/database');

// Initialize knex if not already initialized
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(DB_CONFIG[environment]);

// Bind all models to the knex instance
Model.knex(knex);

class ProviderRateLimit extends Model {
    static get tableName() {
        return 'provider_rate_limits';
    }

    static get idColumn() {
        return 'id';
    }

    static get jsonSchema() {
        return {
            type: 'object',
            required: ['provider_id', 'limit_type', 'limit_value', 'window_seconds'],
            properties: {
                id: { type: 'integer' },
                provider_id: { type: 'integer' },
                limit_type: { type: 'string', enum: ['rpm', 'tpm', 'rpd', 'tpd'] },
                limit_value: { type: 'integer', minimum: 1 },
                window_seconds: { type: 'integer', minimum: 1 },
                updated_at: { type: 'string', format: 'date-time' }
            }
        };
    }

    static get relationMappings() {
        const AIProvider = require('./AIProvider');
        
        return {
            provider: {
                relation: Model.BelongsToOneRelation,
                modelClass: AIProvider,
                join: {
                    from: 'provider_rate_limits.provider_id',
                    to: 'ai_providers.id'
                }
            }
        };
    }

    $beforeUpdate() {
        this.updated_at = new Date().toISOString();
    }

    // Get rate limits for a provider
    static async getRateLimits(providerId) {
        const limits = await this.query()
            .where('provider_id', providerId);
            
        return limits.reduce((acc, limit) => {
            acc[limit.limit_type] = {
                limit: limit.limit_value,
                window: limit.window_seconds
            };
            return acc;
        }, {});
    }

    // Check if a request is allowed based on rate limits
    static async isRequestAllowed(providerId, limitType = 'rpm') {
        const rateLimit = await this.query()
            .where('provider_id', providerId)
            .where('limit_type', limitType)
            .first();
            
        if (!rateLimit) return true; // No rate limit configured for this type
        
        // Get current usage in the window
        const windowStart = new Date(Date.now() - (rateLimit.window_seconds * 1000));
        
        const usage = await this.constructor.knex('api_usage_logs')
            .where('provider_id', providerId)
            .where('created_at', '>=', windowStart.toISOString())
            .count('* as count')
            .first();
            
        return parseInt(usage.count) < rateLimit.limit_value;
    }

    // Get rate limit status for a provider
    static async getRateLimitStatus(providerId) {
        const rateLimits = await this.query()
            .where('provider_id', providerId);
            
        const status = {};
        
        for (const limit of rateLimits) {
            const windowStart = new Date(Date.now() - (limit.window_seconds * 1000));
            
            const usage = await this.constructor.knex('api_usage_logs')
                .where('provider_id', providerId)
                .where('created_at', '>=', windowStart.toISOString())
                .count('* as count')
                .first();
                
            status[limit.limit_type] = {
                limit: limit.limit_value,
                used: parseInt(usage.count),
                remaining: Math.max(0, limit.limit_value - parseInt(usage.count)),
                window_seconds: limit.window_seconds,
                reset: new Date(Date.now() + (limit.window_seconds * 1000)).toISOString()
            };
        }
        
        return status;
    }
}

module.exports = ProviderRateLimit;
