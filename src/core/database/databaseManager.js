/**
 * Database Manager - Centralized database management for the CAI Platform
 * 
 * Handles connections to PostgreSQL, Redis, and other data stores
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger');

class DatabaseManager {
    constructor(config = {}) {
        this.logger = new Logger('DatabaseManager');
        this.config = config;

        // Database connections
        this.pgPool = null;
        this.redisClient = null;
        this.redisSubscriber = null;
        this.redisPublisher = null;

        // Connection states
        this.isPostgresConnected = false;
        this.isRedisConnected = false;

        // Connection pools and settings
        this.connectionRetries = 3;
        this.retryDelay = 5000;

        // Health check intervals
        this.healthCheckInterval = null;
        this.healthCheckFrequency = 30000; // 30 seconds
    }

    /**
     * Initialize all database connections
     */
    async initialize() {
        try {
            this.logger.info('🗄️ Initializing Database Manager...');

            // Initialize PostgreSQL
            await this.initializePostgreSQL();

            // Initialize Redis
            await this.initializeRedis();

            // Start health monitoring
            this.startHealthMonitoring();

            this.logger.info('✅ Database Manager initialized successfully');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Database Manager:', error);
            throw error;
        }
    }

    /**
     * Initialize PostgreSQL connection
     */
    async initializePostgreSQL() {
        try {
            const dbConfig = this.config.database || {};

            const poolConfig = {
                host: dbConfig.host || 'localhost',
                port: dbConfig.port || 5432,
                database: dbConfig.name || 'cai_platform',
                user: dbConfig.user || 'postgres',
                password: dbConfig.password || '',
                min: dbConfig.pool?.min || 2,
                max: dbConfig.pool?.max || 10,
                idleTimeoutMillis: dbConfig.pool?.idle_timeout || 30000,
                connectionTimeoutMillis: dbConfig.pool?.connection_timeout || 10000
            };

            this.pgPool = new Pool(poolConfig);

            // Test connection
            const client = await this.pgPool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isPostgresConnected = true;
            this.logger.info(`🐘 PostgreSQL connected: ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);

            // Setup error handlers
            this.pgPool.on('error', (err) => {
                this.logger.error('PostgreSQL pool error:', err);
                this.isPostgresConnected = false;
            });

            // Initialize database schema
            await this.initializeSchema();

        } catch (error) {
            this.logger.error('❌ Failed to initialize PostgreSQL:', error);
            throw error;
        }
    }

    /**
     * Initialize Redis connections
     */
    async initializeRedis() {
        try {
            const redisConfig = this.config.redis || {};

            const connectionConfig = {
                host: redisConfig.host || 'localhost',
                port: redisConfig.port || 6379,
                password: redisConfig.password || undefined,
                db: redisConfig.db || 0,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true
            };

            // Main Redis client
            this.redisClient = new Redis(connectionConfig);

            // Subscriber client (for pub/sub)
            this.redisSubscriber = new Redis(connectionConfig);

            // Publisher client (for pub/sub)
            this.redisPublisher = new Redis(connectionConfig);

            // Connect all clients
            await Promise.all([
                this.redisClient.connect(),
                this.redisSubscriber.connect(),
                this.redisPublisher.connect()
            ]);

            this.isRedisConnected = true;
            this.logger.info(`🔴 Redis connected: ${connectionConfig.host}:${connectionConfig.port}`);

            // Setup error handlers
            this.redisClient.on('error', (err) => {
                this.logger.error('Redis client error:', err);
                this.isRedisConnected = false;
            });

            this.redisSubscriber.on('error', (err) => {
                this.logger.error('Redis subscriber error:', err);
            });

            this.redisPublisher.on('error', (err) => {
                this.logger.error('Redis publisher error:', err);
            });

        } catch (error) {
            this.logger.error('❌ Failed to initialize Redis:', error);
            throw error;
        }
    }

    /**
     * Initialize database schema
     */
    async initializeSchema() {
        try {
            this.logger.info('📋 Initializing database schema...');

            const schemaPath = path.join(__dirname, '../../..', 'scripts', 'database', 'schema.sql');

            try {
                const schemaSQL = await fs.readFile(schemaPath, 'utf8');
                await this.pgPool.query(schemaSQL);
                this.logger.info('✅ Database schema initialized');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    this.logger.warn('⚠️ Schema file not found, creating basic tables...');
                    await this.createBasicTables();
                } else {
                    throw error;
                }
            }

        } catch (error) {
            this.logger.error('❌ Failed to initialize schema:', error);
            throw error;
        }
    }

    /**
     * Create basic tables if schema file doesn't exist
     */
    async createBasicTables() {
        const basicSchema = `
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Sessions table
            CREATE TABLE IF NOT EXISTS sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER REFERENCES users(id),
                session_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP
            );
            
            -- Conversations table
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER REFERENCES users(id),
                title VARCHAR(255),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Messages table
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID REFERENCES conversations(id),
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Knowledge base table
            CREATE TABLE IF NOT EXISTS knowledge_base (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                embedding_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- System logs table
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                level VARCHAR(20) NOT NULL,
                component VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Performance metrics table
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id SERIAL PRIMARY KEY,
                operation VARCHAR(100) NOT NULL,
                duration INTEGER NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding_id ON knowledge_base(embedding_id);
            CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation ON performance_metrics(operation);
        `;

        await this.pgPool.query(basicSchema);
        this.logger.info('✅ Basic database tables created');
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckFrequency);

        this.logger.debug('💓 Database health monitoring started');
    }

    /**
     * Perform health check on all connections
     */
    async performHealthCheck() {
        try {
            // Check PostgreSQL
            if (this.pgPool) {
                const client = await this.pgPool.connect();
                await client.query('SELECT 1');
                client.release();

                if (!this.isPostgresConnected) {
                    this.isPostgresConnected = true;
                    this.logger.info('🐘 PostgreSQL connection restored');
                }
            }

            // Check Redis
            if (this.redisClient) {
                await this.redisClient.ping();

                if (!this.isRedisConnected) {
                    this.isRedisConnected = true;
                    this.logger.info('🔴 Redis connection restored');
                }
            }

        } catch (error) {
            this.logger.warn('⚠️ Database health check failed:', error.message);

            // Update connection states
            this.isPostgresConnected = false;
            this.isRedisConnected = false;
        }
    }

    /**
     * Execute PostgreSQL query
     */
    async query(text, params = []) {
        if (!this.isPostgresConnected) {
            throw new Error('PostgreSQL not connected');
        }

        try {
            const start = Date.now();
            const result = await this.pgPool.query(text, params);
            const duration = Date.now() - start;

            this.logger.debug(`🔍 Query executed in ${duration}ms`);
            return result;

        } catch (error) {
            this.logger.error('❌ Query execution failed:', error);
            throw error;
        }
    }

    /**
     * Execute transaction
     */
    async transaction(callback) {
        if (!this.isPostgresConnected) {
            throw new Error('PostgreSQL not connected');
        }

        const client = await this.pgPool.connect();

        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Redis operations
     */
    async setCache(key, value, ttl = 3600) {
        if (!this.isRedisConnected) {
            throw new Error('Redis not connected');
        }

        const serializedValue = JSON.stringify(value);
        await this.redisClient.setex(key, ttl, serializedValue);
    }

    async getCache(key) {
        if (!this.isRedisConnected) {
            throw new Error('Redis not connected');
        }

        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
    }

    async deleteCache(key) {
        if (!this.isRedisConnected) {
            return await this.redisClient.del(key);
        }
        return 0;
    }

    async publish(channel, message) {
        if (!this.isRedisConnected) {
            throw new Error('Redis not connected');
        }

        const serializedMessage = JSON.stringify(message);
        return await this.redisPublisher.publish(channel, serializedMessage);
    }

    async subscribe(channel, callback) {
        if (!this.isRedisConnected) {
            throw new Error('Redis not connected');
        }

        await this.redisSubscriber.subscribe(channel);
        this.redisSubscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    const parsedMessage = JSON.parse(message);
                    callback(parsedMessage);
                } catch (error) {
                    this.logger.error('Failed to parse Redis message:', error);
                }
            }
        });
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            postgres: this.isPostgresConnected,
            redis: this.isRedisConnected,
            overall: this.isPostgresConnected && this.isRedisConnected
        };
    }

    /**
     * Get database statistics
     */
    async getStatistics() {
        const stats = {
            postgres: null,
            redis: null
        };

        try {
            if (this.isPostgresConnected) {
                const pgStats = await this.query(`
                    SELECT 
                        numbackends as active_connections,
                        xact_commit as transactions_committed,
                        xact_rollback as transactions_rolled_back,
                        blks_read as blocks_read,
                        blks_hit as blocks_hit
                    FROM pg_stat_database 
                    WHERE datname = current_database()
                `);

                stats.postgres = pgStats.rows[0] || {};
            }

            if (this.isRedisConnected) {
                const redisInfo = await this.redisClient.info();
                const lines = redisInfo.split('\r\n');
                const redisStats = {};

                for (const line of lines) {
                    if (line.includes(':')) {
                        const [key, value] = line.split(':');
                        redisStats[key] = value;
                    }
                }

                stats.redis = {
                    connected_clients: redisStats.connected_clients,
                    used_memory: redisStats.used_memory_human,
                    total_commands_processed: redisStats.total_commands_processed,
                    keyspace_hits: redisStats.keyspace_hits,
                    keyspace_misses: redisStats.keyspace_misses
                };
            }

        } catch (error) {
            this.logger.error('Failed to get database statistics:', error);
        }

        return stats;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Database Manager...');

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            // Close Redis connections
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            if (this.redisSubscriber) {
                await this.redisSubscriber.quit();
            }
            if (this.redisPublisher) {
                await this.redisPublisher.quit();
            }

            // Close PostgreSQL pool
            if (this.pgPool) {
                await this.pgPool.end();
            }

            this.logger.info('✅ Database Manager shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during database shutdown:', error);
            throw error;
        }
    }
}

module.exports = DatabaseManager;