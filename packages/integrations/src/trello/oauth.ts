import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';
import type { TrackerAuthConfig } from '@agentforge/tracker-common';
import type { TrelloOAuth1Config, TrelloOAuthTokens } from './types';

/**
 * @fileoverview Trello OAuth 1.0a flow implementation.
 * @packageDocumentation
 */

/**
 * OAuth state data stored during authorization
 */
export interface TrelloOAuthState {
  /** Organization ID in AgentForge */
  organizationId: string;
  /** User ID initiating the connection */
  userId: string;
  /** OAuth request token */
  requestToken: string;
  /** OAuth request token secret */
  requestTokenSecret: string;
  /** Timestamp when state was created */
  createdAt: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Trello OAuth 1.0a flow manager.
 * Implements the three-legged OAuth flow for Trello.
 *
 * @example
 * ```typescript
 * const oauth = new TrelloOAuthFlow({
 *   apiKey: process.env.TRELLO_API_KEY,
 *   apiSecret: process.env.TRELLO_API_SECRET,
 *   callbackUrl: 'https://app.example.com/api/integrations/trello/callback',
 *   appName: 'My App',
 *   expiration: 'never',
 *   scope: ['read', 'write'],
 * });
 *
 * // Step 1: Get request token and authorization URL
 * const { url, requestToken, requestTokenSecret } = await oauth.getAuthorizationUrl({
 *   organizationId: 'org-123',
 *   userId: 'user-456',
 * });
 *
 * // Store requestToken and requestTokenSecret
 * // Redirect user to url
 *
 * // Step 2: In callback, exchange for access token
 * const tokens = await oauth.getAccessToken({
 *   requestToken: storedRequestToken,
 *   requestTokenSecret: storedRequestTokenSecret,
 *   oauthVerifier: request.query.oauth_verifier,
 * });
 * ```
 */
export class TrelloOAuthFlow {
  private config: TrelloOAuth1Config;
  private oauth: OAuth;

  /** Trello API endpoints */
  private static readonly REQUEST_TOKEN_URL = 'https://trello.com/1/OAuthGetRequestToken';
  private static readonly AUTHORIZE_URL = 'https://trello.com/1/OAuthAuthorizeToken';
  private static readonly ACCESS_TOKEN_URL = 'https://trello.com/1/OAuthGetAccessToken';

  /**
   * Creates a new Trello OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: TrelloOAuth1Config) {
    this.config = {
      ...config,
      appName: config.appName || 'AgentForge',
      expiration: config.expiration || 'never',
      scope: config.scope || ['read', 'write'],
    };

    this.oauth = new OAuth({
      consumer: {
        key: this.config.apiKey,
        secret: this.config.apiSecret,
      },
      signature_method: 'HMAC-SHA1',
      hash_function(baseString: string, key: string) {
        return createHmac('sha1', key).update(baseString).digest('base64');
      },
    });
  }

  /**
   * Generate a secure state parameter.
   * @param data - State data to encode
   * @returns Encoded state string
   */
  generateState(data: Omit<TrelloOAuthState, 'createdAt'>): string {
    const stateData: TrelloOAuthState = {
      ...data,
      createdAt: Date.now(),
    };
    return Buffer.from(JSON.stringify(stateData)).toString('base64url');
  }

  /**
   * Decode and validate a state parameter.
   * @param state - Encoded state string
   * @param maxAgeMs - Maximum age of state in milliseconds (default: 10 minutes)
   * @returns Decoded state data
   */
  validateState(state: string, maxAgeMs: number = 600000): TrelloOAuthState {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf-8')
      ) as TrelloOAuthState;

      if (Date.now() - decoded.createdAt > maxAgeMs) {
        throw new Error('OAuth state expired');
      }

      return decoded;
    } catch (error) {
      if (error instanceof Error && error.message === 'OAuth state expired') {
        throw error;
      }
      throw new Error('Invalid OAuth state');
    }
  }

  /**
   * Get a request token and authorization URL.
   * @param params - Authorization parameters
   * @returns Authorization URL and request tokens
   */
  async getAuthorizationUrl(params: {
    organizationId: string;
    userId: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    url: string;
    requestToken: string;
    requestTokenSecret: string;
    state: string;
  }> {
    // Step 1: Get request token
    const requestTokenData = this.oauth.authorize({
      url: TrelloOAuthFlow.REQUEST_TOKEN_URL,
      method: 'POST',
      data: {
        oauth_callback: this.config.callbackUrl,
      },
    });

    const requestTokenResponse = await fetch(TrelloOAuthFlow.REQUEST_TOKEN_URL, {
      method: 'POST',
      headers: {
        ...this.oauth.toHeader(requestTokenData),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        oauth_callback: this.config.callbackUrl,
      }),
    });

    if (!requestTokenResponse.ok) {
      throw new Error(`Failed to get request token: ${requestTokenResponse.statusText}`);
    }

    const responseText = await requestTokenResponse.text();
    const responseParams = new URLSearchParams(responseText);
    const requestToken = responseParams.get('oauth_token');
    const requestTokenSecret = responseParams.get('oauth_token_secret');

    if (!requestToken || !requestTokenSecret) {
      throw new Error('Invalid request token response');
    }

    // Generate state
    const state = this.generateState({
      organizationId: params.organizationId,
      userId: params.userId,
      requestToken,
      requestTokenSecret,
      metadata: params.metadata,
    });

    // Step 2: Build authorization URL
    const authUrl = new URL(TrelloOAuthFlow.AUTHORIZE_URL);
    authUrl.searchParams.set('oauth_token', requestToken);
    authUrl.searchParams.set('name', this.config.appName!);
    authUrl.searchParams.set('scope', this.config.scope!.join(','));
    authUrl.searchParams.set('expiration', this.config.expiration!);
    authUrl.searchParams.set('return_url', this.config.callbackUrl);

    return {
      url: authUrl.toString(),
      requestToken,
      requestTokenSecret,
      state,
    };
  }

  /**
   * Exchange request token for access token.
   * @param params - Exchange parameters
   * @returns Access tokens
   */
  async getAccessToken(params: {
    requestToken: string;
    requestTokenSecret: string;
    oauthVerifier: string;
  }): Promise<TrackerAuthConfig> {
    const accessTokenData = this.oauth.authorize(
      {
        url: TrelloOAuthFlow.ACCESS_TOKEN_URL,
        method: 'POST',
        data: {
          oauth_verifier: params.oauthVerifier,
        },
      },
      {
        key: params.requestToken,
        secret: params.requestTokenSecret,
      }
    );

    const accessTokenResponse = await fetch(TrelloOAuthFlow.ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        ...this.oauth.toHeader(accessTokenData),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        oauth_verifier: params.oauthVerifier,
      }),
    });

    if (!accessTokenResponse.ok) {
      throw new Error(`Failed to get access token: ${accessTokenResponse.statusText}`);
    }

    const responseText = await accessTokenResponse.text();
    const responseParams = new URLSearchParams(responseText);
    const accessToken = responseParams.get('oauth_token');
    const accessTokenSecret = responseParams.get('oauth_token_secret');

    if (!accessToken || !accessTokenSecret) {
      throw new Error('Invalid access token response');
    }

    return {
      type: 'oauth1',
      accessToken,
      tokenSecret: accessTokenSecret,
      // Trello tokens don't expire (unless configured otherwise)
      expiresAt: this.config.expiration === 'never' ? undefined : this.calculateExpiry(),
    };
  }

  /**
   * Calculate token expiry based on configured expiration.
   */
  private calculateExpiry(): Date | undefined {
    const now = Date.now();
    switch (this.config.expiration) {
      case '1hour':
        return new Date(now + 60 * 60 * 1000);
      case '1day':
        return new Date(now + 24 * 60 * 60 * 1000);
      case '30days':
        return new Date(now + 30 * 24 * 60 * 60 * 1000);
      case 'never':
      default:
        return undefined;
    }
  }

  /**
   * Revoke an access token.
   * Note: Trello doesn't have a revocation endpoint.
   * Users must revoke via Trello settings.
   */
  async revokeToken(_accessToken: string): Promise<void> {
    throw new Error(
      'Trello tokens cannot be revoked via API. ' +
        'Users must revoke access via Trello account settings.'
    );
  }

  /**
   * Get authenticated user's member info.
   * @param tokens - OAuth tokens
   * @returns Member info
   */
  async getMemberInfo(tokens: TrelloOAuthTokens): Promise<{
    id: string;
    username: string;
    fullName: string;
    email?: string;
  }> {
    const url = 'https://api.trello.com/1/members/me';
    const requestData = this.oauth.authorize(
      {
        url,
        method: 'GET',
      },
      {
        key: tokens.token,
        secret: tokens.tokenSecret,
      }
    );

    const response = await fetch(`${url}?key=${this.config.apiKey}`, {
      method: 'GET',
      headers: this.oauth.toHeader(requestData),
    });

    if (!response.ok) {
      throw new Error(`Failed to get member info: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a Trello OAuth flow from environment variables.
   * @param callbackUrl - Callback URL
   * @returns Trello OAuth flow instance
   */
  static fromEnv(callbackUrl: string): TrelloOAuthFlow {
    const apiKey = process.env.TRELLO_API_KEY;
    const apiSecret = process.env.TRELLO_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error(
        'TRELLO_API_KEY and TRELLO_API_SECRET environment variables are required'
      );
    }

    return new TrelloOAuthFlow({
      apiKey,
      apiSecret,
      callbackUrl,
    });
  }
}

/**
 * Alternative: Simple token-based authorization.
 * For simpler integrations, Trello allows direct token generation via URL.
 */
export class TrelloSimpleAuth {
  private apiKey: string;
  private appName: string;

  constructor(apiKey: string, appName: string = 'AgentForge') {
    this.apiKey = apiKey;
    this.appName = appName;
  }

  /**
   * Generate a URL for users to manually authorize and get a token.
   * The token is displayed on the page after authorization.
   */
  getManualAuthUrl(options?: {
    expiration?: '1hour' | '1day' | '30days' | 'never';
    scope?: ('read' | 'write' | 'account')[];
    returnUrl?: string;
  }): string {
    const url = new URL('https://trello.com/1/authorize');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('name', this.appName);
    url.searchParams.set('expiration', options?.expiration || 'never');
    url.searchParams.set('scope', (options?.scope || ['read', 'write']).join(','));
    url.searchParams.set('response_type', 'token');

    if (options?.returnUrl) {
      url.searchParams.set('return_url', options.returnUrl);
    }

    return url.toString();
  }

  /**
   * Validate a token by making a test API call.
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.trello.com/1/members/me?key=${this.apiKey}&token=${token}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
