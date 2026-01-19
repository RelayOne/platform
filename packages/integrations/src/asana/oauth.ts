import { createLogger } from '@relay/logger';
import type { TrackerAuthConfig } from '../tracker-base';
import type { AsanaOAuth2Config, AsanaOAuthTokens } from './types';

/**
 * @fileoverview Asana OAuth 2.0 flow implementation.
 * Handles authorization, token exchange, and token refresh.
 * @packageDocumentation
 */

const logger = createLogger('asana-oauth');

/**
 * OAuth state data stored during authorization.
 */
export interface AsanaOAuthState {
  /** Organization ID in AgentForge */
  organizationId: string;
  /** User ID initiating the connection */
  userId: string;
  /** Random state string for CSRF protection */
  state: string;
  /** Timestamp when state was created */
  createdAt: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Asana OAuth 2.0 flow manager.
 * Implements the standard OAuth 2.0 authorization code flow for Asana.
 *
 * @example
 * ```typescript
 * const oauth = AsanaOAuthFlow.fromEnv(
 *   'https://app.example.com/api/integrations/asana/callback'
 * );
 *
 * // Step 1: Generate authorization URL
 * const { url, state } = oauth.generateAuthUrl({
 *   organizationId: 'org-123',
 *   userId: 'user-456',
 * });
 *
 * // Store state in session/database
 * // Redirect user to url
 *
 * // Step 2: In callback handler
 * oauth.validateState(storedState, receivedState);
 * const tokens = await oauth.exchangeCode(code);
 *
 * // Step 3: Refresh tokens when needed (tokens expire in 1 hour)
 * const newTokens = await oauth.refreshTokens(tokens.refreshToken);
 * ```
 */
export class AsanaOAuthFlow {
  private config: AsanaOAuth2Config;

  /** Asana OAuth endpoints */
  private static readonly AUTHORIZATION_URL = 'https://app.asana.com/-/oauth_authorize';
  private static readonly TOKEN_URL = 'https://app.asana.com/-/oauth_token';
  private static readonly REVOKE_URL = 'https://app.asana.com/-/oauth_revoke';
  private static readonly USER_INFO_URL = 'https://app.asana.com/api/1.0/users/me';

  /**
   * Creates a new Asana OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: AsanaOAuth2Config) {
    this.config = config;
  }

  /**
   * Generate a cryptographically secure random string.
   * @param length - Length of the random string
   * @returns Random string
   */
  private generateRandomString(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (v) => chars[v % chars.length]).join('');
  }

  /**
   * Generate an authorization URL.
   * @param params - Authorization parameters
   * @returns Authorization URL and state
   */
  generateAuthUrl(params: {
    organizationId: string;
    userId: string;
    metadata?: Record<string, unknown>;
  }): {
    url: string;
    state: string;
    stateData: AsanaOAuthState;
  } {
    const stateString = this.generateRandomString(32);

    const stateData: AsanaOAuthState = {
      organizationId: params.organizationId,
      userId: params.userId,
      state: stateString,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    // Encode state as base64url for transmission
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    const authUrl = new URL(AsanaOAuthFlow.AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', encodedState);

    return {
      url: authUrl.toString(),
      state: encodedState,
      stateData,
    };
  }

  /**
   * Validate and decode a state parameter.
   * @param storedState - State stored in session
   * @param receivedState - State received in callback
   * @param maxAgeMs - Maximum age of state in milliseconds (default: 10 minutes)
   * @returns Decoded state data
   */
  validateState(
    storedState: string,
    receivedState: string,
    maxAgeMs: number = 600000
  ): AsanaOAuthState {
    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(receivedState, 'base64url').toString('utf-8')
      ) as AsanaOAuthState;

      if (Date.now() - decoded.createdAt > maxAgeMs) {
        throw new Error('OAuth state expired');
      }

      return decoded;
    } catch (error) {
      if (error instanceof Error && error.message.includes('OAuth')) {
        throw error;
      }
      throw new Error('Invalid OAuth state');
    }
  }

  /**
   * Exchange an authorization code for tokens.
   * @param code - Authorization code from callback
   * @returns OAuth tokens
   */
  async exchangeCode(code: string): Promise<AsanaOAuthTokens> {
    const response = await fetch(AsanaOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Token exchange failed', {
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      data: data.data,
    };
  }

  /**
   * Refresh an access token.
   * @param refreshToken - Refresh token
   * @returns New OAuth tokens
   */
  async refreshTokens(refreshToken: string): Promise<AsanaOAuthTokens> {
    const response = await fetch(AsanaOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Token refresh failed', {
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      data: data.data,
    };
  }

  /**
   * Revoke an access token.
   * @param accessToken - Access token to revoke
   */
  async revokeToken(accessToken: string): Promise<void> {
    const response = await fetch(AsanaOAuthFlow.REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        token: accessToken,
      }),
    });

    if (!response.ok) {
      logger.warn('Token revocation failed', { status: response.status });
    }
  }

  /**
   * Get user info using an access token.
   * @param accessToken - Access token
   * @returns User info
   */
  async getUserInfo(accessToken: string): Promise<{
    gid: string;
    name: string;
    email: string;
    workspaces: Array<{ gid: string; name: string }>;
  }> {
    const response = await fetch(
      `${AsanaOAuthFlow.USER_INFO_URL}?opt_fields=gid,name,email,workspaces,workspaces.name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Convert Asana OAuth tokens to TrackerAuthConfig.
   * @param tokens - Asana OAuth tokens
   * @returns TrackerAuthConfig
   */
  toTrackerAuthConfig(tokens: AsanaOAuthTokens): TrackerAuthConfig {
    return {
      type: 'oauth2',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    };
  }

  /**
   * Create an Asana OAuth flow from environment variables.
   * @param redirectUri - OAuth redirect URI
   * @returns Asana OAuth flow instance
   */
  static fromEnv(redirectUri: string): AsanaOAuthFlow {
    const clientId = process.env.ASANA_CLIENT_ID;
    const clientSecret = process.env.ASANA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'ASANA_CLIENT_ID and ASANA_CLIENT_SECRET environment variables are required'
      );
    }

    return new AsanaOAuthFlow({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
}

/**
 * Personal Access Token authentication for Asana.
 * For simpler integrations or personal use, Asana supports personal access tokens.
 */
export class AsanaPersonalAccessToken {
  /**
   * Validate a personal access token.
   * @param token - Personal access token
   * @returns True if token is valid
   */
  static async validate(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://app.asana.com/api/1.0/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get user info using a personal access token.
   * @param token - Personal access token
   * @returns User info
   */
  static async getUserInfo(token: string): Promise<{
    gid: string;
    name: string;
    email: string;
    workspaces: Array<{ gid: string; name: string }>;
  }> {
    const response = await fetch(
      'https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email,workspaces,workspaces.name',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * Create TrackerAuthConfig from a personal access token.
   * @param token - Personal access token
   * @returns TrackerAuthConfig
   */
  static toTrackerAuthConfig(token: string): TrackerAuthConfig {
    return {
      type: 'personal_token',
      accessToken: token,
    };
  }
}
