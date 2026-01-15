/**
 * @fileoverview Notion OAuth 2.0 flow implementation.
 * Handles authorization and token exchange.
 *
 * Note: Notion OAuth tokens do not expire.
 *
 * @packageDocumentation
 */

import { createLogger } from '@relay/logger';
import type { TrackerAuthConfig } from '@agentforge/tracker-common';
import type { NotionOAuth2Config, NotionOAuthTokens } from './types';

const logger = createLogger('notion-oauth');

/**
 * OAuth state data stored during authorization.
 */
export interface NotionOAuthState {
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
 * Notion OAuth 2.0 flow manager.
 *
 * Notion tokens do not expire and there's no refresh token.
 * Once obtained, the token remains valid until the user revokes access.
 *
 * @example
 * ```typescript
 * const oauth = NotionOAuthFlow.fromEnv(
 *   'https://app.example.com/api/integrations/notion/callback'
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
 * console.log('Workspace:', tokens.workspace.name);
 * ```
 */
export class NotionOAuthFlow {
  private config: NotionOAuth2Config;

  /** Notion OAuth endpoints */
  private static readonly AUTHORIZATION_URL = 'https://api.notion.com/v1/oauth/authorize';
  private static readonly TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

  /**
   * Creates a new Notion OAuth flow manager.
   * @param config - OAuth configuration
   */
  constructor(config: NotionOAuth2Config) {
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
    owner?: 'user' | 'workspace';
  }): {
    url: string;
    state: string;
    stateData: NotionOAuthState;
  } {
    const stateString = this.generateRandomString(32);

    const stateData: NotionOAuthState = {
      organizationId: params.organizationId,
      userId: params.userId,
      state: stateString,
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    // Encode state as base64url for transmission
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    const authUrl = new URL(NotionOAuthFlow.AUTHORIZATION_URL);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', encodedState);

    // owner parameter controls whether the integration can be installed by
    // individual users ('user') or workspace admins only ('workspace')
    if (params.owner) {
      authUrl.searchParams.set('owner', params.owner);
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
  ): NotionOAuthState {
    if (storedState !== receivedState) {
      throw new Error('OAuth state mismatch');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(receivedState, 'base64url').toString('utf-8')
      ) as NotionOAuthState;

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
  async exchangeCode(code: string): Promise<NotionOAuthTokens> {
    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(NotionOAuthFlow.TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      tokenType: data.token_type,
      botId: data.bot_id,
      workspace: {
        id: data.workspace_id,
        name: data.workspace_name,
        icon: data.workspace_icon,
      },
      owner: data.owner,
      duplicatedTemplateId: data.duplicated_template_id,
    };
  }

  /**
   * Convert Notion OAuth tokens to TrackerAuthConfig.
   * @param tokens - Notion OAuth tokens
   * @returns TrackerAuthConfig
   */
  toTrackerAuthConfig(tokens: NotionOAuthTokens): TrackerAuthConfig {
    return {
      type: 'oauth2',
      accessToken: tokens.accessToken,
      // Notion tokens don't expire
      expiresAt: undefined,
    };
  }

  /**
   * Create a Notion OAuth flow from environment variables.
   * @param redirectUri - OAuth redirect URI
   * @returns Notion OAuth flow instance
   */
  static fromEnv(redirectUri: string): NotionOAuthFlow {
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'NOTION_CLIENT_ID and NOTION_CLIENT_SECRET environment variables are required'
      );
    }

    return new NotionOAuthFlow({
      clientId,
      clientSecret,
      redirectUri,
    });
  }
}

/**
 * Internal Integration Token authentication for Notion.
 * For internal integrations where OAuth is not needed.
 */
export class NotionInternalToken {
  /**
   * Validate an internal integration token.
   * @param token - Internal integration token
   * @returns True if token is valid
   */
  static async validate(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get bot info using an internal integration token.
   * @param token - Internal integration token
   * @returns Bot info
   */
  static async getBotInfo(token: string): Promise<{
    id: string;
    name: string;
    type: string;
    avatar_url: string | null;
  }> {
    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get bot info: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      avatar_url: data.avatar_url,
    };
  }

  /**
   * Create TrackerAuthConfig from an internal integration token.
   * @param token - Internal integration token
   * @returns TrackerAuthConfig
   */
  static toTrackerAuthConfig(token: string): TrackerAuthConfig {
    return {
      type: 'api_key',
      accessToken: token,
    };
  }
}
