/*
 * User model for authentication & authorisation middleware.
 * This is a minimal implementation to satisfy current runtime needs.
 * It uses Objection.js and expects a `users` table with the columns listed in the jsonSchema.
 * Extend as needed with full relations, hooks, etc.
 */

const { Model } = require('objection');
const { DB_CONFIG } = require('../config/database');

// Initialise knex once per process (reuse existing connection if any)
const environment = process.env.NODE_ENV || 'development';
let knexInstance;
try {
  // Attempt to reuse any initialised Model.knex connection
  knexInstance = Model.knex();
} catch {
  // Not initialised yet
  const knex = require('knex')(DB_CONFIG[environment]);
  Model.knex(knex);
  knexInstance = knex;
}

class User extends Model {
  static get tableName() {
    return 'users';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['email', 'password_hash'],
      properties: {
        id: { type: 'integer' },
        email: { type: 'string', format: 'email', minLength: 3, maxLength: 255 },
        password_hash: { type: 'string' },
        is_active: { type: 'boolean', default: true },
        roles: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' }
      }
    };
  }

  $beforeInsert() {
    const now = new Date().toISOString();
    this.created_at = now;
    this.updated_at = now;
  }

  $beforeUpdate() {
    this.updated_at = new Date().toISOString();
  }
}

module.exports = User;
