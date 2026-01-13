/**
 * @fileoverview Relay Platform Authentication Middleware
 * @module @relay/auth-middleware
 *
 * Shared authentication middleware for all Relay Platform Hono applications.
 *
 * Features:
 * - JWT token validation and generation
 * - Session management
 * - Role-based access control (RBAC)
 * - Tier-based feature gating
 * - Organization/project context handling
 * - MFA verification
 * - Cross-app permission validation
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import {
 *   authMiddleware,
 *   requireTier,
 *   requireOrganization,
 *   requireRole,
 *   JwtService,
 *   Role,
 * } from '@relay/auth-middleware';
 *
 * const app = new Hono();
 *
 * // Configure authentication
 * app.use('/*', authMiddleware({
 *   jwt: { secret: process.env.JWT_SECRET },
 *   requiredApp: 'noteman',
 *   skipPaths: ['/health', '/public/*'],
 * }));
 *
 * // Tier-based access
 * app.use('/api/premium/*', requireTier('team'));
 *
 * // Organization-scoped routes
 * app.use('/api/orgs/:orgId/*', requireOrganization());
 *
 * // Role-based access
 * app.use('/api/admin/*', requireRole(Role.ADMIN));
 *
 * // Permission-based access
 * app.use('/api/meetings', requirePermission('meeting:create', 'noteman'));
 * ```
 *
 * @example Token Generation
 * ```typescript
 * import { createJwtService, AuthMethod } from '@relay/auth-middleware';
 *
 * const jwtService = createJwtService({ secret: process.env.JWT_SECRET });
 *
 * // Generate access token
 * const token = await jwtService.generateAccessToken({
 *   sub: 'user-123',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   tier: 'team',
 *   sessionId: crypto.randomUUID(),
 * }, {
 *   orgId: 'org-456',
 *   appPermissions: {
 *     noteman: ['meeting:read', 'meeting:create'],
 *     verity: ['document:read'],
 *   },
 *   authMethod: AuthMethod.OAUTH,
 *   oauthProvider: 'google',
 * });
 *
 * // Verify token
 * const claims = await jwtService.verifyToken(token);
 * ```
 *
 * @example Session Management
 * ```typescript
 * import {
 *   createSession,
 *   isSessionValid,
 *   extendSession,
 *   parseDeviceInfo,
 *   AuthMethod,
 * } from '@relay/auth-middleware';
 *
 * // Create session
 * const device = parseDeviceInfo(request.headers.get('user-agent'));
 * const session = createSession('user-123', {
 *   device,
 *   authMethod: AuthMethod.PASSWORD,
 *   mfaVerified: false,
 *   app: 'noteman',
 * });
 *
 * // Validate session
 * if (isSessionValid(session)) {
 *   // Session is active
 * }
 *
 * // Extend session
 * const extended = extendSession(session, 3600); // 1 hour
 * ```
 */

// ============================================================================
// Middleware Exports
// ============================================================================

export {
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
  type AuthContext,
} from './middleware.js';

// ============================================================================
// JWT Exports
// ============================================================================

export {
  JwtService,
  JwtError,
  createJwtService,
  DEFAULT_JWT_CONFIG,
  SERVICE_TOKEN_EXPIRY,
  type GenerateTokenOptions,
  type UserClaims,
} from './jwt.js';

// ============================================================================
// Session Exports
// ============================================================================

export {
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
  type CreateSessionOptions,
} from './session.js';

// ============================================================================
// Type Exports
// ============================================================================

export {
  // App and platform types
  type RelayApp,
  RELAY_APPS,
  TOKEN_ISSUER,

  // Token types
  TokenType,
  AuthMethod,

  // Role types
  Role,
  ROLE_HIERARCHY,

  // Tier types
  type Tier,
  TIER_HIERARCHY,

  // Permission types
  type PermissionString,
  type OrganizationAccess,

  // Claims and config
  type PlatformClaims,
  type JwtConfig,
  type TokenPair,

  // Session types
  SessionStatus,
  type DeviceType,
  type SessionDevice,
  type PlatformSession,

  // Configuration types
  type AuthMiddlewareConfig,
  type AuthLogger,
  defaultLogger,

  // Legacy compatibility
  type LegacyJWTPayload,
  isLegacyPayload,
  normalizeLegacyPayload,
} from './types.js';
