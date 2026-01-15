import { createLogger } from '@relay/logger';
import type { TrackerAuthConfig } from '@agentforge/tracker-common';
import type { ClickUpOAuth2Config, ClickUpOAuthTokens } from './types';

/**
 * @fileoverview ClickUp OAuth 2.0 flow implementation.
 * Handles authorization and token exchange.
 *
 * Note: ClickUp OAuth tokens do not expire and do not have refresh tokens.
 * Tokens remain valid until the user revokes access.
 *
 * @packageDocumentation
 */

const logger = createLogger('clickup-oauth');

/**
 * OAuth state data stored during authorization.
 */
export interface ClickUpOAuthState {
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
 * ClickUp OAuth 2.0 flow manager.
 *
 * ClickUp OAuth tokens are long-lived and do not expire.
 * No refresh token flow is needed.
 *
 * @example
 * ```typescript
 * const oauth = ClickUpOAuthFlow.fromEnv(
 *   'https://app.example.com/api/integrations/clickup/callback'
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
 * // Tokens don't expire - store and use indefinitely
 * ```
 */
export class ClickUpOAuthFlow {
  private config: ClickUpOAuth2Config;

  /** ClickUp OAuth endpoints */
  private static readonly AUTHORIZATION_URL = 'https://app.clickup.com/api';
  private static readonly TOKEN_URL = 'https://api.clickup.com/api/v2/oauth/token';

  /**
   * Creates a new ClickUp OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: ClickUpOAuth2Config) {
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
    stateData: ClickUpOAuthState;
  } {
    const stateString = this.generateRandomString(32);

    const stateData: ClickUpOAuthState = {
      organizationId: params.organizationId,
      userId: params.userId,
      state: stateString,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    // Encode state as base64url for transmission
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    const authUrl = new URL(ClickUpOAuthFlow.AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
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
  ): ClickUpOAuthState {
    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(receivedState, 'base64url').toString('utf-8')
      ) as ClickUpOAuthState;

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
  async exchangeCode(code: string): Promise<ClickUpOAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
    });

    const response = await fetch(`${ClickUpOAuthFlow.TOKEN_URL}?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      tokenType: data.token_type || 'Bearer',
    };
  }

  /**
   * Get user info using an access token.
   * @param accessToken - Access token
   * @returns User info
   */
  async getUserInfo(accessToken: string): Promise<{
    user: {
      id: number;
      username: string;
      email: string;
      color: string;
      profilePicture: string | null;
    };
  }> {
    const response = await fetch('https://api.clickup.com/api/v2/user', {
      headers: {
        Authorization: accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get teams (workspaces) the user has access to.
   * @param accessToken - Access token
   * @returns List of teams
   */
  async getTeams(accessToken: string): Promise<{
    teams: Array<{
      id: string;
      name: string;
      color: string;
      avatar: string | null;
    }>;
  }> {
    const response = await fetch('https://api.clickup.com/api/v2/team', {
      headers: {
        Authorization: accessToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get teams: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Convert ClickUp OAuth tokens to TrackerAuthConfig.
   *
   * Note: ClickUp tokens don't expire.
   *
   * @param tokens - ClickUp OAuth tokens
   * @returns TrackerAuthConfig
   */
  toTrackerAuthConfig(tokens: ClickUpOAuthTokens): TrackerAuthConfig {
    return {
      type: 'oauth2',
      accessToken: tokens.accessToken,
      // ClickUp tokens don't expire
      expiresAt: undefined,
    };
  }

  /**
   * Create a ClickUp OAuth flow from environment variables.
   * @param redirectUri - OAuth redirect URI
   * @returns ClickUp OAuth flow instance
   */
  static fromEnv(redirectUri: string): ClickUpOAuthFlow {
    const clientId = process.env.CLICKUP_CLIENT_ID;
    const clientSecret = process.env.CLICKUP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'CLICKUP_CLIENT_ID and CLICKUP_CLIENT_SECRET environment variables are required'
      );
    }

    return new ClickUpOAuthFlow({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
}

/**
 * Personal API Token authentication for ClickUp.
 * For personal use or simpler integrations.
 */
export class ClickUpPersonalToken {
  /**
   * Validate a personal API token.
   * @param token - Personal API token
   * @returns True if token is valid
   */
  static async validate(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.clickup.com/api/v2/user', {
        headers: {
          Authorization: token,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get user info using a personal API token.
   * @param token - Personal API token
   * @returns User info
   */
  static async getUserInfo(token: string): Promise<{
    user: {
      id: number;
      username: string;
      email: string;
      color: string;
      profilePicture: string | null;
    };
  }> {
    const response = await fetch('https://api.clickup.com/api/v2/user', {
      headers: {
        Authorization: token,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create TrackerAuthConfig from a personal API token.
   * @param token - Personal API token
   * @returns TrackerAuthConfig
   */
  static toTrackerAuthConfig(token: string): TrackerAuthConfig {
    return {
      type: 'api_key',
      accessToken: token,
    };
  }
}
