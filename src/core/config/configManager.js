/**
 * Configuration Manager - Centralized configuration management for the CAI Platform
 * 
 * Handles loading, validation, and management of configuration from multiple sources
 */

const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger');

class ConfigManager {
    constructor(options = {}) {
        this.logger = new Logger('ConfigManager');
        this.environment = options.environment || process.env.NODE_ENV || 'development';
        this.configDir = options.configDir || 'config';
        this.config = {};
        this.watchers = new Map();
        this.isLoaded = false;
    }

    /**
     * Load configuration from all sources
     */
    async loadConfiguration() {
        try {
            this.logger.info(`🔧 Loading configuration for environment: ${this.environment}`);

            // Load base configuration
            await this.loadBaseConfig();

            // Load environment-specific configuration
            await this.loadEnvironmentConfig();

            // Load component-specific configurations
            await this.loadComponentConfigs();

            // Apply environment variable overrides
            this.applyEnvironmentOverrides();

            // Validate configuration
            this.validateConfiguration();

            this.isLoaded = true;
            this.logger.info('✅ Configuration loaded successfully');

            return this.config;

        } catch (error) {
            this.logger.error('❌ Failed to load configuration:', error);
            throw error;
        }
    }

    /**
     * Load base configuration
     */
    async loadBaseConfig() {
        const baseConfigPath = path.join(this.configDir, 'base.json');

        try {
            const configContent = await fs.readFile(baseConfigPath, 'utf8');
            const baseConfig = JSON.parse(configContent);
            this.config = { ...baseConfig };
            this.logger.debug('📄 Base configuration loaded');
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn('⚠️ Base configuration file not found, using defaults');
                this.config = this.getDefaultConfiguration();
            } else {
                throw error;
            }
        }
    }

    /**
     * Load environment-specific configuration
     */
    async loadEnvironmentConfig() {
        const envConfigPath = path.join(this.configDir, this.environment, 'app.json');

        try {
            const configContent = await fs.readFile(envConfigPath, 'utf8');
            const envConfig = JSON.parse(configContent);
            this.config = this.mergeConfigs(this.config, envConfig);
            this.logger.debug(`🌍 Environment configuration loaded: ${this.environment}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`⚠️ Environment configuration not found: ${envConfigPath}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Load component-specific configurations
     */
    async loadComponentConfigs() {
        const components = ['brain', 'agents', 'rag', 'integration'];

        for (const component of components) {
            await this.loadComponentConfig(component);
        }
    }

    /**
     * Load individual component configuration
     */
    async loadComponentConfig(component) {
        const componentConfigPath = path.join(this.configDir, this.environment, `${component}_config.json`);

        try {
            const configContent = await fs.readFile(componentConfigPath, 'utf8');
            const componentConfig = JSON.parse(configContent);

            if (!this.config.components) {
                this.config.components = {};
            }

            this.config.components[component] = componentConfig;
            this.logger.debug(`🧩 Component configuration loaded: ${component}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(`⚠️ Component configuration not found: ${component}`);
                // Set default component config
                if (!this.config.components) {
                    this.config.components = {};
                }
                this.config.components[component] = this.getDefaultComponentConfig(component);
            } else {
                throw error;
            }
        }
    }

    /**
     * Apply environment variable overrides
     */
    applyEnvironmentOverrides() {
        const envOverrides = {
            // Server configuration
            'server.port': process.env.PORT,
            'server.host': process.env.HOST,

            // Database configuration
            'database.host': process.env.DB_HOST,
            'database.port': process.env.DB_PORT,
            'database.name': process.env.DB_NAME,
            'database.user': process.env.DB_USER,
            'database.password': process.env.DB_PASSWORD,

            // Redis configuration
            'redis.host': process.env.REDIS_HOST,
            'redis.port': process.env.REDIS_PORT,
            'redis.password': process.env.REDIS_PASSWORD,

            // API Keys
            'api.openai_key': process.env.OPENAI_API_KEY,
            'api.anthropic_key': process.env.ANTHROPIC_API_KEY,

            // Logging
            'logging.level': process.env.LOG_LEVEL,
            'logging.format': process.env.LOG_FORMAT
        };

        for (const [path, value] of Object.entries(envOverrides)) {
            if (value !== undefined) {
                this.setConfigValue(path, value);
                this.logger.debug(`🔄 Environment override applied: ${path}`);
            }
        }
    }

    /**
     * Validate configuration
     */
    validateConfiguration() {
        const requiredPaths = [
            'server.port',
            'server.host'
        ];

        for (const path of requiredPaths) {
            const value = this.getConfigValue(path);
            if (value === undefined || value === null) {
                throw new Error(`Required configuration missing: ${path}`);
            }
        }

        // Validate port number
        const port = this.getConfigValue('server.port');
        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port number: ${port}`);
        }

        this.logger.debug('✅ Configuration validation passed');
    }

    /**
     * Get default configuration
     */
    getDefaultConfiguration() {
        return {
            server: {
                port: 8000,
                host: '0.0.0.0',
                cors: {
                    enabled: true,
                    origins: ['http://localhost:3000']
                }
            },
            database: {
                host: 'localhost',
                port: 5432,
                name: 'cai_platform',
                pool: {
                    min: 2,
                    max: 10
                }
            },
            redis: {
                host: 'localhost',
                port: 6379,
                ttl: 3600
            },
            logging: {
                level: 'info',
                format: 'text',
                file: true,
                console: true
            },
            api: {
                rate_limit: {
                    window_ms: 900000, // 15 minutes
                    max: 100
                },
                timeout: 30000
            },
            components: {}
        };
    }

    /**
     * Get default component configuration
     */
    getDefaultComponentConfig(component) {
        const defaults = {
            brain: {
                enabled: true,
                layers: {
                    perception: { enabled: true },
                    attention: { enabled: true },
                    memory: { enabled: true },
                    reasoning: { enabled: true },
                    emotion: { enabled: true },
                    decision: { enabled: true },
                    action: { enabled: true }
                },
                performance: {
                    timeout: 30000,
                    parallel_processing: false
                }
            },
            agents: {
                enabled: true,
                council_size: 5,
                decision_threshold: 0.7,
                timeout: 30000,
                agents: {
                    knowledge: { enabled: true },
                    reasoning: { enabled: true },
                    content: { enabled: true },
                    tools: { enabled: true }
                }
            },
            rag: {
                enabled: true,
                index_path: 'data/embeddings',
                chunk_size: 1000,
                overlap: 200,
                embedding: {
                    provider: 'openai',
                    model: 'text-embedding-ada-002'
                },
                retrieval: {
                    top_k: 10,
                    similarity_threshold: 0.7
                }
            },
            integration: {
                enabled: true,
                routing: {
                    strategy: 'intelligent',
                    fallback: 'rag'
                },
                synthesis: {
                    strategy: 'weighted_merge',
                    quality_threshold: 0.8
                }
            }
        };

        return defaults[component] || {};
    }

    /**
     * Merge configurations with deep merge
     */
    mergeConfigs(target, source) {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeConfigs(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    /**
     * Get configuration value by path
     */
    getConfigValue(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }

        return current;
    }

    /**
     * Set configuration value by path
     */
    setConfigValue(path, value) {
        const keys = path.split('.');
        let current = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get component configuration
     */
    getComponentConfig(component) {
        return this.getConfigValue(`components.${component}`, {});
    }

    /**
     * Get server configuration
     */
    getServerConfig() {
        return this.getConfigValue('server', {});
    }

    /**
     * Get database configuration
     */
    getDatabaseConfig() {
        return this.getConfigValue('database', {});
    }

    /**
     * Get Redis configuration
     */
    getRedisConfig() {
        return this.getConfigValue('redis', {});
    }

    /**
     * Get logging configuration
     */
    getLoggingConfig() {
        return this.getConfigValue('logging', {});
    }

    /**
     * Get API configuration
     */
    getApiConfig() {
        return this.getConfigValue('api', {});
    }

    /**
     * Watch configuration file for changes
     */
    async watchConfig(filePath, callback) {
        try {
            const watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.logger.info(`📁 Configuration file changed: ${filePath}`);
                    callback();
                }
            });

            this.watchers.set(filePath, watcher);
            this.logger.debug(`👀 Watching configuration file: ${filePath}`);
        } catch (error) {
            this.logger.warn(`⚠️ Failed to watch configuration file: ${filePath}`, error);
        }
    }

    /**
     * Reload configuration
     */
    async reloadConfiguration() {
        this.logger.info('🔄 Reloading configuration...');
        this.config = {};
        this.isLoaded = false;
        await this.loadConfiguration();
    }

    /**
     * Stop watching configuration files
     */
    stopWatching() {
        for (const [filePath, watcher] of this.watchers) {
            watcher.close();
            this.logger.debug(`👁️ Stopped watching: ${filePath}`);
        }
        this.watchers.clear();
    }

    /**
     * Get full configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Check if configuration is loaded
     */
    isConfigLoaded() {
        return this.isLoaded;
    }
}

module.exports = ConfigManager;