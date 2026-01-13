/**
 * @fileoverview Tests for Hono authentication middleware
 * @module @relay/auth-middleware/tests/middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  authMiddleware,
  requireTier,
  requireOrganization,
  requireOrganizationRole,
  requireProjectRole,
  requireRole,
  requireMFA,
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  hasOrganizationAccess,
  getOrganizationRole,
  getProjectRole,
  getUser,
  requireUser,
} from '../src/middleware.js';
import { JwtService, createJwtService } from '../src/jwt.js';
import type { PlatformClaims } from '../src/types.js';
import { Role, AuthMethod, TokenType } from '../src/types.js';

/**
 * Helper to create a Hono app with error handling for tests.
 */
function createTestApp(): Hono {
  const app = new Hono();
  // Handle RelayError-like errors
  app.onError((error, c) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return c.json({ error: error.message }, statusCode as 400 | 401 | 403 | 404 | 500);
  });
  return app;
}

describe('Auth Middleware', () => {
  let jwtService: JwtService;
  const testSecret = 'test-secret-for-middleware-testing-32ch';

  beforeEach(() => {
    jwtService = new JwtService({ secret: testSecret });
  });

  async function createTestToken(overrides: Partial<{
    sub: string;
    email: string;
    tier: 'personal' | 'pro' | 'team' | 'enterprise';
    orgId: string;
    orgs: Record<string, { role: Role; projects?: Record<string, Role> }>;
    appPermissions: Record<string, string[]>;
    mfaVerified: boolean;
  }> = {}): Promise<string> {
    return jwtService.generateAccessToken({
      sub: overrides.sub ?? 'user-123',
      email: overrides.email ?? 'test@example.com',
      tier: overrides.tier ?? 'team',
      sessionId: 'session-456',
    }, {
      orgId: overrides.orgId,
      orgs: overrides.orgs,
      appPermissions: overrides.appPermissions,
      mfaVerified: overrides.mfaVerified,
    });
  }

  describe('authMiddleware', () => {
    it('should authenticate valid token', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ userId: user.sub });
      });

      const token = await createTestToken();
      const res = await app.request('/test', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe('user-123');
    });

    it('should reject missing authorization header', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      });

      expect(res.status).toBe(401);
    });

    it('should skip configured paths', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({
        jwt: { secret: testSecret },
        skipPaths: ['/health', '/public/*'],
      }));
      app.get('/health', (c) => c.json({ status: 'ok' }));
      app.get('/public/docs', (c) => c.json({ docs: true }));
      app.get('/api/protected', (c) => c.json({ protected: true }));

      // Health endpoint should be accessible without auth
      const healthRes = await app.request('/health');
      expect(healthRes.status).toBe(200);

      // Public wildcard should be accessible
      const publicRes = await app.request('/public/docs');
      expect(publicRes.status).toBe(200);

      // Protected endpoint should require auth
      const protectedRes = await app.request('/api/protected');
      expect(protectedRes.status).toBe(401);
    });

    it('should extract org context from headers', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ orgId: user.orgId, projectId: user.projectId });
      });

      const token = await createTestToken();
      const res = await app.request('/test', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-organization-id': 'org-from-header',
          'x-project-id': 'project-from-header',
        },
      });

      const data = await res.json();
      expect(data.orgId).toBe('org-from-header');
      expect(data.projectId).toBe('project-from-header');
    });
  });

  describe('requireTier', () => {
    it('should allow equal tier', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/pro/*', requireTier('pro'));
      app.get('/pro/feature', (c) => c.json({ ok: true }));

      const token = await createTestToken({ tier: 'pro' });
      const res = await app.request('/pro/feature', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should allow higher tier', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/pro/*', requireTier('pro'));
      app.get('/pro/feature', (c) => c.json({ ok: true }));

      const token = await createTestToken({ tier: 'team' });
      const res = await app.request('/pro/feature', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject lower tier', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/team/*', requireTier('team'));
      app.get('/team/feature', (c) => c.json({ ok: true }));

      const token = await createTestToken({ tier: 'personal' });
      const res = await app.request('/team/feature', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireOrganization', () => {
    it('should allow access to org member via orgs map', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/*', requireOrganization());
      app.get('/orgs/:orgId/data', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-123': { role: Role.VIEWER } },
      });
      const res = await app.request('/orgs/org-123/data', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should allow access via context orgId', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/*', requireOrganization());
      app.get('/orgs/:orgId/data', (c) => c.json({ ok: true }));

      const token = await createTestToken({ orgId: 'org-123' });
      const res = await app.request('/orgs/org-123/data', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject non-member', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/*', requireOrganization());
      app.get('/orgs/:orgId/data', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-other': { role: Role.VIEWER } },
      });
      const res = await app.request('/orgs/org-123/data', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireOrganizationRole', () => {
    it('should allow equal role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/admin/*', requireOrganizationRole(Role.ADMIN));
      app.get('/orgs/:orgId/admin/settings', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-123': { role: Role.ADMIN } },
      });
      const res = await app.request('/orgs/org-123/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should allow higher role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/admin/*', requireOrganizationRole(Role.ADMIN));
      app.get('/orgs/:orgId/admin/settings', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-123': { role: Role.OWNER } },
      });
      const res = await app.request('/orgs/org-123/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject lower role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/admin/*', requireOrganizationRole(Role.ADMIN));
      app.get('/orgs/:orgId/admin/settings', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-123': { role: Role.EDITOR } },
      });
      const res = await app.request('/orgs/org-123/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireProjectRole', () => {
    it('should use project-specific role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/projects/:projectId/*', requireProjectRole(Role.EDITOR));
      app.get('/orgs/:orgId/projects/:projectId/edit', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: {
          'org-123': {
            role: Role.VIEWER,
            projects: { 'project-456': Role.EDITOR },
          },
        },
      });
      const res = await app.request('/orgs/org-123/projects/project-456/edit', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should fall back to org role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/orgs/:orgId/projects/:projectId/*', requireProjectRole(Role.EDITOR));
      app.get('/orgs/:orgId/projects/:projectId/edit', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: { 'org-123': { role: Role.ADMIN } },
      });
      const res = await app.request('/orgs/org-123/projects/project-456/edit', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('requireRole', () => {
    it('should check highest role across all orgs', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/admin/*', requireRole(Role.ADMIN));
      app.get('/admin/dashboard', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: {
          'org-1': { role: Role.VIEWER },
          'org-2': { role: Role.ADMIN },
        },
      });
      const res = await app.request('/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject if no org has required role', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/admin/*', requireRole(Role.ADMIN));
      app.get('/admin/dashboard', (c) => c.json({ ok: true }));

      const token = await createTestToken({
        orgs: {
          'org-1': { role: Role.VIEWER },
          'org-2': { role: Role.EDITOR },
        },
      });
      const res = await app.request('/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireMFA', () => {
    it('should allow when MFA verified', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/secure/*', requireMFA());
      app.get('/secure/action', (c) => c.json({ ok: true }));

      const token = await createTestToken({ mfaVerified: true });
      const res = await app.request('/secure/action', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject when MFA not verified', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.use('/secure/*', requireMFA());
      app.get('/secure/action', (c) => c.json({ ok: true }));

      const token = await createTestToken({ mfaVerified: false });
      const res = await app.request('/secure/action', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requirePermission', () => {
    it('should allow when permission exists', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.post('/meetings', requirePermission('meeting:create', 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['meeting:create', 'meeting:read'] },
      });
      const res = await app.request('/meetings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject when permission missing', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.delete('/meetings/:id', requirePermission('meeting:delete', 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['meeting:read'] },
      });
      const res = await app.request('/meetings/123', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireAllPermissions', () => {
    it('should require all permissions', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.post('/meetings/full', requireAllPermissions(['meeting:create', 'meeting:update'], 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['meeting:create', 'meeting:update'] },
      });
      const res = await app.request('/meetings/full', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject when any permission missing', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.post('/meetings/full', requireAllPermissions(['meeting:create', 'meeting:delete'], 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['meeting:create'] },
      });
      const res = await app.request('/meetings/full', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('requireAnyPermission', () => {
    it('should allow when any permission exists', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/meetings', requireAnyPermission(['meeting:read', 'meeting:admin'], 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['meeting:read'] },
      });
      const res = await app.request('/meetings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
    });

    it('should reject when no permission exists', async () => {
      const app = createTestApp();
      app.use('/*', authMiddleware({ jwt: { secret: testSecret } }));
      app.get('/meetings', requireAnyPermission(['meeting:read', 'meeting:admin'], 'noteman'), (c) => c.json({ ok: true }));

      const token = await createTestToken({
        appPermissions: { noteman: ['other:permission'] },
      });
      const res = await app.request('/meetings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('utility functions', () => {
    describe('hasOrganizationAccess', () => {
      it('should return true for org member', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
          orgs: { 'org-123': { role: Role.VIEWER } },
        };

        expect(hasOrganizationAccess(claims, 'org-123')).toBe(true);
      });

      it('should return false for non-member', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
          orgs: { 'org-other': { role: Role.VIEWER } },
        };

        expect(hasOrganizationAccess(claims, 'org-123')).toBe(false);
      });
    });

    describe('getOrganizationRole', () => {
      it('should return role for org member', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
          orgs: { 'org-123': { role: Role.ADMIN } },
        };

        expect(getOrganizationRole(claims, 'org-123')).toBe(Role.ADMIN);
      });

      it('should return undefined for non-member', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
        };

        expect(getOrganizationRole(claims, 'org-123')).toBeUndefined();
      });
    });

    describe('getProjectRole', () => {
      it('should return project-specific role', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
          orgs: {
            'org-123': {
              role: Role.VIEWER,
              projects: { 'project-456': Role.EDITOR },
            },
          },
        };

        expect(getProjectRole(claims, 'org-123', 'project-456')).toBe(Role.EDITOR);
      });

      it('should fall back to org role', () => {
        const claims: PlatformClaims = {
          sub: 'user-123',
          iss: 'relay-platform',
          aud: ['noteman'],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
          jti: 'token-1',
          email: 'test@example.com',
          tier: 'team',
          sessionId: 'session-1',
          tokenType: TokenType.ACCESS,
          orgs: { 'org-123': { role: Role.ADMIN } },
        };

        expect(getProjectRole(claims, 'org-123', 'project-456')).toBe(Role.ADMIN);
      });
    });
  });
});
