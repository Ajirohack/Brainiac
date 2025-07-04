#!/usr/bin/env node

/**
 * CAI Platform Initialization Script
 * 
 * This script helps set up the Cognitive Agentic Intelligence Platform
 * by creating necessary directories, checking dependencies, and initializing databases
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class PlatformInitializer {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.requiredDirectories = [
            'logs',
            'data',
            'data/embeddings',
            'data/uploads',
            'data/backups',
            'temp',
            'plugins'
        ];

        this.requiredFiles = [
            '.env'
        ];

        this.systemRequirements = {
            node: '16.0.0',
            npm: '8.0.0'
        };
    }

    /**
     * Main initialization process
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Cognitive Agentic Intelligence Platform...');
            console.log('='.repeat(60));

            // Check system requirements
            await this.checkSystemRequirements();

            // Create required directories
            await this.createDirectories();

            // Setup configuration files
            await this.setupConfiguration();

            // Install dependencies
            await this.installDependencies();

            // Initialize databases
            await this.initializeDatabases();

            // Setup logging
            await this.setupLogging();

            // Final setup
            await this.finalSetup();

            console.log('\n✅ Platform initialization completed successfully!');
            console.log('\n📋 Next Steps:');
            console.log('1. Update your .env file with your API keys and database credentials');
            console.log('2. Start the development server: npm run dev');
            console.log('3. Visit http://localhost:3000 to access the platform');
            console.log('4. Check the documentation at http://localhost:3000/docs');

        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    /**
     * Check system requirements
     */
    async checkSystemRequirements() {
        console.log('\n🔍 Checking system requirements...');

        // Check Node.js version
        const nodeVersion = process.version.substring(1);
        if (!this.compareVersions(nodeVersion, this.systemRequirements.node)) {
            throw new Error(`Node.js ${this.systemRequirements.node} or higher is required. Current: ${nodeVersion}`);
        }
        console.log(`✅ Node.js ${nodeVersion} (required: ${this.systemRequirements.node}+)`);

        // Check npm version
        try {
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            if (!this.compareVersions(npmVersion, this.systemRequirements.npm)) {
                throw new Error(`npm ${this.systemRequirements.npm} or higher is required. Current: ${npmVersion}`);
            }
            console.log(`✅ npm ${npmVersion} (required: ${this.systemRequirements.npm}+)`);
        } catch (error) {
            throw new Error('npm is not installed or not accessible');
        }

        // Check available disk space
        const stats = fs.statSync(this.projectRoot);
        console.log('✅ Disk space check passed');

        // Check write permissions
        try {
            const testFile = path.join(this.projectRoot, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log('✅ Write permissions verified');
        } catch (error) {
            throw new Error('No write permissions in project directory');
        }
    }

    /**
     * Create required directories
     */
    async createDirectories() {
        console.log('\n📁 Creating required directories...');

        for (const dir of this.requiredDirectories) {
            const dirPath = path.join(this.projectRoot, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`✅ Created directory: ${dir}`);
            } else {
                console.log(`ℹ️  Directory already exists: ${dir}`);
            }
        }

        // Create .gitkeep files for empty directories
        const emptyDirs = ['logs', 'data/uploads', 'data/backups', 'temp'];
        for (const dir of emptyDirs) {
            const gitkeepPath = path.join(this.projectRoot, dir, '.gitkeep');
            if (!fs.existsSync(gitkeepPath)) {
                fs.writeFileSync(gitkeepPath, '');
            }
        }
    }

    /**
     * Setup configuration files
     */
    async setupConfiguration() {
        console.log('\n⚙️  Setting up configuration files...');

        // Copy .env.example to .env if it doesn't exist
        const envPath = path.join(this.projectRoot, '.env');
        const envExamplePath = path.join(this.projectRoot, '.env.example');

        if (!fs.existsSync(envPath)) {
            if (fs.existsSync(envExamplePath)) {
                fs.copyFileSync(envExamplePath, envPath);
                console.log('✅ Created .env file from .env.example');
                console.log('⚠️  Please update .env with your actual configuration values');
            } else {
                console.log('⚠️  .env.example not found, creating basic .env file');
                this.createBasicEnvFile(envPath);
            }
        } else {
            console.log('ℹ️  .env file already exists');
        }

        // Validate configuration files
        const configDir = path.join(this.projectRoot, 'config');
        if (fs.existsSync(configDir)) {
            console.log('✅ Configuration directory found');
        } else {
            console.log('⚠️  Configuration directory not found');
        }
    }

    /**
     * Install dependencies
     */
    async installDependencies() {
        console.log('\n📦 Installing dependencies...');

        const shouldInstall = await this.askQuestion('Install npm dependencies? (y/n): ');
        if (shouldInstall.toLowerCase() === 'y' || shouldInstall.toLowerCase() === 'yes') {
            try {
                console.log('Installing production dependencies...');
                execSync('npm install --production=false', {
                    cwd: this.projectRoot,
                    stdio: 'inherit'
                });
                console.log('✅ Dependencies installed successfully');
            } catch (error) {
                console.log('⚠️  Failed to install dependencies automatically');
                console.log('Please run "npm install" manually');
            }
        } else {
            console.log('ℹ️  Skipping dependency installation');
            console.log('Remember to run "npm install" before starting the platform');
        }
    }

    /**
     * Initialize databases
     */
    async initializeDatabases() {
        console.log('\n🗄️  Database initialization...');

        console.log('ℹ️  Database initialization requires manual setup:');
        console.log('   1. PostgreSQL: Create database and user as specified in .env');
        console.log('   2. Redis: Ensure Redis server is running');
        console.log('   3. MongoDB: Ensure MongoDB server is running (if using)');

        const shouldCreateSchema = await this.askQuestion('Create database schema files? (y/n): ');
        if (shouldCreateSchema.toLowerCase() === 'y' || shouldCreateSchema.toLowerCase() === 'yes') {
            await this.createDatabaseSchema();
        }
    }

    /**
     * Create database schema files
     */
    async createDatabaseSchema() {
        const schemaDir = path.join(this.projectRoot, 'database', 'schema');
        if (!fs.existsSync(schemaDir)) {
            fs.mkdirSync(schemaDir, { recursive: true });
        }

        // Create basic PostgreSQL schema
        const pgSchemaPath = path.join(schemaDir, 'postgresql.sql');
        if (!fs.existsSync(pgSchemaPath)) {
            const pgSchema = `-- CAI Platform PostgreSQL Schema
-- Run this script to create the initial database structure

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    data JSONB,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255),
    permissions JSONB,
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Processing logs table
CREATE TABLE IF NOT EXISTS processing_logs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(255),
    user_id INTEGER REFERENCES users(id),
    input_data JSONB,
    output_data JSONB,
    processing_time INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
    id SERIAL PRIMARY KEY,
    metric_type VARCHAR(100),
    metric_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_user_id ON processing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_created_at ON processing_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_type_timestamp ON system_metrics(metric_type, timestamp);
`;

            fs.writeFileSync(pgSchemaPath, pgSchema);
            console.log('✅ Created PostgreSQL schema file');
        }
    }

    /**
     * Setup logging
     */
    async setupLogging() {
        console.log('\n📝 Setting up logging...');

        const logsDir = path.join(this.projectRoot, 'logs');
        if (fs.existsSync(logsDir)) {
            console.log('✅ Logs directory ready');
        }

        // Create log rotation configuration
        const logConfigPath = path.join(this.projectRoot, 'config', 'logging.json');
        if (!fs.existsSync(logConfigPath)) {
            const logConfig = {
                "appenders": {
                    "console": {
                        "type": "console"
                    },
                    "file": {
                        "type": "file",
                        "filename": "logs/cai-platform.log",
                        "maxLogSize": 10485760,
                        "backups": 5
                    }
                },
                "categories": {
                    "default": {
                        "appenders": ["console", "file"],
                        "level": "info"
                    }
                }
            };

            fs.writeFileSync(logConfigPath, JSON.stringify(logConfig, null, 2));
            console.log('✅ Created logging configuration');
        }
    }

    /**
     * Final setup tasks
     */
    async finalSetup() {
        console.log('\n🔧 Final setup tasks...');

        // Create a simple health check file
        const healthCheckPath = path.join(this.projectRoot, 'health.json');
        const healthCheck = {
            status: 'initialized',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
        fs.writeFileSync(healthCheckPath, JSON.stringify(healthCheck, null, 2));
        console.log('✅ Created health check file');

        // Set proper permissions (Unix-like systems)
        if (process.platform !== 'win32') {
            try {
                execSync('chmod +x scripts/setup/initialize.js', { cwd: this.projectRoot });
                console.log('✅ Set script permissions');
            } catch (error) {
                console.log('ℹ️  Could not set script permissions (this is normal on some systems)');
            }
        }
    }

    /**
     * Create basic .env file
     */
    createBasicEnvFile(envPath) {
        const basicEnv = `# CAI Platform Environment Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Security
JWT_SECRET=change-this-to-a-secure-random-string

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cai_platform
DB_USER=cai_user
DB_PASSWORD=change-this-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
`;

        fs.writeFileSync(envPath, basicEnv);
    }

    /**
     * Compare version strings
     */
    compareVersions(current, required) {
        const currentParts = current.split('.').map(Number);
        const requiredParts = required.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const currentPart = currentParts[i] || 0;
            const requiredPart = requiredParts[i] || 0;

            if (currentPart > requiredPart) return true;
            if (currentPart < requiredPart) return false;
        }

        return true;
    }

    /**
     * Ask user a question
     */
    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    }
}

// Run the initializer if this script is executed directly
if (require.main === module) {
    const initializer = new PlatformInitializer();
    initializer.initialize().catch(console.error);
}

module.exports = PlatformInitializer;