/**
 * @fileoverview Pipedrive OAuth 2.0 authentication
 * @module @relay/integrations/pipedrive/oauth
 */

import axios from 'axios';
import type { PipedriveOAuthConfig, PipedriveOAuthToken } from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';

/**
 * Pipedrive OAuth URLs
 */
const PIPEDRIVE_AUTH_URL = 'https://oauth.pipedrive.com/oauth/authorize';
const PIPEDRIVE_TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token';

/**
 * Pipedrive OAuth client for authorization flows
 */
export class PipedriveOAuthClient {
  private config: PipedriveOAuthConfig;

  /**
   * Creates a new Pipedrive OAuth client
   * @param config - OAuth configuration
   */
  constructor(config: PipedriveOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates the OAuth configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: PipedriveOAuthConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('pipedrive', 'Pipedrive client ID is required');
    }
    if (!config.clientSecret) {
      throw new ConfigurationError('pipedrive', 'Pipedrive client secret is required');
    }
    if (!config.redirectUri) {
      throw new ConfigurationError('pipedrive', 'Pipedrive redirect URI is required');
    }
  }

  /**
   * Generates the authorization URL for OAuth flow
   * @param state - Optional state parameter for CSRF protection
   * @returns Authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
    });

    if (state) {
      params.append('state', state);
    }

    return `${PIPEDRIVE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   * @param code - Authorization code from callback
   * @returns OAuth token
   */
  async exchangeCode(code: string): Promise<PipedriveOAuthToken> {
    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      });

      const response = await axios.post(PIPEDRIVE_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
      });

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
  async refreshAccessToken(refreshToken: string): Promise<PipedriveOAuthToken> {
    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await axios.post(PIPEDRIVE_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
      });

      return this.mapTokenResponse(response.data);
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Maps raw token response to PipedriveOAuthToken
   * @param data - Raw token response
   * @returns Mapped token
   */
  private mapTokenResponse(data: Record<string, unknown>): PipedriveOAuthToken {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: data.expires_in as number,
      obtainedAt: new Date(),
      apiDomain: data.api_domain as string,
      scope: data.scope as string,
    };
  }

  /**
   * Handles OAuth errors
   * @param error - Error from OAuth request
   * @returns AuthenticationError
   */
  private handleOAuthError(error: unknown): AuthenticationError {
    if (axios.isAxiosError(error) && error.response?.data) {
      const data = error.response.data as {
        error?: string;
        error_description?: string;
        message?: string;
      };
      const message = data.error_description || data.message || data.error || 'Unknown OAuth error';
      return new AuthenticationError('pipedrive', `Pipedrive OAuth error: ${message}`);
    }
    return new AuthenticationError(
      'pipedrive',
      error instanceof Error ? error.message : 'Unknown OAuth error'
    );
  }
}

/**
 * Validates a Pipedrive OAuth token
 * @param token - Token to validate
 * @returns Whether the token is valid (not expired)
 */
export function isTokenValid(token: PipedriveOAuthToken): boolean {
  if (!token.expiresIn) {
    return true;
  }

  const expiresAt = new Date(token.obtainedAt.getTime() + token.expiresIn * 1000);
  const now = new Date();
  // Consider token invalid 5 minutes before actual expiry
  const bufferMs = 5 * 60 * 1000;

  return now.getTime() < expiresAt.getTime() - bufferMs;
}

/**
 * Checks if a token needs refresh
 * @param token - Token to check
 * @returns Whether the token should be refreshed
 */
export function shouldRefreshToken(token: PipedriveOAuthToken): boolean {
  if (!token.refreshToken) {
    return false;
  }
  return !isTokenValid(token);
}
