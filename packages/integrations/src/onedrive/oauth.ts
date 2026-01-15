/**
 * @fileoverview OneDrive/Microsoft OAuth 2.0 authentication
 * @module @relay/integrations/onedrive/oauth
 */

import * as crypto from 'crypto';
import axios from 'axios';
import type { OneDriveOAuthConfig, OneDriveOAuthToken, OneDriveScope } from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';

/**
 * Microsoft OAuth base URLs
 */
const MS_AUTH_BASE = 'https://login.microsoftonline.com';
const MS_TOKEN_ENDPOINT = '/oauth2/v2.0/token';
const MS_AUTH_ENDPOINT = '/oauth2/v2.0/authorize';

/**
 * Default scopes for OneDrive access
 */
export const DEFAULT_ONEDRIVE_SCOPES: OneDriveScope[] = [
  'offline_access',
  'User.Read',
  'Files.Read',
  'Files.Read.All',
];

/**
 * Full access scopes (use carefully)
 */
export const FULL_ACCESS_SCOPES: OneDriveScope[] = [
  'offline_access',
  'User.Read',
  'Files.ReadWrite',
  'Files.ReadWrite.All',
];

/**
 * SharePoint scopes
 */
export const SHAREPOINT_SCOPES: OneDriveScope[] = [
  'offline_access',
  'User.Read',
  'Sites.Read.All',
  'Sites.ReadWrite.All',
];

/**
 * OneDrive OAuth client for Microsoft identity platform
 */
export class OneDriveOAuthClient {
  private config: OneDriveOAuthConfig;
  private authUrl: string;
  private tokenUrl: string;

  /**
   * Creates a new OneDrive OAuth client
   * @param config - OAuth configuration
   */
  constructor(config: OneDriveOAuthConfig) {
    this.validateConfig(config);
    this.config = config;

    // Determine tenant endpoint (default to 'common' for multi-tenant)
    const tenant = config.tenantId || 'common';
    this.authUrl = `${MS_AUTH_BASE}/${tenant}${MS_AUTH_ENDPOINT}`;
    this.tokenUrl = `${MS_AUTH_BASE}/${tenant}${MS_TOKEN_ENDPOINT}`;
  }

  /**
   * Validates the OAuth configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: OneDriveOAuthConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('onedrive', 'Microsoft client ID is required');
    }
    if (!config.clientSecret) {
      throw new ConfigurationError('onedrive', 'Microsoft client secret is required');
    }
    if (!config.redirectUri) {
      throw new ConfigurationError('onedrive', 'Microsoft redirect URI is required');
    }
  }

  /**
   * Generates a PKCE code verifier
   * @returns Base64URL encoded code verifier
   */
  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generates a PKCE code challenge from verifier
   * @param verifier - Code verifier
   * @returns Base64URL encoded code challenge
   */
  generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generates the authorization URL for OAuth flow
   * @param options - Authorization options
   * @returns Authorization URL and code verifier (for PKCE)
   */
  getAuthorizationUrl(options?: {
    state?: string;
    scopes?: OneDriveScope[];
    prompt?: 'login' | 'none' | 'consent' | 'select_account';
    loginHint?: string;
    domainHint?: string;
    usePkce?: boolean;
  }): { url: string; state: string; codeVerifier?: string } {
    const state = options?.state || crypto.randomBytes(16).toString('hex');
    const scopes = options?.scopes || this.config.scopes || DEFAULT_ONEDRIVE_SCOPES;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      response_mode: 'query',
    });

    if (options?.prompt) {
      params.append('prompt', options.prompt);
    }

    if (options?.loginHint) {
      params.append('login_hint', options.loginHint);
    }

    if (options?.domainHint) {
      params.append('domain_hint', options.domainHint);
    }

    let codeVerifier: string | undefined;
    if (options?.usePkce !== false) {
      codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return {
      url: `${this.authUrl}?${params.toString()}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   * @param code - Authorization code from callback
   * @param codeVerifier - PKCE code verifier (if used)
   * @returns OAuth token
   */
  async exchangeCode(code: string, codeVerifier?: string): Promise<OneDriveOAuthToken> {
    try {
      const params = new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      });

      if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
      }

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
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
   * @param scopes - Optional scopes to request (defaults to config scopes)
   * @returns New OAuth token
   */
  async refreshAccessToken(refreshToken: string, scopes?: OneDriveScope[]): Promise<OneDriveOAuthToken> {
    try {
      const scopeString = (scopes || this.config.scopes || DEFAULT_ONEDRIVE_SCOPES).join(' ');

      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        scope: scopeString,
      });

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return this.mapTokenResponse(response.data);
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Gets tokens using client credentials (app-only, no user)
   * Note: Requires admin consent for the tenant
   * @param scopes - Scopes to request (must use .default format)
   * @returns OAuth token
   */
  async getClientCredentialsToken(scopes?: string[]): Promise<OneDriveOAuthToken> {
    try {
      const scopeString = scopes?.join(' ') || 'https://graph.microsoft.com/.default';

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'client_credentials',
        scope: scopeString,
      });

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return this.mapTokenResponse(response.data);
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Maps raw token response to OneDriveOAuthToken
   * @param data - Raw token response
   * @returns Mapped token
   */
  private mapTokenResponse(data: Record<string, unknown>): OneDriveOAuthToken {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: data.expires_in as number,
      obtainedAt: new Date(),
      scope: data.scope as string,
      idToken: data.id_token as string | undefined,
      extExpiresIn: data.ext_expires_in as number | undefined,
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
        error_codes?: number[];
        error_uri?: string;
      };
      const message = data.error_description || data.error || 'Unknown OAuth error';
      return new AuthenticationError('onedrive', `Microsoft OAuth error: ${message}`);
    }
    return new AuthenticationError(
      'onedrive',
      error instanceof Error ? error.message : 'Unknown OAuth error'
    );
  }
}

/**
 * Validates a OneDrive OAuth token
 * @param token - Token to validate
 * @returns Whether the token is valid (not expired)
 */
export function isTokenValid(token: OneDriveOAuthToken): boolean {
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
export function shouldRefreshToken(token: OneDriveOAuthToken): boolean {
  if (!token.refreshToken) {
    return false;
  }
  return !isTokenValid(token);
}
