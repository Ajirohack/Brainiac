const { Model } = require('objection');
const { DB_CONFIG } = require('../config/database');

// Initialize knex if not already initialized
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(DB_CONFIG[environment]);

// Bind all models to the knex instance
Model.knex(knex);

class ModelCapability extends Model {
    static get tableName() {
        return 'model_capabilities';
    }

    static get idColumn() {
        return 'id';
    }

    static get jsonSchema() {
        return {
            type: 'object',
            required: ['model_id', 'capability'],
            properties: {
                id: { type: 'integer' },
                model_id: { type: 'integer' },
                capability: { type: 'string', minLength: 1, maxLength: 50 },
                is_supported: { type: 'boolean', default: true },
                details: { type: ['object', 'null'] }
            }
        };
    }

    static get relationMappings() {
        const AIModel = require('./AIModel');
        
        return {
            model: {
                relation: Model.BelongsToOneRelation,
                modelClass: AIModel,
                join: {
                    from: 'model_capabilities.model_id',
                    to: 'ai_models.id'
                }
            }
        };
    }

    // Get all models that support a specific capability
    static async getModelsWithCapability(capability) {
        return this.query()
            .where('capability', capability)
            .where('is_supported', true)
            .withGraphFetched('model');
    }

    // Check if a model has a specific capability
    static async hasCapability(modelId, capability) {
        const capabilityRecord = await this.query()
            .where('model_id', modelId)
            .where('capability', capability)
            .where('is_supported', true)
            .first();
            
        return !!capabilityRecord;
    }

    // Get all capabilities for a model
    static async getModelCapabilities(modelId) {
        const capabilities = await this.query()
            .where('model_id', modelId)
            .where('is_supported', true);
            
        return capabilities.map(cap => ({
            capability: cap.capability,
            details: cap.details || {}
        }));
    }
}

module.exports = ModelCapability;
