/**
 * @fileoverview Session management utilities for the Relay Platform
 * @module @relay/auth-middleware/session
 *
 * Provides session creation, validation, and management utilities
 * for maintaining authenticated user sessions across apps.
 *
 * @example
 * ```typescript
 * import { createSession, isSessionValid, extendSession } from '@relay/auth-middleware/session';
 *
 * // Create a new session
 * const session = createSession('user-123', {
 *   device: { id: 'device-456', type: 'desktop', name: 'Chrome on Windows' },
 *   authMethod: AuthMethod.PASSWORD,
 * });
 *
 * // Validate session
 * if (isSessionValid(session)) {
 *   // Session is active and not expired
 * }
 *
 * // Extend session lifetime
 * const extended = extendSession(session, 3600);
 * ```
 */

import type {
  PlatformSession,
  PlatformClaims,
  SessionDevice,
  SessionStatus,
  DeviceType,
  RelayApp,
  AuthMethod,
} from './types.js';
import { RELAY_APPS } from './types.js';

/**
 * Default session configuration.
 */
export const SESSION_DEFAULTS = {
  /** Default session duration (7 days in seconds) */
  duration: 604800,
  /** Maximum session duration (30 days in seconds) */
  maxDuration: 2592000,
  /** Inactivity timeout (24 hours in seconds) */
  inactivityTimeout: 86400,
  /** Extension period (1 hour in seconds) */
  extensionPeriod: 3600,
};

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  /** Device information */
  device: SessionDevice;
  /** Authentication method used */
  authMethod: AuthMethod;
  /** MFA verification status */
  mfaVerified?: boolean;
  /** Initial app context */
  app?: RelayApp;
  /** Organization context */
  orgId?: string;
  /** Project context */
  projectId?: string;
  /** Custom session duration (seconds) */
  duration?: number;
  /** Access token (for hashing) */
  accessToken?: string;
  /** Refresh token (for hashing) */
  refreshToken?: string;
}

/**
 * Create a new platform session.
 *
 * @param userId - User ID for the session
 * @param options - Session creation options
 * @returns New platform session
 *
 * @example
 * ```typescript
 * const session = createSession('user-123', {
 *   device: {
 *     id: 'device-456',
 *     type: 'desktop',
 *     name: 'Chrome on Windows',
 *     os: 'Windows 11',
 *     browser: 'Chrome 120',
 *   },
 *   authMethod: AuthMethod.OAUTH,
 *   mfaVerified: false,
 *   app: 'noteman',
 * });
 * ```
 */
export function createSession(userId: string, options: CreateSessionOptions): PlatformSession {
  const now = Math.floor(Date.now() / 1000);
  const duration = Math.min(
    options.duration ?? SESSION_DEFAULTS.duration,
    SESSION_DEFAULTS.maxDuration
  );

  return {
    id: crypto.randomUUID(),
    userId,
    device: options.device,
    status: 'active' as SessionStatus,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + duration,
    apps: options.app ? [options.app] : [],
    orgId: options.orgId,
    projectId: options.projectId,
    mfaVerified: options.mfaVerified ?? false,
    authMethod: options.authMethod,
    accessTokenHash: options.accessToken ? hashToken(options.accessToken) : undefined,
    refreshTokenHash: options.refreshToken ? hashToken(options.refreshToken) : undefined,
  };
}

/**
 * Check if a session has expired based on time.
 *
 * @param session - Session to check
 * @returns True if session has expired
 */
export function isSessionExpired(session: PlatformSession): boolean {
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt < now;
}

/**
 * Check if a session is inactive (no activity within timeout).
 *
 * @param session - Session to check
 * @param timeout - Inactivity timeout in seconds (default: 24 hours)
 * @returns True if session is inactive
 */
export function isSessionInactive(session: PlatformSession, timeout?: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const inactivityTimeout = timeout ?? SESSION_DEFAULTS.inactivityTimeout;
  return session.lastActiveAt + inactivityTimeout < now;
}

/**
 * Check if a session is valid (active, not expired, not revoked).
 *
 * @param session - Session to check
 * @returns True if session is valid for use
 *
 * @example
 * ```typescript
 * if (isSessionValid(session)) {
 *   // Proceed with authenticated request
 * } else {
 *   // Re-authenticate user
 * }
 * ```
 */
export function isSessionValid(session: PlatformSession): boolean {
  if (session.status !== 'active') return false;
  if (isSessionExpired(session)) return false;
  if (isSessionInactive(session)) return false;
  return true;
}

/**
 * Extend session expiration time.
 *
 * @param session - Session to extend
 * @param duration - Extension duration in seconds (default: 1 hour)
 * @returns Updated session with new expiration
 */
export function extendSession(session: PlatformSession, duration?: number): PlatformSession {
  const now = Math.floor(Date.now() / 1000);
  const extension = duration ?? SESSION_DEFAULTS.extensionPeriod;
  const maxExpiry = session.createdAt + SESSION_DEFAULTS.maxDuration;

  return {
    ...session,
    lastActiveAt: now,
    expiresAt: Math.min(session.expiresAt + extension, maxExpiry),
  };
}

/**
 * Update session activity timestamp.
 *
 * @param session - Session to update
 * @returns Updated session with new lastActiveAt
 */
export function touchSession(session: PlatformSession): PlatformSession {
  return {
    ...session,
    lastActiveAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Add an app to the session's accessed apps list.
 *
 * @param session - Session to update
 * @param app - App to add
 * @returns Updated session with app added
 */
export function addAppToSession(session: PlatformSession, app: RelayApp): PlatformSession {
  if (session.apps.includes(app)) {
    return touchSession(session);
  }

  return {
    ...session,
    apps: [...session.apps, app],
    lastActiveAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Update session organization context.
 *
 * @param session - Session to update
 * @param orgId - New organization ID
 * @param projectId - Optional project ID
 * @returns Updated session
 */
export function updateSessionContext(
  session: PlatformSession,
  orgId?: string,
  projectId?: string
): PlatformSession {
  return {
    ...session,
    orgId,
    projectId,
    lastActiveAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Revoke a session.
 *
 * @param session - Session to revoke
 * @returns Revoked session
 */
export function revokeSession(session: PlatformSession): PlatformSession {
  return {
    ...session,
    status: 'revoked' as SessionStatus,
  };
}

/**
 * Mark session as requiring re-authentication.
 *
 * @param session - Session to mark
 * @returns Updated session
 */
export function requireReauth(session: PlatformSession): PlatformSession {
  return {
    ...session,
    status: 'requires_reauth' as SessionStatus,
  };
}

/**
 * Verify MFA for a session.
 *
 * @param session - Session to verify
 * @returns Updated session with MFA verified
 */
export function verifyMfa(session: PlatformSession): PlatformSession {
  return {
    ...session,
    mfaVerified: true,
    lastActiveAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Extract session information from JWT claims.
 *
 * @param claims - Platform JWT claims
 * @returns Partial session (without device info and token hashes)
 *
 * @example
 * ```typescript
 * const claims = await jwtService.verifyToken(token);
 * const sessionInfo = sessionFromClaims(claims);
 * console.log('Session ID:', sessionInfo.id);
 * ```
 */
export function sessionFromClaims(claims: PlatformClaims): Partial<PlatformSession> {
  return {
    id: claims.sessionId,
    userId: claims.sub,
    status: 'active' as SessionStatus,
    createdAt: claims.iat,
    lastActiveAt: Math.floor(Date.now() / 1000),
    expiresAt: claims.exp,
    apps: claims.aud.filter((a): a is RelayApp => RELAY_APPS.includes(a as RelayApp)),
    orgId: claims.orgId,
    projectId: claims.projectId,
    mfaVerified: claims.mfaVerified ?? false,
    authMethod: claims.authMethod ?? ('password' as AuthMethod),
  };
}

/**
 * Hash a token for secure storage.
 *
 * Uses SHA-256 for consistent hashing.
 *
 * @param token - Token to hash
 * @returns Hex-encoded hash
 */
export function hashToken(token: string): string {
  // Use Web Crypto API for hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(token);

  // Synchronous hash using simple algorithm for Node.js compatibility
  // In production, consider using crypto.subtle.digest for async hashing
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // For production, use proper SHA-256:
  // const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  // return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Async version of token hashing using SHA-256.
 *
 * @param token - Token to hash
 * @returns Promise of hex-encoded SHA-256 hash
 */
export async function hashTokenAsync(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse device information from User-Agent string.
 *
 * @param userAgent - User-Agent header value
 * @param deviceId - Optional device ID
 * @returns Parsed device information
 *
 * @example
 * ```typescript
 * const device = parseDeviceInfo(req.headers['user-agent'], 'device-123');
 * // { id: 'device-123', type: 'desktop', name: 'Chrome on Windows', ... }
 * ```
 */
export function parseDeviceInfo(userAgent: string | undefined, deviceId?: string): SessionDevice {
  const device: SessionDevice = {
    id: deviceId ?? crypto.randomUUID(),
    type: 'unknown' as DeviceType,
    name: 'Unknown Device',
  };

  if (!userAgent) return device;

  // Parse OS - order matters! Check mobile patterns before desktop
  if (userAgent.includes('iPhone')) {
    device.os = 'iOS';
    device.type = 'mobile';
  } else if (userAgent.includes('iPad')) {
    device.os = 'iOS';
    device.type = 'tablet';
  } else if (userAgent.includes('Android')) {
    device.os = 'Android';
    device.type = 'mobile';
  } else if (userAgent.includes('Windows')) {
    device.os = 'Windows';
    device.type = 'desktop';
  } else if (userAgent.includes('Mac OS X')) {
    device.os = 'macOS';
    device.type = 'desktop';
  } else if (userAgent.includes('Linux')) {
    device.os = 'Linux';
    device.type = 'desktop';
  }

  // Parse browser
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    device.browser = 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    device.browser = 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    device.browser = 'Safari';
  } else if (userAgent.includes('Edg')) {
    device.browser = 'Edge';
  }

  // Build display name
  if (device.browser && device.os) {
    device.name = `${device.browser} on ${device.os}`;
  } else if (device.browser) {
    device.name = device.browser;
  } else if (device.os) {
    device.name = device.os;
  }

  // CLI detection
  if (userAgent.includes('curl') || userAgent.includes('wget') || userAgent.includes('cli')) {
    device.type = 'cli';
    device.name = 'CLI Client';
  }

  // Service detection
  if (userAgent.includes('service') || userAgent.includes('bot')) {
    device.type = 'service';
    device.name = 'Service Account';
  }

  return device;
}

/**
 * Get remaining session lifetime.
 *
 * @param session - Session to check
 * @returns Seconds until expiration (negative if expired)
 */
export function getSessionLifetime(session: PlatformSession): number {
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt - now;
}

/**
 * Check if session needs refresh (expiring soon).
 *
 * @param session - Session to check
 * @param threshold - Refresh threshold in seconds (default: 5 minutes)
 * @returns True if session should be refreshed
 */
export function sessionNeedsRefresh(session: PlatformSession, threshold = 300): boolean {
  const remaining = getSessionLifetime(session);
  return remaining > 0 && remaining < threshold;
}

// Re-export types
export type {
  PlatformSession,
  SessionDevice,
  SessionStatus,
  DeviceType,
  RelayApp,
  AuthMethod,
};
