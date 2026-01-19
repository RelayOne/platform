//! OAuth 2.0 provider support
//!
//! This module provides OAuth 2.0 integration for common identity providers.
//! Supports Google, GitHub, Microsoft, Apple, and custom providers.

use crate::claims::{AuthMethod, PlatformClaims};
use crate::error::{AuthError, AuthResult};
use async_trait::async_trait;
use chrono::Duration;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Supported OAuth providers.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OAuthProvider {
    /// Google OAuth
    Google,
    /// GitHub OAuth
    GitHub,
    /// Microsoft OAuth (Azure AD)
    Microsoft,
    /// Apple Sign In
    Apple,
    /// Slack OAuth
    Slack,
    /// Custom OAuth provider
    Custom,
}

impl OAuthProvider {
    /// Get the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            OAuthProvider::Google => "google",
            OAuthProvider::GitHub => "github",
            OAuthProvider::Microsoft => "microsoft",
            OAuthProvider::Apple => "apple",
            OAuthProvider::Slack => "slack",
            OAuthProvider::Custom => "custom",
        }
    }

    /// Parse from string.
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "google" => Some(OAuthProvider::Google),
            "github" => Some(OAuthProvider::GitHub),
            "microsoft" | "azure" | "azuread" => Some(OAuthProvider::Microsoft),
            "apple" => Some(OAuthProvider::Apple),
            "slack" => Some(OAuthProvider::Slack),
            "custom" => Some(OAuthProvider::Custom),
            _ => None,
        }
    }

    /// Get the default authorization URL for the provider.
    pub fn auth_url(&self) -> Option<&'static str> {
        match self {
            OAuthProvider::Google => Some("https://accounts.google.com/o/oauth2/v2/auth"),
            OAuthProvider::GitHub => Some("https://github.com/login/oauth/authorize"),
            OAuthProvider::Microsoft => {
                Some("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
            }
            OAuthProvider::Apple => Some("https://appleid.apple.com/auth/authorize"),
            OAuthProvider::Slack => Some("https://slack.com/oauth/v2/authorize"),
            OAuthProvider::Custom => None,
        }
    }

    /// Get the default token URL for the provider.
    pub fn token_url(&self) -> Option<&'static str> {
        match self {
            OAuthProvider::Google => Some("https://oauth2.googleapis.com/token"),
            OAuthProvider::GitHub => Some("https://github.com/login/oauth/access_token"),
            OAuthProvider::Microsoft => {
                Some("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            }
            OAuthProvider::Apple => Some("https://appleid.apple.com/auth/token"),
            OAuthProvider::Slack => Some("https://slack.com/api/oauth.v2.access"),
            OAuthProvider::Custom => None,
        }
    }

    /// Get default scopes for the provider.
    pub fn default_scopes(&self) -> Vec<&'static str> {
        match self {
            OAuthProvider::Google => vec!["openid", "email", "profile"],
            OAuthProvider::GitHub => vec!["user:email", "read:user"],
            OAuthProvider::Microsoft => vec!["openid", "email", "profile", "User.Read"],
            OAuthProvider::Apple => vec!["name", "email"],
            OAuthProvider::Slack => vec!["users:read", "users:read.email"],
            OAuthProvider::Custom => vec![],
        }
    }
}

/// OAuth provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    /// Provider type
    pub provider: OAuthProvider,

    /// Client ID
    pub client_id: String,

    /// Client secret
    pub client_secret: String,

    /// Authorization URL (optional, uses default for known providers)
    pub auth_url: Option<String>,

    /// Token URL (optional, uses default for known providers)
    pub token_url: Option<String>,

    /// Redirect URL
    pub redirect_url: String,

    /// Scopes to request
    pub scopes: Vec<String>,

    /// Additional parameters
    #[serde(default)]
    pub extra_params: HashMap<String, String>,
}

impl OAuthConfig {
    /// Create a new OAuth configuration.
    pub fn new(
        provider: OAuthProvider,
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
        redirect_url: impl Into<String>,
    ) -> Self {
        Self {
            provider,
            client_id: client_id.into(),
            client_secret: client_secret.into(),
            auth_url: None,
            token_url: None,
            redirect_url: redirect_url.into(),
            scopes: provider
                .default_scopes()
                .iter()
                .map(|s| s.to_string())
                .collect(),
            extra_params: HashMap::new(),
        }
    }

    /// Get the authorization URL.
    pub fn get_auth_url(&self) -> AuthResult<String> {
        self.auth_url
            .clone()
            .or_else(|| self.provider.auth_url().map(String::from))
            .ok_or_else(|| AuthError::ConfigError("Authorization URL not configured".to_string()))
    }

    /// Get the token URL.
    pub fn get_token_url(&self) -> AuthResult<String> {
        self.token_url
            .clone()
            .or_else(|| self.provider.token_url().map(String::from))
            .ok_or_else(|| AuthError::ConfigError("Token URL not configured".to_string()))
    }
}

/// OAuth user information retrieved from provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthUserInfo {
    /// Provider-specific user ID
    pub provider_id: String,

    /// Provider type
    pub provider: OAuthProvider,

    /// Email address
    pub email: Option<String>,

    /// Whether email is verified
    pub email_verified: bool,

    /// Display name
    pub name: Option<String>,

    /// First name
    pub given_name: Option<String>,

    /// Last name
    pub family_name: Option<String>,

    /// Profile picture URL
    pub picture: Option<String>,

    /// Locale
    pub locale: Option<String>,

    /// Raw provider response
    #[serde(default)]
    pub raw: HashMap<String, serde_json::Value>,
}

impl OAuthUserInfo {
    /// Create claims from OAuth user info.
    pub fn to_claims(&self, user_id: Uuid, duration: Duration) -> AuthResult<PlatformClaims> {
        let email = self
            .email
            .clone()
            .ok_or_else(|| AuthError::MissingClaim("email".to_string()))?;

        let mut claims =
            PlatformClaims::new(user_id, email, duration).with_auth_method(AuthMethod::OAuth);

        claims.email_verified = self.email_verified;
        claims.name = self.name.clone();

        Ok(claims)
    }
}

/// OAuth token response from provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    /// Access token
    pub access_token: String,

    /// Token type (usually "Bearer")
    pub token_type: String,

    /// Expires in seconds
    pub expires_in: Option<i64>,

    /// Refresh token (if provided)
    pub refresh_token: Option<String>,

    /// ID token (for OIDC)
    pub id_token: Option<String>,

    /// Granted scopes
    pub scope: Option<String>,
}

/// OAuth state for CSRF protection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthState {
    /// Random state value
    pub state: String,

    /// PKCE code verifier (for PKCE flow)
    pub code_verifier: Option<String>,

    /// Redirect URL after authentication
    pub redirect_after: Option<String>,

    /// Additional data to pass through
    #[serde(default)]
    pub extra: HashMap<String, String>,

    /// Created timestamp
    pub created_at: i64,
}

impl OAuthState {
    /// Create a new OAuth state.
    pub fn new() -> Self {
        use rand::Rng;
        let state: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect();

        Self {
            state,
            code_verifier: None,
            redirect_after: None,
            extra: HashMap::new(),
            created_at: chrono::Utc::now().timestamp(),
        }
    }

    /// Create with PKCE support.
    pub fn with_pkce() -> Self {
        use rand::Rng;
        use sha2::{Digest, Sha256};

        let code_verifier: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(64)
            .map(char::from)
            .collect();

        let mut state = Self::new();
        state.code_verifier = Some(code_verifier);
        state
    }

    /// Get the PKCE code challenge.
    pub fn code_challenge(&self) -> Option<String> {
        use sha2::{Digest, Sha256};

        self.code_verifier.as_ref().map(|verifier| {
            let mut hasher = Sha256::new();
            hasher.update(verifier.as_bytes());
            let hash = hasher.finalize();
            base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, hash)
        })
    }

    /// Check if the state has expired (default: 10 minutes).
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        now - self.created_at > 600
    }
}

impl Default for OAuthState {
    fn default() -> Self {
        Self::new()
    }
}

/// Trait for OAuth provider implementations.
#[async_trait]
pub trait OAuthProviderClient: Send + Sync {
    /// Get the authorization URL.
    async fn authorization_url(&self, state: &OAuthState) -> AuthResult<String>;

    /// Exchange authorization code for tokens.
    async fn exchange_code(&self, code: &str, state: &OAuthState) -> AuthResult<OAuthTokens>;

    /// Get user info from access token.
    async fn get_user_info(&self, access_token: &str) -> AuthResult<OAuthUserInfo>;

    /// Refresh access token.
    async fn refresh_token(&self, refresh_token: &str) -> AuthResult<OAuthTokens>;

    /// Revoke token.
    async fn revoke_token(&self, token: &str) -> AuthResult<()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oauth_provider_parsing() {
        assert_eq!(OAuthProvider::parse("google"), Some(OAuthProvider::Google));
        assert_eq!(OAuthProvider::parse("GitHub"), Some(OAuthProvider::GitHub));
        assert_eq!(
            OAuthProvider::parse("microsoft"),
            Some(OAuthProvider::Microsoft)
        );
        assert_eq!(
            OAuthProvider::parse("azure"),
            Some(OAuthProvider::Microsoft)
        );
        assert_eq!(OAuthProvider::parse("invalid"), None);
    }

    #[test]
    fn test_oauth_provider_urls() {
        assert!(OAuthProvider::Google.auth_url().is_some());
        assert!(OAuthProvider::Google.token_url().is_some());
        assert!(OAuthProvider::Custom.auth_url().is_none());
    }

    #[test]
    fn test_oauth_config() {
        let config = OAuthConfig::new(
            OAuthProvider::Google,
            "client-id",
            "client-secret",
            "http://localhost/callback",
        );

        assert_eq!(config.provider, OAuthProvider::Google);
        assert!(config.get_auth_url().is_ok());
        assert!(config.get_token_url().is_ok());
    }

    #[test]
    fn test_oauth_state() {
        let state = OAuthState::new();
        assert!(!state.state.is_empty());
        assert!(!state.is_expired());
        assert!(state.code_verifier.is_none());
    }

    #[test]
    fn test_oauth_state_with_pkce() {
        let state = OAuthState::with_pkce();
        assert!(state.code_verifier.is_some());
        assert!(state.code_challenge().is_some());
    }
}
