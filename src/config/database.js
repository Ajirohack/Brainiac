/*
 * Database configuration for Knex / Objection.js.
 * - Development uses a local SQLite file for ease of setup.
 * - Test uses an in-memory SQLite database.
 * - Production expects environment variables for Postgres but can be adapted.
 */

require('dotenv').config();

module.exports.DB_CONFIG = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.SQLITE_FILENAME || './data/dev.sqlite3'
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations'
    },
    pool: {
      afterCreate: (conn, done) => {
        // Enable foreign keys for SQLite
        conn.run('PRAGMA foreign_keys = ON', done);
      }
    }
  },

  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true
  },

  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    }
  }
};
