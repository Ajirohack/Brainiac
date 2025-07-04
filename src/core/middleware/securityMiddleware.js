/**
 * Security Middleware
 * 
 * Implements comprehensive security measures for the CAI Platform API
 */

const jwt = require('jsonwebtoken');
const SecurityUtils = require('../utils/security');
const { promisify } = require('util');

// Use a try-catch to handle cases where RateLimiter might not be available (e.g., in tests)
let RateLimiter;
try {
    RateLimiter = require('./rateLimiter').RateLimiter;
} catch (err) {
    // Fallback RateLimiter for test environments
    RateLimiter = class {
        constructor() {
            this.middleware = (req, res, next) => next();
            this.getRateLimitInfo = () => ({
                limit: 100,
                current: 0,
                remaining: 100,
                resetTime: Date.now() + 60000
            });
        }
    };
}

// Use a try-catch to handle cases where Logger might not be available (e.g., in tests)
let Logger;
try {
    Logger = require('../utils/logger').Logger;
} catch (err) {
    // Fallback logger for test environments
    Logger = class {
        constructor() {
            this.log = () => {};
            this.info = () => {};
            this.warn = () => {};
            this.error = () => {};
            this.debug = () => {};
        }
    };
}

class SecurityMiddleware {
    constructor(config = {}) {
        this.logger = new (Logger || function() { return { log: () => {} }; })('SecurityMiddleware');
        this.config = {
            // JWT Configuration
            jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
            jwtExpiresIn: '24h',
            
            // Rate Limiting
            rateLimit: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                maxRequests: 100, // Limit each IP to 100 requests per windowMs
                message: 'Too many requests, please try again later',
                enableDdosProtection: true,
                ddosThreshold: 100, // requests per second per IP to trigger DDoS protection
            },
            
            // Security Headers
            securityHeaders: {
                enableHSTS: process.env.NODE_ENV === 'production',
                enableCSP: true,
                enableCORS: true,
                allowedOrigins: process.env.ALLOWED_ORIGINS ? 
                    process.env.ALLOWED_ORIGINS.split(',') : 
                    ['*'],
            },
            
            // API Keys
            requireApiKey: false,
            apiKeys: process.env.API_KEYS ? 
                process.env.API_KEYS.split(',') : 
                [],
                
            // Trust proxy (for rate limiting and IP detection)
            trustProxy: process.env.TRUST_PROXY !== 'false',
            
            // Apply defaults
            ...config,
        };
        
        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(this.config.rateLimit);
        
        // Promisify JWT methods
        this.jwtVerify = promisify(jwt.verify).bind(jwt);
        this.jwtSign = promisify(jwt.sign).bind(jwt);
        
        this.logger.info('Security middleware initialized');
    }
    
    /**
     * Verify a JWT token
     * @param {string} token - The JWT token to verify
     * @returns {Promise<object>} The decoded token payload
     * @throws {Error} If the token is invalid or verification fails
     */
    async verifyToken(token) {
        try {
            if (!token) {
                throw new Error('No token provided');
            }

            // Remove 'Bearer ' prefix if present
            if (token.startsWith('Bearer ')) {
                token = token.slice(7);
            }

            const decoded = await this.jwtVerify(token, this.config.jwtSecret);
            return decoded;
        } catch (error) {
            this.logger.error(`Token verification failed: ${error.message}`);
            throw new Error('Invalid token');
        }
    }

    /**
     * Middleware to apply security headers
     */
    securityHeaders() {
        return (req, res, next) => {
            const headers = SecurityUtils.getSecurityHeaders({
                https: req.secure || req.headers['x-forwarded-proto'] === 'https',
                csp: this.config.securityHeaders.enableCSP ? undefined : false,
                cors: this.config.securityHeaders.enableCORS ? {
                    origin: this._getAllowedOrigin(req),
                    methods: 'GET, POST, PUT, DELETE, OPTIONS',
                    headers: 'Content-Type, Authorization, X-API-Key',
                    credentials: true,
                } : false,
            });
            
            // Set security headers
            Object.entries(headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });
            
            next();
        };
    }
    
    /**
     * Middleware to handle CORS preflight requests
     */
    cors() {
        return (req, res, next) => {
            if (req.method === 'OPTIONS') {
                const origin = this._getAllowedOrigin(req);
                
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
                
                return res.status(204).send();
            }
            
            next();
        };
    }
    
    /**
     * Middleware to rate limit requests
     */
    rateLimit() {
        return async (req, res, next) => {
            try {
                await this.rateLimiter.consume(req);
                next();
            } catch (error) {
                this.logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
                
                const retryAfter = error.retryAfter || 60; // Default to 60 seconds
                res.setHeader('Retry-After', retryAfter);
                
                return res.status(429).json({
                    status: 'error',
                    code: 'rate_limit_exceeded',
                    message: 'Too many requests, please try again later',
                    retryAfter,
                });
            }
        };
    }
    
    /**
     * Middleware to validate API key
     */
    validateApiKey() {
        return (req, res, next) => {
            if (!this.config.requireApiKey) {
                return next();
            }
            
            const apiKey = this._getApiKey(req);
            
            if (!apiKey) {
                return res.status(401).json({
                    status: 'error',
                    code: 'api_key_required',
                    message: 'API key is required',
                });
            }
            
            if (!this.config.apiKeys.includes(apiKey)) {
                this.logger.warn(`Invalid API key attempt from IP: ${req.ip}`);
                return res.status(403).json({
                    status: 'error',
                    code: 'invalid_api_key',
                    message: 'Invalid API key',
                });
            }
            
            next();
        };
    }
    
    /**
     * Middleware to validate JWT token
     */
    authenticate() {
        return async (req, res, next) => {
            const token = this._getToken(req);
            
            if (!token) {
                return res.status(401).json({
                    status: 'error',
                    code: 'authentication_required',
                    message: 'Authentication token is required',
                });
            }
            
            try {
                const decoded = await this.jwtVerify(token, this.config.jwtSecret);
                req.user = decoded;
                next();
            } catch (error) {
                this.logger.warn(`Invalid JWT token: ${error.message}`);
                
                let message = 'Invalid token';
                let statusCode = 401;
                
                if (error.name === 'TokenExpiredError') {
                    message = 'Token has expired';
                    statusCode = 403;
                } else if (error.name === 'JsonWebTokenError') {
                    message = 'Invalid token';
                }
                
                return res.status(statusCode).json({
                    status: 'error',
                    code: 'authentication_failed',
                    message,
                });
            }
        };
    }
    
    /**
     * Middleware to check user roles
     * @param {string[]} allowedRoles - Array of allowed roles
     */
    authorize(allowedRoles = []) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    status: 'error',
                    code: 'authentication_required',
                    message: 'Authentication required',
                });
            }
            
            if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    status: 'error',
                    code: 'forbidden',
                    message: 'Insufficient permissions',
                });
            }
            
            next();
        };
    }
    
    /**
     * Middleware to validate request body against a schema
     * @param {Joi.Schema} schema - Joi validation schema
     */
    validateBody(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.body, {
                abortEarly: false,
                allowUnknown: true,
                stripUnknown: true,
            });
            
            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                }));
                
                return res.status(400).json({
                    status: 'error',
                    code: 'validation_error',
                    message: 'Validation failed',
                    errors,
                });
            }
            
            // Replace req.body with the validated and sanitized data
            req.body = value;
            next();
        };
    }
    
    /**
     * Generate a JWT token
     * @param {Object} payload - Token payload
     * @returns {Promise<string>} - JWT token
     */
    async generateToken(payload) {
        return this.jwtSign(payload, this.config.jwtSecret, {
            expiresIn: this.config.jwtExpiresIn,
        });
    }
    
    /**
     * Get the allowed origin for CORS
     * @private
     */
    _getAllowedOrigin(req) {
        const origin = req.headers.origin;
        
        if (this.config.securityHeaders.allowedOrigins.includes('*')) {
            return origin || '*';
        }
        
        if (origin && this.config.securityHeaders.allowedOrigins.includes(origin)) {
            return origin;
        }
        
        return this.config.securityHeaders.allowedOrigins[0] || '*'; // Default to first origin or *
    }
    
    /**
     * Extract API key from request
     * @private
     */
    _getApiKey(req) {
        return (
            req.headers['x-api-key'] ||
            req.query.api_key ||
            (req.body && req.body.api_key)
        );
    }
    
    /**
     * Extract JWT token from request
     * @private
     */
    _getToken(req) {
        const authHeader = req.headers.authorization || '';
        
        if (authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7); // Remove 'Bearer ' prefix
        }
        
        return req.query.token || req.cookies?.token;
    }
}

module.exports = SecurityMiddleware;
