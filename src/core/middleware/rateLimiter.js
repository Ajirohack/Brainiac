/**
 * Rate Limiter Middleware
 * 
 * Implements rate limiting to protect the CAI Platform from abuse
 * Supports multiple rate limiting strategies and configurations
 */

const Logger = require('../utils/logger');

class RateLimiter {
    constructor(config = {}) {
        this.config = {
            // Default rate limiting configuration
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxRequests: 100, // requests per window
            message: 'Too many requests, please try again later',
            standardHeaders: true, // Return rate limit info in headers
            legacyHeaders: false, // Disable X-RateLimit-* headers
            
            // Security settings
            trustProxy: true, // Trust X-Forwarded-* headers
            enableDdosProtection: true,
            ddosThreshold: 100, // requests per second per IP to trigger DDoS protection
            skipSuccessfulRequests: false,
            skipFailedRequests: false,
            
            // Key generation and handlers
            keyGenerator: this.defaultKeyGenerator.bind(this),
            handler: this.defaultHandler.bind(this),
            onLimitReached: this.defaultOnLimitReached.bind(this),
            
            // Rate limit tiers (requests per 15 minutes)
            tiers: {
                // IP-based tiers
                ip: {
                    default: { max: 100, windowMs: 15 * 60 * 1000 },
                    strict: { max: 30, windowMs: 15 * 60 * 1000 },
                    exempt: [] // List of IPs to exclude from rate limiting
                },
                // API key based tiers
                apiKey: {
                    free: { max: 100, windowMs: 15 * 60 * 1000 },
                    basic: { max: 1000, windowMs: 15 * 60 * 1000 },
                    premium: { max: 10000, windowMs: 15 * 60 * 1000 },
                    enterprise: { max: 100000, windowMs: 15 * 60 * 1000 }
                },
                // Endpoint-specific overrides
                endpoints: {
                    '/api/auth/login': { max: 10, windowMs: 15 * 60 * 1000 },
                    '/api/auth/register': { max: 5, windowMs: 60 * 60 * 1000 },
                    '/api/llm/chat': { max: 60, windowMs: 60 * 1000 } // 1 request per second
                }
            },
            ...config
        };

        this.logger = new Logger('RateLimiter');
        
        // Enhanced storage with TTL for automatic cleanup
        this.store = new Map();
        
        // Enhanced statistics with more detailed metrics
        this.stats = {
            totalRequests: 0,
            blockedRequests: 0,
            uniqueIPs: new Map(), // IP -> {count, firstSeen, lastSeen}
            rateLimitHits: 0,
            byEndpoint: new Map(), // endpoint -> {count, blocked}
            byUser: new Map(),    // userId -> {count, blocked}
            byApiKey: new Map()   // apiKey -> {count, blocked}
        };

        // Track suspicious IPs for DDoS protection
        this.suspiciousIPs = new Map();
        
        // Cleanup intervals
        this.cleanupInterval = setInterval(() => this.cleanupOldRecords(), 60000); // Every minute
        this.monitorInterval = setInterval(() => this.monitorTraffic(), 5000);     // Every 5 seconds
    }

    /**
     * Create rate limiting middleware
     */
    middleware(options = {}) {
        const config = { ...this.config, ...options };
        
        return (req, res, next) => {
            this.handleRequest(req, res, next, config);
        };
    }

    /**
     * Handle incoming request
     */
    async handleRequest(req, res, next, config) {
        try {
            // Generate key for this request
            const key = config.keyGenerator(req);
            
            // Get current window data
            const windowData = this.getWindowData(key, config);
            
            // Update statistics
            this.updateStats(req, windowData);
            
            // Check if limit exceeded
            if (windowData.requests >= config.maxRequests) {
                return this.handleLimitExceeded(req, res, windowData, config);
            }
            
            // Increment request count
            windowData.requests++;
            this.store.set(key, windowData);
            
            // Add rate limit headers
            this.addHeaders(res, windowData, config);
            
            // Continue to next middleware
            next();
            
        } catch (error) {
            this.logger.error('Rate limiter error:', error);
            next(); // Continue on error to avoid blocking legitimate requests
        }
    }

    /**
     * Get window data for a key
     */
    getWindowData(key, config) {
        const now = Date.now();
        const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
        
        let windowData = this.store.get(key);
        
        // Create new window or reset if expired
        if (!windowData || windowData.windowStart !== windowStart) {
            windowData = {
                windowStart,
                requests: 0,
                firstRequest: now,
                lastRequest: now
            };
        }
        
        windowData.lastRequest = now;
        return windowData;
    }

    /**
     * Handle limit exceeded
     */
    handleLimitExceeded(req, res, windowData, config) {
        this.stats.blockedRequests++;
        this.stats.rateLimitHits++;
        
        // Log rate limit hit
        this.logger.warn('Rate limit exceeded:', {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.originalUrl,
            requests: windowData.requests,
            limit: config.maxRequests
        });
        
        // Call limit reached callback
        config.onLimitReached(req, res, windowData);
        
        // Add headers
        this.addHeaders(res, windowData, config);
        
        // Send error response
        return config.handler(req, res, windowData, config);
    }

    /**
     * Add rate limit headers to response
     */
    addHeaders(res, windowData, config) {
        const remaining = Math.max(0, config.maxRequests - windowData.requests);
        const resetTime = windowData.windowStart + config.windowMs;
        
        if (config.standardHeaders) {
            res.set({
                'RateLimit-Limit': config.maxRequests,
                'RateLimit-Remaining': remaining,
                'RateLimit-Reset': new Date(resetTime).toISOString()
            });
        }
        
        if (config.legacyHeaders) {
            res.set({
                'X-RateLimit-Limit': config.maxRequests,
                'X-RateLimit-Remaining': remaining,
                'X-RateLimit-Reset': Math.ceil(resetTime / 1000)
            });
        }
    }

    /**
     * Generate a rate limit key based on IP, API key, and endpoint
     * @param {Object} req - Express request object
     * @returns {string} Rate limit key
     */
    defaultKeyGenerator(req) {
        const ip = this.getClientIP(req);
        const apiKey = this.getApiKey(req);
        const endpoint = req.path;
        
        // Check for DDoS protection
        if (this.config.enableDdosProtection) {
            this.trackIP(ip, endpoint);
            if (this.isDDoSAttack(ip)) {
                this.logger.warn(`Potential DDoS attack detected from IP: ${ip}`);
                // Apply stricter rate limiting or block the IP
                return `ddos:${ip}`;
            }
        }
        
        // If API key is provided, use it for rate limiting
        if (apiKey) {
            return `key:${apiKey}:${endpoint}`;
        }
        
        // Default to IP + endpoint based rate limiting
        return `ip:${ip}:${endpoint}`;
    }

    /**
     * Default handler for rate limited requests
     */
    defaultHandler(req, res, next, options) {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        
        // Set standard rate limit headers
        if (this.config.standardHeaders) {
            res.setHeader('Retry-After', retryAfter);
            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', 0);
            res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + options.windowMs) / 1000));
        }
        
        // Log the rate limit hit
        const ip = this.getClientIP(req);
        const endpoint = req.path;
        this.logger.warn(`Rate limit hit: ${ip} - ${endpoint} - ${options.max} requests per ${options.windowMs}ms`);
        
        // Update statistics
        this.stats.rateLimitHits++;
        this.updateEndpointStats(endpoint, true);
        
        // Return appropriate response
        res.status(429).json({
            status: 'error',
            code: 'rate_limit_exceeded',
            message: options.message || 'Too many requests, please try again later',
            retryAfter,
            documentation: 'https://docs.your-api.com/rate-limiting'
        });
    }

    /**
     * Key generator by user ID
     */
    userKeyGenerator(req) {
        return req.user?.id || req.userId || this.defaultKeyGenerator(req);
    }

    /**
     * Key generator by API key
     */
    apiKeyGenerator(req) {
        return req.headers['x-api-key'] || req.query.apiKey || this.defaultKeyGenerator(req);
    }

    /**
    /**
     * Default limit reached callback
     */
    defaultOnLimitReached(req, res, windowData) {
        // Override this method to implement custom logic
        // e.g., send notifications, update user status, etc.
    }

    /**
     * Create tiered rate limiter
     */
    createTieredLimiter(getTier) {
        return (req, res, next) => {
            const tier = getTier(req);
            const tierConfig = this.tiers[tier] || this.tiers.free;
            
            const config = {
                ...this.config,
                ...tierConfig
            };
            
            this.handleRequest(req, res, next, config);
        };
    }

    /**
     * Create endpoint-specific rate limiter
     */
    createEndpointLimiter(endpointLimits) {
        return (req, res, next) => {
            const endpoint = req.route?.path || req.path;
            const endpointConfig = endpointLimits[endpoint] || {};
            
            const config = {
                ...this.config,
                ...endpointConfig,
                keyGenerator: (req) => `${this.defaultKeyGenerator(req)}:${endpoint}`
            };
            
            this.handleRequest(req, res, next, config);
        };
    }

    /**
     * Create sliding window rate limiter
     */
    createSlidingWindowLimiter(options = {}) {
        const config = {
            ...this.config,
            ...options
        };
        
        return (req, res, next) => {
            const key = config.keyGenerator(req);
            const now = Date.now();
            const windowStart = now - config.windowMs;
            
            // Get or create request log for this key
            let requestLog = this.store.get(`sliding:${key}`) || [];
            
            // Remove old requests outside the window
            requestLog = requestLog.filter(timestamp => timestamp > windowStart);
            
            // Check if limit exceeded
            if (requestLog.length >= config.maxRequests) {
                this.stats.blockedRequests++;
                this.stats.rateLimitHits++;
                
                const retryAfter = Math.ceil((requestLog[0] + config.windowMs - now) / 1000);
                
                res.status(429).json({
                    error: 'RateLimitError',
                    message: config.message,
                    retryAfter: retryAfter,
                    limit: config.maxRequests,
                    windowMs: config.windowMs,
                    timestamp: new Date().toISOString()
                });
                return;
            }
            
            // Add current request
            requestLog.push(now);
            this.store.set(`sliding:${key}`, requestLog);
            
            // Add headers
            res.set({
                'RateLimit-Limit': config.maxRequests,
                'RateLimit-Remaining': Math.max(0, config.maxRequests - requestLog.length),
                'RateLimit-Reset': new Date(requestLog[0] + config.windowMs).toISOString()
            });
            
            next();
        };
    }

    /**
     * Update statistics
     */
    updateStats(req, windowData) {
        this.stats.totalRequests++;
        this.stats.uniqueIPs.set(this.getClientIP(req), {
            count: (this.stats.uniqueIPs.get(this.getClientIP(req)) || { count: 0 }).count + 1,
            firstSeen: (this.stats.uniqueIPs.get(this.getClientIP(req)) || { firstSeen: Date.now() }).firstSeen,
            lastSeen: Date.now(),
            endpoints: (this.stats.uniqueIPs.get(this.getClientIP(req)) || { endpoints: new Set() }).endpoints
        });
    }

    /**
     * Track IP address and detect potential DDoS attacks
     * @param {string} ip - Client IP address
     * @param {string} endpoint - Requested endpoint
     */
    trackIP(ip, endpoint) {
        const now = Date.now();

        // Update IP tracking
        if (!this.stats.uniqueIPs.has(ip)) {
            this.stats.uniqueIPs.set(ip, {
                count: 1,
                firstSeen: now,
                lastSeen: now,
                endpoints: new Set([endpoint])
            });
        } else {
            const ipData = this.stats.uniqueIPs.get(ip);
            ipData.count++;
            ipData.lastSeen = now;
            ipData.endpoints.add(endpoint);
        }

        // Update endpoint statistics
        this.updateEndpointStats(endpoint);
    }

    /**
     * Check if an IP is part of a DDoS attack
     * @param {string} ip - Client IP address
     * @returns {boolean} True if DDoS attack is detected
     */
    isDDoSAttack(ip) {
        if (!this.config.enableDdosProtection) return false;

        const now = Date.now();
        const ipData = this.stats.uniqueIPs.get(ip);

        // Skip if we don't have enough data
        if (!ipData || ipData.count < 10) return false;

        // Check request rate (requests per second)
        const timeWindow = (now - ipData.firstSeen) / 1000; // in seconds
        const requestRate = ipData.count / (timeWindow || 1);

        // If request rate exceeds threshold, mark as suspicious
        if (requestRate > this.config.ddosThreshold) {
            this.logger.warn(`High request rate detected from ${ip}: ${requestRate.toFixed(2)} req/s`);

            // Track suspicious IPs
            if (!this.suspiciousIPs.has(ip)) {
                this.suspiciousIPs.set(ip, {
                    firstDetected: now,
                    lastSeen: now,
                    requestCount: ipData.count,
                    requestRate: requestRate
                });
            } else {
                const suspiciousData = this.suspiciousIPs.get(ip);
                suspiciousData.lastSeen = now;
                suspiciousData.requestCount = ipData.count;
                suspiciousData.requestRate = requestRate;
            }

            return true;
        }

        return false;
    }

    /**
     * Update endpoint statistics
     * @param {string} endpoint - API endpoint
     * @param {boolean} isBlocked - Whether the request was blocked
     */
    updateEndpointStats(endpoint, isBlocked = false) {
        if (!this.stats.byEndpoint.has(endpoint)) {
            this.stats.byEndpoint.set(endpoint, { count: 1, blocked: isBlocked ? 1 : 0 });
        } else {
            const endpointData = this.stats.byEndpoint.get(endpoint);
            endpointData.count++;
            if (isBlocked) endpointData.blocked++;
        }
    }

    /**
     * Get client IP from request
     * @param {Object} req - Express request object
     * @returns {string} Client IP address
     */
    getClientIP(req) {
        if (this.config.trustProxy) {
            return req.headers['x-forwarded-for'] ||
                   req.connection.remoteAddress ||
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null);
        }
        return req.connection.remoteAddress || 'unknown';
    }

    /**
     * Extract API key from request
     * @param {Object} req - Express request object
     * @returns {string|null} API key or null if not found
     */
    getApiKey(req) {
        return req.headers['x-api-key'] ||
               req.query.api_key ||
               (req.body && req.body.api_key) ||
               null;
    }

    /**
     * Monitor traffic for anomalies and potential attacks
     */
    monitorTraffic() {
        const now = Date.now();
        const stats = {
            totalRequests: this.stats.totalRequests,
            uniqueIPs: this.stats.uniqueIPs.size,
            blockedRequests: this.stats.blockedRequests,
            rateLimitHits: this.stats.rateLimitHits,
            suspiciousIPs: this.suspiciousIPs.size,
            topEndpoints: Array.from(this.stats.byEndpoint.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5)
        };

        // Log traffic summary
        this.logger.info('Traffic Statistics:', stats);

        // Check for unusual patterns
        if (this.stats.rateLimitHits > 100) {
            this.logger.warn('High rate of rate limit hits detected');
        }

        if (this.suspiciousIPs.size > 10) {
            this.logger.warn('Multiple suspicious IPs detected');
        }
    }

    /**
     * Clean up old rate limit records and statistics
     */
    cleanupOldRecords() {
        const now = Date.now();
        let deleted = 0;

        // Clean up old rate limit entries
        for (const [key, entry] of this.store.entries()) {
            if (now - entry.lastReset > this.config.windowMs) {
                this.store.delete(key);
                deleted++;
            }
        }

        // Clean up old IP tracking (keep for 24 hours)
        for (const [ip, data] of this.stats.uniqueIPs.entries()) {
            if (now - data.lastSeen > 24 * 60 * 60 * 1000) {
                this.stats.uniqueIPs.delete(ip);
            }
        }

        // Clean up old suspicious IPs (keep for 1 hour)
        for (const [ip, data] of this.suspiciousIPs.entries()) {
            if (now - data.lastSeen > 60 * 60 * 1000) {
                this.suspiciousIPs.delete(ip);
            }
        }

        // Reset hourly statistics
        if (now - (this.lastHourlyReset || 0) > 60 * 60 * 1000) {
            this.lastHourlyReset = now;
            this.stats.byEndpoint.clear();
            this.logger.info('Reset hourly statistics');
        }

        this.logger.debug(`Cleaned up ${deleted} old rate limit records`);
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        const expiredKeys = [];

        for (const [key, data] of this.store.entries()) {
            if (key.startsWith('sliding:')) {
                // Clean sliding window data
                const requestLog = data.filter(timestamp => timestamp > now - this.config.windowMs);
                if (requestLog.length === 0) {
                    expiredKeys.push(key);
                } else {
                    this.store.set(key, requestLog);
                }
            } else {
                // Clean fixed window data
                if (data.windowStart + this.config.windowMs < now) {
                    expiredKeys.push(key);
                }
            }
        }

        expiredKeys.forEach(key => this.store.delete(key));

        if (expiredKeys.length > 0) {
            this.logger.debug(`Cleaned up ${expiredKeys.length} expired rate limit entries`);
        }
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            totalRequests: this.stats.totalRequests,
            blockedRequests: this.stats.blockedRequests,
            uniqueIPs: this.stats.uniqueIPs.size,
            rateLimitHits: this.stats.rateLimitHits,
            blockRate: this.stats.totalRequests > 0 ? 
                (this.stats.blockedRequests / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%',
            activeKeys: this.store.size
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            blockedRequests: 0,
            uniqueIPs: new Set(),
            rateLimitHits: 0
        };
    }

    /**
     * Clear all rate limit data
     */
    reset() {
        this.store.clear();
        this.resetStats();
        this.logger.info('Rate limiter reset - all data cleared');
    }

    /**
     * Get rate limit status for a key
     */
    getStatus(key) {
        const windowData = this.store.get(key);
        if (!windowData) {
            return {
                requests: 0,
                remaining: this.config.maxRequests,
                resetTime: Date.now() + this.config.windowMs
            };
        }
        
        return {
            requests: windowData.requests,
            remaining: Math.max(0, this.config.maxRequests - windowData.requests),
            resetTime: windowData.windowStart + this.config.windowMs,
            windowStart: windowData.windowStart
        };
    }

    /**
     * Whitelist an IP or key
     */
    whitelist(keys) {
        this.whitelistedKeys = this.whitelistedKeys || new Set();
        if (Array.isArray(keys)) {
            keys.forEach(key => this.whitelistedKeys.add(key));
        } else {
            this.whitelistedKeys.add(keys);
        }
    }

    /**
     * Check if key is whitelisted
     */
    isWhitelisted(key) {
        return this.whitelistedKeys && this.whitelistedKeys.has(key);
    }

    /**
     * Shutdown rate limiter
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
        this.logger.info('Rate limiter shutdown complete');
    }
}

module.exports = RateLimiter;