/**
 * Rate Limiting Middleware - Request rate limiting and throttling for the CAI Platform
 * 
 * Implements various rate limiting strategies including IP-based, user-based,
 * and endpoint-specific rate limiting with sliding window and token bucket algorithms
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const RedisStore = require('rate-limit-redis');
const Logger = require('../utils/logger');

class RateLimitMiddleware {
    constructor(config = {}, redisClient = null) {
        this.logger = new Logger('RateLimitMiddleware');
        this.config = config;
        this.redisClient = redisClient;

        // Default rate limit settings
        this.defaultLimits = {
            windowMs: config.window_ms || 15 * 60 * 1000, // 15 minutes
            max: config.max_requests || 100, // requests per window
            message: config.message || 'Too many requests, please try again later.',
            standardHeaders: true,
            legacyHeaders: false,
            skipSuccessfulRequests: false,
            skipFailedRequests: false
        };

        // Endpoint-specific limits
        this.endpointLimits = new Map([
            // Authentication endpoints
            ['/api/auth/login', { windowMs: 15 * 60 * 1000, max: 5 }],
            ['/api/auth/register', { windowMs: 60 * 60 * 1000, max: 3 }],
            ['/api/auth/reset-password', { windowMs: 60 * 60 * 1000, max: 3 }],

            // AI processing endpoints
            ['/api/brain/process', { windowMs: 60 * 1000, max: 10 }],
            ['/api/agents/query', { windowMs: 60 * 1000, max: 20 }],
            ['/api/rag/search', { windowMs: 60 * 1000, max: 30 }],

            // Data modification endpoints
            ['/api/data/upload', { windowMs: 60 * 60 * 1000, max: 10 }],
            ['/api/data/delete', { windowMs: 60 * 60 * 1000, max: 5 }],

            // Admin endpoints
            ['/api/admin/*', { windowMs: 60 * 1000, max: 20 }]
        ]);

        // User tier limits
        this.userTierLimits = {
            free: { windowMs: 60 * 60 * 1000, max: 100 },
            premium: { windowMs: 60 * 60 * 1000, max: 1000 },
            enterprise: { windowMs: 60 * 60 * 1000, max: 10000 }
        };

        // Rate limiting stores
        this.stores = {
            memory: new Map(),
            redis: redisClient ? new RedisStore({
                client: redisClient,
                prefix: 'rl:',
                sendCommand: (...args) => redisClient.call(...args)
            }) : null
        };

        // Statistics tracking
        this.stats = {
            totalRequests: 0,
            limitedRequests: 0,
            byEndpoint: new Map(),
            byIP: new Map(),
            byUser: new Map()
        };

        // Token bucket for burst handling
        this.tokenBuckets = new Map();

        this.logger.info('🚦 Rate limiting middleware initialized');
    }

    /**
     * Get default rate limiter
     */
    getDefaultLimiter() {
        return rateLimit({
            ...this.defaultLimits,
            store: this.stores.redis || undefined,
            keyGenerator: this.keyGenerator.bind(this),
            handler: this.limitHandler.bind(this),
            onLimitReached: this.onLimitReached.bind(this)
        });
    }

    /**
     * Get endpoint-specific rate limiter
     */
    getEndpointLimiter(endpoint) {
        const limits = this.endpointLimits.get(endpoint) || this.defaultLimits;

        return rateLimit({
            ...this.defaultLimits,
            ...limits,
            store: this.stores.redis || undefined,
            keyGenerator: (req) => this.keyGenerator(req, endpoint),
            handler: this.limitHandler.bind(this),
            onLimitReached: (req) => this.onLimitReached(req, endpoint)
        });
    }

    /**
     * Get user-based rate limiter
     */
    getUserLimiter(userTier = 'free') {
        const limits = this.userTierLimits[userTier] || this.userTierLimits.free;

        return rateLimit({
            ...this.defaultLimits,
            ...limits,
            store: this.stores.redis || undefined,
            keyGenerator: (req) => this.userKeyGenerator(req),
            handler: this.limitHandler.bind(this),
            onLimitReached: (req) => this.onLimitReached(req, `user-${userTier}`)
        });
    }

    /**
     * Get slow down middleware for gradual throttling
     */
    getSlowDown(options = {}) {
        return slowDown({
            windowMs: options.windowMs || 15 * 60 * 1000,
            delayAfter: options.delayAfter || 50,
            delayMs: options.delayMs || 500,
            maxDelayMs: options.maxDelayMs || 20000,
            skipFailedRequests: true,
            skipSuccessfulRequests: false,
            store: this.stores.redis || undefined,
            keyGenerator: this.keyGenerator.bind(this)
        });
    }

    /**
     * Token bucket rate limiter
     */
    getTokenBucketLimiter(options = {}) {
        const capacity = options.capacity || 10;
        const refillRate = options.refillRate || 1; // tokens per second
        const refillPeriod = options.refillPeriod || 1000; // milliseconds

        return (req, res, next) => {
            const key = this.keyGenerator(req);
            const now = Date.now();

            let bucket = this.tokenBuckets.get(key);
            if (!bucket) {
                bucket = {
                    tokens: capacity,
                    lastRefill: now,
                    capacity,
                    refillRate,
                    refillPeriod
                };
                this.tokenBuckets.set(key, bucket);
            }

            // Refill tokens
            const timePassed = now - bucket.lastRefill;
            const tokensToAdd = Math.floor(timePassed / refillPeriod) * refillRate;
            bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;

            // Check if request can be processed
            if (bucket.tokens >= 1) {
                bucket.tokens -= 1;
                next();
            } else {
                this.limitHandler(req, res, next);
            }
        };
    }

    /**
     * Adaptive rate limiter based on system load
     */
    getAdaptiveLimiter(systemMonitor) {
        return (req, res, next) => {
            if (!systemMonitor) {
                return next();
            }

            const systemStatus = systemMonitor.getSystemStatus();
            const cpuUsage = systemStatus.metrics?.system?.cpu?.percent || 0;
            const memoryUsage = systemStatus.metrics?.system?.memory?.system?.percent || 0;

            // Adjust limits based on system load
            let multiplier = 1;
            if (cpuUsage > 80 || memoryUsage > 85) {
                multiplier = 0.5; // Reduce limits by 50%
            } else if (cpuUsage > 60 || memoryUsage > 70) {
                multiplier = 0.75; // Reduce limits by 25%
            }

            const adaptiveLimiter = rateLimit({
                ...this.defaultLimits,
                max: Math.floor(this.defaultLimits.max * multiplier),
                store: this.stores.redis || undefined,
                keyGenerator: this.keyGenerator.bind(this),
                handler: this.limitHandler.bind(this)
            });

            adaptiveLimiter(req, res, next);
        };
    }

    /**
     * Generate rate limiting key
     */
    keyGenerator(req, endpoint = null) {
        const ip = this.getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'unknown';
        const route = endpoint || req.route?.path || req.path;

        // Use user ID if authenticated, otherwise use IP + User Agent hash
        if (req.user && req.user.id) {
            return `user:${req.user.id}:${route}`;
        }

        const hash = require('crypto')
            .createHash('md5')
            .update(userAgent)
            .digest('hex')
            .substring(0, 8);

        return `ip:${ip}:${hash}:${route}`;
    }

    /**
     * Generate user-specific key
     */
    userKeyGenerator(req) {
        if (req.user && req.user.id) {
            return `user:${req.user.id}`;
        }

        return this.keyGenerator(req);
    }

    /**
     * Get client IP address
     */
    getClientIP(req) {
        return req.ip ||
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            '127.0.0.1';
    }

    /**
     * Rate limit handler
     */
    limitHandler(req, res, next) {
        this.stats.limitedRequests++;

        const ip = this.getClientIP(req);
        const endpoint = req.route?.path || req.path;

        // Update statistics
        this.updateStats(ip, endpoint, 'limited');

        // Log rate limit hit
        this.logger.warn(`🚦 Rate limit exceeded for ${ip} on ${endpoint}`);

        // Send rate limit response
        res.status(429).json({
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: res.getHeader('Retry-After') || 60,
            limit: res.getHeader('X-RateLimit-Limit'),
            remaining: res.getHeader('X-RateLimit-Remaining'),
            reset: res.getHeader('X-RateLimit-Reset')
        });
    }

    /**
     * Called when rate limit is reached
     */
    onLimitReached(req, endpoint = null) {
        const ip = this.getClientIP(req);
        const route = endpoint || req.route?.path || req.path;

        this.logger.warn(`🚨 Rate limit reached for ${ip} on ${route}`);

        // Could trigger additional actions like temporary IP blocking
        // or alerting administrators
    }

    /**
     * Update statistics
     */
    updateStats(ip, endpoint, type = 'request') {
        this.stats.totalRequests++;

        // Update endpoint stats
        const endpointStats = this.stats.byEndpoint.get(endpoint) || { requests: 0, limited: 0 };
        endpointStats.requests++;
        if (type === 'limited') endpointStats.limited++;
        this.stats.byEndpoint.set(endpoint, endpointStats);

        // Update IP stats
        const ipStats = this.stats.byIP.get(ip) || { requests: 0, limited: 0 };
        ipStats.requests++;
        if (type === 'limited') ipStats.limited++;
        this.stats.byIP.set(ip, ipStats);
    }

    /**
     * Whitelist IP or user
     */
    whitelist(identifier, type = 'ip') {
        // Implementation would depend on the rate limiting store
        // For now, we'll use a simple in-memory whitelist
        if (!this.whitelistedEntities) {
            this.whitelistedEntities = new Set();
        }

        this.whitelistedEntities.add(`${type}:${identifier}`);
        this.logger.info(`✅ Whitelisted ${type}: ${identifier}`);
    }

    /**
     * Remove from whitelist
     */
    removeFromWhitelist(identifier, type = 'ip') {
        if (this.whitelistedEntities) {
            this.whitelistedEntities.delete(`${type}:${identifier}`);
            this.logger.info(`❌ Removed from whitelist ${type}: ${identifier}`);
        }
    }

    /**
     * Check if entity is whitelisted
     */
    isWhitelisted(req) {
        if (!this.whitelistedEntities) return false;

        const ip = this.getClientIP(req);
        const userId = req.user?.id;

        return this.whitelistedEntities.has(`ip:${ip}`) ||
            (userId && this.whitelistedEntities.has(`user:${userId}`));
    }

    /**
     * Get rate limiting statistics
     */
    getStats() {
        const topEndpoints = Array.from(this.stats.byEndpoint.entries())
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 10)
            .map(([endpoint, stats]) => ({ endpoint, ...stats }));

        const topIPs = Array.from(this.stats.byIP.entries())
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 10)
            .map(([ip, stats]) => ({ ip, ...stats }));

        return {
            total: this.stats.totalRequests,
            limited: this.stats.limitedRequests,
            limitRate: this.stats.totalRequests > 0 ?
                (this.stats.limitedRequests / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%',
            topEndpoints,
            topIPs,
            activeBuckets: this.tokenBuckets.size,
            whitelisted: this.whitelistedEntities ? this.whitelistedEntities.size : 0
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            limitedRequests: 0,
            byEndpoint: new Map(),
            byIP: new Map(),
            byUser: new Map()
        };

        this.logger.info('📊 Rate limiting statistics reset');
    }

    /**
     * Clean up expired token buckets
     */
    cleanup() {
        const now = Date.now();
        const expireTime = 60 * 60 * 1000; // 1 hour

        for (const [key, bucket] of this.tokenBuckets) {
            if (now - bucket.lastRefill > expireTime) {
                this.tokenBuckets.delete(key);
            }
        }

        this.logger.debug('🧹 Token bucket cleanup completed');
    }

    /**
     * Update endpoint limits
     */
    updateEndpointLimit(endpoint, limits) {
        this.endpointLimits.set(endpoint, limits);
        this.logger.info(`🔄 Updated rate limit for ${endpoint}:`, limits);
    }

    /**
     * Remove endpoint limit
     */
    removeEndpointLimit(endpoint) {
        this.endpointLimits.delete(endpoint);
        this.logger.info(`❌ Removed rate limit for ${endpoint}`);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            defaultLimits: this.defaultLimits,
            endpointLimits: Object.fromEntries(this.endpointLimits),
            userTierLimits: this.userTierLimits,
            storeType: this.stores.redis ? 'redis' : 'memory'
        };
    }
}

module.exports = RateLimitMiddleware;