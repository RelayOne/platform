/**
 * @fileoverview JWT utilities for the Relay Platform
 * @module @relay/platform/auth/jwt
 */

import * as jose from 'jose';
import type { RelayApp, PermissionString } from '../types/rbac';

/**
 * Platform JWT claims structure
 * Matches the Rust platform-auth crate structure for cross-app compatibility
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
  /** JWT ID */
  jti: string;
  /** User email */
  email: string;
  /** User display name */
  name: string;
  /** Whether email is verified */
  email_verified: boolean;
  /** Primary organization ID */
  org_id?: string;
  /** Primary project ID */
  project_id?: string;
  /** Organization claims (multi-org support) */
  orgs?: Record<string, OrgClaim>;
  /** Per-app permissions */
  app_permissions?: Record<string, PermissionString[]>;
  /** Session ID */
  session_id: string;
  /** Token type */
  token_type: 'access' | 'refresh' | 'cross_app';
  /** Whether MFA was verified for this session */
  mfa_verified?: boolean;
  /** Authentication method used */
  auth_method?: 'password' | 'oauth' | 'sso' | 'magic_link';
  /** Custom claims */
  custom?: Record<string, unknown>;
}

/**
 * Organization claim within JWT
 */
export interface OrgClaim {
  /** Organization name */
  name: string;
  /** User's role in this org */
  role: string;
  /** Permissions within this org */
  permissions: PermissionString[];
}

/**
 * Token pair (access + refresh)
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
 * JWT configuration options
 */
export interface JwtConfig {
  /** JWT secret (for HS256) or private key (for RS256/ES256) */
  secret: string;
  /** Algorithm to use */
  algorithm: 'HS256' | 'RS256' | 'ES256';
  /** Issuer claim */
  issuer: string;
  /** Default audience */
  audience: string[];
  /** Access token expiration (seconds) */
  accessTokenExpiry: number;
  /** Refresh token expiration (seconds) */
  refreshTokenExpiry: number;
}

/**
 * Default JWT configuration
 */
export const DEFAULT_JWT_CONFIG: JwtConfig = {
  secret: process.env['JWT_SECRET'] ?? 'development-secret-change-in-production',
  algorithm: 'HS256',
  issuer: 'relay-platform',
  audience: ['verity', 'noteman', 'shipcheck'],
  accessTokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 604800, // 7 days
};

/**
 * JWT service for token operations
 */
export class JwtService {
  private config: JwtConfig;
  private secretKey: Uint8Array;

  /**
   * Create a new JWT service instance
   */
  constructor(config: Partial<JwtConfig> = {}) {
    this.config = { ...DEFAULT_JWT_CONFIG, ...config };
    this.secretKey = new TextEncoder().encode(this.config.secret);
  }

  /**
   * Generate an access token
   */
  async generateAccessToken(claims: Omit<PlatformClaims, 'iss' | 'aud' | 'exp' | 'iat' | 'jti' | 'token_type'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const fullClaims: PlatformClaims = {
      ...claims,
      iss: this.config.issuer,
      aud: this.config.audience,
      iat: now,
      exp: now + this.config.accessTokenExpiry,
      jti: crypto.randomUUID(),
      token_type: 'access',
    };

    return new jose.SignJWT(fullClaims as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: this.config.algorithm })
      .sign(this.secretKey);
  }

  /**
   * Generate a refresh token
   */
  async generateRefreshToken(claims: Omit<PlatformClaims, 'iss' | 'aud' | 'exp' | 'iat' | 'jti' | 'token_type'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const fullClaims: PlatformClaims = {
      ...claims,
      iss: this.config.issuer,
      aud: this.config.audience,
      iat: now,
      exp: now + this.config.refreshTokenExpiry,
      jti: crypto.randomUUID(),
      token_type: 'refresh',
    };

    return new jose.SignJWT(fullClaims as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: this.config.algorithm })
      .sign(this.secretKey);
  }

  /**
   * Generate a token pair (access + refresh)
   */
  async generateTokenPair(claims: Omit<PlatformClaims, 'iss' | 'aud' | 'exp' | 'iat' | 'jti' | 'token_type'>): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(claims),
      this.generateRefreshToken(claims),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + this.config.accessTokenExpiry,
      tokenType: 'Bearer',
    };
  }

  /**
   * Verify and decode a token
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
        throw new JwtError('Token validation failed', 'VALIDATION_FAILED');
      }
      throw new JwtError('Invalid token', 'INVALID_TOKEN');
    }
  }

  /**
   * Decode a token without verification (for debugging)
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
   * Check if a token is expired
   */
  isTokenExpired(token: string): boolean {
    const claims = this.decodeToken(token);
    if (!claims) return true;
    return claims.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Check if claims are valid for a specific app
   */
  isValidForApp(claims: PlatformClaims, app: RelayApp): boolean {
    return claims.aud.includes(app.toLowerCase());
  }

  /**
   * Check if claims have a specific permission
   */
  hasPermission(claims: PlatformClaims, permission: PermissionString, app?: RelayApp): boolean {
    if (!claims.app_permissions) return false;

    if (app) {
      const appPerms = claims.app_permissions[app.toLowerCase()];
      return appPerms?.includes(permission) ?? false;
    }

    // Check all apps
    return Object.values(claims.app_permissions).some(perms => perms.includes(permission));
  }

  /**
   * Extract token from Authorization header
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}

/**
 * JWT-specific error
 */
export class JwtError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
  }
}

/**
 * Create a JWT service with environment configuration
 */
export function createJwtService(config?: Partial<JwtConfig>): JwtService {
  const envSecret = process.env['JWT_SECRET'];
  return new JwtService({
    ...(envSecret ? { secret: envSecret } : {}),
    ...config,
  });
}
