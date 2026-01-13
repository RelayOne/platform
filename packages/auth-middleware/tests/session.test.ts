/**
 * @fileoverview Tests for session management
 * @module @relay/auth-middleware/tests/session
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSession,
  isSessionExpired,
  isSessionInactive,
  isSessionValid,
  extendSession,
  touchSession,
  addAppToSession,
  updateSessionContext,
  revokeSession,
  requireReauth,
  verifyMfa,
  sessionFromClaims,
  hashToken,
  hashTokenAsync,
  parseDeviceInfo,
  getSessionLifetime,
  sessionNeedsRefresh,
  SESSION_DEFAULTS,
} from '../src/session.js';
import type { PlatformSession, SessionDevice, PlatformClaims } from '../src/types.js';
import { AuthMethod, SessionStatus, TokenType } from '../src/types.js';

describe('Session Management', () => {
  const testDevice: SessionDevice = {
    id: 'device-123',
    type: 'desktop',
    name: 'Chrome on Windows',
    os: 'Windows 11',
    browser: 'Chrome',
  };

  describe('createSession', () => {
    it('should create a new session with required fields', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.device).toEqual(testDevice);
      expect(session.status).toBe('active');
      expect(session.authMethod).toBe(AuthMethod.PASSWORD);
    });

    it('should set correct timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.OAUTH,
      });

      expect(session.createdAt).toBeCloseTo(now, 0);
      expect(session.lastActiveAt).toBeCloseTo(now, 0);
      expect(session.expiresAt).toBeCloseTo(now + SESSION_DEFAULTS.duration, 0);
    });

    it('should respect custom duration', () => {
      const customDuration = 3600; // 1 hour
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        duration: customDuration,
      });

      const now = Math.floor(Date.now() / 1000);
      expect(session.expiresAt).toBeCloseTo(now + customDuration, 0);
    });

    it('should cap duration at max duration', () => {
      const veryLongDuration = SESSION_DEFAULTS.maxDuration + 1000000;
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        duration: veryLongDuration,
      });

      const now = Math.floor(Date.now() / 1000);
      expect(session.expiresAt).toBeLessThanOrEqual(now + SESSION_DEFAULTS.maxDuration);
    });

    it('should include optional fields', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.OAUTH,
        mfaVerified: true,
        app: 'noteman',
        orgId: 'org-456',
        projectId: 'project-789',
      });

      expect(session.mfaVerified).toBe(true);
      expect(session.apps).toContain('noteman');
      expect(session.orgId).toBe('org-456');
      expect(session.projectId).toBe('project-789');
    });

    it('should hash tokens when provided', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });

      expect(session.accessTokenHash).toBeDefined();
      expect(session.refreshTokenHash).toBeDefined();
      expect(session.accessTokenHash).not.toBe('access-token-123');
    });
  });

  describe('isSessionExpired', () => {
    it('should return false for non-expired session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      expect(isSessionExpired(session)).toBe(false);
    });

    it('should return true for expired session', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 7200,
        lastActiveAt: Math.floor(Date.now() / 1000) - 3600,
        expiresAt: Math.floor(Date.now() / 1000) - 1, // Expired 1 second ago
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      expect(isSessionExpired(session)).toBe(true);
    });
  });

  describe('isSessionInactive', () => {
    it('should return false for recently active session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      expect(isSessionInactive(session)).toBe(false);
    });

    it('should return true for inactive session', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 100000,
        lastActiveAt: Math.floor(Date.now() / 1000) - SESSION_DEFAULTS.inactivityTimeout - 1,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      expect(isSessionInactive(session)).toBe(true);
    });

    it('should respect custom timeout', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 100000,
        lastActiveAt: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      // With 5 minute timeout, should be inactive
      expect(isSessionInactive(session, 300)).toBe(true);
      // With 15 minute timeout, should be active
      expect(isSessionInactive(session, 900)).toBe(false);
    });
  });

  describe('isSessionValid', () => {
    it('should return true for valid active session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      expect(isSessionValid(session)).toBe(true);
    });

    it('should return false for revoked session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });
      const revoked = revokeSession(session);

      expect(isSessionValid(revoked)).toBe(false);
    });

    it('should return false for expired session', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 7200,
        lastActiveAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) - 1,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      expect(isSessionValid(session)).toBe(false);
    });
  });

  describe('extendSession', () => {
    it('should extend session expiration', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      const originalExpiry = session.expiresAt;
      const extended = extendSession(session, 3600);

      expect(extended.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('should update lastActiveAt', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        lastActiveAt: Math.floor(Date.now() / 1000) - 1800,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      const extended = extendSession(session);
      expect(extended.lastActiveAt).toBeGreaterThan(session.lastActiveAt);
    });

    it('should not exceed max duration', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      // Try to extend way beyond max
      const extended = extendSession(session, SESSION_DEFAULTS.maxDuration * 2);
      const maxExpiry = session.createdAt + SESSION_DEFAULTS.maxDuration;

      expect(extended.expiresAt).toBeLessThanOrEqual(maxExpiry);
    });
  });

  describe('touchSession', () => {
    it('should update lastActiveAt only', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        lastActiveAt: Math.floor(Date.now() / 1000) - 1800,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      const touched = touchSession(session);

      expect(touched.lastActiveAt).toBeGreaterThan(session.lastActiveAt);
      expect(touched.expiresAt).toBe(session.expiresAt); // Unchanged
    });
  });

  describe('addAppToSession', () => {
    it('should add new app to session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        app: 'noteman',
      });

      const updated = addAppToSession(session, 'verity');

      expect(updated.apps).toContain('noteman');
      expect(updated.apps).toContain('verity');
    });

    it('should not duplicate existing app', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        app: 'noteman',
      });

      const updated = addAppToSession(session, 'noteman');

      expect(updated.apps.filter(a => a === 'noteman')).toHaveLength(1);
    });

    it('should update lastActiveAt', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        lastActiveAt: Math.floor(Date.now() / 1000) - 1800,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        apps: ['noteman'],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      const updated = addAppToSession(session, 'verity');
      expect(updated.lastActiveAt).toBeGreaterThan(session.lastActiveAt);
    });
  });

  describe('updateSessionContext', () => {
    it('should update org and project context', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      const updated = updateSessionContext(session, 'org-new', 'project-new');

      expect(updated.orgId).toBe('org-new');
      expect(updated.projectId).toBe('project-new');
    });
  });

  describe('revokeSession', () => {
    it('should set status to revoked', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      const revoked = revokeSession(session);

      expect(revoked.status).toBe('revoked');
    });
  });

  describe('requireReauth', () => {
    it('should set status to requires_reauth', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      const reauth = requireReauth(session);

      expect(reauth.status).toBe('requires_reauth');
    });
  });

  describe('verifyMfa', () => {
    it('should set mfaVerified to true', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
        mfaVerified: false,
      });

      const verified = verifyMfa(session);

      expect(verified.mfaVerified).toBe(true);
    });
  });

  describe('sessionFromClaims', () => {
    it('should extract session info from claims', () => {
      const claims: PlatformClaims = {
        sub: 'user-123',
        iss: 'relay-platform',
        aud: ['noteman', 'verity'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        jti: 'token-123',
        email: 'test@example.com',
        tier: 'team',
        sessionId: 'session-456',
        tokenType: TokenType.ACCESS,
        mfaVerified: true,
        authMethod: AuthMethod.OAUTH,
        orgId: 'org-789',
      };

      const session = sessionFromClaims(claims);

      expect(session.id).toBe('session-456');
      expect(session.userId).toBe('user-123');
      expect(session.status).toBe('active');
      expect(session.mfaVerified).toBe(true);
      expect(session.authMethod).toBe(AuthMethod.OAUTH);
      expect(session.apps).toContain('noteman');
      expect(session.apps).toContain('verity');
      expect(session.orgId).toBe('org-789');
    });
  });

  describe('hashToken', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = hashToken('my-secret-token');
      const hash2 = hashToken('my-secret-token');

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = hashToken('token-1');
      const hash2 = hashToken('token-2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashTokenAsync', () => {
    it('should return SHA-256 hash', async () => {
      const hash = await hashTokenAsync('my-secret-token');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('should return consistent hash', async () => {
      const hash1 = await hashTokenAsync('test-token');
      const hash2 = await hashTokenAsync('test-token');

      expect(hash1).toBe(hash2);
    });
  });

  describe('parseDeviceInfo', () => {
    it('should parse Windows Chrome user agent', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const device = parseDeviceInfo(ua);

      expect(device.type).toBe('desktop');
      expect(device.os).toBe('Windows');
      expect(device.browser).toBe('Chrome');
      expect(device.name).toBe('Chrome on Windows');
    });

    it('should parse macOS Safari user agent', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      const device = parseDeviceInfo(ua);

      expect(device.type).toBe('desktop');
      expect(device.os).toBe('macOS');
      expect(device.browser).toBe('Safari');
    });

    it('should parse iPhone user agent', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const device = parseDeviceInfo(ua);

      expect(device.type).toBe('mobile');
      expect(device.os).toBe('iOS');
    });

    it('should parse Android user agent', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      const device = parseDeviceInfo(ua);

      expect(device.type).toBe('mobile');
      expect(device.os).toBe('Android');
    });

    it('should detect CLI client', () => {
      const device = parseDeviceInfo('curl/7.88.1');

      expect(device.type).toBe('cli');
      expect(device.name).toBe('CLI Client');
    });

    it('should handle undefined user agent', () => {
      const device = parseDeviceInfo(undefined);

      expect(device.type).toBe('unknown');
      expect(device.name).toBe('Unknown Device');
    });

    it('should use provided device ID', () => {
      const device = parseDeviceInfo('any-ua', 'custom-device-id');

      expect(device.id).toBe('custom-device-id');
    });
  });

  describe('getSessionLifetime', () => {
    it('should return positive for valid session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      const lifetime = getSessionLifetime(session);
      expect(lifetime).toBeGreaterThan(0);
    });

    it('should return negative for expired session', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 7200,
        lastActiveAt: Math.floor(Date.now() / 1000) - 3600,
        expiresAt: Math.floor(Date.now() / 1000) - 100,
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      const lifetime = getSessionLifetime(session);
      expect(lifetime).toBeLessThan(0);
    });
  });

  describe('sessionNeedsRefresh', () => {
    it('should return false for fresh session', () => {
      const session = createSession('user-123', {
        device: testDevice,
        authMethod: AuthMethod.PASSWORD,
      });

      expect(sessionNeedsRefresh(session)).toBe(false);
    });

    it('should return true for session about to expire', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        lastActiveAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 60, // Expires in 60 seconds
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      expect(sessionNeedsRefresh(session)).toBe(true);
    });

    it('should respect custom threshold', () => {
      const session: PlatformSession = {
        id: 'session-1',
        userId: 'user-123',
        device: testDevice,
        status: 'active',
        createdAt: Math.floor(Date.now() / 1000) - 3600,
        lastActiveAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 600, // Expires in 10 minutes
        apps: [],
        mfaVerified: false,
        authMethod: AuthMethod.PASSWORD,
      };

      // With 5 minute threshold, should not need refresh
      expect(sessionNeedsRefresh(session, 300)).toBe(false);
      // With 15 minute threshold, should need refresh
      expect(sessionNeedsRefresh(session, 900)).toBe(true);
    });
  });
});
