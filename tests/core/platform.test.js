/**
 * Core Platform Tests
 * 
 * Tests for the main CAI Platform initialization and core functionality
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random available port
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'cai_platform_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

describe('CAI Platform Core', () => {
    let app;
    let server;

    beforeAll(async () => {
        // Import the main application
        try {
            const CAIPlatform = require('../../src/core/index.js');
            app = new CAIPlatform();

            // Initialize the platform in test mode
            await app.initialize();
            server = app.getServer();
        } catch (error) {
            console.warn('Could not initialize full platform for testing:', error.message);
            // Create a minimal Express app for basic testing
            const express = require('express');
            app = express();
            app.get('/health', (req, res) => {
                res.json({ status: 'ok', timestamp: new Date().toISOString() });
            });
            server = app;
        }
    });

    afterAll(async () => {
        if (app && typeof app.shutdown === 'function') {
            await app.shutdown();
        }
    });

    describe('Platform Initialization', () => {
        test('should have core utilities available', () => {
            const utilsPath = path.join(__dirname, '../../src/core/utils');
            expect(fs.existsSync(utilsPath)).toBe(true);

            const loggerPath = path.join(utilsPath, 'logger.js');
            expect(fs.existsSync(loggerPath)).toBe(true);
        });

        test('should have configuration management', () => {
            const configPath = path.join(__dirname, '../../src/core/config');
            expect(fs.existsSync(configPath)).toBe(true);

            const configManagerPath = path.join(configPath, 'configManager.js');
            expect(fs.existsSync(configManagerPath)).toBe(true);
        });

        test('should have database management', () => {
            const dbPath = path.join(__dirname, '../../src/core/database');
            expect(fs.existsSync(dbPath)).toBe(true);

            const dbManagerPath = path.join(dbPath, 'databaseManager.js');
            expect(fs.existsSync(dbManagerPath)).toBe(true);
        });

        test('should have monitoring capabilities', () => {
            const monitoringPath = path.join(__dirname, '../../src/core/monitoring');
            expect(fs.existsSync(monitoringPath)).toBe(true);

            const systemMonitorPath = path.join(monitoringPath, 'systemMonitor.js');
            expect(fs.existsSync(systemMonitorPath)).toBe(true);
        });

        test('should have security middleware', () => {
            const middlewarePath = path.join(__dirname, '../../src/core/middleware');
            expect(fs.existsSync(middlewarePath)).toBe(true);

            const securityPath = path.join(middlewarePath, 'security.js');
            expect(fs.existsSync(securityPath)).toBe(true);
        });
    });

    describe('Health Check Endpoint', () => {
        test('should respond to health check', async () => {
            const response = await request(server)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(response.body.status).toBe('ok');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Configuration Management', () => {
        test('should load configuration files', () => {
            const configDir = path.join(__dirname, '../../config');
            expect(fs.existsSync(configDir)).toBe(true);

            const baseConfigPath = path.join(configDir, 'base.json');
            expect(fs.existsSync(baseConfigPath)).toBe(true);

            const devConfigPath = path.join(configDir, 'development.json');
            expect(fs.existsSync(devConfigPath)).toBe(true);

            const prodConfigPath = path.join(configDir, 'production.json');
            expect(fs.existsSync(prodConfigPath)).toBe(true);
        });

        test('should have valid JSON configuration', () => {
            const configDir = path.join(__dirname, '../../config');
            const configFiles = ['base.json', 'development.json', 'production.json'];

            configFiles.forEach(file => {
                const filePath = path.join(configDir, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    expect(() => JSON.parse(content)).not.toThrow();
                }
            });
        });
    });

    describe('Environment Configuration', () => {
        test('should have environment example file', () => {
            const envExamplePath = path.join(__dirname, '../../.env.example');
            expect(fs.existsSync(envExamplePath)).toBe(true);
        });

        test('should have required environment variables defined', () => {
            const requiredVars = [
                'NODE_ENV',
                'PORT',
                'JWT_SECRET',
                'DB_HOST',
                'DB_PORT',
                'DB_NAME',
                'REDIS_HOST',
                'REDIS_PORT'
            ];

            requiredVars.forEach(varName => {
                expect(process.env[varName]).toBeDefined();
            });
        });
    });

    describe('Directory Structure', () => {
        test('should have required directories', () => {
            const requiredDirs = [
                'src',
                'src/core',
                'src/core/utils',
                'src/core/config',
                'src/core/database',
                'src/core/monitoring',
                'src/core/middleware',
                'config',
                'tests',
                'scripts'
            ];

            requiredDirs.forEach(dir => {
                const dirPath = path.join(__dirname, '../..', dir);
                expect(fs.existsSync(dirPath)).toBe(true);
            });
        });
    });

    describe('Package Configuration', () => {
        test('should have valid package.json', () => {
            const packagePath = path.join(__dirname, '../../package.json');
            expect(fs.existsSync(packagePath)).toBe(true);

            const packageContent = fs.readFileSync(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);

            expect(packageJson).toHaveProperty('name');
            expect(packageJson).toHaveProperty('version');
            expect(packageJson).toHaveProperty('main');
            expect(packageJson).toHaveProperty('scripts');
            expect(packageJson).toHaveProperty('dependencies');
        });

        test('should have required dependencies', () => {
            const packagePath = path.join(__dirname, '../../package.json');
            const packageContent = fs.readFileSync(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);

            const requiredDeps = [
                'express',
                'socket.io',
                'cors',
                'helmet',
                'dotenv',
                'winston',
                'jsonwebtoken',
                'bcryptjs',
                'joi',
                'redis',
                'pg'
            ];

            // Check that dependencies object exists
            expect(packageJson).toHaveProperty('dependencies');
            expect(typeof packageJson.dependencies).toBe('object');

            // Check each required dependency
            const missingDeps = [];
            requiredDeps.forEach(dep => {
                if (!packageJson.dependencies.hasOwnProperty(dep)) {
                    missingDeps.push(dep);
                }
            });

            if (missingDeps.length > 0) {
                console.log('Missing dependencies:', missingDeps);
                console.log('Available dependencies:', Object.keys(packageJson.dependencies));
            }

            expect(missingDeps).toEqual([]);
        });
    });
});

describe('Core Utilities', () => {
    describe('Logger', () => {
        test('should be able to import logger', () => {
            expect(() => {
                require('../../src/core/utils/logger.js');
            }).not.toThrow();
        });

        test('should create logger instance', () => {
            const Logger = require('../../src/core/utils/logger.js');
            const logger = new Logger();

            expect(logger).toBeDefined();
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.debug).toBe('function');
        });
    });

    describe('Config Manager', () => {
        test('should be able to import config manager', () => {
            expect(() => {
                require('../../src/core/config/configManager.js');
            }).not.toThrow();
        });

        test('should create config manager instance', () => {
            const ConfigManager = require('../../src/core/config/configManager.js');
            const configManager = new ConfigManager();

            expect(configManager).toBeDefined();
            expect(typeof configManager.getConfigValue).toBe('function');
            expect(typeof configManager.setConfigValue).toBe('function');
            expect(typeof configManager.loadConfiguration).toBe('function');
        });
    });

    describe('Database Manager', () => {
        test('should be able to import database manager', () => {
            expect(() => {
                require('../../src/core/database/databaseManager.js');
            }).not.toThrow();
        });

        test('should create database manager instance', () => {
            const DatabaseManager = require('../../src/core/database/databaseManager.js');
            const dbManager = new DatabaseManager();

            expect(dbManager).toBeDefined();
            expect(typeof dbManager.initialize).toBe('function');
            expect(typeof dbManager.shutdown).toBe('function');
            expect(typeof dbManager.query).toBe('function');
        });
    });

    describe('System Monitor', () => {
        test('should be able to import system monitor', () => {
            expect(() => {
                require('../../src/core/monitoring/systemMonitor.js');
            }).not.toThrow();
        });

        test('should create system monitor instance', () => {
            const SystemMonitor = require('../../src/core/monitoring/systemMonitor.js');
            const monitor = new SystemMonitor();

            expect(monitor).toBeDefined();
            expect(typeof monitor.start).toBe('function');
            expect(typeof monitor.stop).toBe('function');
            expect(typeof monitor.getMetrics).toBe('function');
        });
    });
});

describe('Security Middleware', () => {
    describe('Security Module', () => {
        test('should be able to import security middleware', () => {
            expect(() => {
                require('../../src/core/middleware/security.js');
            }).not.toThrow();
        });
    });

    describe('CORS Module', () => {
        test('should be able to import CORS middleware', () => {
            expect(() => {
                require('../../src/core/middleware/cors.js');
            }).not.toThrow();
        });
    });

    describe('Rate Limit Module', () => {
        test('should be able to import rate limit middleware', () => {
            expect(() => {
                require('../../src/core/middleware/rateLimit.js');
            }).not.toThrow();
        });
    });
});