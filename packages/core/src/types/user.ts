/**
 * @fileoverview User-related types for the Relay Platform
 * @module @relay/platform/types/user
 */

/**
 * User roles within an organization
 */
export enum UserRole {
  /** Full platform administrator */
  SUPER_ADMIN = 'super_admin',
  /** Organization administrator */
  ADMIN = 'admin',
  /** Organization member with full access */
  MEMBER = 'member',
  /** Limited access viewer */
  VIEWER = 'viewer',
  /** External guest with minimal access */
  GUEST = 'guest',
}

/**
 * User account status
 */
export enum UserStatus {
  /** Account is active and usable */
  ACTIVE = 'active',
  /** Account pending email verification */
  PENDING = 'pending',
  /** Account suspended by admin */
  SUSPENDED = 'suspended',
  /** Account deactivated by user */
  DEACTIVATED = 'deactivated',
}

/**
 * Supported OAuth providers
 */
export enum OAuthProvider {
  GOOGLE = 'google',
  GITHUB = 'github',
  MICROSOFT = 'microsoft',
  APPLE = 'apple',
  SLACK = 'slack',
  /** Enterprise SAML SSO */
  SAML = 'saml',
  /** Enterprise OIDC SSO */
  OIDC = 'oidc',
}

/**
 * Two-factor authentication method
 */
export enum TwoFactorMethod {
  /** Time-based One-Time Password */
  TOTP = 'totp',
  /** SMS verification code */
  SMS = 'sms',
  /** Email verification code */
  EMAIL = 'email',
  /** Hardware security key (WebAuthn) */
  WEBAUTHN = 'webauthn',
}

/**
 * User environment access flags
 */
export interface EnvironmentAccess {
  /** Access to development environment */
  developer: boolean;
  /** Access to staging environment */
  staging: boolean;
  /** Access to beta environment (default true) */
  beta: boolean;
}

/**
 * OAuth account link
 */
export interface OAuthLink {
  /** OAuth provider */
  provider: OAuthProvider;
  /** Provider-specific user ID */
  providerId: string;
  /** Provider email (may differ from primary) */
  email?: string;
  /** Link creation timestamp */
  linkedAt: Date;
}

/**
 * Two-factor authentication configuration
 */
export interface TwoFactorConfig {
  /** Whether 2FA is enabled */
  enabled: boolean;
  /** Active 2FA method */
  method: TwoFactorMethod;
  /** TOTP secret (encrypted) */
  secret?: string;
  /** Backup recovery codes (hashed) */
  backupCodes?: string[];
  /** Phone number for SMS */
  phone?: string;
  /** Last verification timestamp */
  lastVerifiedAt?: Date;
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  /** Email notification settings */
  email: {
    enabled: boolean;
    digest: 'immediate' | 'daily' | 'weekly' | 'none';
    categories: string[];
  };
  /** Push notification settings */
  push: {
    enabled: boolean;
    categories: string[];
  };
  /** In-app notification settings */
  inApp: {
    enabled: boolean;
    sound: boolean;
  };
  /** Quiet hours (no notifications) */
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm
    end: string; // HH:mm
    timezone: string;
  };
}

/**
 * Base user interface for the Relay Platform
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** Primary email address */
  email: string;
  /** Whether email is verified */
  emailVerified: boolean;
  /** Display name */
  name: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Profile avatar URL */
  avatarUrl?: string;
  /** Account status */
  status: UserStatus;
  /** Global role (platform-level) */
  role: UserRole;
  /** Linked OAuth accounts */
  oauthLinks: OAuthLink[];
  /** Two-factor authentication config */
  twoFactor?: TwoFactorConfig;
  /** Notification preferences */
  notificationPreferences?: NotificationPreferences;
  /** Environment access flags */
  environmentAccess: EnvironmentAccess;
  /** Platform user ID (for cross-app SSO) */
  platformUserId?: string;
  /** When linked to platform SSO */
  platformLinkedAt?: Date;
  /** Account creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Last login timestamp */
  lastLoginAt?: Date;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * User creation input
 */
export interface CreateUserInput {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  oauthProvider?: OAuthProvider;
  oauthProviderId?: string;
  role?: UserRole;
  metadata?: Record<string, unknown>;
}

/**
 * User update input
 */
export interface UpdateUserInput {
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  notificationPreferences?: Partial<NotificationPreferences>;
  metadata?: Record<string, unknown>;
}

/**
 * Check if user has admin privileges
 */
export function isAdmin(user: User): boolean {
  return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
}

/**
 * Check if user has platform-level SSO linked
 */
export function isPlatformLinked(user: User): boolean {
  return !!user.platformUserId && !!user.platformLinkedAt;
}

/**
 * Check if user has 2FA enabled
 */
export function has2FAEnabled(user: User): boolean {
  return !!user.twoFactor?.enabled;
}
