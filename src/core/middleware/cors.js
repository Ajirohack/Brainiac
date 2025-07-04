/**
 * CORS Middleware - Cross-Origin Resource Sharing configuration for the CAI Platform
 * 
 * Handles CORS policies, preflight requests, and origin validation
 */

const cors = require('cors');
const Logger = require('../utils/logger');

class CorsMiddleware {
    constructor(config = {}) {
        this.logger = new Logger('CorsMiddleware');
        this.config = config;

        // Default allowed origins
        this.allowedOrigins = config.allowed_origins || [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:8080'
        ];

        // Environment-specific origins
        if (process.env.NODE_ENV === 'production') {
            this.allowedOrigins = config.production_origins || [];
        } else if (process.env.NODE_ENV === 'development') {
            this.allowedOrigins = [
                ...this.allowedOrigins,
                ...(config.development_origins || [])
            ];
        }

        // CORS options
        this.corsOptions = {
            origin: this.originHandler.bind(this),
            methods: config.allowed_methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: config.allowed_headers || [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'X-API-Key',
                'X-Session-ID',
                'X-Request-ID',
                'Accept',
                'Origin'
            ],
            exposedHeaders: config.exposed_headers || [
                'X-Total-Count',
                'X-Page-Count',
                'X-Rate-Limit-Remaining',
                'X-Rate-Limit-Reset',
                'X-Request-ID'
            ],
            credentials: config.credentials !== false, // Default to true
            maxAge: config.max_age || 86400, // 24 hours
            preflightContinue: false,
            optionsSuccessStatus: 204
        };

        // Request tracking
        this.requestStats = {
            total: 0,
            allowed: 0,
            blocked: 0,
            preflight: 0,
            origins: new Map()
        };

        this.logger.info('🌐 CORS middleware initialized');
    }

    /**
     * Origin handler for CORS
     */
    originHandler(origin, callback) {
        try {
            // Track request
            this.requestStats.total++;

            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) {
                this.requestStats.allowed++;
                return callback(null, true);
            }

            // Track origin statistics
            const originCount = this.requestStats.origins.get(origin) || 0;
            this.requestStats.origins.set(origin, originCount + 1);

            // Check if origin is allowed
            if (this.isOriginAllowed(origin)) {
                this.requestStats.allowed++;
                this.logger.debug(`✅ CORS: Allowed origin ${origin}`);
                return callback(null, true);
            }

            // Block disallowed origin
            this.requestStats.blocked++;
            this.logger.warn(`❌ CORS: Blocked origin ${origin}`);

            const error = new Error(`Origin ${origin} not allowed by CORS policy`);
            error.status = 403;
            return callback(error, false);

        } catch (error) {
            this.logger.error('CORS origin handler error:', error);
            return callback(error, false);
        }
    }

    /**
     * Check if origin is allowed
     */
    isOriginAllowed(origin) {
        // Exact match
        if (this.allowedOrigins.includes(origin)) {
            return true;
        }

        // Wildcard match
        for (const allowedOrigin of this.allowedOrigins) {
            if (allowedOrigin === '*') {
                return true;
            }

            // Pattern matching (e.g., *.example.com)
            if (allowedOrigin.includes('*')) {
                const pattern = allowedOrigin.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(origin)) {
                    return true;
                }
            }
        }

        // Development mode - allow localhost with any port
        if (process.env.NODE_ENV === 'development') {
            const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
            if (localhostPattern.test(origin)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get CORS middleware
     */
    getMiddleware() {
        return cors(this.corsOptions);
    }

    /**
     * Custom CORS middleware with additional features
     */
    getCustomMiddleware() {
        return (req, res, next) => {
            try {
                const origin = req.headers.origin;

                // Handle preflight requests
                if (req.method === 'OPTIONS') {
                    this.requestStats.preflight++;
                    this.handlePreflight(req, res, origin);
                    return;
                }

                // Set CORS headers for actual requests
                this.setCorsHeaders(res, origin);

                next();

            } catch (error) {
                this.logger.error('Custom CORS middleware error:', error);
                next(error);
            }
        };
    }

    /**
     * Handle preflight requests
     */
    handlePreflight(req, res, origin) {
        // Check if origin is allowed
        if (origin && !this.isOriginAllowed(origin)) {
            this.logger.warn(`❌ CORS Preflight: Blocked origin ${origin}`);
            return res.status(403).json({
                error: 'Origin not allowed by CORS policy',
                code: 'CORS_ORIGIN_NOT_ALLOWED'
            });
        }

        // Check requested method
        const requestedMethod = req.headers['access-control-request-method'];
        if (requestedMethod && !this.corsOptions.methods.includes(requestedMethod)) {
            this.logger.warn(`❌ CORS Preflight: Method ${requestedMethod} not allowed`);
            return res.status(403).json({
                error: 'Method not allowed by CORS policy',
                code: 'CORS_METHOD_NOT_ALLOWED'
            });
        }

        // Check requested headers
        const requestedHeaders = req.headers['access-control-request-headers'];
        if (requestedHeaders) {
            const headers = requestedHeaders.split(',').map(h => h.trim());
            const disallowedHeaders = headers.filter(h =>
                !this.corsOptions.allowedHeaders.includes(h) &&
                !h.toLowerCase().startsWith('x-')
            );

            if (disallowedHeaders.length > 0) {
                this.logger.warn(`❌ CORS Preflight: Headers not allowed: ${disallowedHeaders.join(', ')}`);
                return res.status(403).json({
                    error: 'Headers not allowed by CORS policy',
                    code: 'CORS_HEADERS_NOT_ALLOWED',
                    disallowedHeaders
                });
            }
        }

        // Set preflight response headers
        this.setCorsHeaders(res, origin);
        res.header('Access-Control-Allow-Methods', this.corsOptions.methods.join(', '));
        res.header('Access-Control-Allow-Headers', this.corsOptions.allowedHeaders.join(', '));
        res.header('Access-Control-Max-Age', this.corsOptions.maxAge.toString());

        this.logger.debug(`✅ CORS Preflight: Allowed for origin ${origin}`);
        res.status(204).send();
    }

    /**
     * Set CORS headers
     */
    setCorsHeaders(res, origin) {
        // Set origin header
        if (origin && this.isOriginAllowed(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else if (!origin) {
            res.header('Access-Control-Allow-Origin', '*');
        }

        // Set credentials header
        if (this.corsOptions.credentials) {
            res.header('Access-Control-Allow-Credentials', 'true');
        }

        // Set exposed headers
        if (this.corsOptions.exposedHeaders.length > 0) {
            res.header('Access-Control-Expose-Headers', this.corsOptions.exposedHeaders.join(', '));
        }

        // Set Vary header
        res.header('Vary', 'Origin');
    }

    /**
     * Add allowed origin
     */
    addAllowedOrigin(origin) {
        if (!this.allowedOrigins.includes(origin)) {
            this.allowedOrigins.push(origin);
            this.logger.info(`➕ Added allowed origin: ${origin}`);
        }
    }

    /**
     * Remove allowed origin
     */
    removeAllowedOrigin(origin) {
        const index = this.allowedOrigins.indexOf(origin);
        if (index > -1) {
            this.allowedOrigins.splice(index, 1);
            this.logger.info(`➖ Removed allowed origin: ${origin}`);
        }
    }

    /**
     * Get CORS statistics
     */
    getStats() {
        const topOrigins = Array.from(this.requestStats.origins.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([origin, count]) => ({ origin, count }));

        return {
            total: this.requestStats.total,
            allowed: this.requestStats.allowed,
            blocked: this.requestStats.blocked,
            preflight: this.requestStats.preflight,
            allowedOrigins: this.allowedOrigins.length,
            topOrigins,
            blockRate: this.requestStats.total > 0 ?
                (this.requestStats.blocked / this.requestStats.total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Get CORS configuration
     */
    getConfig() {
        return {
            allowedOrigins: this.allowedOrigins,
            methods: this.corsOptions.methods,
            allowedHeaders: this.corsOptions.allowedHeaders,
            exposedHeaders: this.corsOptions.exposedHeaders,
            credentials: this.corsOptions.credentials,
            maxAge: this.corsOptions.maxAge
        };
    }

    /**
     * Update CORS configuration
     */
    updateConfig(newConfig) {
        try {
            if (newConfig.allowed_origins) {
                this.allowedOrigins = newConfig.allowed_origins;
            }

            if (newConfig.allowed_methods) {
                this.corsOptions.methods = newConfig.allowed_methods;
            }

            if (newConfig.allowed_headers) {
                this.corsOptions.allowedHeaders = newConfig.allowed_headers;
            }

            if (newConfig.exposed_headers) {
                this.corsOptions.exposedHeaders = newConfig.exposed_headers;
            }

            if (typeof newConfig.credentials === 'boolean') {
                this.corsOptions.credentials = newConfig.credentials;
            }

            if (newConfig.max_age) {
                this.corsOptions.maxAge = newConfig.max_age;
            }

            this.logger.info('🔄 CORS configuration updated');

        } catch (error) {
            this.logger.error('Failed to update CORS configuration:', error);
            throw error;
        }
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.requestStats = {
            total: 0,
            allowed: 0,
            blocked: 0,
            preflight: 0,
            origins: new Map()
        };

        this.logger.info('📊 CORS statistics reset');
    }

    /**
     * Validate origin format
     */
    validateOrigin(origin) {
        try {
            // Allow wildcard
            if (origin === '*') {
                return true;
            }

            // Allow pattern with wildcard
            if (origin.includes('*')) {
                // Basic validation for wildcard patterns
                return /^\*\.[a-zA-Z0-9.-]+$/.test(origin) || /^https?:\/\/\*\.[a-zA-Z0-9.-]+$/.test(origin);
            }

            // Validate URL format
            new URL(origin);
            return true;

        } catch (error) {
            return false;
        }
    }

    /**
     * Get middleware for specific route
     */
    getRouteMiddleware(routeConfig = {}) {
        const routeCorsOptions = {
            ...this.corsOptions,
            ...routeConfig
        };

        return cors(routeCorsOptions);
    }
}

module.exports = CorsMiddleware;