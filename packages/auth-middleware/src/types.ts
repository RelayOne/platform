/**
 * @fileoverview Shared type definitions for auth middleware
 * @module @relay/auth-middleware/types
 */

/**
 * Relay Platform application identifiers.
 * Used for cross-app token validation and permission scoping.
 */
export type RelayApp = 'verity' | 'noteman' | 'shipcheck';

/**
 * All supported applications for audience validation.
 */
export const RELAY_APPS: readonly RelayApp[] = ['verity', 'noteman', 'shipcheck'] as const;

/**
 * Token issuer for Relay Platform tokens.
 */
export const TOKEN_ISSUER = 'relay-platform';

/**
 * Token types for different authentication flows.
 */
export enum TokenType {
  /** Standard access token for API requests */
  ACCESS = 'access',
  /** Refresh token for obtaining new access tokens */
  REFRESH = 'refresh',
  /** API key token for programmatic access */
  API_KEY = 'api_key',
  /** Service-to-service token for cross-app communication */
  SERVICE = 'service',
  /** Cross-app SSO token */
  CROSS_APP = 'cross_app',
}

/**
 * Authentication methods supported by the platform.
 */
export enum AuthMethod {
  /** Email/password authentication */
  PASSWORD = 'password',
  /** OAuth 2.0 provider authentication */
  OAUTH = 'oauth',
  /** Magic link authentication */
  MAGIC_LINK = 'magic_link',
  /** API key authentication */
  API_KEY = 'api_key',
  /** SSO (SAML/OIDC) authentication */
  SSO = 'sso',
  /** Service account authentication */
  SERVICE = 'service',
}

/**
 * User roles in the Relay Platform.
 * Defines hierarchical access levels.
 */
export enum Role {
  /** Read-only access */
  VIEWER = 'viewer',
  /** Can create and edit resources */
  EDITOR = 'editor',
  /** Can manage settings and users */
  ADMIN = 'admin',
  /** Full access including billing */
  OWNER = 'owner',
  /** Platform-wide super admin */
  SUPER_ADMIN = 'super_admin',
}

/**
 * Numeric role hierarchy for comparison.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.EDITOR]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
  [Role.SUPER_ADMIN]: 4,
};

/**
 * Subscription tiers for Relay Platform.
 */
export type Tier = 'personal' | 'pro' | 'team' | 'enterprise';

/**
 * Tier hierarchy for comparison.
 */
export const TIER_HIERARCHY: Record<Tier, number> = {
  personal: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

/**
 * Permission string format: "resource:action"
 * Examples: "meeting:read", "document:write", "repository:delete"
 */
export type PermissionString = string;

/**
 * Per-organization role and project access information.
 * Used in the `orgs` map of platform JWT claims.
 */
export interface OrganizationAccess {
  /** Organization display name */
  name?: string;
  /** User's role in this organization */
  role: Role;
  /** Per-project role overrides */
  projects?: Record<string, Role>;
  /** Teams the user belongs to in this organization */
  teams?: string[];
  /** Permission strings for this org */
  permissions?: PermissionString[];
}

/**
 * Platform JWT claims structure.
 * Matches the Rust platform-auth crate structure for cross-app compatibility.
 */
export interface PlatformClaims {
  /** Subject (user ID) */
  sub: string;
  /** Issuer (always "relay-platform") */
  iss: string;
  /** Audience (app identifiers) */
  aud: string[];
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Not before (Unix timestamp) */
  nbf?: number;
  /** JWT ID (unique token identifier) */
  jti: string;
  /** User email */
  email: string;
  /** User display name */
  name?: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** Whether email is verified */
  emailVerified?: boolean;
  /** User subscription tier */
  tier: Tier;
  /** Primary organization ID for request context */
  orgId?: string;
  /** Primary project ID for request context */
  projectId?: string;
  /** Organization claims (multi-org support) */
  orgs?: Record<string, OrganizationAccess>;
  /** Per-app permissions */
  appPermissions?: Record<string, PermissionString[]>;
  /** Session ID for tracking and revocation */
  sessionId: string;
  /** Token type (access, refresh, service, etc.) */
  tokenType: TokenType;
  /** Whether MFA was verified for this session */
  mfaVerified?: boolean;
  /** Authentication method used */
  authMethod?: AuthMethod;
  /** OAuth provider if authMethod is 'oauth' */
  oauthProvider?: string;
  /** SSO provider ID if authMethod is 'sso' */
  ssoProviderId?: string;
  /** Device ID for session tracking */
  deviceId?: string;
  /** IP address at token creation */
  ipAddress?: string;
  /** User-Agent at token creation */
  userAgent?: string;
  /** Token version for rotation/revocation */
  tokenVersion?: number;
  /** Custom claims for extensibility */
  custom?: Record<string, unknown>;
}

/**
 * Token pair (access + refresh).
 */
export interface TokenPair {
  /** Access token (short-lived) */
  accessToken: string;
  /** Refresh token (long-lived) */
  refreshToken: string;
  /** Access token expiration (Unix timestamp) */
  expiresAt: number;
  /** Token type (always "Bearer") */
  tokenType: 'Bearer';
}

/**
 * JWT configuration options.
 */
export interface JwtConfig {
  /** JWT secret (for HS256) or private key (for RS256/ES256) */
  secret: string;
  /** Algorithm to use */
  algorithm: 'HS256' | 'RS256' | 'ES256';
  /** Issuer claim */
  issuer: string;
  /** Default audience */
  audience: RelayApp[];
  /** Access token expiration (seconds) */
  accessTokenExpiry: number;
  /** Refresh token expiration (seconds) */
  refreshTokenExpiry: number;
}

/**
 * Session status enumeration.
 */
export enum SessionStatus {
  /** Session is active and valid */
  ACTIVE = 'active',
  /** Session has expired naturally */
  EXPIRED = 'expired',
  /** Session was manually revoked */
  REVOKED = 'revoked',
  /** Session requires re-authentication (e.g., sensitive action) */
  REQUIRES_REAUTH = 'requires_reauth',
}

/**
 * Device type for session tracking.
 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'cli' | 'service' | 'unknown';

/**
 * Device information for sessions.
 */
export interface SessionDevice {
  /** Unique device identifier */
  id: string;
  /** Device type category */
  type: DeviceType;
  /** Device name (e.g., "Chrome on Windows") */
  name: string;
  /** Operating system */
  os?: string;
  /** Browser or client name */
  browser?: string;
  /** Last known IP address */
  lastIp?: string;
  /** Last known location (city, country) */
  lastLocation?: string;
}

/**
 * Platform session structure.
 */
export interface PlatformSession {
  /** Session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Device information */
  device: SessionDevice;
  /** Session status */
  status: SessionStatus;
  /** Session creation time (Unix timestamp) */
  createdAt: number;
  /** Last activity time (Unix timestamp) */
  lastActiveAt: number;
  /** Session expiration time (Unix timestamp) */
  expiresAt: number;
  /** Apps accessed in this session */
  apps: RelayApp[];
  /** Current organization context */
  orgId?: string;
  /** Current project context */
  projectId?: string;
  /** Whether MFA is verified for this session */
  mfaVerified: boolean;
  /** Authentication method used */
  authMethod: AuthMethod;
  /** Access token hash (for validation) */
  accessTokenHash?: string;
  /** Refresh token hash (for validation) */
  refreshTokenHash?: string;
}

/**
 * Auth middleware configuration.
 */
export interface AuthMiddlewareConfig {
  /** JWT service configuration */
  jwt: Partial<JwtConfig>;
  /** Required app audience for this middleware instance */
  requiredApp?: RelayApp;
  /** Whether to allow legacy token formats */
  allowLegacyTokens?: boolean;
  /** Custom logger function */
  logger?: AuthLogger;
  /** Skip auth for specific paths */
  skipPaths?: string[];
}

/**
 * Logger interface for auth middleware.
 */
export interface AuthLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * Default console logger.
 */
export const defaultLogger: AuthLogger = {
  debug: (message, context) => console.debug(`[auth] ${message}`, context ?? ''),
  info: (message, context) => console.info(`[auth] ${message}`, context ?? ''),
  warn: (message, context) => console.warn(`[auth] ${message}`, context ?? ''),
  error: (message, context) => console.error(`[auth] ${message}`, context ?? ''),
};

/**
 * Legacy JWT payload structure for backward compatibility.
 * Used during migration from old token formats.
 */
export interface LegacyJWTPayload {
  /** User ID */
  sub: string;
  /** User email */
  email: string;
  /** User tier */
  tier: 'personal' | 'pro' | 'team';
  /** Organization ID (for team users) - deprecated, use orgId */
  organizationId?: string;
  /** User roles for RBAC (optional) */
  roles?: string[];
  /** Token issued at timestamp */
  iat: number;
  /** Token expiration timestamp */
  exp: number;
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Check if a payload is a legacy JWT format.
 *
 * @param payload - JWT payload to check
 * @returns True if legacy format
 */
export function isLegacyPayload(payload: unknown): payload is LegacyJWTPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  // Legacy tokens don't have sessionId or tokenType
  return !('sessionId' in p) && !('tokenType' in p) && 'sub' in p && 'email' in p;
}

/**
 * Convert legacy JWT payload to platform claims format.
 *
 * @param legacy - Legacy JWT payload
 * @returns Platform claims structure
 */
export function normalizeLegacyPayload(legacy: LegacyJWTPayload): PlatformClaims {
  return {
    sub: legacy.sub,
    iss: TOKEN_ISSUER,
    aud: [...RELAY_APPS],
    exp: legacy.exp,
    iat: legacy.iat,
    jti: `legacy-${legacy.sub}-${legacy.iat}`,
    email: legacy.email,
    tier: legacy.tier as Tier,
    orgId: legacy.organizationId,
    sessionId: `legacy-${legacy.sub}-${legacy.iat}`,
    tokenType: TokenType.ACCESS,
    mfaVerified: false,
    authMethod: AuthMethod.PASSWORD,
  };
}
