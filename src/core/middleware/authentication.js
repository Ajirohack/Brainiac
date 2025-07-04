/**
 * Authentication Middleware
 * 
 * Handles user authentication and authorization for the CAI Platform
 * Supports JWT tokens, API keys, and session-based authentication
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Logger = require('../utils/logger');

class Authentication {
    constructor(config = {}) {
        this.config = {
            jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
            jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
            bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
            enableApiKeys: true,
            enableSessions: false,
            requireAuth: true,
            ...config
        };

        this.logger = new Logger('Authentication');
        
        // API key storage (in production, use database)
        this.apiKeys = new Map();
        
        // Session storage (in production, use Redis)
        this.sessions = new Map();
        
        // User storage (in production, use database)
        this.users = new Map();
        
        // Authentication statistics
        this.stats = {
            totalAttempts: 0,
            successfulLogins: 0,
            failedLogins: 0,
            activeTokens: 0,
            activeSessions: 0
        };

        // Initialize default admin user if none exists
        this.initializeDefaultUser();
    }

    /**
     * Initialize default admin user
     */
    async initializeDefaultUser() {
        if (this.users.size === 0) {
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await this.hashPassword(defaultPassword);
            
            this.users.set('admin', {
                id: 'admin',
                username: 'admin',
                email: 'admin@cai-platform.com',
                password: hashedPassword,
                role: 'admin',
                permissions: ['*'],
                createdAt: new Date(),
                lastLogin: null,
                isActive: true
            });
            
            this.logger.info('Default admin user created');
        }
    }

    /**
     * Authentication middleware
     */
    middleware(options = {}) {
        const config = { ...this.config, ...options };
        
        return async (req, res, next) => {
            try {
                // Skip authentication if not required
                if (!config.requireAuth) {
                    return next();
                }
                
                // Try different authentication methods
                const authResult = await this.authenticate(req, config);
                
                if (authResult.success) {
                    req.user = authResult.user;
                    req.authMethod = authResult.method;
                    this.stats.successfulLogins++;
                    next();
                } else {
                    this.stats.failedLogins++;
                    this.handleAuthFailure(res, authResult.error);
                }
                
            } catch (error) {
                this.logger.error('Authentication error:', error);
                this.stats.failedLogins++;
                this.handleAuthFailure(res, 'Authentication failed');
            }
        };
    }

    /**
     * Authenticate request using multiple methods
     */
    async authenticate(req, config) {
        this.stats.totalAttempts++;
        
        // Try JWT token authentication
        const jwtResult = await this.authenticateJWT(req);
        if (jwtResult.success) {
            return jwtResult;
        }
        
        // Try API key authentication
        if (config.enableApiKeys) {
            const apiKeyResult = await this.authenticateApiKey(req);
            if (apiKeyResult.success) {
                return apiKeyResult;
            }
        }
        
        // Try session authentication
        if (config.enableSessions) {
            const sessionResult = await this.authenticateSession(req);
            if (sessionResult.success) {
                return sessionResult;
            }
        }
        
        return {
            success: false,
            error: 'No valid authentication found'
        };
    }

    /**
     * Authenticate using JWT token
     */
    async authenticateJWT(req) {
        try {
            const token = this.extractToken(req);
            if (!token) {
                return { success: false, error: 'No token provided' };
            }
            
            const decoded = jwt.verify(token, this.config.jwtSecret);
            const user = this.users.get(decoded.username || decoded.id);
            
            if (!user || !user.isActive) {
                return { success: false, error: 'User not found or inactive' };
            }
            
            return {
                success: true,
                user: this.sanitizeUser(user),
                method: 'jwt',
                token
            };
            
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { success: false, error: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { success: false, error: 'Invalid token' };
            }
            return { success: false, error: 'Token verification failed' };
        }
    }

    /**
     * Authenticate using API key
     */
    async authenticateApiKey(req) {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey) {
            return { success: false, error: 'No API key provided' };
        }
        
        const keyData = this.apiKeys.get(apiKey);
        if (!keyData || !keyData.isActive) {
            return { success: false, error: 'Invalid or inactive API key' };
        }
        
        // Check expiration
        if (keyData.expiresAt && keyData.expiresAt < new Date()) {
            return { success: false, error: 'API key expired' };
        }
        
        // Update usage
        keyData.lastUsed = new Date();
        keyData.usageCount = (keyData.usageCount || 0) + 1;
        
        return {
            success: true,
            user: {
                id: keyData.userId,
                username: keyData.name,
                role: keyData.role || 'api',
                permissions: keyData.permissions || []
            },
            method: 'apikey',
            apiKey
        };
    }

    /**
     * Authenticate using session
     */
    async authenticateSession(req) {
        const sessionId = req.sessionID || req.headers['x-session-id'];
        if (!sessionId) {
            return { success: false, error: 'No session ID provided' };
        }
        
        const session = this.sessions.get(sessionId);
        if (!session || session.expiresAt < new Date()) {
            return { success: false, error: 'Invalid or expired session' };
        }
        
        const user = this.users.get(session.userId);
        if (!user || !user.isActive) {
            return { success: false, error: 'User not found or inactive' };
        }
        
        // Update session
        session.lastAccessed = new Date();
        
        return {
            success: true,
            user: this.sanitizeUser(user),
            method: 'session',
            sessionId
        };
    }

    /**
     * Extract token from request
     */
    extractToken(req) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        
        return req.query.token || req.headers['x-access-token'];
    }

    /**
     * Login user and generate token
     */
    async login(username, password, options = {}) {
        try {
            const user = this.users.get(username);
            if (!user || !user.isActive) {
                throw new Error('User not found or inactive');
            }
            
            const isValidPassword = await this.verifyPassword(password, user.password);
            if (!isValidPassword) {
                throw new Error('Invalid password');
            }
            
            // Update last login
            user.lastLogin = new Date();
            
            // Generate JWT token
            const token = this.generateToken(user, options);
            
            this.stats.successfulLogins++;
            this.stats.activeTokens++;
            
            this.logger.info(`User ${username} logged in successfully`);
            
            return {
                success: true,
                token,
                user: this.sanitizeUser(user),
                expiresIn: this.config.jwtExpiresIn
            };
            
        } catch (error) {
            this.stats.failedLogins++;
            this.logger.warn(`Login failed for user ${username}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate JWT token
     */
    generateToken(user, options = {}) {
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role,
            permissions: user.permissions
        };
        
        const tokenOptions = {
            expiresIn: options.expiresIn || this.config.jwtExpiresIn,
            issuer: 'cai-platform',
            audience: 'cai-users'
        };
        
        return jwt.sign(payload, this.config.jwtSecret, tokenOptions);
    }

    /**
     * Create API key
     */
    createApiKey(userId, name, options = {}) {
        const apiKey = this.generateApiKey();
        
        const keyData = {
            key: apiKey,
            userId,
            name,
            role: options.role || 'api',
            permissions: options.permissions || [],
            createdAt: new Date(),
            expiresAt: options.expiresAt || null,
            isActive: true,
            usageCount: 0,
            lastUsed: null
        };
        
        this.apiKeys.set(apiKey, keyData);
        
        this.logger.info(`API key created for user ${userId}: ${name}`);
        
        return {
            apiKey,
            name,
            createdAt: keyData.createdAt,
            expiresAt: keyData.expiresAt
        };
    }

    /**
     * Generate random API key
     */
    generateApiKey() {
        const prefix = 'cai';
        const randomPart = require('crypto').randomBytes(32).toString('hex');
        return `${prefix}_${randomPart}`;
    }

    /**
     * Create user session
     */
    createSession(userId, options = {}) {
        const sessionId = this.generateSessionId();
        const expiresAt = new Date(Date.now() + (options.maxAge || 24 * 60 * 60 * 1000)); // 24 hours
        
        const session = {
            id: sessionId,
            userId,
            createdAt: new Date(),
            expiresAt,
            lastAccessed: new Date(),
            data: options.data || {}
        };
        
        this.sessions.set(sessionId, session);
        this.stats.activeSessions++;
        
        return sessionId;
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return require('crypto').randomBytes(32).toString('hex');
    }

    /**
     * Hash password
     */
    async hashPassword(password) {
        return bcrypt.hash(password, this.config.bcryptRounds);
    }

    /**
     * Verify password
     */
    async verifyPassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }

    /**
     * Create new user
     */
    async createUser(userData) {
        const { username, email, password, role = 'user', permissions = [] } = userData;
        
        if (this.users.has(username)) {
            throw new Error('Username already exists');
        }
        
        const hashedPassword = await this.hashPassword(password);
        
        const user = {
            id: username,
            username,
            email,
            password: hashedPassword,
            role,
            permissions,
            createdAt: new Date(),
            lastLogin: null,
            isActive: true
        };
        
        this.users.set(username, user);
        
        this.logger.info(`User created: ${username}`);
        
        return this.sanitizeUser(user);
    }

    /**
     * Authorization middleware
     */
    authorize(requiredPermissions = [], options = {}) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    error: 'AuthenticationError',
                    message: 'Authentication required'
                });
            }
            
            // Check if user has required permissions
            if (!this.hasPermissions(req.user, requiredPermissions, options)) {
                return res.status(403).json({
                    error: 'AuthorizationError',
                    message: 'Insufficient permissions'
                });
            }
            
            next();
        };
    }

    /**
     * Check if user has required permissions
     */
    hasPermissions(user, requiredPermissions, options = {}) {
        // Admin users have all permissions
        if (user.role === 'admin' || user.permissions.includes('*')) {
            return true;
        }
        
        // Check specific permissions
        if (options.requireAll) {
            return requiredPermissions.every(perm => user.permissions.includes(perm));
        } else {
            return requiredPermissions.some(perm => user.permissions.includes(perm));
        }
    }

    /**
     * Handle authentication failure
     */
    handleAuthFailure(res, error) {
        res.status(401).json({
            error: 'AuthenticationError',
            message: error || 'Authentication failed',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Sanitize user data (remove sensitive information)
     */
    sanitizeUser(user) {
        const { password, ...sanitized } = user;
        return sanitized;
    }

    /**
     * Logout user (invalidate token/session)
     */
    logout(req) {
        if (req.authMethod === 'session' && req.sessionId) {
            this.sessions.delete(req.sessionId);
            this.stats.activeSessions--;
        }
        
        // For JWT tokens, you would typically add them to a blacklist
        // This is a simplified implementation
        
        this.logger.info(`User ${req.user?.username} logged out`);
    }

    /**
     * Revoke API key
     */
    revokeApiKey(apiKey) {
        const keyData = this.apiKeys.get(apiKey);
        if (keyData) {
            keyData.isActive = false;
            this.logger.info(`API key revoked: ${keyData.name}`);
            return true;
        }
        return false;
    }

    /**
     * Clean up expired sessions and tokens
     */
    cleanup() {
        const now = new Date();
        
        // Clean up expired sessions
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                this.sessions.delete(sessionId);
                this.stats.activeSessions--;
            }
        }
        
        // Clean up expired API keys
        for (const [apiKey, keyData] of this.apiKeys.entries()) {
            if (keyData.expiresAt && keyData.expiresAt < now) {
                keyData.isActive = false;
            }
        }
    }

    /**
     * Get authentication statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalUsers: this.users.size,
            activeApiKeys: Array.from(this.apiKeys.values()).filter(k => k.isActive).length,
            successRate: this.stats.totalAttempts > 0 ? 
                (this.stats.successfulLogins / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Shutdown authentication system
     */
    shutdown() {
        this.sessions.clear();
        this.logger.info('Authentication system shutdown complete');
    }
}

module.exports = Authentication;