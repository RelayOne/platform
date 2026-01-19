//! # Platform Authentication
//!
//! This crate provides unified authentication for the Relay platform,
//! shared across Verity, NoteMan, and ShipCheck applications.
//!
//! ## Overview
//!
//! The platform-auth crate handles:
//! - **JWT**: Token generation, validation, and claims management
//! - **OAuth 2.0**: Support for Google, GitHub, Microsoft, Apple, Slack
//! - **OIDC**: OpenID Connect integration (optional)
//! - **SAML**: Enterprise SSO support (optional)
//! - **Sessions**: Session management and invalidation
//!
//! ## Features
//!
//! - `jwt` (default): JWT token support using jsonwebtoken
//! - `oauth` (default): OAuth 2.0 provider support
//! - `oidc`: OpenID Connect support
//! - `saml`: SAML SSO support
//! - `full`: All features enabled
//!
//! ## Usage
//!
//! ### JWT Authentication
//!
//! ```rust,no_run
//! use platform_auth::{JwtService, JwtConfig, PlatformClaims};
//! use chrono::Duration;
//! use uuid::Uuid;
//!
//! // Create JWT service with secret
//! let service = JwtService::with_secret("your-secret-key").unwrap();
//!
//! // Generate access token
//! let user_id = Uuid::now_v7();
//! let token = service.generate_access_token(user_id, "user@example.com").unwrap();
//!
//! // Validate token
//! let claims = service.validate_token(&token).unwrap();
//! assert_eq!(claims.user_id(), Some(user_id));
//! ```
//!
//! ### OAuth 2.0
//!
//! ```rust,no_run
//! use platform_auth::{OAuthConfig, OAuthProvider, OAuthState};
//!
//! // Configure OAuth provider
//! let config = OAuthConfig::new(
//!     OAuthProvider::Google,
//!     "client-id",
//!     "client-secret",
//!     "https://your-app.com/callback",
//! );
//!
//! // Create state for CSRF protection
//! let state = OAuthState::with_pkce();
//! ```
//!
//! ### Claims Structure
//!
//! The `PlatformClaims` structure provides:
//! - Standard JWT claims (sub, iss, aud, exp, iat, nbf, jti)
//! - Multi-organization support with roles
//! - Per-app permissions
//! - Session management
//! - MFA status
//!
//! ## Cross-App Integration
//!
//! This crate integrates with:
//! - `platform-org`: Organization and role information in claims
//! - `platform-rbac`: Permission checking for resources
//! - `platform-events`: Authentication events

pub mod claims;
pub mod cross_app;
pub mod error;
#[cfg(feature = "jwt")]
pub mod jwt;
#[cfg(feature = "oauth")]
pub mod oauth;

// Re-export main types
pub use claims::{AuthMethod, OrgClaim, PlatformClaims, TokenType};
pub use cross_app::{
    AppId, CrossAppToken, ServiceToken, SourceContext, TokenExchangeRequest, TokenExchangeResponse,
};
pub use error::{AuthError, AuthResult};

#[cfg(feature = "jwt")]
pub use jwt::{JwtAlgorithm, JwtConfig, JwtService, TokenPair};

#[cfg(feature = "oauth")]
pub use oauth::{
    OAuthConfig, OAuthProvider, OAuthProviderClient, OAuthState, OAuthTokens, OAuthUserInfo,
};
