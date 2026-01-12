/**
 * @fileoverview Session management utilities for the Relay Platform
 * @module @relay/platform/auth/session
 */

import type { RelayApp } from '../types/rbac';
import type { PlatformClaims } from './jwt';

/**
 * Session status
 */
export enum SessionStatus {
  /** Session is active and valid */
  ACTIVE = 'active',
  /** Session has expired */
  EXPIRED = 'expired',
  /** Session was revoked */
  REVOKED = 'revoked',
  /** Session requires re-authentication */
  REQUIRES_REAUTH = 'requires_reauth',
}

/**
 * Session device information
 */
export interface SessionDevice {
  /** Device identifier */
  deviceId: string;
  /** Device type */
  type: 'web' | 'mobile' | 'desktop' | 'api';
  /** User agent string */
  userAgent?: string;
  /** IP address */
  ipAddress?: string;
  /** Operating system */
  os?: string;
  /** Browser/client name */
  browser?: string;
  /** Last seen location (city, country) */
  location?: string;
}

/**
 * Platform session
 */
export interface PlatformSession {
  /** Session ID */
  id: string;
  /** User ID */
  userId: string;
  /** Organization ID */
  organizationId?: string;
  /** Session status */
  status: SessionStatus;
  /** Active apps in this session */
  activeApps: RelayApp[];
  /** Device information */
  device: SessionDevice;
  /** Authentication method used */
  authMethod: 'password' | 'oauth' | 'sso' | 'magic_link';
  /** Whether MFA was completed */
  mfaCompleted: boolean;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
  /** Session expiration time */
  expiresAt: Date;
  /** Access token (hashed) */
  accessTokenHash?: string;
  /** Refresh token (hashed) */
  refreshTokenHash?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  userId: string;
  organizationId?: string;
  device: SessionDevice;
  authMethod: 'password' | 'oauth' | 'sso' | 'magic_link';
  mfaCompleted?: boolean;
  expiresIn?: number; // seconds
  apps?: RelayApp[];
  metadata?: Record<string, unknown>;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  /** Whether session is valid */
  valid: boolean;
  /** Session data if valid */
  session?: PlatformSession;
  /** Error code if invalid */
  errorCode?: 'EXPIRED' | 'REVOKED' | 'NOT_FOUND' | 'INVALID';
  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Create a new session object (not persisted)
 */
export function createSession(options: CreateSessionOptions): PlatformSession {
  const now = new Date();
  const expiresIn = options.expiresIn ?? 86400; // Default 24 hours

  return {
    id: crypto.randomUUID(),
    userId: options.userId,
    organizationId: options.organizationId,
    status: SessionStatus.ACTIVE,
    activeApps: options.apps ?? [],
    device: options.device,
    authMethod: options.authMethod,
    mfaCompleted: options.mfaCompleted ?? false,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    metadata: options.metadata,
  };
}

/**
 * Check if session is expired
 */
export function isSessionExpired(session: PlatformSession): boolean {
  return session.expiresAt < new Date();
}

/**
 * Check if session is valid
 */
export function isSessionValid(session: PlatformSession): SessionValidationResult {
  if (session.status === SessionStatus.REVOKED) {
    return {
      valid: false,
      errorCode: 'REVOKED',
      errorMessage: 'Session has been revoked',
    };
  }

  if (session.status === SessionStatus.EXPIRED || isSessionExpired(session)) {
    return {
      valid: false,
      errorCode: 'EXPIRED',
      errorMessage: 'Session has expired',
    };
  }

  return {
    valid: true,
    session,
  };
}

/**
 * Extend session expiration
 */
export function extendSession(session: PlatformSession, additionalSeconds: number): PlatformSession {
  return {
    ...session,
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + additionalSeconds * 1000),
  };
}

/**
 * Add an app to the session's active apps
 */
export function addAppToSession(session: PlatformSession, app: RelayApp): PlatformSession {
  if (session.activeApps.includes(app)) {
    return session;
  }
  return {
    ...session,
    activeApps: [...session.activeApps, app],
    lastActivityAt: new Date(),
  };
}

/**
 * Mark session as revoked
 */
export function revokeSession(session: PlatformSession): PlatformSession {
  return {
    ...session,
    status: SessionStatus.REVOKED,
  };
}

/**
 * Extract session info from JWT claims
 */
export function sessionFromClaims(claims: PlatformClaims): Partial<PlatformSession> {
  return {
    id: claims.session_id,
    userId: claims.sub,
    organizationId: claims.org_id,
    mfaCompleted: claims.mfa_verified ?? false,
    authMethod: claims.auth_method,
    activeApps: claims.aud.map(a => a.toUpperCase() as RelayApp),
    expiresAt: new Date(claims.exp * 1000),
  };
}

/**
 * Hash a token for secure storage
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse device info from user agent
 */
export function parseDeviceInfo(userAgent: string, ipAddress?: string): SessionDevice {
  // Basic UA parsing - in production, use a proper UA parser library
  let type: SessionDevice['type'] = 'web';
  let os: string | undefined;
  let browser: string | undefined;

  const ua = userAgent.toLowerCase();

  // Detect device type
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    type = 'mobile';
  } else if (ua.includes('electron') || ua.includes('tauri')) {
    type = 'desktop';
  }

  // Detect OS
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  // Detect browser
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';

  return {
    deviceId: crypto.randomUUID(),
    type,
    userAgent,
    ipAddress,
    os,
    browser,
  };
}
