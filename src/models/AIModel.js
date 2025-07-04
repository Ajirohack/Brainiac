const { Model } = require('objection');
const { DB_CONFIG } = require('../../config/database');

// Initialize knex if not already initialized
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(DB_CONFIG[environment]);

// Bind all models to the knex instance
Model.knex(knex);

class AIModel extends Model {
    static get tableName() {
        return 'ai_models';
    }

    static get idColumn() {
        return 'id';
    }

    static get jsonSchema() {
        return {
            type: 'object',
            required: ['provider_id', 'model_name', 'model_id'],
            properties: {
                id: { type: 'integer' },
                provider_id: { type: 'integer' },
                model_name: { type: 'string', minLength: 1, maxLength: 100 },
                model_id: { type: 'string', minLength: 1, maxLength: 100 },
                is_active: { type: 'boolean', default: true },
                context_length: { type: ['integer', 'null'] },
                max_tokens: { type: ['integer', 'null'] },
                is_chat_model: { type: 'boolean', default: true },
                is_embedding_model: { type: 'boolean', default: false },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
                config: { type: ['object', 'null'] }
            }
        };
    }

    static get relationMappings() {
        const AIProvider = require('./AIProvider');
        const ModelCapability = require('./ModelCapability');
        
        return {
            provider: {
                relation: Model.BelongsToOneRelation,
                modelClass: AIProvider,
                join: {
                    from: 'ai_models.provider_id',
                    to: 'ai_providers.id'
                }
            },
            capabilities: {
                relation: Model.HasManyRelation,
                modelClass: ModelCapability,
                join: {
                    from: 'ai_models.id',
                    to: 'model_capabilities.model_id'
                }
            }
        };
    }

    $beforeInsert() {
        this.created_at = new Date().toISOString();
        this.updated_at = this.created_at;
    }

    $beforeUpdate() {
        this.updated_at = new Date().toISOString();
    }

    // Check if model supports a specific capability
    async supports(capability) {
        if (!this.capabilities) {
            await this.$fetchGraph('capabilities');
        }
        return this.capabilities.some(
            cap => cap.capability === capability && cap.is_supported === true
        );
    }

    // Add capability to model
    async addCapability(capability, details = {}) {
        const existing = await this.$relatedQuery('capabilities')
            .where('capability', capability)
            .first();
        
        if (existing) {
            return existing.$query().patch({
                is_supported: true,
                details: { ...existing.details, ...details },
                updated_at: new Date().toISOString()
            });
        }
        
        return this.$relatedQuery('capabilities').insert({
            model_id: this.id,
            capability,
            is_supported: true,
            details
        });
    }

    // Remove capability from model
    async removeCapability(capability) {
        return this.$relatedQuery('capabilities')
            .where('capability', capability)
            .patch({
                is_supported: false,
                updated_at: new Date().toISOString()
            });
    }

    // Get active models for a specific provider
    static async getActiveModels(providerId) {
        return this.query()
            .where('provider_id', providerId)
            .where('is_active', true);
    }

    // Find model by provider and model ID
    static async findByProviderAndModelId(providerId, modelId) {
        return this.query()
            .where('provider_id', providerId)
            .where('model_id', modelId)
            .first();
    }

    // Get model usage statistics
    async getUsageStats(timeRange = '24h') {
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
            WHERE model_id = ?
            AND created_at >= NOW() - INTERVAL ?
            GROUP BY time
            ORDER BY time
        `, [this.id, timeAgo]);
        
        return stats.rows;
    }
}

module.exports = AIModel;
