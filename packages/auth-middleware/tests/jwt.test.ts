/**
 * @fileoverview Tests for JWT service
 * @module @relay/auth-middleware/tests/jwt
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JwtService,
  JwtError,
  createJwtService,
  DEFAULT_JWT_CONFIG,
  SERVICE_TOKEN_EXPIRY,
} from '../src/jwt.js';
import type { PlatformClaims, UserClaims } from '../src/types.js';
import { TokenType, AuthMethod, Role } from '../src/types.js';

describe('JwtService', () => {
  let jwtService: JwtService;
  const testSecret = 'test-secret-key-for-jwt-testing-32chars';

  beforeEach(() => {
    jwtService = new JwtService({ secret: testSecret });
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const service = new JwtService();
      expect(service).toBeInstanceOf(JwtService);
    });

    it('should merge custom config with defaults', () => {
      const service = new JwtService({
        accessTokenExpiry: 1800,
        refreshTokenExpiry: 86400,
      });
      expect(service).toBeInstanceOf(JwtService);
    });
  });

  describe('generateAccessToken', () => {
    const userClaims: UserClaims = {
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      tier: 'team',
      sessionId: 'session-456',
    };

    it('should generate a valid access token', async () => {
      const token = await jwtService.generateAccessToken(userClaims);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should include required claims', async () => {
      const token = await jwtService.generateAccessToken(userClaims);
      const claims = await jwtService.verifyToken(token);

      expect(claims.sub).toBe(userClaims.sub);
      expect(claims.email).toBe(userClaims.email);
      expect(claims.name).toBe(userClaims.name);
      expect(claims.tier).toBe(userClaims.tier);
      expect(claims.sessionId).toBe(userClaims.sessionId);
    });

    it('should set correct token type', async () => {
      const token = await jwtService.generateAccessToken(userClaims);
      const claims = await jwtService.verifyToken(token);

      expect(claims.tokenType).toBe('access');
    });

    it('should include issuer and audience', async () => {
      const token = await jwtService.generateAccessToken(userClaims);
      const claims = await jwtService.verifyToken(token);

      expect(claims.iss).toBe(DEFAULT_JWT_CONFIG.issuer);
      expect(claims.aud).toEqual(expect.arrayContaining(['verity', 'noteman', 'shipcheck']));
    });

    it('should set expiration time', async () => {
      const token = await jwtService.generateAccessToken(userClaims);
      const claims = await jwtService.verifyToken(token);

      const expectedExp = Math.floor(Date.now() / 1000) + DEFAULT_JWT_CONFIG.accessTokenExpiry;
      expect(claims.exp).toBeCloseTo(expectedExp, -1); // Within 10 seconds
    });

    it('should include optional claims when provided', async () => {
      const token = await jwtService.generateAccessToken(userClaims, {
        orgId: 'org-789',
        projectId: 'project-abc',
        mfaVerified: true,
        authMethod: AuthMethod.OAUTH,
        oauthProvider: 'google',
      });
      const claims = await jwtService.verifyToken(token);

      expect(claims.orgId).toBe('org-789');
      expect(claims.projectId).toBe('project-abc');
      expect(claims.mfaVerified).toBe(true);
      expect(claims.authMethod).toBe(AuthMethod.OAUTH);
      expect(claims.oauthProvider).toBe('google');
    });

    it('should include organization access map', async () => {
      const token = await jwtService.generateAccessToken(userClaims, {
        orgs: {
          'org-1': { role: Role.ADMIN, name: 'Org One' },
          'org-2': { role: Role.VIEWER, name: 'Org Two' },
        },
      });
      const claims = await jwtService.verifyToken(token);

      expect(claims.orgs).toBeDefined();
      expect(claims.orgs!['org-1'].role).toBe(Role.ADMIN);
      expect(claims.orgs!['org-2'].role).toBe(Role.VIEWER);
    });

    it('should include app permissions', async () => {
      const token = await jwtService.generateAccessToken(userClaims, {
        appPermissions: {
          noteman: ['meeting:read', 'meeting:create'],
          verity: ['document:read'],
        },
      });
      const claims = await jwtService.verifyToken(token);

      expect(claims.appPermissions).toBeDefined();
      expect(claims.appPermissions!.noteman).toContain('meeting:read');
      expect(claims.appPermissions!.verity).toContain('document:read');
    });

    it('should respect custom expiration', async () => {
      const customExpiry = 300; // 5 minutes
      const token = await jwtService.generateAccessToken(userClaims, {
        expiresIn: customExpiry,
      });
      const claims = await jwtService.verifyToken(token);

      const expectedExp = Math.floor(Date.now() / 1000) + customExpiry;
      expect(claims.exp).toBeCloseTo(expectedExp, -1);
    });
  });

  describe('generateRefreshToken', () => {
    const userClaims: UserClaims = {
      sub: 'user-123',
      email: 'test@example.com',
      tier: 'pro',
      sessionId: 'session-456',
    };

    it('should generate a valid refresh token', async () => {
      const token = await jwtService.generateRefreshToken(userClaims);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should set refresh token type', async () => {
      const token = await jwtService.generateRefreshToken(userClaims);
      const claims = await jwtService.verifyToken(token);

      expect(claims.tokenType).toBe('refresh');
    });

    it('should have longer expiration than access token', async () => {
      const accessToken = await jwtService.generateAccessToken(userClaims);
      const refreshToken = await jwtService.generateRefreshToken(userClaims);

      const accessClaims = await jwtService.verifyToken(accessToken);
      const refreshClaims = await jwtService.verifyToken(refreshToken);

      expect(refreshClaims.exp).toBeGreaterThan(accessClaims.exp);
    });
  });

  describe('generateTokenPair', () => {
    const userClaims: UserClaims = {
      sub: 'user-123',
      email: 'test@example.com',
      tier: 'team',
      sessionId: 'session-456',
    };

    it('should return both access and refresh tokens', async () => {
      const pair = await jwtService.generateTokenPair(userClaims);

      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.tokenType).toBe('Bearer');
      expect(pair.expiresAt).toBeDefined();
    });

    it('should have valid tokens in pair', async () => {
      const pair = await jwtService.generateTokenPair(userClaims);

      const accessClaims = await jwtService.verifyToken(pair.accessToken);
      const refreshClaims = await jwtService.verifyToken(pair.refreshToken);

      expect(accessClaims.tokenType).toBe('access');
      expect(refreshClaims.tokenType).toBe('refresh');
    });
  });

  describe('generateServiceToken', () => {
    it('should generate service token with long expiry', async () => {
      const token = await jwtService.generateServiceToken(
        'svc-api-123',
        'API Service',
        { noteman: ['meeting:read'], verity: ['document:verify'] }
      );

      const claims = await jwtService.verifyToken(token);

      expect(claims.sub).toBe('svc-api-123');
      expect(claims.tokenType).toBe('service');
      expect(claims.authMethod).toBe('service');
      expect(claims.mfaVerified).toBe(true);
    });

    it('should include service email format', async () => {
      const token = await jwtService.generateServiceToken(
        'svc-api-123',
        'API Service',
        {}
      );

      const claims = await jwtService.verifyToken(token);

      expect(claims.email).toBe('API Service@service.relay-platform.internal');
    });

    it('should have 90 day expiration', async () => {
      const token = await jwtService.generateServiceToken('svc-1', 'Service', {});
      const claims = await jwtService.verifyToken(token);

      const expectedExp = Math.floor(Date.now() / 1000) + SERVICE_TOKEN_EXPIRY;
      expect(claims.exp).toBeCloseTo(expectedExp, -1);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      const claims = await jwtService.verifyToken(token);
      expect(claims.sub).toBe('user-123');
    });

    it('should reject invalid token', async () => {
      await expect(jwtService.verifyToken('invalid-token'))
        .rejects.toThrow(JwtError);
    });

    it('should reject token with wrong secret', async () => {
      const otherService = new JwtService({ secret: 'different-secret' });
      const token = await otherService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      await expect(jwtService.verifyToken(token))
        .rejects.toThrow(JwtError);
    });

    it('should reject expired token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      }, { expiresIn: -1 }); // Already expired

      await expect(jwtService.verifyToken(token))
        .rejects.toThrow(JwtError);
    });
  });

  describe('verifyTokenForApp', () => {
    it('should verify token valid for specific app', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-1',
      });

      const claims = await jwtService.verifyTokenForApp(token, 'noteman');
      expect(claims.sub).toBe('user-123');
    });

    it('should reject token not valid for app', async () => {
      // Create a service with custom audience
      const service = new JwtService({
        secret: testSecret,
        audience: ['verity'],
      });

      const token = await service.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-1',
      });

      await expect(jwtService.verifyTokenForApp(token, 'noteman'))
        .rejects.toThrow(JwtError);
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      const claims = jwtService.decodeToken(token);
      expect(claims).not.toBeNull();
      expect(claims!.sub).toBe('user-123');
    });

    it('should return null for invalid token', () => {
      const claims = jwtService.decodeToken('not-a-valid-jwt');
      expect(claims).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      expect(jwtService.isTokenExpired(token)).toBe(false);
    });

    it('should return true for expired token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      }, { expiresIn: -1 });

      expect(jwtService.isTokenExpired(token)).toBe(true);
    });

    it('should return true for invalid token', () => {
      expect(jwtService.isTokenExpired('invalid')).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('should return true when permission exists', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-1',
      }, {
        appPermissions: {
          noteman: ['meeting:read', 'meeting:create'],
        },
      });

      const claims = await jwtService.verifyToken(token);
      expect(jwtService.hasPermission(claims, 'meeting:read', 'noteman')).toBe(true);
    });

    it('should return false when permission missing', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-1',
      }, {
        appPermissions: {
          noteman: ['meeting:read'],
        },
      });

      const claims = await jwtService.verifyToken(token);
      expect(jwtService.hasPermission(claims, 'meeting:delete', 'noteman')).toBe(false);
    });

    it('should check all apps when app not specified', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-1',
      }, {
        appPermissions: {
          verity: ['document:verify'],
        },
      });

      const claims = await jwtService.verifyToken(token);
      expect(jwtService.hasPermission(claims, 'document:verify')).toBe(true);
    });
  });

  describe('isValidForApp', () => {
    it('should return true when app in audience', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      const claims = await jwtService.verifyToken(token);
      expect(jwtService.isValidForApp(claims, 'noteman')).toBe(true);
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid header', () => {
      const token = JwtService.extractBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.test');
      expect(token).toBe('eyJhbGciOiJIUzI1NiJ9.test');
    });

    it('should return null for missing header', () => {
      expect(JwtService.extractBearerToken(undefined)).toBeNull();
    });

    it('should return null for non-bearer header', () => {
      expect(JwtService.extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    });
  });

  describe('getExpirationDate', () => {
    it('should return expiration as Date', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      const expDate = jwtService.getExpirationDate(token);
      expect(expDate).toBeInstanceOf(Date);
      expect(expDate!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getRemainingLifetime', () => {
    it('should return positive seconds for valid token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      });

      const remaining = jwtService.getRemainingLifetime(token);
      expect(remaining).toBeGreaterThan(0);
    });

    it('should return negative for expired token', async () => {
      const token = await jwtService.generateAccessToken({
        sub: 'user-123',
        email: 'test@example.com',
        tier: 'personal',
        sessionId: 'session-1',
      }, { expiresIn: -10 });

      const remaining = jwtService.getRemainingLifetime(token);
      expect(remaining).toBeLessThan(0);
    });
  });

  describe('createJwtService factory', () => {
    it('should create service with environment config', () => {
      const service = createJwtService();
      expect(service).toBeInstanceOf(JwtService);
    });

    it('should merge provided config', () => {
      const service = createJwtService({ accessTokenExpiry: 1800 });
      expect(service).toBeInstanceOf(JwtService);
    });
  });
});
