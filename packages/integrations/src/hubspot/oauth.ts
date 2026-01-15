/**
 * @fileoverview HubSpot OAuth 2.0 authentication
 * @module @relay/integrations/hubspot/oauth
 */

import axios from 'axios';
import type { HubSpotOAuthConfig, HubSpotOAuthToken, HubSpotOAuthScope } from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';

/**
 * HubSpot OAuth base URL
 */
const HUBSPOT_OAUTH_URL = 'https://app.hubspot.com/oauth';
const HUBSPOT_API_URL = 'https://api.hubapi.com';

/**
 * Default OAuth scopes
 */
const DEFAULT_SCOPES: HubSpotOAuthScope[] = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.owners.read',
];

/**
 * HubSpot OAuth client for authorization flows
 */
export class HubSpotOAuthClient {
  private config: HubSpotOAuthConfig;

  /**
   * Creates a new HubSpot OAuth client
   * @param config - OAuth configuration
   */
  constructor(config: HubSpotOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates the OAuth configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: HubSpotOAuthConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('hubspot', 'HubSpot client ID is required');
    }
    if (!config.clientSecret) {
      throw new ConfigurationError('hubspot', 'HubSpot client secret is required');
    }
    if (!config.redirectUri) {
      throw new ConfigurationError('hubspot', 'HubSpot redirect URI is required');
    }
  }

  /**
   * Generates the authorization URL for OAuth flow
   * @param state - Optional state parameter for CSRF protection
   * @param scopes - Optional scopes to request
   * @returns Authorization URL
   */
  getAuthorizationUrl(state?: string, scopes?: HubSpotOAuthScope[]): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: (scopes || this.config.scopes || DEFAULT_SCOPES).join(' '),
    });

    if (state) {
      params.append('state', state);
    }

    return `${HUBSPOT_OAUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   * @param code - Authorization code from callback
   * @returns OAuth token
   */
  async exchangeCode(code: string): Promise<HubSpotOAuthToken> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      });

      const response = await axios.post(
        `${HUBSPOT_API_URL}/oauth/v1/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return this.mapTokenResponse(response.data);
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Refreshes an access token using a refresh token
   * @param refreshToken - Refresh token
   * @returns New OAuth token
   */
  async refreshAccessToken(refreshToken: string): Promise<HubSpotOAuthToken> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      });

      const response = await axios.post(
        `${HUBSPOT_API_URL}/oauth/v1/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return this.mapTokenResponse(response.data);
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Gets access token info (for validation)
   * @param accessToken - Access token to validate
   * @returns Token info
   */
  async getTokenInfo(accessToken: string): Promise<{
    token: string;
    user: string;
    hubDomain: string;
    scopes: string[];
    hubId: number;
    appId: number;
    expiresIn: number;
    userId: number;
    tokenType: string;
  }> {
    try {
      const response = await axios.get(
        `${HUBSPOT_API_URL}/oauth/v1/access-tokens/${accessToken}`
      );

      return {
        token: response.data.token,
        user: response.data.user,
        hubDomain: response.data.hub_domain,
        scopes: response.data.scopes,
        hubId: response.data.hub_id,
        appId: response.data.app_id,
        expiresIn: response.data.expires_in,
        userId: response.data.user_id,
        tokenType: response.data.token_type,
      };
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Revokes a refresh token
   * @param refreshToken - Refresh token to revoke
   */
  async revokeToken(refreshToken: string): Promise<void> {
    try {
      const params = new URLSearchParams({
        token: refreshToken,
      });

      await axios.post(
        `${HUBSPOT_API_URL}/oauth/v1/refresh-tokens/${refreshToken}`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          method: 'DELETE',
        }
      );
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Maps raw token response to HubSpotOAuthToken
   * @param data - Raw token response
   * @returns Mapped token
   */
  private mapTokenResponse(data: Record<string, unknown>): HubSpotOAuthToken {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      tokenType: 'bearer',
      expiresIn: data.expires_in as number,
      obtainedAt: new Date(),
      hubId: data.hub_id as number || 0,
      userId: data.user_id as number || 0,
      appId: data.app_id as number || 0,
    };
  }

  /**
   * Handles OAuth errors
   * @param error - Error from OAuth request
   * @returns AuthenticationError
   */
  private handleOAuthError(error: unknown): AuthenticationError {
    if (axios.isAxiosError(error) && error.response?.data) {
      const data = error.response.data as { message?: string; error?: string; error_description?: string };
      const message = data.message || data.error_description || data.error || 'Unknown OAuth error';
      return new AuthenticationError('hubspot', `HubSpot OAuth error: ${message}`);
    }
    return new AuthenticationError(
      'hubspot',
      error instanceof Error ? error.message : 'Unknown OAuth error'
    );
  }
}

/**
 * Validates a HubSpot OAuth token
 * @param token - Token to validate
 * @returns Whether the token is valid (not expired)
 */
export function isTokenValid(token: HubSpotOAuthToken): boolean {
  if (!token.expiresIn) {
    return true; // If no expiry info, assume valid
  }

  const expiresAt = new Date(token.obtainedAt.getTime() + token.expiresIn * 1000);
  const now = new Date();
  // Consider token invalid 5 minutes before actual expiry for safety
  const bufferMs = 5 * 60 * 1000;

  return now.getTime() < expiresAt.getTime() - bufferMs;
}

/**
 * Checks if a token needs refresh
 * @param token - Token to check
 * @returns Whether the token should be refreshed
 */
export function shouldRefreshToken(token: HubSpotOAuthToken): boolean {
  if (!token.refreshToken) {
    return false;
  }
  return !isTokenValid(token);
}
