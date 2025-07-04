/**
 * Error Handler Middleware
 * 
 * Centralized error handling for the CAI Platform
 * Provides consistent error responses and logging
 */

const Logger = require('../utils/logger');

class ErrorHandler {
    constructor(config = {}) {
        this.config = {
            enableStackTrace: process.env.NODE_ENV === 'development',
            enableDetailedErrors: process.env.NODE_ENV !== 'production',
            logErrors: true,
            includeRequestInfo: true,
            ...config
        };

        this.logger = new Logger('ErrorHandler');
        
        // Error type mappings
        this.errorTypes = {
            ValidationError: { status: 400, message: 'Invalid input data' },
            AuthenticationError: { status: 401, message: 'Authentication required' },
            AuthorizationError: { status: 403, message: 'Access denied' },
            NotFoundError: { status: 404, message: 'Resource not found' },
            ConflictError: { status: 409, message: 'Resource conflict' },
            RateLimitError: { status: 429, message: 'Too many requests' },
            InternalError: { status: 500, message: 'Internal server error' },
            ServiceUnavailableError: { status: 503, message: 'Service temporarily unavailable' }
        };

        // Error statistics
        this.stats = {
            totalErrors: 0,
            errorsByType: new Map(),
            errorsByEndpoint: new Map(),
            last24Hours: []
        };
    }

    /**
     * Express error handling middleware
     */
    middleware() {
        return (error, req, res, next) => {
            this.handleError(error, req, res, next);
        };
    }

    /**
     * Handle error and send appropriate response
     */
    handleError(error, req, res, next) {
        try {
            // Update statistics
            this.updateStats(error, req);

            // Log the error
            if (this.config.logErrors) {
                this.logError(error, req);
            }

            // Determine error details
            const errorDetails = this.getErrorDetails(error);
            
            // Build response
            const response = this.buildErrorResponse(error, errorDetails, req);

            // Send response
            res.status(errorDetails.status).json(response);

        } catch (handlingError) {
            // Fallback error handling
            this.logger.error('Error in error handler:', handlingError);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An unexpected error occurred',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get error details based on error type
     */
    getErrorDetails(error) {
        // Check for custom error types
        if (error.name && this.errorTypes[error.name]) {
            return {
                status: error.status || this.errorTypes[error.name].status,
                type: error.name,
                message: error.message || this.errorTypes[error.name].message
            };
        }

        // Check for HTTP status codes
        if (error.status || error.statusCode) {
            return {
                status: error.status || error.statusCode,
                type: this.getErrorTypeFromStatus(error.status || error.statusCode),
                message: error.message || 'An error occurred'
            };
        }

        // Check for specific error patterns
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return {
                status: 400,
                type: 'ValidationError',
                message: error.message || 'Invalid input data'
            };
        }

        if (error.name === 'MongoError' || error.name === 'MongooseError') {
            return {
                status: 500,
                type: 'DatabaseError',
                message: this.config.enableDetailedErrors ? error.message : 'Database operation failed'
            };
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return {
                status: 503,
                type: 'ServiceUnavailableError',
                message: 'External service unavailable'
            };
        }

        // Default to internal server error
        return {
            status: 500,
            type: 'InternalError',
            message: this.config.enableDetailedErrors ? error.message : 'Internal server error'
        };
    }

    /**
     * Build error response object
     */
    buildErrorResponse(error, errorDetails, req) {
        const response = {
            error: errorDetails.type,
            message: errorDetails.message,
            timestamp: new Date().toISOString(),
            requestId: req.id || req.headers['x-request-id'] || this.generateRequestId()
        };

        // Add stack trace in development
        if (this.config.enableStackTrace && error.stack) {
            response.stack = error.stack;
        }

        // Add request information
        if (this.config.includeRequestInfo) {
            response.request = {
                method: req.method,
                url: req.originalUrl || req.url,
                userAgent: req.headers['user-agent']
            };
        }

        // Add validation details for validation errors
        if (error.name === 'ValidationError' && error.details) {
            response.validationErrors = error.details;
        }

        // Add additional error data if available
        if (error.data && this.config.enableDetailedErrors) {
            response.additionalData = error.data;
        }

        return response;
    }

    /**
     * Log error with appropriate level
     */
    logError(error, req) {
        const errorDetails = this.getErrorDetails(error);
        const logData = {
            error: error.message,
            type: errorDetails.type,
            status: errorDetails.status,
            method: req.method,
            url: req.originalUrl || req.url,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString()
        };

        // Log based on severity
        if (errorDetails.status >= 500) {
            this.logger.error('Server error:', logData);
            if (error.stack) {
                this.logger.error('Stack trace:', error.stack);
            }
        } else if (errorDetails.status >= 400) {
            this.logger.warn('Client error:', logData);
        } else {
            this.logger.info('Request error:', logData);
        }
    }

    /**
     * Update error statistics
     */
    updateStats(error, req) {
        this.stats.totalErrors++;
        
        const errorType = this.getErrorDetails(error).type;
        const currentCount = this.stats.errorsByType.get(errorType) || 0;
        this.stats.errorsByType.set(errorType, currentCount + 1);
        
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        const endpointCount = this.stats.errorsByEndpoint.get(endpoint) || 0;
        this.stats.errorsByEndpoint.set(endpoint, endpointCount + 1);
        
        // Track last 24 hours
        const now = Date.now();
        this.stats.last24Hours.push(now);
        this.stats.last24Hours = this.stats.last24Hours.filter(
            timestamp => now - timestamp < 24 * 60 * 60 * 1000
        );
    }

    /**
     * Get error type from HTTP status code
     */
    getErrorTypeFromStatus(status) {
        if (status >= 500) return 'ServerError';
        if (status >= 400) return 'ClientError';
        return 'UnknownError';
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create custom error classes
     */
    static createError(type, message, status, data = null) {
        const error = new Error(message);
        error.name = type;
        error.status = status;
        if (data) error.data = data;
        return error;
    }

    /**
     * Validation error helper
     */
    static validationError(message, details = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.status = 400;
        if (details) error.details = details;
        return error;
    }

    /**
     * Authentication error helper
     */
    static authenticationError(message = 'Authentication required') {
        const error = new Error(message);
        error.name = 'AuthenticationError';
        error.status = 401;
        return error;
    }

    /**
     * Authorization error helper
     */
    static authorizationError(message = 'Access denied') {
        const error = new Error(message);
        error.name = 'AuthorizationError';
        error.status = 403;
        return error;
    }

    /**
     * Not found error helper
     */
    static notFoundError(message = 'Resource not found') {
        const error = new Error(message);
        error.name = 'NotFoundError';
        error.status = 404;
        return error;
    }

    /**
     * Rate limit error helper
     */
    static rateLimitError(message = 'Too many requests') {
        const error = new Error(message);
        error.name = 'RateLimitError';
        error.status = 429;
        return error;
    }

    /**
     * Get error statistics
     */
    getStats() {
        return {
            totalErrors: this.stats.totalErrors,
            errorsByType: Object.fromEntries(this.stats.errorsByType),
            errorsByEndpoint: Object.fromEntries(this.stats.errorsByEndpoint),
            errorsLast24Hours: this.stats.last24Hours.length,
            errorRate: this.stats.last24Hours.length / 24 // errors per hour
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalErrors: 0,
            errorsByType: new Map(),
            errorsByEndpoint: new Map(),
            last24Hours: []
        };
    }

    /**
     * Handle uncaught exceptions
     */
    handleUncaughtException(error) {
        this.logger.error('Uncaught Exception:', error);
        
        // Graceful shutdown
        process.exit(1);
    }

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection(reason, promise) {
        this.logger.error('Unhandled Promise Rejection:', {
            reason: reason,
            promise: promise
        });
        
        // Graceful shutdown
        process.exit(1);
    }

    /**
     * Setup global error handlers
     */
    setupGlobalHandlers() {
        process.on('uncaughtException', this.handleUncaughtException.bind(this));
        process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
    }
}

module.exports = ErrorHandler;