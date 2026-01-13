/**
 * @fileoverview GitHub App authentication utilities
 * Handles JWT generation and installation token management
 * @module @relay/integrations/github/auth
 */

import jwt from 'jsonwebtoken';
import type { GitHubAppConfig, InstallationToken } from './types';
import { AuthenticationError, ConfigurationError } from '../common/errors';
import type { IntegrationSource } from '../common/types';

/**
 * GitHub API integration source identifier
 */
const SOURCE: IntegrationSource = 'github';

/**
 * Token cache entry with expiration tracking
 */
interface TokenCacheEntry {
  /** The installation token */
  token: InstallationToken;
  /** When the token was cached */
  cachedAt: Date;
}

/**
 * GitHub App authentication manager
 * Handles JWT generation and installation token caching
 */
export class GitHubAuthManager {
  private config: GitHubAppConfig;
  private tokenCache: Map<number, TokenCacheEntry>;
  private readonly JWT_EXPIRATION_SECONDS = 600; // 10 minutes
  private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Creates a new GitHub auth manager
   * @param config - GitHub App configuration
   */
  constructor(config: GitHubAppConfig) {
    this.validateConfig(config);
    this.config = config;
    this.tokenCache = new Map();
  }

  /**
   * Validates the GitHub App configuration
   * @param config - Configuration to validate
   * @throws {ConfigurationError} If configuration is invalid
   */
  private validateConfig(config: GitHubAppConfig): void {
    if (!config.appId || config.appId <= 0) {
      throw new ConfigurationError(SOURCE, 'GitHub App ID is required and must be positive');
    }

    if (!config.privateKey || config.privateKey.trim() === '') {
      throw new ConfigurationError(SOURCE, 'GitHub App private key is required');
    }

    if (!config.privateKey.includes('BEGIN RSA PRIVATE KEY') &&
        !config.privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new ConfigurationError(SOURCE, 'GitHub App private key must be in PEM format');
    }

    if (!config.webhookSecret || config.webhookSecret.trim() === '') {
      throw new ConfigurationError(SOURCE, 'GitHub webhook secret is required');
    }
  }

  /**
   * Generates a JWT for GitHub App authentication
   * JWTs are used to authenticate as the GitHub App itself
   * @returns JWT string
   */
  generateJwt(): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      // Issued at time
      iat: now - 60, // 60 seconds in the past to allow for clock drift
      // JWT expiration time (10 minutes maximum)
      exp: now + this.JWT_EXPIRATION_SECONDS,
      // GitHub App's identifier
      iss: this.config.appId,
    };

    try {
      return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
    } catch (error) {
      throw new AuthenticationError(
        SOURCE,
        `Failed to sign JWT: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets the GitHub API base URL
   * @returns API base URL
   */
  getApiUrl(): string {
    return this.config.apiUrl || 'https://api.github.com';
  }

  /**
   * Gets an installation token, using cache when possible
   * Installation tokens are used to authenticate API requests on behalf of an installation
   * @param installationId - The installation ID
   * @param fetchToken - Function to fetch a new token from GitHub API
   * @returns Installation token
   */
  async getInstallationToken(
    installationId: number,
    fetchToken: (jwt: string, installationId: number) => Promise<InstallationToken>
  ): Promise<InstallationToken> {
    // Check cache first
    const cached = this.tokenCache.get(installationId);
    if (cached && !this.isTokenExpiringSoon(cached.token)) {
      return cached.token;
    }

    // Generate new JWT and fetch token
    const jwtToken = this.generateJwt();
    const token = await fetchToken(jwtToken, installationId);

    // Cache the token
    this.tokenCache.set(installationId, {
      token,
      cachedAt: new Date(),
    });

    return token;
  }

  /**
   * Checks if a token is expiring soon
   * @param token - Token to check
   * @returns True if token expires within the buffer period
   */
  private isTokenExpiringSoon(token: InstallationToken): boolean {
    const expiresAt = new Date(token.expiresAt).getTime();
    const now = Date.now();
    return expiresAt - now < this.TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Invalidates a cached installation token
   * @param installationId - The installation ID to invalidate
   */
  invalidateToken(installationId: number): void {
    this.tokenCache.delete(installationId);
  }

  /**
   * Clears all cached tokens
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Gets the webhook secret for signature verification
   * @returns Webhook secret
   */
  getWebhookSecret(): string {
    return this.config.webhookSecret;
  }

  /**
   * Gets the filter configuration
   * @returns Filter configuration or undefined
   */
  getFilters(): GitHubAppConfig['filters'] {
    return this.config.filters;
  }

  /**
   * Gets cache statistics for monitoring
   * @returns Cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ installationId: number; expiresAt: Date }> } {
    const entries: Array<{ installationId: number; expiresAt: Date }> = [];

    this.tokenCache.forEach((entry, installationId) => {
      entries.push({
        installationId,
        expiresAt: entry.token.expiresAt,
      });
    });

    return {
      size: this.tokenCache.size,
      entries,
    };
  }
}

/**
 * Creates JWT headers for GitHub App authentication
 * @param jwt - JWT token
 * @returns Headers object
 */
export function createJwtHeaders(jwt: string): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Creates headers for installation token authentication
 * @param token - Installation token
 * @returns Headers object
 */
export function createInstallationHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
