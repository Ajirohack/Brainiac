/**
 * Authentication Middleware - JWT-based authentication and authorization
 * 
 * Provides JWT token validation, user management, role-based access control,
 * and session management with proper security measures.
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class AuthenticationMiddleware {
    constructor(config = {}) {
        this.config = {
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key',
      jwtExpiresIn: config.jwtExpiresIn || '24h',
      refreshTokenExpiresIn: config.refreshTokenExpiresIn || '7d',
      saltRounds: config.saltRounds || 12,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
            ...config
        };

    this.logger = logger;
    this.loginAttempts = new Map(); // Track login attempts per IP
    this.refreshTokens = new Map(); // Store refresh tokens
    this.userSessions = new Map(); // Track user sessions

    this.logger.info('🔐 Authentication middleware initialized');
  }

  /**
   * Middleware to authenticate JWT tokens
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  authenticateToken(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          error: 'Access token required',
          code: 'MISSING_TOKEN'
        });
      }

      jwt.verify(token, this.config.jwtSecret, (err, decoded) => {
        if (err) {
          this.logger.warn('❌ Invalid JWT token', {
            error: err.message,
            ip: req.ip
          });

          if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
              error: 'Token expired',
              code: 'TOKEN_EXPIRED'
            });
          }

          return res.status(403).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
          });
        }

        // Check if user session is still valid
        if (!this.isSessionValid(decoded.userId, decoded.sessionId)) {
          return res.status(401).json({
            error: 'Session expired',
            code: 'SESSION_EXPIRED'
          });
        }

        req.user = decoded;
        req.userId = decoded.userId;
        req.sessionId = decoded.sessionId;

        this.logger.debug('✅ Token authenticated', {
          userId: decoded.userId,
          ip: req.ip
        });

        next();
      });
            
        } catch (error) {
      this.logger.error('❌ Authentication error', {
        error: error.message,
        ip: req.ip
      });

      return res.status(500).json({
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
        }
    }

    /**
   * Middleware to require specific roles
   * @param {Array} requiredRoles - Array of required roles
   * @returns {Function} Express middleware function
   */
  requireRoles(requiredRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        this.logger.warn('❌ Insufficient permissions', {
          userId: req.user.userId,
          userRoles,
          requiredRoles,
          ip: req.ip
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      this.logger.debug('✅ Role check passed', {
        userId: req.user.userId,
        roles: userRoles,
        requiredRoles
      });

      next();
        };
    }

    /**
   * Middleware to require specific permissions
   * @param {Array} requiredPermissions - Array of required permissions
   * @returns {Function} Express middleware function
   */
  requirePermissions(requiredPermissions) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userPermissions = req.user.permissions || [];
      const hasRequiredPermission = requiredPermissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (!hasRequiredPermission) {
        this.logger.warn('❌ Insufficient permissions', {
          userId: req.user.userId,
          userPermissions,
          requiredPermissions,
          ip: req.ip
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      this.logger.debug('✅ Permission check passed', {
        userId: req.user.userId,
        permissions: userPermissions,
        requiredPermissions
      });

      next();
    };
  }

    /**
     * Generate JWT token
   * @param {Object} user - User object
   * @returns {Object} Token data
     */
  generateToken(user) {
    const sessionId = crypto.randomUUID();
        const payload = {
      userId: user.id,
      email: user.email,
      roles: user.roles || [],
      permissions: user.permissions || [],
      sessionId: sessionId,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiresIn
    });

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId: sessionId },
      this.config.jwtSecret,
      { expiresIn: this.config.refreshTokenExpiresIn }
    );

    // Store session information
    this.userSessions.set(sessionId, {
      userId: user.id,
            createdAt: new Date(),
      lastActivity: new Date(),
      ip: user.ip || 'unknown'
    });

    // Store refresh token
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      sessionId: sessionId,
      createdAt: new Date()
    });

    this.logger.info('🎫 Generated new token', {
      userId: user.id,
      sessionId: sessionId
    });
        
        return {
      accessToken: token,
      refreshToken: refreshToken,
      expiresIn: this.config.jwtExpiresIn,
      tokenType: 'Bearer'
        };
    }

    /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} New token data
   */
  refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.config.jwtSecret);
      
      // Check if refresh token exists in storage
      const storedToken = this.refreshTokens.get(refreshToken);
      if (!storedToken || storedToken.userId !== decoded.userId) {
        throw new Error('Invalid refresh token');
      }

      // Get user data (in real implementation, fetch from database)
      const user = this.getUserById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const newTokens = this.generateToken(user);

      // Remove old refresh token
      this.refreshTokens.delete(refreshToken);

      this.logger.info('🔄 Token refreshed', {
        userId: decoded.userId,
        sessionId: decoded.sessionId
      });

      return newTokens;

    } catch (error) {
      this.logger.error('❌ Token refresh failed', {
        error: error.message
      });
      throw new Error('Token refresh failed');
    }
    }

    /**
     * Hash password
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
     */
    async hashPassword(password) {
    try {
      const salt = await bcrypt.genSalt(this.config.saltRounds);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      this.logger.error('❌ Password hashing failed', {
        error: error.message
      });
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Password match
   */
  async comparePassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('❌ Password comparison failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if IP is locked out
   * @param {string} ip - IP address
   * @returns {boolean} Lockout status
   * @private
   */
  isIpLockedOut(ip) {
    const attempts = this.loginAttempts.get(ip);
    if (!attempts) return false;

    const now = Date.now();
    const timeSinceLastAttempt = now - attempts.lastAttempt;

    if (attempts.count >= this.config.maxLoginAttempts && 
        timeSinceLastAttempt < this.config.lockoutDuration) {
      return true;
    }

    // Reset if lockout period has passed
    if (timeSinceLastAttempt >= this.config.lockoutDuration) {
      this.loginAttempts.delete(ip);
      return false;
    }

    return false;
  }

  /**
   * Record login attempt
   * @param {string} ip - IP address
   * @param {boolean} success - Whether login was successful
   * @private
   */
  recordLoginAttempt(ip, success) {
    const now = Date.now();
    const attempts = this.loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    if (success) {
      this.loginAttempts.delete(ip);
        } else {
      attempts.count++;
      attempts.lastAttempt = now;
      this.loginAttempts.set(ip, attempts);
        }
    }

    /**
   * Check if session is valid
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {boolean} Session validity
   * @private
   */
  isSessionValid(userId, sessionId) {
    const session = this.userSessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return false;
    }

    // Update last activity
    session.lastActivity = new Date();
    this.userSessions.set(sessionId, session);

    return true;
  }

  /**
   * Invalidate session
   * @param {string} sessionId - Session ID
   */
  invalidateSession(sessionId) {
    this.userSessions.delete(sessionId);
    this.logger.info('🚫 Session invalidated', { sessionId });
  }

  /**
   * Invalidate all sessions for user
   * @param {string} userId - User ID
   */
  invalidateUserSessions(userId) {
    for (const [sessionId, session] of this.userSessions.entries()) {
      if (session.userId === userId) {
        this.userSessions.delete(sessionId);
      }
    }

    // Remove refresh tokens for user
    for (const [refreshToken, tokenData] of this.refreshTokens.entries()) {
      if (tokenData.userId === userId) {
        this.refreshTokens.delete(refreshToken);
      }
    }

    this.logger.info('🚫 All sessions invalidated for user', { userId });
  }

  /**
   * Get user by ID (placeholder - implement with database)
   * @param {string} userId - User ID
   * @returns {Object|null} User object
   * @private
   */
  getUserById(userId) {
    // This is a placeholder - implement with actual database query
    // For now, return a mock user
    return {
      id: userId,
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['read', 'write']
    };
    }

    /**
     * Clean up expired sessions and tokens
   * @private
     */
  cleanupExpired() {
        const now = new Date();
        
        // Clean up expired sessions
    for (const [sessionId, session] of this.userSessions.entries()) {
      const sessionAge = now - session.lastActivity;
      if (sessionAge > 24 * 60 * 60 * 1000) { // 24 hours
        this.userSessions.delete(sessionId);
      }
    }

    // Clean up expired refresh tokens
    for (const [refreshToken, tokenData] of this.refreshTokens.entries()) {
      const tokenAge = now - tokenData.createdAt;
      if (tokenAge > 7 * 24 * 60 * 60 * 1000) { // 7 days
        this.refreshTokens.delete(refreshToken);
      }
    }

    // Clean up old login attempts
    for (const [ip, attempts] of this.loginAttempts.entries()) {
      const attemptAge = now - attempts.lastAttempt;
      if (attemptAge > this.config.lockoutDuration) {
        this.loginAttempts.delete(ip);
            }
        }
    }

    /**
     * Get authentication statistics
   * @returns {Object} Auth statistics
     */
    getStats() {
        return {
      activeSessions: this.userSessions.size,
      activeRefreshTokens: this.refreshTokens.size,
      lockedOutIPs: Array.from(this.loginAttempts.entries())
        .filter(([ip, attempts]) => this.isIpLockedOut(ip)).length,
      config: {
        jwtExpiresIn: this.config.jwtExpiresIn,
        refreshTokenExpiresIn: this.config.refreshTokenExpiresIn,
        maxLoginAttempts: this.config.maxLoginAttempts,
        lockoutDuration: this.config.lockoutDuration
      }
        };
    }

    /**
   * Start cleanup interval
   */
  startCleanup() {
    // Clean up every hour
    setInterval(() => {
      this.cleanupExpired();
    }, 60 * 60 * 1000);

    this.logger.info('🧹 Started authentication cleanup interval');
  }
}

module.exports = AuthenticationMiddleware;