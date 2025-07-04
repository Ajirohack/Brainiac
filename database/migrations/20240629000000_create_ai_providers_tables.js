const TABLE_NAMES = {
  AI_PROVIDERS: 'ai_providers',
  AI_MODELS: 'ai_models',
  MODEL_CAPABILITIES: 'model_capabilities',
  PROVIDER_RATE_LIMITS: 'provider_rate_limits',
  API_USAGE_LOGS: 'api_usage_logs'
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function(knex) {
  // Create AI Providers table
  await knex.schema.createTable(TABLE_NAMES.AI_PROVIDERS, (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('provider_type', 50).notNullable();
    table.string('base_url', 255).nullable();
    table.text('api_key_encrypted').nullable();
    table.string('api_key_encryption_iv', 100).nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('supports_dynamic_models').defaultTo(false);
    table.integer('priority').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by', 100).defaultTo('system');
    table.jsonb('config').nullable();
    
    table.unique(['name', 'provider_type']);
  });

  // Create AI Models table
  await knex.schema.createTable(TABLE_NAMES.AI_MODELS, (table) => {
    table.increments('id').primary();
    table.integer('provider_id').unsigned().notNullable()
      .references('id').inTable(TABLE_NAMES.AI_PROVIDERS).onDelete('CASCADE');
    table.string('model_name', 100).notNullable();
    table.string('model_id', 100).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('context_length').nullable();
    table.integer('max_tokens').nullable();
    table.boolean('is_chat_model').defaultTo(true);
    table.boolean('is_embedding_model').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.jsonb('config').nullable();
    
    table.unique(['provider_id', 'model_id']);
  });

  // Create Model Capabilities table
  await knex.schema.createTable(TABLE_NAMES.MODEL_CAPABILITIES, (table) => {
    table.increments('id').primary();
    table.integer('model_id').unsigned().notNullable()
      .references('id').inTable(TABLE_NAMES.AI_MODELS).onDelete('CASCADE');
    table.string('capability', 50).notNullable();
    table.boolean('is_supported').defaultTo(true);
    table.jsonb('details').nullable();
    
    table.unique(['model_id', 'capability']);
  });

  // Create Provider Rate Limits table
  await knex.schema.createTable(TABLE_NAMES.PROVIDER_RATE_LIMITS, (table) => {
    table.increments('id').primary();
    table.integer('provider_id').unsigned().notNullable()
      .references('id').inTable(TABLE_NAMES.AI_PROVIDERS).onDelete('CASCADE');
    table.enum('limit_type', ['rpm', 'tpm', 'rpd', 'tpd']).notNullable();
    table.integer('limit_value').unsigned().notNullable();
    table.integer('window_seconds').unsigned().notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.unique(['provider_id', 'limit_type']);
  });

  // Create API Usage Logs table
  await knex.schema.createTable(TABLE_NAMES.API_USAGE_LOGS, (table) => {
    table.bigIncrements('id').primary();
    table.integer('provider_id').unsigned().nullable()
      .references('id').inTable(TABLE_NAMES.AI_PROVIDERS).onDelete('SET NULL');
    table.integer('model_id').unsigned().nullable()
      .references('id').inTable(TABLE_NAMES.AI_MODELS).onDelete('SET NULL');
    table.string('endpoint', 255).notNullable();
    table.integer('status_code').nullable();
    table.integer('prompt_tokens').nullable();
    table.integer('completion_tokens').nullable();
    table.integer('total_tokens').nullable();
    table.integer('latency_ms').nullable();
    table.decimal('cost', 10, 6).nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Add indexes for performance
    table.index(['provider_id', 'model_id']);
    table.index(['created_at']);
  });
  
  // Add indexes for performance
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_ai_providers_active ON ${TABLE_NAMES.AI_PROVIDERS}(is_active);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ${TABLE_NAMES.AI_MODELS}(provider_id, is_active);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON ${TABLE_NAMES.API_USAGE_LOGS}(created_at);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_model ON ${TABLE_NAMES.API_USAGE_LOGS}(provider_id, model_id);`);
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function(knex) {
  // Drop tables in reverse order of creation to handle foreign key constraints
  await knex.schema.dropTableIfExists(TABLE_NAMES.API_USAGE_LOGS);
  await knex.schema.dropTableIfExists(TABLE_NAMES.PROVIDER_RATE_LIMITS);
  await knex.schema.dropTableIfExists(TABLE_NAMES.MODEL_CAPABILITIES);
  await knex.schema.dropTableIfExists(TABLE_NAMES.AI_MODELS);
  await knex.schema.dropTableIfExists(TABLE_NAMES.AI_PROVIDERS);
  
  // Drop indexes
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_ai_providers_active;`);
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_ai_models_provider;`);
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_api_usage_logs_created_at;`);
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_api_usage_logs_provider_model;`);
};

// Add this to help with TypeScript/IntelliSense
exports.config = { transaction: true };
