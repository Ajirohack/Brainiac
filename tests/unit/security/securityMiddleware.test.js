// Mock the logger first, before any imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock the Logger module before it's imported by security.js
jest.mock('../../../src/core/utils/logger', () => {
  return jest.fn().mockImplementation(() => mockLogger);
});

// Now import the modules that depend on the logger
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const SecurityMiddleware = require('../../../src/core/middleware/security');

// Mock other external modules
jest.mock('jsonwebtoken');
jest.mock('bcrypt');

// Mock the rate limiter
const mockRateLimiter = {
  consume: jest.fn().mockResolvedValue()
};

// Mock the rate limiter module
jest.mock('express-rate-limit', () => {
  return jest.fn().mockImplementation(() => mockRateLimiter);
});

// Mock the rate limiter in SecurityMiddleware
jest.mock('../../../src/core/middleware/security', () => {
  const originalModule = jest.requireActual('../../../src/core/middleware/security');
  return {
    ...originalModule,
    rateLimiter: mockRateLimiter
  };
});

// Mock crypto for secret generation
const mockRandomBytes = jest.spyOn(crypto, 'randomBytes').mockImplementation(() => ({
  toString: () => 'mocked-secret-key'
}));

// Helper functions
const createMockRequest = (opts = {}) => ({
  headers: {},
  method: 'GET',
  path: '/api/test',
  ip: '192.168.1.1',
  secure: true,
  query: {},
  body: {},
  cookies: {},
  ...opts,
  get: function(header) { 
    const headerName = header.toLowerCase();
    if (headerName === 'authorization') {
      return this.headers.authorization || this.headers.Authorization;
    }
    return this.headers[headerName]; 
  }
});

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnThis();
  return res;
};

// Test data
const TEST_USER = {
  id: 'user123',
  email: 'test@example.com',
  roles: ['user']
};

const TEST_API_KEY = 'test-api-key-123';
const TEST_TOKEN = 'test-jwt-token';
const TEST_SESSION_ID = 'session-123';

describe('Security Middleware', () => {
  let security;
  let mockNext;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
    security = new SecurityMiddleware({
      jwt_secret: 'test-secret',
      jwt_expiry: '1h',
      salt_rounds: 10,
      max_login_attempts: 3,
      lockout_duration: 300000 // 5 minutes
    });
    
    // Reset mock implementations
    jwt.sign.mockImplementation(() => TEST_TOKEN);
    jwt.verify.mockImplementation(() => ({
      ...TEST_USER,
      sessionId: TEST_SESSION_ID,
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    }));
    
    bcrypt.hash.mockResolvedValue('hashed-password');
    bcrypt.compare.mockResolvedValue(true);
    
    // Reset maps
    security.failedLogins.clear();
    security.apiKeys.clear();
    security.activeSessions.clear();
  });

  describe('Authentication', () => {
    describe('Session Management', () => {
      it('should create a new session on login', async () => {
        const user = { id: 'test-user', role: 'user' };
        const req = createMockRequest();
        const res = createMockResponse();
        
        // Mock session creation
        security.sessionManager = {
          create: jest.fn().mockResolvedValue({
            id: 'test-session',
            userId: user.id,
            expiresAt: new Date(Date.now() + 3600000)
          })
        };
        
        // Call login
        await security.login(user, req, res);
        
        expect(security.sessionManager.create).toHaveBeenCalledWith({
          userId: user.id,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        });
        expect(res.cookie).toHaveBeenCalledWith(
          'sessionId',
          'test-session',
          expect.objectContaining({
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
          })
        );
      });
      
      it('should destroy session on logout', async () => {
        const req = createMockRequest({
          cookies: { sessionId: 'test-session' }
        });
        const res = createMockResponse();
        
        // Mock session destruction
        security.sessionManager = {
          destroy: jest.fn().mockResolvedValue(true)
        };
        
        // Call logout
        await security.logout(req, res);
        
        expect(security.sessionManager.destroy).toHaveBeenCalledWith('test-session');
        expect(res.clearCookie).toHaveBeenCalledWith('sessionId');
      });
    });
    
    describe('JWT Authentication', () => {
      it('should authenticate with valid token', async () => {
        const req = createMockRequest();
        const res = createMockResponse();
        const mockNext = jest.fn();
        
        // Mock JWT verify
        jwt.verify.mockImplementation(() => ({
          id: 'test-user',
          role: 'user',
          sessionId: TEST_SESSION_ID
        }));
        
        // Set auth header
        req.headers.authorization = `Bearer ${TEST_TOKEN}`;
        
        // Call the middleware
        const middleware = security.authenticateJWT();
        await middleware(req, res, mockNext);
        
        expect(jwt.verify).toHaveBeenCalledWith(TEST_TOKEN, expect.any(String));
        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('test-user');
        expect(mockNext).toHaveBeenCalled();
      });

      it('should reject missing token', async () => {
        const req = createMockRequest();
        const res = createMockResponse();
        const mockNext = jest.fn();
        
        // No auth header set
        
        // Call the middleware
        const middleware = security.authenticateJWT();
        await middleware(req, res, mockNext);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.any(String),
          code: expect.any(String)
        }));
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
    
    describe('API Key Authentication', () => {
      it('should authenticate with valid API key', async () => {
        const req = createMockRequest({
          headers: { 'x-api-key': 'valid-api-key' }
        });
        const res = createMockResponse();
        const mockNext = jest.fn();
        
        // Mock API key validation
        security.validateApiKey = jest.fn().mockReturnValue(true);
        security.getApiKeyDetails = jest.fn().mockReturnValue({
          userId: 'test-user',
          permissions: ['read', 'write']
        });
        
        const middleware = security.authenticateApiKey();
        await middleware(req, res, mockNext);
        
        expect(security.validateApiKey).toHaveBeenCalledWith('valid-api-key');
        expect(req.apiKey).toBeDefined();
        expect(mockNext).toHaveBeenCalled();
      });
      
      it('should reject invalid API key', async () => {
        const req = createMockRequest({
          headers: { 'x-api-key': 'invalid-api-key' }
        });
        const res = createMockResponse();
        const mockNext = jest.fn();
        
        // Mock API key validation
        security.validateApiKey = jest.fn().mockReturnValue(false);
        
        const middleware = security.authenticateApiKey();
        await middleware(req, res, mockNext);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.any(String),
          code: expect.any(String)
        }));
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });
  
  describe('Rate Limiting', () => {
    it('should allow requests under the limit', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const mockNext = jest.fn();
      
      // Mock consume to resolve (allow request)
      mockRateLimiter.consume.mockResolvedValue();
      
      // Call the rate limit middleware
      const middleware = security.rateLimit();
      await middleware(req, res, mockNext);
      
      expect(mockRateLimiter.consume).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
    
    it('should block requests over the limit', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const mockNext = jest.fn();
      
      // Mock consume to reject (rate limit exceeded)
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.retryAfter = 30;
      mockRateLimiter.consume.mockRejectedValue(rateLimitError);
      
      // Call the rate limit middleware
      const middleware = security.rateLimit();
      await middleware(req, res, mockNext);
      
    
    const decoded = await security.utils.verifyToken(token);
    
    expect(decoded).toMatchObject(payload);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      expect.any(String), // JWT secret from config
      expect.objectContaining({
        expiresIn: expect.any(Number),
        algorithm: 'HS256'
      })
    );
      expect(security.activeSessions.has(sessionId)).toBe(false);
    });
  });
  
  describe('Failed Login Tracking', () => {
    it('should track failed login attempts', async () => {
      const ip = '192.168.1.1';
      const username = 'testuser';
      const req = createMockRequest({
        ip,
        body: { username }
      });
      
      // Call trackFailedLogin
      await security.trackFailedLogin(req);
      
      // Check if failed login was tracked
      const failedLogins = security.failedLogins.get(ip) || [];
      expect(failedLogins.some(attempt => attempt.username === username)).toBe(true);
    });
    
    it('should block IP after max failed attempts', async () => {
      const ip = '192.168.1.2';
      const req = createMockRequest({
        ip,
        body: { username: 'testuser' }
      });
      
      // Simulate max failed attempts
      for (let i = 0; i < security.config.maxLoginAttempts; i++) {
        await security.trackFailedLogin(req);
      }
      
      // Check if IP is blocked
      const blockedIps = security.blockedIps;
      expect(blockedIps.has(ip)).toBe(true);
    });
    
    it('should clear failed login attempts', async () => {
      const ip = '192.168.1.3';
      const req = createMockRequest({
        ip,
        body: { username: 'testuser' }
      });
      
      // Track failed login
      await security.trackFailedLogin(req);
      security.clearFailedLogins(identifier);
      
      expect(security.failedLogins.has(identifier)).toBe(false);
    });
  });
  
  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const mockNext = jest.fn();
      
      // Mock the security headers middleware
      const middleware = security.securityHeaders();
      await middleware(req, res, mockNext);
      
      // Check if security headers are set
      const expectedHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Referrer-Policy',
        'Permissions-Policy'
      ];
      
      // Verify all expected headers are set
      expectedHeaders.forEach(header => {
        expect(res.setHeader).toHaveBeenCalledWith(header, expect.any(String));
      });
      
      // Verify next() was called
      expect(mockNext).toHaveBeenCalled();
    });
  });
  
  describe('Input Validation', () => {
    it('should validate request body', async () => {
      const schema = {
        validate: jest.fn().mockReturnValue({ error: null })
      };
      
      const req = createMockRequest({
        body: { name: 'Test' }
      });
      const res = createMockResponse();
      
      await security.validateBody(schema)(req, res, mockNext);
      
      expect(schema.validate).toHaveBeenCalledWith(req.body);
      expect(mockNext).toHaveBeenCalled();
    });
    
    it('should reject invalid request body', async () => {
      const schema = {
        validate: jest.fn().mockReturnValue({
          error: { details: [{ message: 'Name is required' }] }
        })
      };
      
      const req = createMockRequest({
        body: {}
      });
      const res = createMockResponse();
    
    // Test HTML escaping
    const htmlInput = '<div>Hello & Welcome</div>';
    expect(sanitizeInput(htmlInput)).toContain('&lt;div&gt;');
    expect(sanitizeInput(htmlInput)).toContain('&amp;');
      expect(keyData.active).toBe(true);
    });
    
    it('should revoke API keys', () => {
      const apiKey = security.generateApiKey({ name: 'test-key' });
      security.revokeApiKey(apiKey);
      
      const keyData = security.apiKeys.get(apiKey);
      expect(keyData.active).toBe(false);
    });
  });
});
