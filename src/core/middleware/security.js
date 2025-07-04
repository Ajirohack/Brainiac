/**
 * Security Middleware - Comprehensive security layer for the CAI Platform
 * 
 * Implements various security measures including authentication, authorization,
 * input validation, and security headers
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Logger = require('../utils/logger');

class SecurityMiddleware {
    constructor(config = {}) {
        this.logger = new Logger('SecurityMiddleware');
        this.config = config;

        // JWT configuration
        this.jwtSecret = config.jwt_secret || process.env.JWT_SECRET || this.generateSecret();
        this.jwtExpiry = config.jwt_expiry || '24h';

        // Security settings
        this.saltRounds = config.salt_rounds || 12;
        this.maxLoginAttempts = config.max_login_attempts || 5;
        this.lockoutDuration = config.lockout_duration || 15 * 60 * 1000; // 15 minutes

        // Failed login tracking
        this.failedLogins = new Map();

        // API key management
        this.apiKeys = new Map();

        // Session management
        this.activeSessions = new Map();

        this.logger.info('🔒 Security middleware initialized');
    }

    /**
     * Generate a secure random secret
     */
    generateSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * Get helmet security headers middleware
     */
    getHelmetMiddleware() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        });
    }

    /**
     * Authentication middleware
     */
    authenticate() {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);

                if (!token) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                // Verify JWT token
                const decoded = jwt.verify(token, this.jwtSecret);

                // Check if session is still active
                if (!this.activeSessions.has(decoded.sessionId)) {
                    return res.status(401).json({
                        error: 'Session expired',
                        code: 'SESSION_EXPIRED'
                    });
                }

                // Add user info to request
                req.user = decoded;
                req.sessionId = decoded.sessionId;

                // Update session activity
                this.updateSessionActivity(decoded.sessionId);

                next();

            } catch (error) {
                if (error.name === 'JsonWebTokenError') {
                    return res.status(401).json({
                        error: 'Invalid token',
                        code: 'INVALID_TOKEN'
                    });
                }

                if (error.name === 'TokenExpiredError') {
                    return res.status(401).json({
                        error: 'Token expired',
                        code: 'TOKEN_EXPIRED'
                    });
                }

                this.logger.error('Authentication error:', error);
                return res.status(500).json({
                    error: 'Authentication failed',
                    code: 'AUTH_ERROR'
                });
            }
        };
    }

    /**
     * API Key authentication middleware
     */
    authenticateApiKey() {
        return async (req, res, next) => {
            try {
                const apiKey = req.headers['x-api-key'] || req.query.api_key;

                if (!apiKey) {
                    return res.status(401).json({
                        error: 'API key required',
                        code: 'API_KEY_REQUIRED'
                    });
                }

                // Validate API key
                const keyData = this.apiKeys.get(apiKey);
                if (!keyData) {
                    return res.status(401).json({
                        error: 'Invalid API key',
                        code: 'INVALID_API_KEY'
                    });
                }

                // Check if API key is active
                if (!keyData.active) {
                    return res.status(401).json({
                        error: 'API key disabled',
                        code: 'API_KEY_DISABLED'
                    });
                }

                // Check expiration
                if (keyData.expiresAt && new Date() > keyData.expiresAt) {
                    return res.status(401).json({
                        error: 'API key expired',
                        code: 'API_KEY_EXPIRED'
                    });
                }

                // Add API key info to request
                req.apiKey = keyData;

                // Update usage statistics
                keyData.lastUsed = new Date();
                keyData.usageCount = (keyData.usageCount || 0) + 1;

                next();

            } catch (error) {
                this.logger.error('API key authentication error:', error);
                return res.status(500).json({
                    error: 'API key authentication failed',
                    code: 'API_KEY_AUTH_ERROR'
                });
            }
        };
    }

    /**
     * Authorization middleware
     */
    authorize(requiredRoles = []) {
        return async (req, res, next) => {
            try {
                const user = req.user;

                if (!user) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                // Check if user has required roles
                if (requiredRoles.length > 0) {
                    const userRoles = user.roles || [];
                    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

                    if (!hasRequiredRole) {
                        return res.status(403).json({
                            error: 'Insufficient permissions',
                            code: 'INSUFFICIENT_PERMISSIONS',
                            required: requiredRoles,
                            current: userRoles
                        });
                    }
                }

                next();

            } catch (error) {
                this.logger.error('Authorization error:', error);
                return res.status(500).json({
                    error: 'Authorization failed',
                    code: 'AUTH_ERROR'
                });
            }
        };
    }

    /**
     * Input validation middleware
     */
    validateInput(schema) {
        return (req, res, next) => {
            try {
                // Basic input sanitization
                this.sanitizeInput(req.body);
                this.sanitizeInput(req.query);
                this.sanitizeInput(req.params);

                // Schema validation (if provided)
                if (schema && typeof schema.validate === 'function') {
                    const { error } = schema.validate(req.body);
                    if (error) {
                        return res.status(400).json({
                            error: 'Invalid input',
                            code: 'VALIDATION_ERROR',
                            details: error.details
                        });
                    }
                }

                next();

            } catch (error) {
                this.logger.error('Input validation error:', error);
                return res.status(400).json({
                    error: 'Input validation failed',
                    code: 'VALIDATION_ERROR'
                });
            }
        };
    }

    /**
     * Sanitize input data
     */
    sanitizeInput(obj) {
        if (typeof obj !== 'object' || obj === null) return;

        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                // Remove potentially dangerous characters
                obj[key] = obj[key]
                    .replace(/<script[^>]*>.*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, '')
                    .trim();
            } else if (typeof obj[key] === 'object') {
                this.sanitizeInput(obj[key]);
            }
        }
    }

    /**
     * Extract token from request
     */
    extractToken(req) {
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check query parameter
        if (req.query.token) {
            return req.query.token;
        }

        // Check cookies
        if (req.cookies && req.cookies.token) {
            return req.cookies.token;
        }

        return null;
    }

    /**
     * Generate JWT token
     */
    generateToken(payload, options = {}) {
        const sessionId = crypto.randomUUID();

        const tokenPayload = {
            ...payload,
            sessionId,
            iat: Math.floor(Date.now() / 1000)
        };

        const token = jwt.sign(tokenPayload, this.jwtSecret, {
            expiresIn: options.expiresIn || this.jwtExpiry,
            issuer: 'cai-platform',
            audience: 'cai-users'
        });

        // Store session
        this.activeSessions.set(sessionId, {
            userId: payload.userId,
            createdAt: new Date(),
            lastActivity: new Date(),
            ipAddress: options.ipAddress,
            userAgent: options.userAgent
        });

        return { token, sessionId };
    }

    /**
     * Revoke token/session
     */
    revokeToken(sessionId) {
        this.activeSessions.delete(sessionId);
        this.logger.info(`Session revoked: ${sessionId}`);
    }

    /**
     * Update session activity
     */
    updateSessionActivity(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.lastActivity = new Date();
        }
    }

    /**
     * Hash password
     */
    async hashPassword(password) {
        return await bcrypt.hash(password, this.saltRounds);
    }

    /**
     * Verify password
     */
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Track failed login attempt
     */
    trackFailedLogin(identifier) {
        const now = new Date();
        const attempts = this.failedLogins.get(identifier) || { count: 0, lastAttempt: now };

        // Reset count if lockout period has passed
        if (now - attempts.lastAttempt > this.lockoutDuration) {
            attempts.count = 0;
        }

        attempts.count++;
        attempts.lastAttempt = now;

        this.failedLogins.set(identifier, attempts);

        return attempts;
    }

    /**
     * Check if account is locked
     */
    isAccountLocked(identifier) {
        const attempts = this.failedLogins.get(identifier);
        if (!attempts) return false;

        const now = new Date();
        const timeSinceLastAttempt = now - attempts.lastAttempt;

        return attempts.count >= this.maxLoginAttempts && timeSinceLastAttempt < this.lockoutDuration;
    }

    /**
     * Clear failed login attempts
     */
    clearFailedLogins(identifier) {
        this.failedLogins.delete(identifier);
    }

    /**
     * Generate API key
     */
    generateApiKey(options = {}) {
        const apiKey = crypto.randomBytes(32).toString('hex');

        const keyData = {
            key: apiKey,
            name: options.name || 'Unnamed Key',
            userId: options.userId,
            permissions: options.permissions || [],
            active: true,
            createdAt: new Date(),
            expiresAt: options.expiresAt,
            lastUsed: null,
            usageCount: 0
        };

        this.apiKeys.set(apiKey, keyData);

        return keyData;
    }

    /**
     * Revoke API key
     */
    revokeApiKey(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        if (keyData) {
            keyData.active = false;
            this.logger.info(`API key revoked: ${keyData.name}`);
        }
    }

    /**
     * Get security status
     */
    getSecurityStatus() {
        return {
            activeSessions: this.activeSessions.size,
            activeApiKeys: Array.from(this.apiKeys.values()).filter(key => key.active).length,
            failedLoginAttempts: this.failedLogins.size,
            securitySettings: {
                maxLoginAttempts: this.maxLoginAttempts,
                lockoutDuration: this.lockoutDuration,
                jwtExpiry: this.jwtExpiry
            }
        };
    }

    /**
     * Clean up expired sessions and failed login attempts
     */
    cleanup() {
        const now = new Date();

        // Clean up expired sessions (older than 24 hours of inactivity)
        for (const [sessionId, session] of this.activeSessions) {
            if (now - session.lastActivity > 24 * 60 * 60 * 1000) {
                this.activeSessions.delete(sessionId);
            }
        }

        // Clean up old failed login attempts
        for (const [identifier, attempts] of this.failedLogins) {
            if (now - attempts.lastAttempt > this.lockoutDuration * 2) {
                this.failedLogins.delete(identifier);
            }
        }

        this.logger.debug('Security cleanup completed');
    }
}

module.exports = SecurityMiddleware;