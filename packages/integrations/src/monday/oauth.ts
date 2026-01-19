import { createLogger } from '@relay/logger';
import type { TrackerAuthConfig } from '../tracker-base';
import type { MondayOAuth2Config, MondayOAuthTokens } from './types';

/**
 * @fileoverview Monday.com OAuth 2.0 flow implementation.
 * Handles authorization, token exchange, and token refresh.
 *
 * IMPORTANT: Monday.com tokens expire in 5 minutes! You must implement
 * proactive token refresh to maintain access.
 *
 * @packageDocumentation
 */

const logger = createLogger('monday-oauth');

/**
 * OAuth state data stored during authorization.
 */
export interface MondayOAuthState {
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
 * Monday.com OAuth 2.0 flow manager.
 *
 * IMPORTANT: Monday.com access tokens expire in just 5 minutes!
 * You must implement proactive token refresh.
 *
 * @example
 * ```typescript
 * const oauth = MondayOAuthFlow.fromEnv(
 *   'https://app.example.com/api/integrations/monday/callback'
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
 * // Step 3: IMPORTANT - Refresh tokens BEFORE they expire (within 5 minutes!)
 * // Set up a timer or background job to refresh proactively
 * setInterval(async () => {
 *   tokens = await oauth.refreshTokens(tokens.refreshToken);
 * }, 4 * 60 * 1000); // Refresh every 4 minutes
 * ```
 */
export class MondayOAuthFlow {
  private config: MondayOAuth2Config;

  /** Monday.com OAuth endpoints */
  private static readonly AUTHORIZATION_URL = 'https://auth.monday.com/oauth2/authorize';
  private static readonly TOKEN_URL = 'https://auth.monday.com/oauth2/token';

  /** Default OAuth scopes */
  private static readonly DEFAULT_SCOPES = [
    'me:read',
    'boards:read',
    'boards:write',
    'workspaces:read',
    'users:read',
  ];

  /**
   * Creates a new Monday.com OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: MondayOAuth2Config) {
    this.config = {
      ...config,
      scopes: config.scopes || MondayOAuthFlow.DEFAULT_SCOPES,
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
    stateData: MondayOAuthState;
  } {
    const stateString = this.generateRandomString(32);

    const stateData: MondayOAuthState = {
      organizationId: params.organizationId,
      userId: params.userId,
      state: stateString,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    // Encode state as base64url for transmission
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    const authUrl = new URL(MondayOAuthFlow.AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('state', encodedState);

    // Add scopes if configured
    if (this.config.scopes && this.config.scopes.length > 0) {
      authUrl.searchParams.set('scopes', this.config.scopes.join(' '));
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
  ): MondayOAuthState {
    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(receivedState, 'base64url').toString('utf-8')
      ) as MondayOAuthState;

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
  async exchangeCode(code: string): Promise<MondayOAuthTokens> {
    const response = await fetch(MondayOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
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
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    };
  }

  /**
   * Refresh an access token.
   *
   * IMPORTANT: Monday.com tokens expire in 5 minutes!
   * Call this proactively before expiration.
   *
   * @param refreshToken - Refresh token
   * @returns New OAuth tokens
   */
  async refreshTokens(refreshToken: string): Promise<MondayOAuthTokens> {
    const response = await fetch(MondayOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
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
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    };
  }

  /**
   * Convert Monday.com OAuth tokens to TrackerAuthConfig.
   *
   * Note: Sets expiration to 5 minutes from now.
   *
   * @param tokens - Monday.com OAuth tokens
   * @returns TrackerAuthConfig
   */
  toTrackerAuthConfig(tokens: MondayOAuthTokens): TrackerAuthConfig {
    return {
      type: 'oauth2',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      // Monday.com tokens expire in 5 minutes!
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  /**
   * Create a Monday.com OAuth flow from environment variables.
   * @param redirectUri - OAuth redirect URI
   * @returns Monday.com OAuth flow instance
   */
  static fromEnv(redirectUri: string): MondayOAuthFlow {
    const clientId = process.env.MONDAY_CLIENT_ID;
    const clientSecret = process.env.MONDAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'MONDAY_CLIENT_ID and MONDAY_CLIENT_SECRET environment variables are required'
      );
    }

    return new MondayOAuthFlow({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
}

/**
 * API Token authentication for Monday.com.
 * For simpler integrations or personal use.
 */
export class MondayApiToken {
  /**
   * Validate an API token.
   * @param token - API token
   * @returns True if token is valid
   */
  static async validate(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '{ me { id } }',
        }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      return !!data.data?.me?.id;
    } catch {
      return false;
    }
  }

  /**
   * Get user info using an API token.
   * @param token - API token
   * @returns User info
   */
  static async getUserInfo(token: string): Promise<{
    id: number;
    name: string;
    email: string;
  }> {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '{ me { id name email } }',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.me;
  }

  /**
   * Create TrackerAuthConfig from an API token.
   * @param token - API token
   * @returns TrackerAuthConfig
   */
  static toTrackerAuthConfig(token: string): TrackerAuthConfig {
    return {
      type: 'api_key',
      accessToken: token,
    };
  }
}

/**
 * Token refresh manager for Monday.com.
 *
 * Since Monday.com tokens expire in 5 minutes, this helper class
 * manages proactive token refresh.
 *
 * @example
 * ```typescript
 * const refreshManager = new MondayTokenRefreshManager(oauth);
 *
 * // Start auto-refresh (refreshes every 4 minutes)
 * refreshManager.startAutoRefresh(initialTokens, {
 *   onRefresh: (newTokens) => {
 *     // Save new tokens to database
 *     saveTokens(newTokens);
 *   },
 *   onError: (error) => {
 *     // Handle refresh failure
 *     notifyUser('Monday.com connection lost');
 *   },
 * });
 *
 * // Get current token
 * const token = refreshManager.getAccessToken();
 *
 * // Stop when done
 * refreshManager.stop();
 * ```
 */
export class MondayTokenRefreshManager {
  private oauth: MondayOAuthFlow;
  private tokens?: MondayOAuthTokens;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private onRefresh?: (tokens: MondayOAuthTokens) => void;
  private onError?: (error: Error) => void;

  /**
   * Creates a new token refresh manager.
   * @param oauth - Monday.com OAuth flow instance
   */
  constructor(oauth: MondayOAuthFlow) {
    this.oauth = oauth;
  }

  /**
   * Start automatic token refresh.
   * @param initialTokens - Initial tokens to manage
   * @param options - Refresh options
   */
  startAutoRefresh(
    initialTokens: MondayOAuthTokens,
    options: {
      /** Callback when tokens are refreshed */
      onRefresh?: (tokens: MondayOAuthTokens) => void;
      /** Callback when refresh fails */
      onError?: (error: Error) => void;
      /** Refresh interval in ms (default: 4 minutes) */
      intervalMs?: number;
    } = {}
  ): void {
    this.tokens = initialTokens;
    this.onRefresh = options.onRefresh;
    this.onError = options.onError;

    // Default to 4 minutes (tokens expire at 5)
    const intervalMs = options.intervalMs || 4 * 60 * 1000;

    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, intervalMs);

    logger.info('Started Monday.com token auto-refresh', { intervalMs });
  }

  /**
   * Perform a token refresh.
   */
  private async refresh(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      logger.warn('No refresh token available');
      return;
    }

    try {
      const newTokens = await this.oauth.refreshTokens(this.tokens.refreshToken);
      this.tokens = newTokens;
      logger.info('Monday.com tokens refreshed successfully');
      this.onRefresh?.(newTokens);
    } catch (error) {
      logger.error('Monday.com token refresh failed', { error });
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get the current access token.
   * @returns Access token or undefined
   */
  getAccessToken(): string | undefined {
    return this.tokens?.accessToken;
  }

  /**
   * Get the current tokens.
   * @returns Current tokens or undefined
   */
  getTokens(): MondayOAuthTokens | undefined {
    return this.tokens;
  }

  /**
   * Manually update tokens.
   * @param tokens - New tokens
   */
  setTokens(tokens: MondayOAuthTokens): void {
    this.tokens = tokens;
  }

  /**
   * Stop automatic refresh.
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
      logger.info('Stopped Monday.com token auto-refresh');
    }
  }

  /**
   * Force an immediate refresh.
   * @returns Refreshed tokens
   */
  async forceRefresh(): Promise<MondayOAuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const newTokens = await this.oauth.refreshTokens(this.tokens.refreshToken);
    this.tokens = newTokens;
    this.onRefresh?.(newTokens);
    return newTokens;
  }
}
