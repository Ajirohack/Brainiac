/**
 * Security Utility Module
 * 
 * Provides common security-related utilities for the CAI Platform
 */

const crypto = require('crypto');
const { URL } = require('url');
const validator = require('validator');

// Use a try-catch to handle cases where Logger might not be available (e.g., in tests)
let Logger;
try {
    Logger = require('./logger').Logger;
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

class SecurityUtils {
    constructor() {
        this.logger = new (Logger || function() { return { log: () => {} }; })('SecurityUtils');
        
        // Default security headers for HTTP responses
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';",
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        };
        
        // Rate limiting configuration
        this.rateLimitConfig = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxRequests: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many requests, please try again later',
        };
        
        // Input validation rules
        this.validationRules = {
            username: {
                minLength: 3,
                maxLength: 30,
                regex: /^[a-zA-Z0-9_-]+$/,
            },
            password: {
                minLength: 12,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
            },
            apiKey: {
                minLength: 32,
                maxLength: 256,
            },
            url: {
                requireHttps: true,
                allowedDomains: [], // Add allowed domains if needed
            },
        };
    }
    
    /**
     * Validate user input against common attack patterns
     * @param {string} input - The input to validate
     * @param {string} type - The type of validation to perform
     * @returns {Object} - { isValid: boolean, message: string }
     */
    validateInput(input, type = 'general') {
        if (typeof input !== 'string') {
            return { isValid: false, message: 'Input must be a string' };
        }
        
        // Trim whitespace
        const trimmed = input.trim();
        
        // Check for empty input
        if (!trimmed) {
            return { isValid: false, message: 'Input cannot be empty' };
        }
        
        // Check for common injection patterns
        const injectionPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
            /(\b|\s)(on\w+)=("[^"]*"|'[^']*'|[^\s>]*)/gi, // Event handlers
            /javascript:/gi, // JavaScript URIs
            /vbscript:/gi, // VBScript URIs
            /<\w+[^>]*\s+on\w+\s*=[^>]*>/gi, // Inline event handlers
            /[\u2028\u2029]/g, // Line/paragraph separators
            /[\u0000-\u001F\u007F-\u009F\u2000-\u200F\u2028\u2029\uFEFF]/g, // Control characters
        ];
        
        for (const pattern of injectionPatterns) {
            if (pattern.test(trimmed)) {
                this.logger.warn(`Potential injection attack detected in input: ${trimmed.substring(0, 50)}...`);
                return { isValid: false, message: 'Invalid input detected' };
            }
        }
        
        // Type-specific validation
        switch (type) {
            case 'username':
                return this._validateUsername(trimmed);
            case 'email':
                return this._validateEmail(trimmed);
            case 'password':
                return this._validatePassword(trimmed);
            case 'url':
                return this._validateUrl(trimmed);
            case 'apiKey':
                return this._validateApiKey(trimmed);
            case 'json':
                return this._validateJson(trimmed);
            default:
                return { isValid: true, message: 'Input is valid' };
        }
    }
    
    /**
     * Sanitize user input to prevent XSS and injection attacks
     * @param {string} input - The input to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} - Sanitized input
     */
    sanitizeInput(input, options = {}) {
        if (typeof input !== 'string') {
            return '';
        }
        
        const {
            allowHtml = false,
            allowUrls = false,
            maxLength = 1000,
            escapeHtml = true,
            trim = true,
        } = options;
        
        let sanitized = input;
        
        // Trim whitespace
        if (trim) {
            sanitized = sanitized.trim();
        }
        
        // Remove control characters
        sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F\u2000-\u200F\u2028\u2029\uFEFF]/g, '');
        
        // Escape HTML if needed
        if (escapeHtml) {
            const htmlEscapes = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '/': '&#x2F;',
                '`': '&#x60;',
                '=': '&#x3D;',
            };
            
            sanitized = sanitized.replace(/[&<>"'`=]/g, (char) => htmlEscapes[char]);
        }
        
        // Remove URLs if not allowed
        if (!allowUrls) {
            sanitized = sanitized.replace(/\b(https?:\/\/|www\.)[^\s]+/g, '');
        }
        
        // Enforce max length
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        
        return sanitized;
    }
    
    /**
     * Generate a secure random string
     * @param {number} length - Length of the random string
     * @returns {string} - Secure random string
     */
    generateRandomString(length = 32) {
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }
    
    /**
     * Generate a secure hash of the input
     * @param {string} input - The input to hash
     * @param {string} algorithm - Hash algorithm (default: sha256)
     * @returns {string} - Hashed output
     */
    hash(input, algorithm = 'sha256') {
        if (typeof input !== 'string') {
            throw new Error('Input must be a string');
        }
        
        return crypto
            .createHash(algorithm)
            .update(input, 'utf8')
            .digest('hex');
    }
    
    /**
     * Generate a secure token for CSRF protection
     * @returns {string} - CSRF token
     */
    generateCsrfToken() {
        return this.generateRandomString(64);
    }
    
    /**
     * Get security headers for HTTP responses
     * @param {Object} options - Header options
     * @returns {Object} - Security headers
     */
    getSecurityHeaders(options = {}) {
        const headers = { ...this.securityHeaders };
        
        // Apply custom CSP if provided
        if (options.csp) {
            headers['Content-Security-Policy'] = options.csp;
        }
        
        // Add HSTS header if using HTTPS
        if (options.https) {
            headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
        }
        
        // Add CORS headers if needed
        if (options.cors) {
            headers['Access-Control-Allow-Origin'] = options.cors.origin || '*';
            headers['Access-Control-Allow-Methods'] = options.cors.methods || 'GET, POST, OPTIONS';
            headers['Access-Control-Allow-Headers'] = options.cors.headers || 'Content-Type, Authorization';
            headers['Access-Control-Allow-Credentials'] = options.cors.credentials ? 'true' : 'false';
        }
        
        return headers;
    }
    
    // Private validation methods
    _validateUsername(username) {
        const { minLength, maxLength, regex } = this.validationRules.username;
        
        if (username.length < minLength || username.length > maxLength) {
            return {
                isValid: false,
                message: `Username must be between ${minLength} and ${maxLength} characters`,
            };
        }
        
        if (!regex.test(username)) {
            return {
                isValid: false,
                message: 'Username can only contain letters, numbers, underscores, and hyphens',
            };
        }
        
        return { isValid: true, message: 'Username is valid' };
    }
    
    _validateEmail(email) {
        if (!validator.isEmail(email)) {
            return { isValid: false, message: 'Invalid email address' };
        }
        
        // Additional checks for disposable emails, etc. can be added here
        
        return { isValid: true, message: 'Email is valid' };
    }
    
    _validatePassword(password) {
        const { minLength, requireUppercase, requireLowercase, requireNumbers, requireSpecialChars } = this.validationRules.password;
        
        if (password.length < minLength) {
            return {
                isValid: false,
                message: `Password must be at least ${minLength} characters long`,
            };
        }
        
        if (requireUppercase && !/[A-Z]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one uppercase letter',
            };
        }
        
        if (requireLowercase && !/[a-z]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one lowercase letter',
            };
        }
        
        if (requireNumbers && !/\d/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one number',
            };
        }
        
        if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return {
                isValid: false,
                message: 'Password must contain at least one special character',
            };
        }
        
        return { isValid: true, message: 'Password is valid' };
    }
    
    _validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            
            if (this.validationRules.url.requireHttps && parsedUrl.protocol !== 'https:') {
                return { isValid: false, message: 'URL must use HTTPS' };
            }
            
            if (this.validationRules.url.allowedDomains.length > 0) {
                const domainAllowed = this.validationRules.url.allowedDomains.some(
                    domain => parsedUrl.hostname.endsWith(domain)
                );
                
                if (!domainAllowed) {
                    return { isValid: false, message: 'URL domain is not allowed' };
                }
            }
            
            return { isValid: true, message: 'URL is valid' };
        } catch (error) {
            return { isValid: false, message: 'Invalid URL' };
        }
    }
    
    _validateApiKey(apiKey) {
        const { minLength, maxLength } = this.validationRules.apiKey;
        
        if (apiKey.length < minLength || apiKey.length > maxLength) {
            return {
                isValid: false,
                message: `API key must be between ${minLength} and ${maxLength} characters`,
            };
        }
        
        return { isValid: true, message: 'API key is valid' };
    }
    
    _validateJson(jsonString) {
        try {
            JSON.parse(jsonString);
            return { isValid: true, message: 'Valid JSON' };
        } catch (error) {
            return { isValid: false, message: 'Invalid JSON' };
        }
    }
}

module.exports = new SecurityUtils();
