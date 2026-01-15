import { createLogger } from '@relay/logger';
import type { TrackerAuthConfig } from '@agentforge/tracker-common';
import type { WrikeOAuth2Config, WrikeOAuthTokens } from './types';

/**
 * @fileoverview Wrike OAuth 2.0 flow implementation.
 * Handles authorization, token exchange, and token refresh.
 * @packageDocumentation
 */

const logger = createLogger('wrike-oauth');

/**
 * OAuth state data stored during authorization.
 */
export interface WrikeOAuthState {
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
 * Wrike OAuth 2.0 flow manager.
 *
 * Note: Wrike access tokens have a long expiration (typically hours).
 * Refresh tokens should be used to maintain access.
 *
 * @example
 * ```typescript
 * const oauth = WrikeOAuthFlow.fromEnv(
 *   'https://app.example.com/api/integrations/wrike/callback'
 * );
 *
 * // Step 1: Generate authorization URL
 * const { url, state } = oauth.generateAuthUrl({
 *   organizationId: 'org-123',
 *   userId: 'user-456',
 * });
 *
 * // Redirect user to url
 *
 * // Step 2: In callback handler
 * const tokens = await oauth.exchangeCode(code);
 *
 * // Step 3: Refresh tokens when needed
 * const newTokens = await oauth.refreshTokens(tokens.refreshToken);
 *
 * // IMPORTANT: Store the host from tokens for API calls
 * const apiHost = tokens.host; // e.g., 'www.wrike.com' or 'app-eu.wrike.com'
 * ```
 */
export class WrikeOAuthFlow {
  private config: WrikeOAuth2Config;

  /** Wrike OAuth endpoints */
  private static readonly AUTHORIZATION_URL = 'https://login.wrike.com/oauth2/authorize/v4';
  private static readonly TOKEN_URL = 'https://login.wrike.com/oauth2/token';

  /** Default OAuth scopes */
  private static readonly DEFAULT_SCOPES = [
    'Default',
    'wsReadOnly',
    'wsReadWrite',
    'amReadOnlyWorkflow',
    'amReadWriteWorkflow',
  ];

  /**
   * Creates a new Wrike OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: WrikeOAuth2Config) {
    this.config = {
      ...config,
      scopes: config.scopes || WrikeOAuthFlow.DEFAULT_SCOPES,
    };
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
    stateData: WrikeOAuthState;
  } {
    const stateString = this.generateRandomString(32);

    const stateData: WrikeOAuthState = {
      organizationId: params.organizationId,
      userId: params.userId,
      state: stateString,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    // Encode state as base64url for transmission
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    const authUrl = new URL(WrikeOAuthFlow.AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', encodedState);

    // Add scopes
    if (this.config.scopes && this.config.scopes.length > 0) {
      authUrl.searchParams.set('scope', this.config.scopes.join(','));
    }

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
  ): WrikeOAuthState {
    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(receivedState, 'base64url').toString('utf-8')
      ) as WrikeOAuthState;

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
   * @returns OAuth tokens including API host
   */
  async exchangeCode(code: string): Promise<WrikeOAuthTokens> {
    const response = await fetch(WrikeOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
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
      host: data.host, // Important: API host varies by region
    };
  }

  /**
   * Refresh an access token.
   * @param refreshToken - Refresh token
   * @returns New OAuth tokens
   */
  async refreshTokens(refreshToken: string): Promise<WrikeOAuthTokens> {
    const response = await fetch(WrikeOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
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
      host: data.host,
    };
  }

  /**
   * Convert Wrike OAuth tokens to TrackerAuthConfig.
   * @param tokens - Wrike OAuth tokens
   * @returns TrackerAuthConfig
   */
  toTrackerAuthConfig(tokens: WrikeOAuthTokens): TrackerAuthConfig {
    return {
      type: 'oauth2',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    };
  }

  /**
   * Create a Wrike OAuth flow from environment variables.
   * @param redirectUri - OAuth redirect URI
   * @returns Wrike OAuth flow instance
   */
  static fromEnv(redirectUri: string): WrikeOAuthFlow {
    const clientId = process.env.WRIKE_CLIENT_ID;
    const clientSecret = process.env.WRIKE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'WRIKE_CLIENT_ID and WRIKE_CLIENT_SECRET environment variables are required'
      );
    }

    return new WrikeOAuthFlow({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
}

/**
 * Permanent access token authentication for Wrike.
 * For integrations that don't require OAuth.
 */
export class WrikePermanentToken {
  /**
   * Validate a permanent access token.
   * @param token - Permanent access token
   * @param host - API host (optional)
   * @returns True if token is valid
   */
  static async validate(token: string, host: string = 'www.wrike.com'): Promise<boolean> {
    try {
      const response = await fetch(`https://${host}/api/v4/contacts?me=true`, {
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
   * Get user info using a permanent access token.
   * @param token - Permanent access token
   * @param host - API host (optional)
   * @returns User info
   */
  static async getUserInfo(
    token: string,
    host: string = 'www.wrike.com'
  ): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  }> {
    const response = await fetch(`https://${host}/api/v4/contacts?me=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = await response.json();
    const user = data.data[0];

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.profiles?.[0]?.email,
    };
  }

  /**
   * Create TrackerAuthConfig from a permanent access token.
   * @param token - Permanent access token
   * @returns TrackerAuthConfig
   */
  static toTrackerAuthConfig(token: string): TrackerAuthConfig {
    return {
      type: 'bearer',
      accessToken: token,
    };
  }
}
