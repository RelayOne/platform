/**
 * @fileoverview Hono authentication middleware for the Relay Platform
 * @module @relay/auth-middleware/middleware
 *
 * Provides authentication middleware for Hono.js applications with:
 * - JWT token validation
 * - Organization/project context extraction
 * - Role-based access control
 * - Tier-based feature gating
 * - MFA verification checks
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import {
 *   authMiddleware,
 *   requireTier,
 *   requireOrganization,
 *   requireRole,
 * } from '@relay/auth-middleware';
 *
 * const app = new Hono();
 *
 * // Protect all routes with authentication
 * app.use('/*', authMiddleware({ jwt: { secret: process.env.JWT_SECRET } }));
 *
 * // Require team tier for premium endpoints
 * app.use('/api/premium/*', requireTier('team'));
 *
 * // Require org membership for org endpoints
 * app.use('/api/orgs/:orgId/*', requireOrganization());
 *
 * // Require admin role for admin endpoints
 * app.use('/api/admin/*', requireRole(Role.ADMIN));
 * ```
 */

import { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { JwtService, JwtError, createJwtService } from './jwt.js';
import type {
  PlatformClaims,
  AuthMiddlewareConfig,
  RelayApp,
  Role,
  Tier,
  PermissionString,
} from './types.js';
import {
  ROLE_HIERARCHY,
  TIER_HIERARCHY,
  defaultLogger,
  isLegacyPayload,
  normalizeLegacyPayload,
} from './types.js';
import {
  AuthenticationError,
  AuthorizationError,
  OrganizationAccessError,
} from '@relay/errors';

/**
 * Extended Hono context with authenticated user.
 */
export type AuthContext = Context & {
  /**
   * Get the authenticated user from context.
   */
  get(key: 'user'): PlatformClaims;
  /**
   * Set the authenticated user in context.
   */
  set(key: 'user', value: PlatformClaims): void;
  /**
   * Get the JWT service from context.
   */
  get(key: 'jwtService'): JwtService;
};

/**
 * Default auth middleware configuration.
 */
const DEFAULT_CONFIG: AuthMiddlewareConfig = {
  jwt: {},
  allowLegacyTokens: true,
  skipPaths: [],
};

/**
 * Check if a path should skip authentication.
 */
function shouldSkipPath(path: string, skipPaths: string[]): boolean {
  for (const pattern of skipPaths) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (path.startsWith(prefix)) return true;
    } else if (pattern === path) {
      return true;
    }
  }
  return false;
}

/**
 * Create the main authentication middleware.
 *
 * Validates JWT from Authorization header and attaches user to context.
 *
 * @param config - Middleware configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * app.use('/*', authMiddleware({
 *   jwt: { secret: process.env.JWT_SECRET },
 *   requiredApp: 'noteman',
 *   skipPaths: ['/health', '/public/*'],
 * }));
 * ```
 */
export function authMiddleware(config: Partial<AuthMiddlewareConfig> = {}): MiddlewareHandler {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const jwtService = createJwtService(mergedConfig.jwt);
  const logger = mergedConfig.logger ?? defaultLogger;

  return createMiddleware(async (c, next) => {
    // Check if path should skip auth
    if (mergedConfig.skipPaths && shouldSkipPath(c.req.path, mergedConfig.skipPaths)) {
      await next();
      return;
    }

    // Make JWT service available in context
    c.set('jwtService', jwtService);

    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    const token = JwtService.extractBearerToken(authHeader);

    if (!token) {
      logger.debug('Missing or invalid authorization header', { path: c.req.path });
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    try {
      let claims: PlatformClaims;

      // Try to verify as platform token first
      try {
        if (mergedConfig.requiredApp) {
          claims = await jwtService.verifyTokenForApp(token, mergedConfig.requiredApp);
        } else {
          claims = await jwtService.verifyToken(token);
        }
      } catch (error) {
        // If legacy tokens allowed, try to decode and normalize
        if (mergedConfig.allowLegacyTokens && error instanceof JwtError) {
          const decoded = jwtService.decodeToken(token);
          if (decoded && isLegacyPayload(decoded)) {
            claims = normalizeLegacyPayload(decoded as unknown as Parameters<typeof normalizeLegacyPayload>[0]);
            logger.debug('Using legacy token format', { userId: claims.sub });
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      // Check token expiration
      if (claims.exp < Math.floor(Date.now() / 1000)) {
        logger.debug('Token expired', { userId: claims.sub });
        throw new AuthenticationError('Token has expired');
      }

      // Extract organization context from headers if not in token
      if (!claims.orgId) {
        const orgHeader = c.req.header('x-organization-id');
        if (orgHeader) {
          claims = { ...claims, orgId: orgHeader };
        }
      }

      // Extract project context from headers if not in token
      if (!claims.projectId) {
        const projectHeader = c.req.header('x-project-id');
        if (projectHeader) {
          claims = { ...claims, projectId: projectHeader };
        }
      }

      // Attach user to context
      c.set('user', claims);

      logger.debug('Request authenticated', {
        userId: claims.sub,
        email: claims.email,
        tier: claims.tier,
        orgId: claims.orgId,
        path: c.req.path,
      });

      await next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof JwtError) {
        logger.debug('Token validation failed', { error: error.code, message: error.message });
        throw new AuthenticationError(error.message);
      }
      logger.error('Unexpected auth error', { error: String(error) });
      throw new AuthenticationError('Authentication failed');
    }
  });
}

/**
 * Middleware that requires a specific tier or higher.
 *
 * @param requiredTier - Minimum tier required
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * // Require at least 'pro' tier
 * app.use('/api/premium/*', requireTier('pro'));
 *
 * // Require 'team' tier for team features
 * app.use('/api/teams/*', requireTier('team'));
 * ```
 */
export function requireTier(requiredTier: Tier): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    const userTierLevel = TIER_HIERARCHY[user.tier] ?? 0;
    const requiredTierLevel = TIER_HIERARCHY[requiredTier] ?? 0;

    if (userTierLevel < requiredTierLevel) {
      throw new AuthorizationError(`${requiredTier} tier required`, {
        required: requiredTier,
        current: user.tier,
      });
    }

    await next();
  });
}

/**
 * Middleware that requires the user to be in a specific organization.
 *
 * @param orgParamName - Route parameter name containing organization ID
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * // Default: uses 'orgId' parameter
 * app.use('/api/orgs/:orgId/*', requireOrganization());
 *
 * // Custom parameter name
 * app.use('/api/organizations/:organizationId/*', requireOrganization('organizationId'));
 * ```
 */
export function requireOrganization(orgParamName = 'orgId'): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;
    const orgId = c.req.param(orgParamName);

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!orgId) {
      throw new OrganizationAccessError('Organization ID required');
    }

    // Check organization access via orgs map
    if (user.orgs && orgId in user.orgs) {
      await next();
      return;
    }

    // Check context orgId
    if (user.orgId === orgId) {
      await next();
      return;
    }

    throw new OrganizationAccessError(`Not a member of organization: ${orgId}`);
  });
}

/**
 * Middleware that requires a specific role in an organization.
 *
 * @param requiredRole - Minimum role required
 * @param orgParamName - Route parameter name for organization ID
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * import { Role } from '@relay/auth-middleware';
 *
 * // Require admin role
 * app.use('/api/orgs/:orgId/settings/*', requireOrganizationRole(Role.ADMIN));
 *
 * // Require owner for billing
 * app.use('/api/orgs/:orgId/billing/*', requireOrganizationRole(Role.OWNER));
 * ```
 */
export function requireOrganizationRole(
  requiredRole: Role,
  orgParamName = 'orgId'
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;
    const orgId = c.req.param(orgParamName);

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!orgId) {
      throw new OrganizationAccessError('Organization ID required');
    }

    // Check organization access via orgs map
    if (!user.orgs || !(orgId in user.orgs)) {
      throw new OrganizationAccessError(`Not a member of organization: ${orgId}`);
    }

    const orgAccess = user.orgs[orgId];
    const userRoleLevel = ROLE_HIERARCHY[orgAccess.role as Role] ?? 0;
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    if (userRoleLevel < requiredRoleLevel) {
      throw new AuthorizationError(`${requiredRole} role required`, {
        required: requiredRole,
        current: orgAccess.role,
        organizationId: orgId,
      });
    }

    await next();
  });
}

/**
 * Middleware that requires a specific project role.
 *
 * @param requiredRole - Minimum role required
 * @param orgParamName - Route parameter name for organization ID
 * @param projectParamName - Route parameter name for project ID
 * @returns Hono middleware
 */
export function requireProjectRole(
  requiredRole: Role,
  orgParamName = 'orgId',
  projectParamName = 'projectId'
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;
    const orgId = c.req.param(orgParamName);
    const projectId = c.req.param(projectParamName);

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!orgId || !projectId) {
      throw new AuthorizationError('Organization and project IDs required');
    }

    // Check organization access
    if (!user.orgs || !(orgId in user.orgs)) {
      throw new OrganizationAccessError(`Not a member of organization: ${orgId}`);
    }

    const orgAccess = user.orgs[orgId];

    // Check project-specific role first
    if (orgAccess.projects && projectId in orgAccess.projects) {
      const projectRole = orgAccess.projects[projectId];
      const projectRoleLevel = ROLE_HIERARCHY[projectRole as Role] ?? 0;
      const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

      if (projectRoleLevel < requiredRoleLevel) {
        throw new AuthorizationError(`${requiredRole} project role required`, {
          required: requiredRole,
          current: projectRole,
          projectId,
        });
      }

      await next();
      return;
    }

    // Fall back to organization role
    const orgRoleLevel = ROLE_HIERARCHY[orgAccess.role as Role] ?? 0;
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    if (orgRoleLevel < requiredRoleLevel) {
      throw new AuthorizationError(`${requiredRole} role required for project`, {
        required: requiredRole,
        current: orgAccess.role,
        projectId,
      });
    }

    await next();
  });
}

/**
 * Middleware that requires a specific role (org-agnostic).
 *
 * Checks the user's highest role across all organizations.
 *
 * @param requiredRole - Minimum role required
 * @returns Hono middleware
 */
export function requireRole(requiredRole: Role): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    // Get highest role across all orgs
    let highestRole: Role | undefined;
    let highestLevel = -1;

    if (user.orgs) {
      for (const [, access] of Object.entries(user.orgs)) {
        const level = ROLE_HIERARCHY[access.role as Role] ?? 0;
        if (level > highestLevel) {
          highestLevel = level;
          highestRole = access.role as Role;
        }
      }
    }

    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    if (highestLevel < requiredLevel) {
      throw new AuthorizationError(`${requiredRole} role required`, {
        required: requiredRole,
        current: highestRole ?? 'none',
      });
    }

    await next();
  });
}

/**
 * Middleware that requires MFA verification.
 *
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * // Require MFA for sensitive operations
 * app.use('/api/security/*', requireMFA());
 * app.use('/api/billing/payment-methods/*', requireMFA());
 * ```
 */
export function requireMFA(): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!user.mfaVerified) {
      throw new AuthorizationError('MFA verification required');
    }

    await next();
  });
}

/**
 * Middleware that requires a specific permission.
 *
 * @param permission - Permission string required (e.g., "meeting:create")
 * @param app - Optional app scope (checks all apps if not specified)
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * // Require meeting:create permission for NoteMan
 * app.post('/api/meetings', requirePermission('meeting:create', 'noteman'));
 *
 * // Require document:verify permission (any app)
 * app.post('/api/verify', requirePermission('document:verify'));
 * ```
 */
export function requirePermission(permission: PermissionString, app?: RelayApp): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;
    const jwtService = c.get('jwtService') as JwtService | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!jwtService) {
      // Create a default service for permission checking
      const service = createJwtService();
      if (!service.hasPermission(user, permission, app)) {
        throw new AuthorizationError(`Permission required: ${permission}`, {
          required: permission,
          app,
        });
      }
    } else if (!jwtService.hasPermission(user, permission, app)) {
      throw new AuthorizationError(`Permission required: ${permission}`, {
        required: permission,
        app,
      });
    }

    await next();
  });
}

/**
 * Middleware that requires all specified permissions.
 *
 * @param permissions - Array of permission strings required
 * @param app - Optional app scope
 * @returns Hono middleware
 */
export function requireAllPermissions(permissions: PermissionString[], app?: RelayApp): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    const jwtService = c.get('jwtService') as JwtService | undefined ?? createJwtService();
    const missing: string[] = [];

    for (const permission of permissions) {
      if (!jwtService.hasPermission(user, permission, app)) {
        missing.push(permission);
      }
    }

    if (missing.length > 0) {
      throw new AuthorizationError('Missing required permissions', {
        required: permissions,
        missing,
        app,
      });
    }

    await next();
  });
}

/**
 * Middleware that requires any of the specified permissions.
 *
 * @param permissions - Array of permission strings (at least one required)
 * @param app - Optional app scope
 * @returns Hono middleware
 */
export function requireAnyPermission(permissions: PermissionString[], app?: RelayApp): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as PlatformClaims | undefined;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    const jwtService = c.get('jwtService') as JwtService | undefined ?? createJwtService();

    for (const permission of permissions) {
      if (jwtService.hasPermission(user, permission, app)) {
        await next();
        return;
      }
    }

    throw new AuthorizationError('One of the required permissions is needed', {
      required: permissions,
      app,
    });
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a user has access to a specific organization.
 *
 * @param user - Platform claims
 * @param orgId - Organization ID to check
 * @returns True if user has access
 */
export function hasOrganizationAccess(user: PlatformClaims, orgId: string): boolean {
  if (user.orgs && orgId in user.orgs) return true;
  return user.orgId === orgId;
}

/**
 * Get the user's role in an organization.
 *
 * @param user - Platform claims
 * @param orgId - Organization ID
 * @returns Role or undefined if no access
 */
export function getOrganizationRole(user: PlatformClaims, orgId: string): Role | undefined {
  if (user.orgs && orgId in user.orgs) {
    return user.orgs[orgId].role as Role;
  }
  return undefined;
}

/**
 * Get the user's role in a project.
 *
 * @param user - Platform claims
 * @param orgId - Organization ID
 * @param projectId - Project ID
 * @returns Role (project-specific or inherited from org) or undefined
 */
export function getProjectRole(
  user: PlatformClaims,
  orgId: string,
  projectId: string
): Role | undefined {
  if (!user.orgs || !(orgId in user.orgs)) {
    return undefined;
  }

  const orgAccess = user.orgs[orgId];

  // Check project-specific role first
  if (orgAccess.projects && projectId in orgAccess.projects) {
    return orgAccess.projects[projectId] as Role;
  }

  // Fall back to organization role
  return orgAccess.role as Role;
}

/**
 * Get the authenticated user from context.
 *
 * @param c - Hono context
 * @returns Platform claims or undefined
 */
export function getUser(c: Context): PlatformClaims | undefined {
  return c.get('user');
}

/**
 * Get the authenticated user from context (throws if not authenticated).
 *
 * @param c - Hono context
 * @returns Platform claims
 * @throws {AuthenticationError} If user is not authenticated
 */
export function requireUser(c: Context): PlatformClaims {
  const user = getUser(c);
  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }
  return user;
}
