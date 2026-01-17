//! Error types for authentication operations
//!
//! This module defines all error types that can occur during authentication,
//! token validation, and identity provider interactions.

use thiserror::Error;

/// Authentication error types.
///
/// These errors cover all authentication-related failures including
/// token validation, provider errors, and configuration issues.
#[derive(Debug, Error)]
pub enum AuthError {
    /// JWT token has expired
    #[error("Token has expired")]
    TokenExpired,

    /// JWT token is invalid (malformed, bad signature, etc.)
    #[error("Invalid token: {0}")]
    InvalidToken(String),

    /// Token is missing required claims
    #[error("Missing required claim: {0}")]
    MissingClaim(String),

    /// User is not authorized for this operation
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    /// User does not have required permissions
    #[error("Forbidden: insufficient permissions")]
    Forbidden,

    /// OAuth provider error
    #[error("OAuth error: {0}")]
    OAuthError(String),

    /// OIDC provider error
    #[error("OIDC error: {0}")]
    OidcError(String),

    /// SAML provider error
    #[error("SAML error: {0}")]
    SamlError(String),

    /// Invalid credentials
    #[error("Invalid credentials")]
    InvalidCredentials,

    /// Account is locked or disabled
    #[error("Account is locked")]
    AccountLocked,

    /// Account requires MFA
    #[error("MFA required")]
    MfaRequired,

    /// MFA verification failed
    #[error("MFA verification failed")]
    MfaFailed,

    /// Session has been invalidated
    #[error("Session invalidated")]
    SessionInvalidated,

    /// Rate limit exceeded
    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    /// Configuration error
    #[error("Configuration error: {0}")]
    ConfigError(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}

/// Result type for authentication operations.
pub type AuthResult<T> = Result<T, AuthError>;

impl AuthError {
    /// Check if this error should be logged at error level.
    ///
    /// Some errors (like invalid credentials) are expected and
    /// should not be logged as errors.
    pub fn is_server_error(&self) -> bool {
        matches!(self, AuthError::Internal(_) | AuthError::ConfigError(_))
    }

    /// Get HTTP status code for this error.
    pub fn status_code(&self) -> u16 {
        match self {
            AuthError::TokenExpired
            | AuthError::InvalidToken(_)
            | AuthError::MissingClaim(_)
            | AuthError::InvalidCredentials
            | AuthError::MfaFailed => 401,

            AuthError::Unauthorized(_) => 401,
            AuthError::Forbidden => 403,
            AuthError::AccountLocked => 403,
            AuthError::MfaRequired => 403,
            AuthError::SessionInvalidated => 401,
            AuthError::RateLimitExceeded => 429,

            AuthError::OAuthError(_)
            | AuthError::OidcError(_)
            | AuthError::SamlError(_)
            | AuthError::ConfigError(_)
            | AuthError::Internal(_) => 500,
        }
    }

    /// Get error code for API responses.
    pub fn error_code(&self) -> &'static str {
        match self {
            AuthError::TokenExpired => "TOKEN_EXPIRED",
            AuthError::InvalidToken(_) => "INVALID_TOKEN",
            AuthError::MissingClaim(_) => "MISSING_CLAIM",
            AuthError::Unauthorized(_) => "UNAUTHORIZED",
            AuthError::Forbidden => "FORBIDDEN",
            AuthError::OAuthError(_) => "OAUTH_ERROR",
            AuthError::OidcError(_) => "OIDC_ERROR",
            AuthError::SamlError(_) => "SAML_ERROR",
            AuthError::InvalidCredentials => "INVALID_CREDENTIALS",
            AuthError::AccountLocked => "ACCOUNT_LOCKED",
            AuthError::MfaRequired => "MFA_REQUIRED",
            AuthError::MfaFailed => "MFA_FAILED",
            AuthError::SessionInvalidated => "SESSION_INVALIDATED",
            AuthError::RateLimitExceeded => "RATE_LIMIT_EXCEEDED",
            AuthError::ConfigError(_) => "CONFIG_ERROR",
            AuthError::Internal(_) => "INTERNAL_ERROR",
        }
    }
}
