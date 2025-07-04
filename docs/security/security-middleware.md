# Security Middleware Documentation

## Overview
The security middleware provides essential security features for the Brainiac API, including authentication, rate limiting, input validation, and request sanitization. This document outlines the available middleware components and their configuration options.

## Table of Contents
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Input Validation](#input-validation)
- [Security Headers](#security-headers)
- [CORS Configuration](#cors-configuration)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
- [Best Practices](#best-practices)

## Authentication

### JWT Authentication
```javascript
const { authenticateJWT } = require('@/core/middleware/security');

// Protect a route
router.get('/protected', authenticateJWT(), (req, res) => {
  // Access user data from req.user
  res.json({ user: req.user });
});
```

### API Key Authentication
```javascript
const { authenticateApiKey } = require('@/core/middleware/security');

// Protect a route with API key
router.get('/api/data', authenticateApiKey(), (req, res) => {
  // Access API key data from req.apiKey
  res.json({ data: 'protected data' });
});
```

## Rate Limiting

### Global Rate Limiting
```javascript
const { rateLimit } = require('@/core/middleware/security');

// Apply global rate limiting
app.use(rateLimit());

// Custom rate limiting for specific routes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later.'
});

app.post('/login', loginLimiter, authController.login);
```

## Input Validation

### Request Validation
```javascript
const { validateRequest } = require('@/core/middleware/security');
const { body } = require('express-validator');

const userValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
];

router.post('/users', validateRequest(userValidation), userController.create);
```

### Sanitization
```javascript
const { sanitize } = require('@/core/middleware/security');

router.post('/comments', 
  sanitize('body').escape(),
  commentController.create
);
```

## Security Headers

### Default Headers
```javascript
const { securityHeaders } = require('@/core/middleware/security');

// Apply security headers to all routes
app.use(securityHeaders());

// Customize headers for specific routes
app.use('/api', securityHeaders({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'trusted.cdn.com']
    }
  }
}));
```

## CORS Configuration

```javascript
const { cors } = require('@/core/middleware/security');

// Enable CORS for all routes
app.use(cors());

// Configure CORS for specific origins
app.use(cors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## Error Handling

### Error Responses
All error responses follow a consistent format:
```json
{
  "status": "error",
  "code": "error_code",
  "message": "Human-readable error message",
  "details": {}
}
```

### Common Error Codes
- `authentication_required`: Missing or invalid authentication
- `rate_limit_exceeded`: Too many requests
- `validation_error`: Request validation failed
- `forbidden`: Insufficient permissions
- `not_found`: Resource not found

## Configuration

### Environment Variables
```env
# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# Security Headers
ENABLE_HSTS=true
CSP_REPORT_URI=/report-csp
```

## Best Practices

1. **Always validate and sanitize user input**
   - Use the built-in validators or create custom validation rules
   - Sanitize all user-supplied data before processing

2. **Use HTTPS in production**
   - Enable HSTS to enforce secure connections
   - Set secure cookies with appropriate flags

3. **Implement proper rate limiting**
   - Set appropriate limits for different types of endpoints
   - Consider implementing IP-based blocking for repeated violations

4. **Keep dependencies updated**
   - Regularly update all dependencies to patch security vulnerabilities
   - Use `npm audit` to identify and fix known vulnerabilities

5. **Monitor and log security events**
   - Log authentication attempts (successful and failed)
   - Monitor for unusual patterns or potential attacks
   - Set up alerts for suspicious activities

## Troubleshooting

### Common Issues
1. **CORS errors**
   - Verify allowed origins and headers in CORS configuration
   - Check preflight request handling

2. **Rate limiting too aggressive**
   - Adjust `RATE_LIMIT_WINDOW` and `RATE_LIMIT_MAX` as needed
   - Consider implementing different limits for authenticated vs unauthenticated users

3. **JWT validation failures**
   - Ensure the JWT_SECRET matches between services
   - Verify token expiration and clock synchronization

For additional help, please refer to the [API Documentation](api-docs.md) or open an issue in our [GitHub repository](https://github.com/your-repo).
