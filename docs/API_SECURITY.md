# API Security Implementation Guide

This document outlines the security measures implemented in the CAI Platform's API layer, including configuration, usage, and best practices.

## Table of Contents
1. [Security Middleware](#security-middleware)
2. [Rate Limiting](#rate-limiting)
3. [Authentication & Authorization](#authentication--authorization)
4. [Input Validation](#input-validation)
5. [Security Headers](#security-headers)
6. [CORS Configuration](#cors-configuration)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Security Middleware

The `SecurityMiddleware` class provides comprehensive security features for Express.js applications. It's designed to be modular and configurable.

### Initialization

```javascript
const SecurityMiddleware = require('./core/middleware/securityMiddleware');
const security = new SecurityMiddleware({
  jwtSecret: process.env.JWT_SECRET,
  requireApiKey: process.env.NODE_ENV === 'production',
  securityHeaders: {
    enableHSTS: true,
    enableCSP: true,
    allowedOrigins: ['https://yourdomain.com']
  }
});
```

### Available Middleware Methods

| Method | Description | Example Usage |
|--------|-------------|---------------|
| `securityHeaders()` | Applies security headers to responses | `app.use(security.securityHeaders())` |
| `cors()` | Handles CORS preflight requests | `app.use(security.cors())` |
| `rateLimit()` | Enforces rate limiting | `app.use('/api', security.rateLimit())` |
| `validateApiKey()` | Validates API keys | `app.use('/api', security.validateApiKey())` |
| `authenticate()` | Validates JWT tokens | `app.use('/api/protected', security.authenticate())` |
| `authorize(roles)` | Checks user roles | `app.get('/admin', security.authorize(['admin']), adminHandler)` |
| `validateBody(schema)` | Validates request body | `app.post('/users', security.validateBody(userSchema), createUser)` |

## Rate Limiting

The rate limiting system provides protection against brute force attacks and DDoS attempts.

### Configuration

```javascript
const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // Limit each IP to 100 requests per window
  enableDdosProtection: true,
  ddosThreshold: 100 // Requests per second per IP to trigger DDoS protection
});
```

### Rate Limit Tiers

| Tier | Requests/15 min | Description |
|------|-----------------|-------------|
| IP Default | 100 | Standard limit for unauthenticated requests |
| API Key (Free) | 1,000 | For authenticated free-tier users |
| API Key (Pro) | 10,000 | For pro-tier users |
| API Key (Enterprise) | 100,000 | For enterprise users |

## Authentication & Authorization

### JWT Authentication

```javascript
// Generate a token
const token = await security.generateToken({
  userId: user.id,
  role: user.role,
  email: user.email
});

// Verify token in requests
app.get('/protected', security.authenticate(), (req, res) => {
  // req.user contains the decoded token
  res.json({ user: req.user });
});
```

### Role-Based Access Control

```javascript
// Require admin role
app.get('/admin', 
  security.authenticate(),
  security.authorize(['admin']),
  adminHandler
);

// Multiple roles allowed
app.get('/reports',
  security.authenticate(),
  security.authorize(['admin', 'manager']),
  reportsHandler
);
```

## Input Validation

### Request Body Validation

```javascript
const Joi = require('joi');

const userSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().pattern(new RegExp('^[a-zA-Z0-9]{8,30}$'))
});

app.post('/users', 
  security.validateBody(userSchema),
  userController.create
);
```

### Built-in Security Validations

- SQL Injection prevention
- XSS prevention
- Path traversal prevention
- NoSQL injection prevention
- Command injection prevention

## Security Headers

The following security headers are applied by default:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (Configurable)
- `Strict-Transport-Security` (In production)
- `Permissions-Policy` (Restricts browser features)

## CORS Configuration

CORS is configured to be secure by default:

```javascript
// Example CORS configuration
{
  origin: ['https://yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
  maxAge: 86400 // 24 hours
}
```

## Best Practices

### 1. Always Use HTTPS
- Redirect HTTP to HTTPS
- Enable HSTS with preload
- Use secure cookies with `Secure` and `HttpOnly` flags

### 2. Secure API Keys
- Never commit API keys to version control
- Use environment variables or secret management
- Rotate API keys regularly

### 3. Input Validation
- Validate all user input
- Use parameterized queries
- Sanitize output

### 4. Error Handling
- Don't leak stack traces in production
- Use custom error messages
- Log security-related events

### 5. Monitoring
- Monitor for unusual patterns
- Set up alerts for security events
- Regularly review logs

## Troubleshooting

### Common Issues

#### Rate Limit Errors
- **Symptom**: 429 Too Many Requests
- **Solution**: Implement exponential backoff in clients or request higher rate limits

#### CORS Errors
- **Symptom**: CORS policy errors in browser console
- **Solution**: Verify allowed origins and headers in CORS configuration

#### Authentication Failures
- **Symptom**: 401 Unauthorized
- **Solution**: Check token expiration and validity

### Logging

Security-related events are logged with the `security` tag. To enable debug logging:

```javascript
const Logger = require('./core/utils/logger');
const logger = new Logger('security');
logger.level = 'debug';
```

## Security Contact

For security-related issues, please contact security@yourdomain.com
