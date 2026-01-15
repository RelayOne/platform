/**
 * @fileoverview Salesforce OAuth 2.0 authentication
 * @module @relay/integrations/salesforce/oauth
 */

import axios from 'axios';
import * as crypto from 'crypto';
import type {
  SalesforceOAuthConfig,
  SalesforceJwtConfig,
  SalesforceOAuthToken,
  SalesforceOAuthScope,
} from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';

/**
 * Default Salesforce login URL
 */
const DEFAULT_LOGIN_URL = 'https://login.salesforce.com';

/**
 * Salesforce sandbox login URL
 */
const SANDBOX_LOGIN_URL = 'https://test.salesforce.com';

/**
 * Salesforce OAuth client for Web Server and JWT Bearer flows
 */
export class SalesforceOAuthClient {
  private config: SalesforceOAuthConfig;
  private loginUrl: string;

  /**
   * Creates a new Salesforce OAuth client
   * @param config - OAuth configuration
   */
  constructor(config: SalesforceOAuthConfig) {
    this.validateConfig(config);
    this.config = config;
    this.loginUrl = config.loginUrl || DEFAULT_LOGIN_URL;
  }

  /**
   * Validates the OAuth configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: SalesforceOAuthConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('salesforce', 'Salesforce client ID is required');
    }
    if (!config.clientSecret) {
      throw new ConfigurationError('salesforce', 'Salesforce client secret is required');
    }
    if (!config.redirectUri) {
      throw new ConfigurationError('salesforce', 'Salesforce redirect URI is required');
    }
  }

  /**
   * Generates the authorization URL for the Web Server OAuth flow
   * @param state - Optional state parameter for CSRF protection
   * @param scopes - Optional scopes to request (defaults to api, refresh_token)
   * @returns Authorization URL
   */
  getAuthorizationUrl(state?: string, scopes?: SalesforceOAuthScope[]): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: (scopes || this.config.scopes || ['api', 'refresh_token']).join(' '),
    });

    if (state) {
      params.append('state', state);
    }

    return `${this.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   * @param code - Authorization code from callback
   * @returns OAuth token
   */
  async exchangeCode(code: string): Promise<SalesforceOAuthToken> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      });

      const response = await axios.post(
        `${this.loginUrl}/services/oauth2/token`,
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
  async refreshAccessToken(refreshToken: string): Promise<SalesforceOAuthToken> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      });

      const response = await axios.post(
        `${this.loginUrl}/services/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Refresh token response doesn't include refresh_token, preserve the original
      const token = this.mapTokenResponse(response.data);
      if (!token.refreshToken) {
        token.refreshToken = refreshToken;
      }

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
      const params = new URLSearchParams({
        token,
      });

      await axios.post(
        `${this.loginUrl}/services/oauth2/revoke`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Gets user information using an access token
   * @param accessToken - Access token
   * @param instanceUrl - Salesforce instance URL
   * @returns User information
   */
  async getUserInfo(accessToken: string, instanceUrl: string): Promise<{
    id: string;
    userId: string;
    organizationId: string;
    username: string;
    displayName: string;
    firstName: string;
    lastName: string;
    email: string;
    photos: {
      picture: string;
      thumbnail: string;
    };
  }> {
    try {
      const response = await axios.get(
        `${instanceUrl}/services/oauth2/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return {
        id: response.data.sub,
        userId: response.data.user_id,
        organizationId: response.data.organization_id,
        username: response.data.preferred_username,
        displayName: response.data.name,
        firstName: response.data.given_name,
        lastName: response.data.family_name,
        email: response.data.email,
        photos: {
          picture: response.data.picture,
          thumbnail: response.data.thumbnail,
        },
      };
    } catch (error) {
      throw this.handleOAuthError(error);
    }
  }

  /**
   * Maps raw token response to SalesforceOAuthToken
   * @param data - Raw token response
   * @returns Mapped token
   */
  private mapTokenResponse(data: Record<string, unknown>): SalesforceOAuthToken {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      tokenType: (data.token_type as string) || 'Bearer',
      expiresIn: data.expires_in as number | undefined,
      obtainedAt: new Date(),
      scopes: (data.scope as string)?.split(' '),
      instanceUrl: data.instance_url as string,
      id: data.id as string,
      issuedAt: data.issued_at as string,
      signature: data.signature as string,
    };
  }

  /**
   * Handles OAuth errors
   * @param error - Error from OAuth request
   * @returns AuthenticationError
   */
  private handleOAuthError(error: unknown): AuthenticationError {
    if (axios.isAxiosError(error) && error.response?.data) {
      const data = error.response.data as { error: string; error_description?: string };
      return new AuthenticationError(
        'salesforce',
        `Salesforce OAuth error: ${data.error_description || data.error}`
      );
    }
    return new AuthenticationError(
      'salesforce',
      error instanceof Error ? error.message : 'Unknown OAuth error'
    );
  }

  /**
   * Creates a login URL for sandbox environments
   * @returns New OAuth client configured for sandbox
   */
  static forSandbox(config: SalesforceOAuthConfig): SalesforceOAuthClient {
    return new SalesforceOAuthClient({
      ...config,
      loginUrl: SANDBOX_LOGIN_URL,
    });
  }
}

/**
 * Salesforce JWT Bearer OAuth client for server-to-server authentication
 */
export class SalesforceJwtOAuthClient {
  private config: SalesforceJwtConfig;
  private loginUrl: string;

  /**
   * Creates a new Salesforce JWT OAuth client
   * @param config - JWT configuration
   */
  constructor(config: SalesforceJwtConfig) {
    this.validateConfig(config);
    this.config = config;
    this.loginUrl = config.loginUrl || DEFAULT_LOGIN_URL;
  }

  /**
   * Validates the JWT configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: SalesforceJwtConfig): void {
    if (!config.clientId) {
      throw new ConfigurationError('salesforce', 'Salesforce client ID is required for JWT auth');
    }
    if (!config.privateKey) {
      throw new ConfigurationError('salesforce', 'Private key is required for JWT auth');
    }
    if (!config.username) {
      throw new ConfigurationError('salesforce', 'Username is required for JWT auth');
    }
  }

  /**
   * Obtains an access token using JWT Bearer flow
   * @returns OAuth token
   */
  async getAccessToken(): Promise<SalesforceOAuthToken> {
    try {
      const assertion = this.createJwtAssertion();

      const params = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      });

      const response = await axios.post(
        `${this.loginUrl}/services/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type || 'Bearer',
        obtainedAt: new Date(),
        instanceUrl: response.data.instance_url,
        id: response.data.id,
        issuedAt: response.data.issued_at,
        signature: response.data.signature,
        scopes: (response.data.scope as string)?.split(' '),
      };
    } catch (error) {
      throw this.handleJwtError(error);
    }
  }

  /**
   * Creates a JWT assertion for authentication
   * @returns JWT assertion string
   */
  private createJwtAssertion(): string {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 300; // 5 minutes

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const payload = {
      iss: this.config.clientId,
      sub: this.config.username,
      aud: this.loginUrl,
      exp: expiry,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = this.signJwt(signatureInput);

    return `${signatureInput}.${signature}`;
  }

  /**
   * Signs the JWT using RSA-SHA256
   * @param input - String to sign
   * @returns Base64URL encoded signature
   */
  private signJwt(input: string): string {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(input);
    const signature = sign.sign(this.config.privateKey, 'base64');
    return this.base64ToBase64Url(signature);
  }

  /**
   * Encodes a string as base64url
   * @param str - String to encode
   * @returns Base64URL encoded string
   */
  private base64UrlEncode(str: string): string {
    return this.base64ToBase64Url(Buffer.from(str).toString('base64'));
  }

  /**
   * Converts base64 to base64url
   * @param base64 - Base64 string
   * @returns Base64URL string
   */
  private base64ToBase64Url(base64: string): string {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Handles JWT authentication errors
   * @param error - Error from JWT request
   * @returns AuthenticationError
   */
  private handleJwtError(error: unknown): AuthenticationError {
    if (axios.isAxiosError(error) && error.response?.data) {
      const data = error.response.data as { error: string; error_description?: string };
      return new AuthenticationError(
        'salesforce',
        `Salesforce JWT error: ${data.error_description || data.error}`
      );
    }
    return new AuthenticationError(
      'salesforce',
      error instanceof Error ? error.message : 'Unknown JWT authentication error'
    );
  }

  /**
   * Creates a JWT client for sandbox environments
   * @param config - JWT configuration
   * @returns New JWT OAuth client configured for sandbox
   */
  static forSandbox(config: SalesforceJwtConfig): SalesforceJwtOAuthClient {
    return new SalesforceJwtOAuthClient({
      ...config,
      loginUrl: SANDBOX_LOGIN_URL,
    });
  }
}

/**
 * Validates a Salesforce OAuth token
 * @param token - Token to validate
 * @returns Whether the token is valid (not expired)
 */
export function isTokenValid(token: SalesforceOAuthToken): boolean {
  if (!token.expiresIn) {
    // If no expiry info, assume valid (Salesforce doesn't always return expires_in)
    return true;
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
export function shouldRefreshToken(token: SalesforceOAuthToken): boolean {
  if (!token.refreshToken) {
    return false;
  }
  return !isTokenValid(token);
}
