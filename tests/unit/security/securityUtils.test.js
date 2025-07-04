const SecurityUtils = require('../../../src/core/utils/security');

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';

describe('Security Utils', () => {
  describe('Input Validation', () => {
    it('should validate email addresses', () => {
      const { isValid } = SecurityUtils.validateInput('test@example.com', 'email');
      expect(isValid).toBe(true);
      
      const invalid = SecurityUtils.validateInput('not-an-email', 'email');
      expect(invalid.isValid).toBe(false);
    });

    it('should validate usernames', () => {
      const valid = SecurityUtils.validateInput('user123', 'username');
      expect(valid.isValid).toBe(true);
      
      const tooShort = SecurityUtils.validateInput('ab', 'username');
      expect(tooShort.isValid).toBe(false);
      
      const invalidChars = SecurityUtils.validateInput('user@name', 'username');
      expect(invalidChars.isValid).toBe(false);
    });

    it('should detect injection attempts', () => {
      const xss = SecurityUtils.validateInput('<script>alert(1)</script>');
      expect(xss.isValid).toBe(false);
      
      const sqlInjection = SecurityUtils.validateInput("1' OR '1'='1");
      expect(sqlInjection.isValid).toBe(false);
    });
  });

  describe('Password Validation', () => {
    it('should enforce password requirements', () => {
      const weak = SecurityUtils.validateInput('password', 'password');
      expect(weak.isValid).toBe(false);
      
      const strong = SecurityUtils.validateInput('Str0ngP@ssw0rd', 'password');
      expect(strong.isValid).toBe(true);
    });
  });

  describe('Token Generation', () => {
    it('should generate and verify JWT tokens', async () => {
      const payload = { userId: '123', role: 'user' };
      const token = await SecurityUtils.generateToken(payload);
      
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('Security Headers', () => {
    it('should generate security headers', () => {
      const headers = SecurityUtils.getSecurityHeaders({
        https: true,
        csp: "default-src 'self'"
      });
      
      expect(headers).toHaveProperty('X-Content-Type-Options');
      expect(headers).toHaveProperty('X-Frame-Options');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });
  });

  describe('Rate Limiting', () => {
    it('should track IP addresses', () => {
      const ip = '192.168.1.1';
      const endpoint = '/api/test';
      
      SecurityUtils.trackIP(ip, endpoint);
      const ipData = SecurityUtils.getIPData(ip);
      
      expect(ipData).toHaveProperty('count', 1);
      expect(ipData.endpoints).toContain(endpoint);
    });

    it('should detect potential DDoS attacks', () => {
      const ip = '192.168.1.2';
      
      // Simulate high request rate
      for (let i = 0; i < 150; i++) {
        SecurityUtils.trackIP(ip, '/api/test');
      }
      
      const isAttack = SecurityUtils.isDDoSAttack(ip);
      expect(isAttack).toBe(true);
    });
  });
});
