const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const logger = require('../utils/logger');
const { User } = require('../models');

// Promisify jwt.verify for async/await
const verifyToken = promisify(jwt.verify);

// Cache for blacklisted tokens
const tokenBlacklist = new Set();

/**
 * Middleware to authenticate JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('No token provided', {
        path: req.path,
        method: req.method,
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authentication token provided',
      });
    }
    
    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      logger.warn('Token has been revoked', {
        path: req.path,
        method: req.method,
      });
      
      return res.status(401).json({
        error: 'Token revoked',
        message: 'This token is no longer valid',
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = await verifyToken(token, process.env.JWT_SECRET || 'your_jwt_secret');
    } catch (error) {
      logger.warn('Invalid token', {
        path: req.path,
        method: req.method,
        error: error.message,
      });
      
      return res.status(403).json({
        error: 'Invalid token',
        message: 'Failed to authenticate token',
      });
    }
    
    // Check if user still exists
    const user = await User.query().findById(decoded.userId);
    
    if (!user) {
      logger.warn('User not found', {
        userId: decoded.userId,
        path: req.path,
        method: req.method,
      });
      
      return res.status(403).json({
        error: 'User not found',
        message: 'The user associated with this token no longer exists',
      });
    }
    
    // Check if user is active
    if (!user.is_active) {
      logger.warn('User account is inactive', {
        userId: user.id,
        path: req.path,
        method: req.method,
      });
      
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated',
      });
    }
    
    // Attach user to request object
    req.user = user;
    req.token = token;
    
    // Log successful authentication
    logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
      path: req.path,
      method: req.method,
    });
    
    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Middleware to check if user has required roles
 * @param {...string} roles - Required roles
 * @returns {Function} Express middleware function
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Unauthorized: No user in request', {
        path: req.path,
        method: req.method,
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    // Check if user has any of the required roles
    const hasRole = roles.some(role => req.user.role === role);
    
    if (!hasRole) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        requiredRoles: roles,
        userRole: req.user.role,
        path: req.path,
        method: req.method,
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user has required permissions
 * @param {...string} permissions - Required permissions
 * @returns {Function} Express middleware function
 */
const hasPermission = (...permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      logger.warn('Unauthorized: No user in request', {
        path: req.path,
        method: req.method,
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }
    
    try {
      // Get user with permissions (assuming a many-to-many relationship between User and Permission)
      const user = await User.query()
        .findById(req.user.id)
        .withGraphFetched('permissions');
      
      if (!user) {
        logger.warn('User not found', {
          userId: req.user.id,
          path: req.path,
          method: req.method,
        });
        
        return res.status(404).json({
          error: 'User not found',
          message: 'The user associated with this token no longer exists',
        });
      }
      
      // Get user's permissions
      const userPermissions = user.permissions ? user.permissions.map(p => p.name) : [];
      
      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasAllPermissions) {
        logger.warn('Insufficient permissions', {
          userId: user.id,
          requiredPermissions: permissions,
          userPermissions,
          path: req.path,
          method: req.method,
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to perform this action',
          required: permissions,
          has: userPermissions,
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission check failed', {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        path: req.path,
        method: req.method,
      });
      
      return res.status(500).json({
        error: 'Permission check failed',
        message: 'An error occurred while checking permissions',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  };
};

/**
 * Middleware to check if user is the owner of a resource
 * @param {string} modelName - Name of the model to check ownership
 * @param {string} idParam - Name of the route parameter containing the resource ID
 * @param {string} [userIdField='user_id'] - Name of the user ID field in the resource
 * @returns {Function} Express middleware function
 */
const isOwner = (modelName, idParam, userIdField = 'user_id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        logger.warn('Unauthorized: No user in request', {
          path: req.path,
          method: req.method,
        });
        
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      }
      
      const resourceId = req.params[idParam];
      
      if (!resourceId) {
        logger.warn('Resource ID not found in request', {
          idParam,
          path: req.path,
          method: req.method,
        });
        
        return res.status(400).json({
          error: 'Bad Request',
          message: `Resource ID parameter '${idParam}' is required`,
        });
      }
      
      // Get the model class
      const Model = require(`../models/${modelName}`);
      
      // Find the resource
      const resource = await Model.query().findById(resourceId);
      
      if (!resource) {
        logger.warn('Resource not found', {
          model: modelName,
          resourceId,
          path: req.path,
          method: req.method,
        });
        
        return res.status(404).json({
          error: 'Not Found',
          message: 'The requested resource was not found',
        });
      }
      
      // Check ownership
      if (resource[userIdField] !== req.user.id && req.user.role !== 'admin') {
        logger.warn('Access denied: User is not the owner', {
          userId: req.user.id,
          resourceId,
          ownerId: resource[userIdField],
          path: req.path,
          method: req.method,
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource',
        });
      }
      
      // Attach resource to request object for use in route handlers
      req.resource = resource;
      
      next();
    } catch (error) {
      logger.error('Ownership check failed', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        model: modelName,
        path: req.path,
        method: req.method,
      });
      
      return res.status(500).json({
        error: 'Ownership check failed',
        message: 'An error occurred while checking resource ownership',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  };
};

/**
 * Function to revoke a token by adding it to the blacklist
 * @param {string} token - The JWT token to revoke
 */
const revokeToken = (token) => {
  tokenBlacklist.add(token);
};

/**
 * Function to check if a token is revoked
 * @param {string} token - The JWT token to check
 * @returns {boolean} True if the token is revoked, false otherwise
 */
const isTokenRevoked = (token) => {
  return tokenBlacklist.has(token);
};

/**
 * Function to clean up expired tokens from the blacklist
 */
const cleanupTokenBlacklist = () => {
  // In a production environment, you would want to implement a more sophisticated
  // solution that removes expired tokens from the blacklist
  // This is a simplified version that just clears the blacklist periodically
  // and relies on the JWT expiration for actual token validation
  
  // For a real implementation, you might want to use a Redis set with TTL
  // or a similar solution that automatically expires entries
  
  // This is just a placeholder to illustrate the concept
  const now = Date.now();
  // Assuming we store tokens with their expiration time in the blacklist
  // In a real implementation, you would need to decode the token to get its expiration
  // and remove it from the blacklist if it's expired
  
  // For now, we'll just log the cleanup
  logger.debug('Token blacklist cleanup', {
    size: tokenBlacklist.size,
  });
};

// Schedule periodic cleanup of the token blacklist
// Run cleanup every hour
setInterval(cleanupTokenBlacklist, 60 * 60 * 1000);

module.exports = {
  authenticateToken,
  authorize,
  hasPermission,
  isOwner,
  revokeToken,
  isTokenRevoked,
};
