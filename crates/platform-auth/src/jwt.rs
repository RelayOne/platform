//! JWT token generation and validation
//!
//! This module provides JWT token operations using the jsonwebtoken crate.
//! It supports RS256, RS384, RS512, ES256, ES384, and HS256 algorithms.

use crate::claims::PlatformClaims;
use crate::error::{AuthError, AuthResult};
use chrono::Duration;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[cfg(feature = "jwt")]
use jsonwebtoken::{
    decode, encode, Algorithm, DecodingKey, EncodingKey, Header, TokenData, Validation,
};

/// JWT configuration for token generation and validation.
#[derive(Debug, Clone)]
pub struct JwtConfig {
    /// Secret key for HMAC algorithms (HS256, HS384, HS512)
    pub secret: Option<String>,

    /// Private key (PEM) for RSA/EC algorithms
    pub private_key: Option<String>,

    /// Public key (PEM) for RSA/EC algorithms
    pub public_key: Option<String>,

    /// Algorithm to use
    pub algorithm: JwtAlgorithm,

    /// Token issuer
    pub issuer: String,

    /// Token audience
    pub audience: Vec<String>,

    /// Access token duration
    pub access_token_duration: Duration,

    /// Refresh token duration
    pub refresh_token_duration: Duration,
}

impl Default for JwtConfig {
    fn default() -> Self {
        Self {
            secret: None,
            private_key: None,
            public_key: None,
            algorithm: JwtAlgorithm::HS256,
            issuer: "relay-platform".to_string(),
            audience: vec!["verity".to_string(), "noteman".to_string(), "shipcheck".to_string()],
            access_token_duration: Duration::hours(1),
            refresh_token_duration: Duration::days(7),
        }
    }
}

/// Supported JWT algorithms.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum JwtAlgorithm {
    /// HMAC using SHA-256
    HS256,
    /// HMAC using SHA-384
    HS384,
    /// HMAC using SHA-512
    HS512,
    /// RSASSA-PKCS1-v1_5 using SHA-256
    RS256,
    /// RSASSA-PKCS1-v1_5 using SHA-384
    RS384,
    /// RSASSA-PKCS1-v1_5 using SHA-512
    RS512,
    /// ECDSA using P-256 and SHA-256
    ES256,
    /// ECDSA using P-384 and SHA-384
    ES384,
}

#[cfg(feature = "jwt")]
impl From<JwtAlgorithm> for Algorithm {
    fn from(alg: JwtAlgorithm) -> Self {
        match alg {
            JwtAlgorithm::HS256 => Algorithm::HS256,
            JwtAlgorithm::HS384 => Algorithm::HS384,
            JwtAlgorithm::HS512 => Algorithm::HS512,
            JwtAlgorithm::RS256 => Algorithm::RS256,
            JwtAlgorithm::RS384 => Algorithm::RS384,
            JwtAlgorithm::RS512 => Algorithm::RS512,
            JwtAlgorithm::ES256 => Algorithm::ES256,
            JwtAlgorithm::ES384 => Algorithm::ES384,
        }
    }
}

/// JWT service for token operations.
pub struct JwtService {
    config: JwtConfig,
    #[cfg(feature = "jwt")]
    encoding_key: EncodingKey,
    #[cfg(feature = "jwt")]
    decoding_key: DecodingKey,
}

impl std::fmt::Debug for JwtService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JwtService")
            .field("config", &self.config)
            .field("encoding_key", &"[REDACTED]")
            .field("decoding_key", &"[REDACTED]")
            .finish()
    }
}

impl JwtService {
    /// Create a new JWT service with the given configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - JWT configuration
    ///
    /// # Returns
    ///
    /// JWT service or configuration error
    #[cfg(feature = "jwt")]
    pub fn new(config: JwtConfig) -> AuthResult<Self> {
        let encoding_key = Self::create_encoding_key(&config)?;
        let decoding_key = Self::create_decoding_key(&config)?;

        Ok(Self {
            config,
            encoding_key,
            decoding_key,
        })
    }

    /// Create with a simple secret (HS256).
    ///
    /// # Arguments
    ///
    /// * `secret` - The secret key for HMAC
    #[cfg(feature = "jwt")]
    pub fn with_secret(secret: impl Into<String>) -> AuthResult<Self> {
        let config = JwtConfig {
            secret: Some(secret.into()),
            algorithm: JwtAlgorithm::HS256,
            ..Default::default()
        };
        Self::new(config)
    }

    #[cfg(feature = "jwt")]
    fn create_encoding_key(config: &JwtConfig) -> AuthResult<EncodingKey> {
        match config.algorithm {
            JwtAlgorithm::HS256 | JwtAlgorithm::HS384 | JwtAlgorithm::HS512 => {
                let secret = config
                    .secret
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Secret required for HMAC".to_string()))?;
                Ok(EncodingKey::from_secret(secret.as_bytes()))
            }
            JwtAlgorithm::RS256 | JwtAlgorithm::RS384 | JwtAlgorithm::RS512 => {
                let key = config
                    .private_key
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Private key required for RSA".to_string()))?;
                EncodingKey::from_rsa_pem(key.as_bytes())
                    .map_err(|e| AuthError::ConfigError(format!("Invalid RSA private key: {}", e)))
            }
            JwtAlgorithm::ES256 | JwtAlgorithm::ES384 => {
                let key = config
                    .private_key
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Private key required for EC".to_string()))?;
                EncodingKey::from_ec_pem(key.as_bytes())
                    .map_err(|e| AuthError::ConfigError(format!("Invalid EC private key: {}", e)))
            }
        }
    }

    #[cfg(feature = "jwt")]
    fn create_decoding_key(config: &JwtConfig) -> AuthResult<DecodingKey> {
        match config.algorithm {
            JwtAlgorithm::HS256 | JwtAlgorithm::HS384 | JwtAlgorithm::HS512 => {
                let secret = config
                    .secret
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Secret required for HMAC".to_string()))?;
                Ok(DecodingKey::from_secret(secret.as_bytes()))
            }
            JwtAlgorithm::RS256 | JwtAlgorithm::RS384 | JwtAlgorithm::RS512 => {
                let key = config
                    .public_key
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Public key required for RSA".to_string()))?;
                DecodingKey::from_rsa_pem(key.as_bytes())
                    .map_err(|e| AuthError::ConfigError(format!("Invalid RSA public key: {}", e)))
            }
            JwtAlgorithm::ES256 | JwtAlgorithm::ES384 => {
                let key = config
                    .public_key
                    .as_ref()
                    .ok_or_else(|| AuthError::ConfigError("Public key required for EC".to_string()))?;
                DecodingKey::from_ec_pem(key.as_bytes())
                    .map_err(|e| AuthError::ConfigError(format!("Invalid EC public key: {}", e)))
            }
        }
    }

    /// Generate an access token for a user.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user's unique identifier
    /// * `email` - The user's email address
    ///
    /// # Returns
    ///
    /// Encoded JWT token string
    #[cfg(feature = "jwt")]
    pub fn generate_access_token(&self, user_id: Uuid, email: impl Into<String>) -> AuthResult<String> {
        let claims = PlatformClaims::new(user_id, email, self.config.access_token_duration);
        self.encode_claims(&claims)
    }

    /// Generate a refresh token for a user.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user's unique identifier
    /// * `email` - The user's email address
    ///
    /// # Returns
    ///
    /// Encoded JWT token string
    #[cfg(feature = "jwt")]
    pub fn generate_refresh_token(&self, user_id: Uuid, email: impl Into<String>) -> AuthResult<String> {
        let claims = PlatformClaims::new(user_id, email, self.config.refresh_token_duration)
            .with_token_type(crate::claims::TokenType::Refresh);
        self.encode_claims(&claims)
    }

    /// Generate a token from existing claims.
    ///
    /// # Arguments
    ///
    /// * `claims` - Platform claims to encode
    ///
    /// # Returns
    ///
    /// Encoded JWT token string
    #[cfg(feature = "jwt")]
    pub fn encode_claims(&self, claims: &PlatformClaims) -> AuthResult<String> {
        let header = Header::new(self.config.algorithm.into());
        encode(&header, claims, &self.encoding_key)
            .map_err(|e| AuthError::Internal(format!("Token encoding failed: {}", e)))
    }

    /// Validate and decode a token.
    ///
    /// # Arguments
    ///
    /// * `token` - The JWT token string
    ///
    /// # Returns
    ///
    /// Decoded claims if valid
    #[cfg(feature = "jwt")]
    pub fn validate_token(&self, token: &str) -> AuthResult<PlatformClaims> {
        let mut validation = Validation::new(self.config.algorithm.into());
        validation.set_issuer(&[&self.config.issuer]);
        validation.set_audience(&self.config.audience);

        let token_data: TokenData<PlatformClaims> = decode(token, &self.decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                jsonwebtoken::errors::ErrorKind::InvalidToken => {
                    AuthError::InvalidToken("Malformed token".to_string())
                }
                jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                    AuthError::InvalidToken("Invalid signature".to_string())
                }
                jsonwebtoken::errors::ErrorKind::InvalidIssuer => {
                    AuthError::InvalidToken("Invalid issuer".to_string())
                }
                jsonwebtoken::errors::ErrorKind::InvalidAudience => {
                    AuthError::InvalidToken("Invalid audience".to_string())
                }
                _ => AuthError::InvalidToken(e.to_string()),
            })?;

        Ok(token_data.claims)
    }

    /// Decode a token without validating (for debugging).
    ///
    /// # Arguments
    ///
    /// * `token` - The JWT token string
    ///
    /// # Returns
    ///
    /// Decoded claims (unvalidated)
    ///
    /// # Warning
    ///
    /// This should only be used for debugging. Always use `validate_token`
    /// for production code.
    #[cfg(feature = "jwt")]
    pub fn decode_unvalidated(&self, token: &str) -> AuthResult<PlatformClaims> {
        let mut validation = Validation::new(self.config.algorithm.into());
        validation.insecure_disable_signature_validation();
        validation.validate_exp = false;

        let token_data: TokenData<PlatformClaims> = decode(token, &self.decoding_key, &validation)
            .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

        Ok(token_data.claims)
    }

    /// Get the configuration.
    pub fn config(&self) -> &JwtConfig {
        &self.config
    }

    /// Encode a cross-app token into a JWT string.
    ///
    /// This creates a JWT token that can be used for cross-app authentication,
    /// allowing one application to make authenticated requests to another
    /// application on behalf of a user.
    ///
    /// # Arguments
    ///
    /// * `token` - The cross-app token to encode
    ///
    /// # Returns
    ///
    /// Encoded JWT token string
    ///
    /// # Errors
    ///
    /// Returns an error if token encoding fails
    #[cfg(feature = "jwt")]
    pub fn encode_cross_app_token(&self, token: &crate::cross_app::CrossAppToken) -> AuthResult<String> {
        let header = Header::new(self.config.algorithm.into());
        encode(&header, token, &self.encoding_key)
            .map_err(|e| AuthError::Internal(format!("Cross-app token encoding failed: {}", e)))
    }

    /// Decode and validate a cross-app token.
    ///
    /// This validates the JWT signature and expiration, then returns the
    /// cross-app token claims. Additional validation (e.g., checking if the
    /// token is valid for the current app) should be done by the caller.
    ///
    /// # Arguments
    ///
    /// * `token` - The JWT token string to decode
    ///
    /// # Returns
    ///
    /// Decoded cross-app token if valid
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The token is malformed or has an invalid signature
    /// - The token has expired
    /// - The issuer or audience is invalid
    #[cfg(feature = "jwt")]
    pub fn decode_cross_app_token(&self, token: &str) -> AuthResult<crate::cross_app::CrossAppToken> {
        let mut validation = Validation::new(self.config.algorithm.into());
        // Cross-app tokens can be issued by any platform app
        validation.set_issuer(&["verity", "noteman", "shipcheck"]);
        // Don't validate audience here - let the caller check if token is valid for their app
        validation.validate_aud = false;

        let token_data: TokenData<crate::cross_app::CrossAppToken> =
            decode(token, &self.decoding_key, &validation)
                .map_err(|e| match e.kind() {
                    jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                    jsonwebtoken::errors::ErrorKind::InvalidToken => {
                        AuthError::InvalidToken("Malformed cross-app token".to_string())
                    }
                    jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                        AuthError::InvalidToken("Invalid signature".to_string())
                    }
                    jsonwebtoken::errors::ErrorKind::InvalidIssuer => {
                        AuthError::InvalidToken("Invalid issuer".to_string())
                    }
                    _ => AuthError::InvalidToken(e.to_string()),
                })?;

        Ok(token_data.claims)
    }

    /// Encode a service token into a JWT string.
    ///
    /// Service tokens are used for service-to-service communication without
    /// user context, typically for background jobs and webhooks.
    ///
    /// # Arguments
    ///
    /// * `token` - The service token to encode
    ///
    /// # Returns
    ///
    /// Encoded JWT token string
    ///
    /// # Errors
    ///
    /// Returns an error if token encoding fails
    #[cfg(feature = "jwt")]
    pub fn encode_service_token(&self, token: &crate::cross_app::ServiceToken) -> AuthResult<String> {
        let header = Header::new(self.config.algorithm.into());
        encode(&header, token, &self.encoding_key)
            .map_err(|e| AuthError::Internal(format!("Service token encoding failed: {}", e)))
    }

    /// Decode and validate a service token.
    ///
    /// This validates the JWT signature and expiration for service-to-service
    /// authentication tokens.
    ///
    /// # Arguments
    ///
    /// * `token` - The JWT token string to decode
    ///
    /// # Returns
    ///
    /// Decoded service token if valid
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The token is malformed or has an invalid signature
    /// - The token has expired
    /// - The issuer is invalid
    #[cfg(feature = "jwt")]
    pub fn decode_service_token(&self, token: &str) -> AuthResult<crate::cross_app::ServiceToken> {
        let mut validation = Validation::new(self.config.algorithm.into());
        // Service tokens can be issued by any platform app
        validation.set_issuer(&["verity", "noteman", "shipcheck"]);
        // Don't validate audience here - let the caller check
        validation.validate_aud = false;

        let token_data: TokenData<crate::cross_app::ServiceToken> =
            decode(token, &self.decoding_key, &validation)
                .map_err(|e| match e.kind() {
                    jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                    jsonwebtoken::errors::ErrorKind::InvalidToken => {
                        AuthError::InvalidToken("Malformed service token".to_string())
                    }
                    jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                        AuthError::InvalidToken("Invalid signature".to_string())
                    }
                    jsonwebtoken::errors::ErrorKind::InvalidIssuer => {
                        AuthError::InvalidToken("Invalid issuer".to_string())
                    }
                    _ => AuthError::InvalidToken(e.to_string()),
                })?;

        Ok(token_data.claims)
    }
}

/// Token pair containing access and refresh tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPair {
    /// Access token (short-lived)
    pub access_token: String,

    /// Refresh token (long-lived)
    pub refresh_token: String,

    /// Token type (always "Bearer")
    pub token_type: String,

    /// Access token expiration in seconds
    pub expires_in: i64,
}

impl TokenPair {
    /// Create a new token pair.
    pub fn new(access_token: String, refresh_token: String, expires_in: i64) -> Self {
        Self {
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in,
        }
    }
}

#[cfg(all(test, feature = "jwt"))]
mod tests {
    use super::*;

    fn test_secret() -> String {
        "test-secret-key-for-jwt-signing-minimum-32-chars".to_string()
    }

    #[test]
    fn test_jwt_service_creation() {
        let service = JwtService::with_secret(test_secret()).unwrap();
        assert_eq!(service.config().algorithm, JwtAlgorithm::HS256);
    }

    #[test]
    fn test_token_generation_and_validation() {
        let service = JwtService::with_secret(test_secret()).unwrap();
        let user_id = Uuid::now_v7();

        let token = service.generate_access_token(user_id, "test@example.com").unwrap();
        let claims = service.validate_token(&token).unwrap();

        assert_eq!(claims.user_id(), Some(user_id));
        assert_eq!(claims.email, "test@example.com");
    }

    #[test]
    fn test_invalid_token() {
        let service = JwtService::with_secret(test_secret()).unwrap();
        let result = service.validate_token("invalid-token");

        assert!(matches!(result, Err(AuthError::InvalidToken(_))));
    }

    #[test]
    fn test_token_pair() {
        let pair = TokenPair::new("access".to_string(), "refresh".to_string(), 3600);

        assert_eq!(pair.access_token, "access");
        assert_eq!(pair.refresh_token, "refresh");
        assert_eq!(pair.token_type, "Bearer");
        assert_eq!(pair.expires_in, 3600);
    }

    #[test]
    fn test_cross_app_token_encoding() {
        use crate::cross_app::{AppId, CrossAppToken};

        let service = JwtService::with_secret(test_secret()).unwrap();
        let user_id = Uuid::now_v7();

        let cross_app_token = CrossAppToken::new(
            user_id,
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.read".to_string()],
        );

        let encoded = service.encode_cross_app_token(&cross_app_token).unwrap();
        assert!(!encoded.is_empty());

        let decoded = service.decode_cross_app_token(&encoded).unwrap();
        assert_eq!(decoded.sub, user_id);
        assert_eq!(decoded.email, "test@example.com");
        assert_eq!(decoded.iss, AppId::Verity);
    }

    #[test]
    fn test_service_token_encoding() {
        use crate::cross_app::{AppId, ServiceToken};

        let service = JwtService::with_secret(test_secret()).unwrap();

        let service_token = ServiceToken::new(
            AppId::Verity,
            AppId::NoteMan,
            vec!["webhooks.receive".to_string()],
        );

        let encoded = service.encode_service_token(&service_token).unwrap();
        assert!(!encoded.is_empty());

        let decoded = service.decode_service_token(&encoded).unwrap();
        assert_eq!(decoded.iss, AppId::Verity);
        assert_eq!(decoded.aud, AppId::NoteMan);
        assert!(decoded.has_capability("webhooks.receive"));
    }

    #[test]
    fn test_expired_cross_app_token() {
        use crate::cross_app::{AppId, CrossAppToken};
        use chrono::Duration;

        let service = JwtService::with_secret(test_secret()).unwrap();

        let mut cross_app_token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.read".to_string()],
        );

        // Set expiration to the past
        cross_app_token.exp = chrono::Utc::now() - Duration::hours(1);

        let encoded = service.encode_cross_app_token(&cross_app_token).unwrap();
        let result = service.decode_cross_app_token(&encoded);

        assert!(matches!(result, Err(AuthError::TokenExpired)));
    }
}
