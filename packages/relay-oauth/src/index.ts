/**
 * @fileoverview OAuth provider integration for social authentication
 * Supports Google, GitHub, and Microsoft OAuth 2.0 flows.
 * @module @relay/oauth
 */

/**
 * Supported OAuth providers.
 */
export type OAuthProvider = 'google' | 'github' | 'microsoft';

/**
 * OAuth configuration for a provider.
 */
export interface OAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Authorization URL */
  authUrl: string;
  /** Token exchange URL */
  tokenUrl: string;
  /** User info URL */
  userInfoUrl: string;
  /** OAuth scopes */
  scopes: string[];
}

/**
 * OAuth user profile from provider.
 */
export interface OAuthUserProfile {
  /** Provider-specific user ID */
  providerId: string;
  /** User's email address */
  email: string;
  /** User's display name */
  name: string;
  /** Avatar/profile image URL */
  avatarUrl?: string;
  /** Whether email is verified by provider */
  emailVerified: boolean;
}

/**
 * OAuth token response.
 */
export interface OAuthTokenResponse {
  /** Access token */
  access_token: string;
  /** Token type (usually "Bearer") */
  token_type: string;
  /** Token expiration in seconds */
  expires_in?: number;
  /** Refresh token (if available) */
  refresh_token?: string;
  /** ID token for OpenID Connect providers */
  id_token?: string;
  /** Granted scopes */
  scope?: string;
}

/**
 * OAuth provider configurations.
 */
const PROVIDER_CONFIGS: Record<OAuthProvider, Omit<OAuthConfig, 'clientId' | 'clientSecret'>> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  },
};

/**
 * Get OAuth configuration for a provider.
 * @param provider - OAuth provider name
 * @param clientId - OAuth client ID
 * @param clientSecret - OAuth client secret
 * @returns Full OAuth configuration
 */
export function getOAuthConfig(
  provider: OAuthProvider,
  clientId: string,
  clientSecret: string
): OAuthConfig {
  const baseConfig = PROVIDER_CONFIGS[provider];

  return {
    ...baseConfig,
    clientId,
    clientSecret,
  };
}

/**
 * Get OAuth configuration from environment variables.
 * @param provider - OAuth provider name
 * @returns Full OAuth configuration
 * @throws Error if provider credentials are not configured
 */
export function getOAuthConfigFromEnv(provider: OAuthProvider): OAuthConfig {
  const baseConfig = PROVIDER_CONFIGS[provider];

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  switch (provider) {
    case 'google':
      clientId = process.env.GOOGLE_CLIENT_ID;
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      break;
    case 'github':
      clientId = process.env.GITHUB_CLIENT_ID;
      clientSecret = process.env.GITHUB_CLIENT_SECRET;
      break;
    case 'microsoft':
      clientId = process.env.MICROSOFT_CLIENT_ID;
      clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      break;
  }

  if (!clientId || !clientSecret) {
    throw new Error(`OAuth credentials not configured for ${provider}`);
  }

  return {
    ...baseConfig,
    clientId,
    clientSecret,
  };
}

/**
 * Check if a provider is configured in environment variables.
 * @param provider - OAuth provider name
 * @returns Whether the provider has valid credentials
 */
export function isProviderConfigured(provider: OAuthProvider): boolean {
  try {
    getOAuthConfigFromEnv(provider);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of configured OAuth providers from environment.
 * @returns Array of configured provider names
 */
export function getConfiguredProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = ['google', 'github', 'microsoft'];
  return providers.filter(isProviderConfigured);
}

/**
 * Generate OAuth authorization URL.
 * @param config - OAuth provider configuration
 * @param redirectUri - Callback URL after authorization
 * @param state - CSRF protection state token
 * @param additionalParams - Additional query parameters (optional)
 * @returns Authorization URL to redirect user to
 */
export function getAuthorizationUrl(
  config: OAuthConfig,
  redirectUri: string,
  state: string,
  additionalParams?: Record<string, string>
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    ...additionalParams,
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Generate OAuth authorization URL for a provider with environment credentials.
 * @param provider - OAuth provider
 * @param redirectUri - Callback URL after authorization
 * @param state - CSRF protection state token
 * @returns Authorization URL to redirect user to
 */
export function getAuthorizationUrlForProvider(
  provider: OAuthProvider,
  redirectUri: string,
  state: string
): string {
  const config = getOAuthConfigFromEnv(provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  // Provider-specific parameters
  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token.
 * @param config - OAuth provider configuration
 * @param code - Authorization code from callback
 * @param redirectUri - Same redirect URI used in authorization
 * @returns OAuth tokens
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  redirectUri: string
): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // GitHub requires Accept header for JSON response
  if (config.tokenUrl.includes('github.com')) {
    headers['Accept'] = 'application/json';
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }

  const tokenData = (await response.json()) as OAuthTokenResponse;
  return tokenData;
}

/**
 * Fetch user profile from OAuth provider.
 * @param config - OAuth provider configuration
 * @param accessToken - Access token from token exchange
 * @param provider - Provider type for normalization
 * @returns Normalized user profile
 */
export async function fetchUserProfile(
  config: OAuthConfig,
  accessToken: string,
  provider: OAuthProvider
): Promise<OAuthUserProfile> {
  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch user profile: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Normalize profile based on provider
  switch (provider) {
    case 'google':
      return normalizeGoogleProfile(data);
    case 'github':
      return await normalizeGitHubProfile(data, accessToken);
    case 'microsoft':
      return normalizeMicrosoftProfile(data);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Normalize Google user profile.
 * @param data - Raw Google profile data
 * @returns Normalized user profile
 */
function normalizeGoogleProfile(data: {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}): OAuthUserProfile {
  return {
    providerId: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.picture,
    emailVerified: data.verified_email ?? false,
  };
}

/**
 * Normalize GitHub user profile.
 * GitHub may require a separate API call for email if not public.
 * @param data - Raw GitHub profile data
 * @param accessToken - Access token for additional API calls
 * @returns Normalized user profile
 */
async function normalizeGitHubProfile(
  data: {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  },
  accessToken: string
): Promise<OAuthUserProfile> {
  let email = data.email;

  // If email is not in profile, fetch from emails endpoint
  if (!email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (emailResponse.ok) {
      const emails = (await emailResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      email = primaryEmail?.email || emails[0]?.email;
    }
  }

  if (!email) {
    throw new Error('Could not retrieve email from GitHub');
  }

  return {
    providerId: data.id.toString(),
    email,
    name: data.name || data.login,
    avatarUrl: data.avatar_url,
    emailVerified: true, // GitHub verifies emails
  };
}

/**
 * Normalize Microsoft user profile.
 * @param data - Raw Microsoft profile data
 * @returns Normalized user profile
 */
function normalizeMicrosoftProfile(data: {
  id: string;
  mail?: string;
  userPrincipalName: string;
  displayName: string;
}): OAuthUserProfile {
  return {
    providerId: data.id,
    email: data.mail || data.userPrincipalName,
    name: data.displayName,
    avatarUrl: undefined, // Microsoft Graph requires separate photo endpoint
    emailVerified: true, // Microsoft accounts are verified
  };
}

/**
 * Generate a secure random state token for CSRF protection.
 * @returns Random state string (64 characters hex)
 */
export function generateStateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Complete OAuth flow by exchanging code for token and fetching user profile.
 * @param provider - OAuth provider
 * @param code - Authorization code from callback
 * @param redirectUri - Same redirect URI used in authorization
 * @returns User profile
 */
export async function completeOAuthFlow(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<OAuthUserProfile> {
  const config = getOAuthConfigFromEnv(provider);
  const tokenResponse = await exchangeCodeForToken(config, code, redirectUri);
  const userProfile = await fetchUserProfile(config, tokenResponse.access_token, provider);
  return userProfile;
}

/**
 * Complete OAuth flow with custom configuration.
 * @param config - OAuth provider configuration
 * @param provider - Provider type for profile normalization
 * @param code - Authorization code from callback
 * @param redirectUri - Same redirect URI used in authorization
 * @returns User profile
 */
export async function completeOAuthFlowWithConfig(
  config: OAuthConfig,
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<OAuthUserProfile> {
  const tokenResponse = await exchangeCodeForToken(config, code, redirectUri);
  const userProfile = await fetchUserProfile(config, tokenResponse.access_token, provider);
  return userProfile;
}
