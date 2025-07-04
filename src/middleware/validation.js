const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Middleware to validate request using express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  
  next();
};

/**
 * Middleware to validate API key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    logger.warn('API key is required', {
      path: req.path,
      method: req.method,
    });
    
    return res.status(401).json({
      error: 'API key is required',
    });
  }
  
  // In a real application, you would validate the API key against your database
  // For now, we'll just check if it's not empty
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    logger.warn('Invalid API key format', {
      path: req.path,
      method: req.method,
    });
    
    return res.status(401).json({
      error: 'Invalid API key format',
    });
  }
  
  // Add the API key to the request object for use in route handlers
  req.apiKey = apiKey.trim();
  
  next();
};

/**
 * Middleware to validate JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const validateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Authentication token is required', {
      path: req.path,
      method: req.method,
    });
    
    return res.status(401).json({
      error: 'Authentication token is required',
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    logger.warn('Invalid token format', {
      path: req.path,
      method: req.method,
    });
    
    return res.status(401).json({
      error: 'Invalid token format',
    });
  }
  
  // In a real application, you would verify the JWT token here
  // For now, we'll just check if it's not empty
  if (typeof token !== 'string' || token.trim() === '') {
    logger.warn('Invalid token', {
      path: req.path,
      method: req.method,
    });
    
    return res.status(401).json({
      error: 'Invalid token',
    });
  }
  
  // Add the token to the request object for use in route handlers
  req.token = token.trim();
  
  next();
};

/**
 * Middleware to validate required permissions
 * @param {Array} requiredPermissions - Array of required permissions
 * @returns {Function} Express middleware function
 */
const checkPermissions = (requiredPermissions = []) => {
  return (req, res, next) => {
    // In a real application, you would check the user's permissions here
    // For now, we'll just check if the required permissions array is empty
    if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
      return next();
    }
    
    // Mock user permissions (replace with actual user permissions from the database)
    const userPermissions = [
      'llm:read',
      'llm:write',
      'models:read',
      'models:write',
      'providers:read',
      'providers:write',
    ];
    
    // Check if the user has all the required permissions
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      logger.warn('Insufficient permissions', {
        path: req.path,
        method: req.method,
        requiredPermissions,
        userPermissions,
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: requiredPermissions,
        has: userPermissions,
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate rate limiting
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.maxRequests - Maximum number of requests allowed in the time window
 * @returns {Function} Express middleware function
 */
const rateLimit = ({ windowMs = 60 * 1000, maxRequests = 60 } = {}) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean up old entries
    for (const [key, value] of requests.entries()) {
      if (now - value.timestamp > windowMs) {
        requests.delete(key);
      }
    }
    
    // Get or create request count for this IP
    const requestInfo = requests.get(ip) || { count: 0, timestamp: now };
    
    // Check if the request limit has been exceeded
    if (requestInfo.count >= maxRequests) {
      const retryAfter = Math.ceil((requestInfo.timestamp + windowMs - now) / 1000);
      
      res.set('Retry-After', retryAfter.toString());
      
      logger.warn('Rate limit exceeded', {
        ip,
        path: req.path,
        method: req.method,
        count: requestInfo.count,
        max: maxRequests,
        retryAfter,
      });
      
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }
    
    // Increment the request count
    requestInfo.count += 1;
    requestInfo.timestamp = now;
    requests.set(ip, requestInfo);
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': maxRequests - requestInfo.count,
      'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000),
    });
    
    next();
  };
};

/**
 * Middleware to validate request body against a JSON schema
 * @param {Object} schema - JSON schema to validate against
 * @returns {Function} Express middleware function
 */
const validateSchema = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        message: detail.message,
        path: detail.path.join('.'),
        type: detail.type,
      }));
      
      logger.warn('Schema validation failed', {
        path: req.path,
        method: req.method,
        errors,
      });
      
      return res.status(400).json({
        error: 'Schema validation failed',
        details: errors,
      });
    }
    
    next();
  };
};

module.exports = {
  validateRequest,
  validateApiKey,
  validateToken,
  checkPermissions,
  rateLimit,
  validateSchema,
};
