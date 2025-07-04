# Security API Reference

## Authentication

### Login
```
POST /api/auth/login
```

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response**
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "roles": ["user"]
    }
  }
}
```

### Refresh Token
```
POST /api/auth/refresh
```

**Headers**
```
Authorization: Bearer <refresh_token>
```

**Response**
```json
{
  "status": "success",
  "data": {
    "token": "new-jwt-token",
    "refreshToken": "new-refresh-token"
  }
}
```

## API Keys

### Create API Key
```
POST /api/keys
```

**Headers**
```
Authorization: Bearer <jwt_token>
```

**Request Body**
```json
{
  "name": "My API Key",
  "permissions": ["read:data", "write:data"]
}
```

**Response**
```json
{
  "status": "success",
  "data": {
    "id": "key-123",
    "name": "My API Key",
    "key": "api_abc123...",
    "permissions": ["read:data", "write:data"],
    "createdAt": "2023-04-01T12:00:00Z"
  }
}
```

### List API Keys
```
GET /api/keys
```

**Headers**
```
Authorization: Bearer <jwt_token>
```

**Response**
```json
{
  "status": "success",
  "data": [
    {
      "id": "key-123",
      "name": "My API Key",
      "permissions": ["read:data", "write:data"],
      "createdAt": "2023-04-01T12:00:00Z",
      "lastUsedAt": "2023-04-02T10:30:00Z"
    }
  ]
}
```

## Rate Limits

### Check Rate Limits
```
GET /api/rate-limits
```

**Headers**
```
Authorization: Bearer <jwt_token> or X-API-Key: <api_key>
```

**Response**
```json
{
  "status": "success",
  "data": {
    "limit": 1000,
    "remaining": 987,
    "reset": 1617225600,
    "window": 3600
  }
}
```

## Security Headers

### Check Security Headers
```
HEAD /
```

**Response Headers**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer
```

## Error Responses

### Authentication Error
```json
{
  "status": "error",
  "code": "authentication_required",
  "message": "Authentication required",
  "details": {
    "authUrl": "/login"
  }
}
```

### Rate Limit Exceeded
```json
{
  "status": "error",
  "code": "rate_limit_exceeded",
  "message": "Too many requests, please try again later",
  "details": {
    "retryAfter": 60,
    "limit": 100,
    "reset": 1617225600
  }
}
```

### Validation Error
```json
{
  "status": "error",
  "code": "validation_error",
  "message": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

## Webhook Security

### Verifying Webhook Signatures
When receiving webhooks, verify the signature header:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature), 
    Buffer.from(digest)
  );
}
```

## Best Practices

### API Key Security
- Never commit API keys to version control
- Use environment variables for configuration
- Rotate API keys regularly
- Set appropriate permissions for each key

### JWT Best Practices
- Use short expiration times (15-60 minutes)
- Implement refresh token rotation
- Store tokens securely (httpOnly cookies for web)
- Invalidate tokens on logout

### Rate Limiting
- Set appropriate limits for your use case
- Use the `Retry-After` header
- Consider implementing exponential backoff for clients

### Error Handling
- Use consistent error response format
- Don't leak sensitive information in errors
- Log security-related events

## Changelog

### v1.0.0 (2023-04-01)
- Initial release of Security API
- JWT authentication
- API key management
- Rate limiting
- Security headers

## Support
For additional help, please contact support@example.com or visit our [documentation](https://docs.example.com).
