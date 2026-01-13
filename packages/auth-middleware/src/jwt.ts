/**
 * @fileoverview JWT utilities for the Relay Platform
 * @module @relay/auth-middleware/jwt
 *
 * Provides JWT token generation, verification, and management utilities
 * for use across all Relay Platform applications.
 *
 * @example
 * ```typescript
 * import { JwtService, createJwtService } from '@relay/auth-middleware/jwt';
 *
 * const jwtService = createJwtService({ secret: process.env.JWT_SECRET });
 *
 * // Generate access token
 * const token = await jwtService.generateAccessToken({
 *   sub: 'user-123',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   tier: 'team',
 *   sessionId: 'session-456',
 * });
 *
 * // Verify token
 * const claims = await jwtService.verifyToken(token);
 * ```
 */

import * as jose from 'jose';
import type {
  PlatformClaims,
  JwtConfig,
  TokenPair,
  TokenType,
  RelayApp,
  PermissionString,
  Tier,
  AuthMethod,
  OrganizationAccess,
} from './types.js';
import { TOKEN_ISSUER, RELAY_APPS } from './types.js';

/**
 * Default JWT configuration.
 */
export const DEFAULT_JWT_CONFIG: JwtConfig = {
  secret: process.env['JWT_SECRET'] ?? 'development-secret-change-in-production',
  algorithm: 'HS256',
  issuer: TOKEN_ISSUER,
  audience: [...RELAY_APPS],
  accessTokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 604800, // 7 days
};

/**
 * Service token configuration (longer expiry).
 */
export const SERVICE_TOKEN_EXPIRY = 7776000; // 90 days

/**
 * Options for generating tokens.
 */
export interface GenerateTokenOptions {
  /** Token expiration override (seconds) */
  expiresIn?: number;
  /** Organization context */
  orgId?: string;
  /** Project context */
  projectId?: string;
  /** Multi-org access map */
  orgs?: Record<string, OrganizationAccess>;
  /** Cross-app permissions */
  appPermissions?: Record<string, PermissionString[]>;
  /** MFA verification status */
  mfaVerified?: boolean;
  /** Authentication method */
  authMethod?: AuthMethod;
  /** OAuth provider name */
  oauthProvider?: string;
  /** SSO provider ID */
  ssoProviderId?: string;
  /** Device ID */
  deviceId?: string;
  /** Client IP address */
  ipAddress?: string;
  /** Client User-Agent */
  userAgent?: string;
  /** Custom claims */
  custom?: Record<string, unknown>;
}

/**
 * Core user claims required for token generation.
 */
export interface UserClaims {
  /** User ID */
  sub: string;
  /** User email */
  email: string;
  /** User display name */
  name?: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** Email verified status */
  emailVerified?: boolean;
  /** Subscription tier */
  tier: Tier;
  /** Session ID */
  sessionId: string;
}

/**
 * JWT-specific error class.
 */
export class JwtError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  /**
   * Create a new JWT error.
   *
   * @param message - Human-readable error message
   * @param code - Error code (TOKEN_EXPIRED, INVALID_TOKEN, etc.)
   */
  constructor(message: string, code: string) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
    Object.setPrototypeOf(this, JwtError.prototype);
  }
}

/**
 * JWT service for token operations.
 *
 * Provides methods for generating, verifying, and inspecting JWT tokens
 * following the Relay Platform claims structure.
 */
export class JwtService {
  private readonly config: JwtConfig;
  private readonly secretKey: Uint8Array;

  /**
   * Create a new JWT service instance.
   *
   * @param config - JWT configuration (merged with defaults)
   */
  constructor(config: Partial<JwtConfig> = {}) {
    this.config = { ...DEFAULT_JWT_CONFIG, ...config };
    this.secretKey = new TextEncoder().encode(this.config.secret);
  }

  /**
   * Generate an access token.
   *
   * @param claims - User claims for the token
   * @param options - Additional token options
   * @returns Signed JWT string
   *
   * @example
   * ```typescript
   * const token = await jwtService.generateAccessToken({
   *   sub: 'user-123',
   *   email: 'user@example.com',
   *   tier: 'team',
   *   sessionId: 'session-456',
   * }, {
   *   orgId: 'org-789',
   *   appPermissions: { noteman: ['meeting:read', 'meeting:create'] },
   * });
   * ```
   */
  async generateAccessToken(claims: UserClaims, options: GenerateTokenOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn ?? this.config.accessTokenExpiry;

    const fullClaims: PlatformClaims = {
      // Standard JWT claims
      sub: claims.sub,
      iss: this.config.issuer,
      aud: this.config.audience,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),

      // User info
      email: claims.email,
      name: claims.name,
      avatarUrl: claims.avatarUrl,
      emailVerified: claims.emailVerified,
      tier: claims.tier,

      // Session and token metadata
      sessionId: claims.sessionId,
      tokenType: 'access' as TokenType,
      tokenVersion: 1,

      // Organization context
      orgId: options.orgId,
      projectId: options.projectId,
      orgs: options.orgs,

      // Permissions
      appPermissions: options.appPermissions,

      // Security metadata
      mfaVerified: options.mfaVerified ?? false,
      authMethod: options.authMethod,
      oauthProvider: options.oauthProvider,
      ssoProviderId: options.ssoProviderId,

      // Device tracking
      deviceId: options.deviceId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,

      // Custom claims
      custom: options.custom,
    };

    // Remove undefined values to minimize token size
    const cleanClaims = this.removeUndefined(fullClaims) as jose.JWTPayload;

    return new jose.SignJWT(cleanClaims)
      .setProtectedHeader({ alg: this.config.algorithm })
      .sign(this.secretKey);
  }

  /**
   * Generate a refresh token.
   *
   * Refresh tokens have longer expiry and minimal claims.
   *
   * @param claims - User claims for the token
   * @param options - Additional token options
   * @returns Signed JWT string
   */
  async generateRefreshToken(claims: UserClaims, options: GenerateTokenOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn ?? this.config.refreshTokenExpiry;

    const fullClaims: PlatformClaims = {
      sub: claims.sub,
      iss: this.config.issuer,
      aud: this.config.audience,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),
      email: claims.email,
      tier: claims.tier,
      sessionId: claims.sessionId,
      tokenType: 'refresh' as TokenType,
      tokenVersion: 1,
    };

    const cleanClaims = this.removeUndefined(fullClaims) as jose.JWTPayload;

    return new jose.SignJWT(cleanClaims)
      .setProtectedHeader({ alg: this.config.algorithm })
      .sign(this.secretKey);
  }

  /**
   * Generate a token pair (access + refresh).
   *
   * @param claims - User claims for the tokens
   * @param options - Additional token options
   * @returns Token pair with expiration info
   *
   * @example
   * ```typescript
   * const { accessToken, refreshToken, expiresAt } = await jwtService.generateTokenPair({
   *   sub: 'user-123',
   *   email: 'user@example.com',
   *   tier: 'team',
   *   sessionId: 'session-456',
   * });
   * ```
   */
  async generateTokenPair(claims: UserClaims, options: GenerateTokenOptions = {}): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(claims, options),
      this.generateRefreshToken(claims, options),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (options.expiresIn ?? this.config.accessTokenExpiry),
      tokenType: 'Bearer',
    };
  }

  /**
   * Generate a service-to-service token.
   *
   * Service tokens have:
   * - Longer expiration (90 days)
   * - Explicit app permissions
   * - SERVICE auth method
   * - MFA bypass
   *
   * @param serviceId - Service account ID
   * @param serviceName - Service account name
   * @param appPermissions - Permissions per app
   * @returns Signed JWT string
   *
   * @example
   * ```typescript
   * const token = await jwtService.generateServiceToken(
   *   'svc-noteman-api',
   *   'NoteMan API Service',
   *   {
   *     verity: ['document:read', 'verification:execute'],
   *     shipcheck: ['repository:read'],
   *   }
   * );
   * ```
   */
  async generateServiceToken(
    serviceId: string,
    serviceName: string,
    appPermissions: Record<string, PermissionString[]>
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const claims: PlatformClaims = {
      sub: serviceId,
      iss: this.config.issuer,
      aud: this.config.audience,
      iat: now,
      exp: now + SERVICE_TOKEN_EXPIRY,
      jti: crypto.randomUUID(),
      email: `${serviceName}@service.relay-platform.internal`,
      name: serviceName,
      tier: 'enterprise',
      sessionId: `service-${serviceId}-${now}`,
      tokenType: 'service' as TokenType,
      appPermissions,
      mfaVerified: true, // Service accounts bypass MFA
      authMethod: 'service' as AuthMethod,
      tokenVersion: 1,
    };

    const cleanClaims = this.removeUndefined(claims) as jose.JWTPayload;

    return new jose.SignJWT(cleanClaims)
      .setProtectedHeader({ alg: this.config.algorithm })
      .sign(this.secretKey);
  }

  /**
   * Verify and decode a token.
   *
   * @param token - JWT string to verify
   * @returns Verified platform claims
   * @throws {JwtError} If token is invalid or expired
   *
   * @example
   * ```typescript
   * try {
   *   const claims = await jwtService.verifyToken(token);
   *   console.log('User:', claims.sub, claims.email);
   * } catch (error) {
   *   if (error instanceof JwtError && error.code === 'TOKEN_EXPIRED') {
   *     // Handle expired token
   *   }
   * }
   * ```
   */
  async verifyToken(token: string): Promise<PlatformClaims> {
    try {
      const { payload } = await jose.jwtVerify(token, this.secretKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      return payload as unknown as PlatformClaims;
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new JwtError('Token has expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        throw new JwtError(`Token validation failed: ${(error as Error).message}`, 'VALIDATION_FAILED');
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new JwtError('Invalid token signature', 'INVALID_SIGNATURE');
      }
      throw new JwtError('Invalid token', 'INVALID_TOKEN');
    }
  }

  /**
   * Verify a token with custom audience requirement.
   *
   * @param token - JWT string to verify
   * @param requiredApp - Required app in audience
   * @returns Verified platform claims
   * @throws {JwtError} If token is invalid or doesn't include required app
   */
  async verifyTokenForApp(token: string, requiredApp: RelayApp): Promise<PlatformClaims> {
    const claims = await this.verifyToken(token);

    if (!claims.aud.includes(requiredApp)) {
      throw new JwtError(`Token not valid for app: ${requiredApp}`, 'INVALID_AUDIENCE');
    }

    return claims;
  }

  /**
   * Decode a token without verification (for debugging).
   *
   * WARNING: This does NOT verify the token signature.
   * Only use for logging/debugging purposes.
   *
   * @param token - JWT string to decode
   * @returns Decoded claims or null if invalid
   */
  decodeToken(token: string): PlatformClaims | null {
    try {
      const decoded = jose.decodeJwt(token);
      return decoded as unknown as PlatformClaims;
    } catch {
      return null;
    }
  }

  /**
   * Check if a token is expired.
   *
   * @param token - JWT string to check
   * @returns True if token is expired or invalid
   */
  isTokenExpired(token: string): boolean {
    const claims = this.decodeToken(token);
    if (!claims) return true;
    return claims.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Check if claims are valid for a specific app.
   *
   * @param claims - Platform claims
   * @param app - App to check
   * @returns True if claims include the app in audience
   */
  isValidForApp(claims: PlatformClaims, app: RelayApp): boolean {
    return claims.aud.includes(app.toLowerCase());
  }

  /**
   * Check if claims have a specific permission.
   *
   * @param claims - Platform claims
   * @param permission - Permission string to check
   * @param app - Optional app scope (checks all apps if not provided)
   * @returns True if permission is present
   *
   * @example
   * ```typescript
   * if (jwtService.hasPermission(claims, 'meeting:create', 'noteman')) {
   *   // User can create meetings
   * }
   * ```
   */
  hasPermission(claims: PlatformClaims, permission: PermissionString, app?: RelayApp): boolean {
    if (!claims.appPermissions) return false;

    if (app) {
      const appPerms = claims.appPermissions[app.toLowerCase()];
      return appPerms?.includes(permission) ?? false;
    }

    // Check all apps
    return Object.values(claims.appPermissions).some(perms => perms.includes(permission));
  }

  /**
   * Get all permissions for a specific app.
   *
   * @param claims - Platform claims
   * @param app - App to get permissions for
   * @returns Array of permission strings
   */
  getAppPermissions(claims: PlatformClaims, app: RelayApp): PermissionString[] {
    return claims.appPermissions?.[app.toLowerCase()] ?? [];
  }

  /**
   * Extract bearer token from Authorization header.
   *
   * @param authHeader - Authorization header value
   * @returns Token string or null if not found/invalid
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }

  /**
   * Get token expiration as Date.
   *
   * @param token - JWT string
   * @returns Expiration date or null if invalid
   */
  getExpirationDate(token: string): Date | null {
    const claims = this.decodeToken(token);
    if (!claims) return null;
    return new Date(claims.exp * 1000);
  }

  /**
   * Get remaining token lifetime in seconds.
   *
   * @param token - JWT string
   * @returns Seconds until expiration (negative if expired)
   */
  getRemainingLifetime(token: string): number {
    const claims = this.decodeToken(token);
    if (!claims) return -1;
    return claims.exp - Math.floor(Date.now() / 1000);
  }

  /**
   * Remove undefined values from an object.
   */
  private removeUndefined<T extends object>(obj: T): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );
  }
}

/**
 * Create a JWT service with environment configuration.
 *
 * @param config - Optional configuration overrides
 * @returns Configured JwtService instance
 *
 * @example
 * ```typescript
 * // Uses JWT_SECRET from environment
 * const jwtService = createJwtService();
 *
 * // With custom config
 * const jwtService = createJwtService({
 *   accessTokenExpiry: 1800, // 30 minutes
 * });
 * ```
 */
export function createJwtService(config?: Partial<JwtConfig>): JwtService {
  return new JwtService({
    secret: process.env['JWT_SECRET'],
    ...config,
  });
}

// Re-export types
export type {
  PlatformClaims,
  JwtConfig,
  TokenPair,
  TokenType,
  RelayApp,
  PermissionString,
  Tier,
  AuthMethod,
  OrganizationAccess,
};
