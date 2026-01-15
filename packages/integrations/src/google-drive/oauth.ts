/**
 * @fileoverview Google Drive OAuth 2.0 authentication
 * @module @relay/integrations/google-drive/oauth
 */

import * as crypto from 'crypto';
import axios from 'axios';
import type { GoogleDriveOAuthConfig, GoogleDriveOAuthToken, GoogleDriveScope } from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';

/**
 * Google OAuth URLs
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Default scopes for Google Drive access
 */
export const DEFAULT_GOOGLE_DRIVE_SCOPES: GoogleDriveScope[] = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Full access scopes (use carefully)
 */
export const FULL_ACCESS_SCOPES: GoogleDriveScope[] = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Google Drive OAuth client for authorization flows
 */
export class GoogleDriveOAuthClient {
  private config: GoogleDriveOAuthConfig;

  /**
   * Creates a new Google Drive OAuth client
   * @param config - OAuth configuration
   */
  constructor(config: GoogleDriveOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates the OAuth configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: GoogleDriveOAuthConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('google-drive', 'Google client ID is required');
    }
    if (!config.clientSecret) {
      throw new ConfigurationError('google-drive', 'Google client secret is required');
    }
    if (!config.redirectUri) {
      throw new ConfigurationError('google-drive', 'Google redirect URI is required');
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
    scopes?: GoogleDriveScope[];
    accessType?: 'online' | 'offline';
    prompt?: 'none' | 'consent' | 'select_account';
    loginHint?: string;
    includeGrantedScopes?: boolean;
    usePkce?: boolean;
  }): { url: string; state: string; codeVerifier?: string } {
    const state = options?.state || crypto.randomBytes(16).toString('hex');
    const scopes = options?.scopes || this.config.scopes || DEFAULT_GOOGLE_DRIVE_SCOPES;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: options?.accessType || 'offline',
    });

    if (options?.prompt) {
      params.append('prompt', options.prompt);
    } else if (options?.accessType === 'offline') {
      // Force consent for offline access to get refresh token
      params.append('prompt', 'consent');
    }

    if (options?.loginHint) {
      params.append('login_hint', options.loginHint);
    }

    if (options?.includeGrantedScopes) {
      params.append('include_granted_scopes', 'true');
    }

    let codeVerifier: string | undefined;
    if (options?.usePkce !== false) {
      codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return {
      url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
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
  async exchangeCode(code: string, codeVerifier?: string): Promise<GoogleDriveOAuthToken> {
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

      const response = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
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
   * @returns New OAuth token
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleDriveOAuthToken> {
    try {
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
      });

      const response = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // Google doesn't return a new refresh token, so preserve the old one
      const token = this.mapTokenResponse(response.data);
      token.refreshToken = refreshToken;
      return token;
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Revokes an access or refresh token
   * @param token - Token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    try {
      await axios.post(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, null, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch (error) {
      // Token may already be revoked
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        return;
      }
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Gets user info using access token
   * @param accessToken - Access token
   * @returns User information
   */
  async getUserInfo(accessToken: string): Promise<{
    sub: string;
    email: string;
    emailVerified: boolean;
    name?: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
    locale?: string;
  }> {
    try {
      const response = await axios.get(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        sub: response.data.sub,
        email: response.data.email,
        emailVerified: response.data.email_verified,
        name: response.data.name,
        givenName: response.data.given_name,
        familyName: response.data.family_name,
        picture: response.data.picture,
        locale: response.data.locale,
      };
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Maps raw token response to GoogleDriveOAuthToken
   * @param data - Raw token response
   * @returns Mapped token
   */
  private mapTokenResponse(data: Record<string, unknown>): GoogleDriveOAuthToken {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: data.expires_in as number,
      obtainedAt: new Date(),
      scope: data.scope as string,
      idToken: data.id_token as string | undefined,
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
      };
      const message = data.error_description || data.error || 'Unknown OAuth error';
      return new AuthenticationError('google-drive', `Google OAuth error: ${message}`);
    }
    return new AuthenticationError(
      'google-drive',
      error instanceof Error ? error.message : 'Unknown OAuth error'
    );
  }
}

/**
 * Validates a Google Drive OAuth token
 * @param token - Token to validate
 * @returns Whether the token is valid (not expired)
 */
export function isTokenValid(token: GoogleDriveOAuthToken): boolean {
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
export function shouldRefreshToken(token: GoogleDriveOAuthToken): boolean {
  if (!token.refreshToken) {
    return false;
  }
  return !isTokenValid(token);
}
