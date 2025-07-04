const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL } = process.env;

/**
 * Database configuration for different environments
 */
module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: DB_HOST || 'localhost',
      port: DB_PORT || 5432,
      user: DB_USER || 'postgres',
      password: DB_PASSWORD || 'postgres',
      database: DB_NAME || 'cai_platform_dev',
      ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
    debug: process.env.KNEX_DEBUG === 'true',
  },
  
  test: {
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || 5432,
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'cai_platform_test',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
  },
  
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
  },
};

// Export the knex instance for direct use if needed
const environment = process.env.NODE_ENV || 'development';
const knex = require('knex')(module.exports[environment]);

// Export the knex instance
module.exports.knex = knex;

// Export a function to get a transaction
module.exports.getTransaction = async () => {
  return await knex.transaction();
};

// Export a function to run migrations
module.exports.migrate = async () => {
  console.log('Running migrations...');
  await knex.migrate.latest();
  console.log('Migrations completed');};

// Export a function to run seeds
module.exports.seed = async () => {
  console.log('Running seeds...');
  await knex.seed.run();
  console.log('Seeds completed');
};

// Export a function to close the connection
module.exports.close = async () => {
  await knex.destroy();
};
