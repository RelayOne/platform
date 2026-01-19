/**
 * @fileoverview Integration exports for @relay/platform
 * @module @relay/platform/integrations
 *
 * This module provides shared integration utilities and types
 * for third-party services used across the Relay Platform.
 */

import { createHmac, createHash, randomBytes } from 'crypto';

/**
 * Supported integration providers
 */
export enum IntegrationProvider {
  // Git providers
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  AZURE_DEVOPS = 'azure_devops',

  // Communication
  SLACK = 'slack',
  DISCORD = 'discord',
  TEAMS = 'teams',

  // Project management
  JIRA = 'jira',
  LINEAR = 'linear',
  ASANA = 'asana',
  NOTION = 'notion',

  // Storage
  GOOGLE_DRIVE = 'google_drive',
  DROPBOX = 'dropbox',
  ONEDRIVE = 'onedrive',

  // Calendar
  GOOGLE_CALENDAR = 'google_calendar',
  OUTLOOK_CALENDAR = 'outlook_calendar',

  // Custom
  WEBHOOK = 'webhook',
}

/**
 * Integration status
 */
export enum IntegrationStatus {
  /** Integration is active and working */
  ACTIVE = 'active',
  /** Integration is pending setup */
  PENDING = 'pending',
  /** Integration has an error */
  ERROR = 'error',
  /** Integration is disabled */
  DISABLED = 'disabled',
  /** Integration is disconnected */
  DISCONNECTED = 'disconnected',
}

/**
 * OAuth token storage
 */
export interface OAuthTokens {
  /** Access token */
  accessToken: string;
  /** Refresh token (if available) */
  refreshToken?: string;
  /** Token expiration timestamp */
  expiresAt?: Date;
  /** Token type (usually "Bearer") */
  tokenType: string;
  /** OAuth scopes */
  scopes?: string[];
}

/**
 * Integration configuration
 */
export interface IntegrationConfig {
  /** Integration ID */
  id: string;
  /** Organization ID */
  organizationId: string;
  /** Integration provider */
  provider: IntegrationProvider;
  /** Integration status */
  status: IntegrationStatus;
  /** OAuth tokens (encrypted) */
  tokens?: OAuthTokens;
  /** Provider-specific settings */
  settings: Record<string, unknown>;
  /** Enabled notification types */
  notifications?: string[];
  /** Last sync timestamp */
  lastSyncAt?: Date;
  /** Error message if status is ERROR */
  errorMessage?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Webhook signature verification options
 */
export interface WebhookVerificationOptions {
  /** Header name containing the signature */
  signatureHeader: string;
  /** Secret key for verification */
  secret: string;
  /** Hash algorithm */
  algorithm: 'sha1' | 'sha256';
  /** Signature prefix (e.g., "sha256=") */
  prefix?: string;
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  options: WebhookVerificationOptions,
): boolean {
  const hmac = createHmac(options.algorithm, options.secret);
  hmac.update(payload);
  const expected = options.prefix
    ? `${options.prefix}${hmac.digest('hex')}`
    : hmac.digest('hex');

  // Timing-safe comparison
  if (expected.length !== signature.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Common webhook payload structure
 */
export interface WebhookPayload {
  /** Event type */
  event: string;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Source integration */
  source: IntegrationProvider;
}

/**
 * OAuth configuration for an integration
 */
export interface OAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Authorization URL */
  authorizationUrl: string;
  /** Token URL */
  tokenUrl: string;
  /** Redirect URI */
  redirectUri: string;
  /** Required scopes */
  scopes: string[];
  /** Use PKCE */
  usePkce?: boolean;
}

/**
 * Build OAuth authorization URL
 */
export function buildAuthorizationUrl(config: OAuthConfig, state: string, codeVerifier?: string): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);

  if (config.usePkce && codeVerifier) {
    // Generate code challenge from verifier
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  return url.toString();
}

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}
