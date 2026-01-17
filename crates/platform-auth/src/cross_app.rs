//! Cross-app authentication for service-to-service communication.
//!
//! This module provides secure token exchange between Verity, NoteMan, and ShipCheck,
//! enabling user context forwarding and service-to-service authentication.
//!
//! # Overview
//!
//! The cross-app authentication system supports two types of tokens:
//!
//! 1. **Cross-App Tokens**: Short-lived tokens that carry user context from one app to another.
//!    These tokens are used when a user action in one app (e.g., Verity) needs to access
//!    resources in another app (e.g., NoteMan) on behalf of the user.
//!
//! 2. **Service Tokens**: Tokens for service-to-service communication without user context.
//!    These are used for background jobs, webhooks, and other automated processes.
//!
//! # Security
//!
//! - Cross-app tokens are short-lived (5 minutes) to minimize exposure
//! - Service tokens have slightly longer lifetime (15 minutes) but limited capabilities
//! - All tokens include correlation IDs for audit trails
//! - Tokens are scoped to specific target applications
//!
//! # Example
//!
//! ```rust,no_run
//! use platform_auth::cross_app::{CrossAppToken, AppId};
//! use uuid::Uuid;
//!
//! // Create a token for Verity to call NoteMan on behalf of a user
//! let token = CrossAppToken::new(
//!     Uuid::now_v7(),
//!     "user@example.com",
//!     AppId::Verity,
//!     vec![AppId::NoteMan],
//!     vec!["notes.read".to_string(), "notes.write".to_string()],
//! );
//! ```

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Identifies the source/target application in the Relay platform.
///
/// Each application has its own identity and can issue tokens for
/// cross-app communication.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AppId {
    /// Verity - AI-powered knowledge and verification platform
    Verity,
    /// NoteMan - Note management and organization
    NoteMan,
    /// ShipCheck - Shipping and logistics tracking
    ShipCheck,
}

impl AppId {
    /// Convert AppId to string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            AppId::Verity => "verity",
            AppId::NoteMan => "noteman",
            AppId::ShipCheck => "shipcheck",
        }
    }

    /// Parse AppId from string.
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "verity" => Some(AppId::Verity),
            "noteman" => Some(AppId::NoteMan),
            "shipcheck" => Some(AppId::ShipCheck),
            _ => None,
        }
    }
}

impl std::fmt::Display for AppId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Cross-app token for user context forwarding.
///
/// This token allows one application to make authenticated requests to another
/// application on behalf of a user. The token carries the user's identity,
/// permissions, and the context of why the cross-app call is being made.
///
/// # Lifetime
///
/// Cross-app tokens are intentionally short-lived (5 minutes) to minimize
/// the window of exposure if a token is intercepted.
///
/// # Claims
///
/// - `jti`: Unique token identifier for tracking and revocation
/// - `sub`: User ID being forwarded
/// - `email`: User email for logging and audit
/// - `iss`: Application that issued the token
/// - `aud`: Target application(s) that can accept this token
/// - `iat`: When the token was issued
/// - `exp`: When the token expires
/// - `org_id`: Optional organization context
/// - `permissions`: Specific permissions granted for this request
/// - `source_context`: Why this cross-app call is happening
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossAppToken {
    /// Token ID for tracking and revocation
    pub jti: Uuid,

    /// User ID (subject)
    pub sub: Uuid,

    /// User email
    pub email: String,

    /// Issuing application
    pub iss: AppId,

    /// Target application(s)
    pub aud: Vec<AppId>,

    /// Issued at timestamp
    #[serde(with = "chrono::serde::ts_seconds")]
    pub iat: DateTime<Utc>,

    /// Expires at timestamp (short-lived, 5 minutes)
    #[serde(with = "chrono::serde::ts_seconds")]
    pub exp: DateTime<Utc>,

    /// Organization ID (if scoped to an organization)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_id: Option<Uuid>,

    /// Permissions granted for this request
    pub permissions: Vec<String>,

    /// Source context (what triggered this cross-app call)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_context: Option<SourceContext>,
}

/// Context about the originating request.
///
/// This provides audit trail information about why a cross-app request
/// was initiated, making it easier to debug issues and track user journeys
/// across applications.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceContext {
    /// Resource type being accessed (e.g., "document", "note", "shipment")
    pub resource_type: String,

    /// Resource ID
    pub resource_id: String,

    /// Action being performed (e.g., "read", "write", "sync")
    pub action: String,

    /// Correlation ID for distributed tracing
    pub correlation_id: Uuid,
}

/// Service-to-service token (no user context).
///
/// This token type is used for background jobs, webhooks, and other
/// automated processes that don't have a user context. These tokens
/// grant specific capabilities rather than user permissions.
///
/// # Lifetime
///
/// Service tokens live slightly longer (15 minutes) than cross-app tokens
/// since they're used for potentially longer-running background tasks.
///
/// # Security
///
/// Service tokens should be restricted to specific capabilities and
/// should not grant broad access. Use the principle of least privilege
/// when assigning capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceToken {
    /// Token ID for tracking and revocation
    pub jti: Uuid,

    /// Issuing service
    pub iss: AppId,

    /// Target service
    pub aud: AppId,

    /// Issued at timestamp
    #[serde(with = "chrono::serde::ts_seconds")]
    pub iat: DateTime<Utc>,

    /// Expires at timestamp
    #[serde(with = "chrono::serde::ts_seconds")]
    pub exp: DateTime<Utc>,

    /// Allowed capabilities (e.g., "webhooks.receive", "jobs.execute")
    pub capabilities: Vec<String>,
}

impl CrossAppToken {
    /// Create a new cross-app token.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user ID to forward
    /// * `email` - The user's email address
    /// * `source_app` - The application issuing the token
    /// * `target_apps` - The application(s) that can accept this token
    /// * `permissions` - Specific permissions granted for this request
    ///
    /// # Returns
    ///
    /// A new cross-app token valid for 5 minutes
    pub fn new(
        user_id: Uuid,
        email: impl Into<String>,
        source_app: AppId,
        target_apps: Vec<AppId>,
        permissions: Vec<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            jti: Uuid::now_v7(),
            sub: user_id,
            email: email.into(),
            iss: source_app,
            aud: target_apps,
            iat: now,
            exp: now + Duration::minutes(5),
            org_id: None,
            permissions,
            source_context: None,
        }
    }

    /// Add organization scope to the token.
    ///
    /// # Arguments
    ///
    /// * `org_id` - The organization ID to scope the token to
    ///
    /// # Returns
    ///
    /// Self for method chaining
    pub fn with_org(mut self, org_id: Uuid) -> Self {
        self.org_id = Some(org_id);
        self
    }

    /// Add source context to the token.
    ///
    /// # Arguments
    ///
    /// * `context` - The source context describing why this token was created
    ///
    /// # Returns
    ///
    /// Self for method chaining
    pub fn with_context(mut self, context: SourceContext) -> Self {
        self.source_context = Some(context);
        self
    }

    /// Check if the token is expired.
    ///
    /// # Returns
    ///
    /// `true` if the current time is past the expiration time
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.exp
    }

    /// Check if the token is valid for a specific target application.
    ///
    /// A token is valid if:
    /// 1. It hasn't expired
    /// 2. The target app is in the audience list
    ///
    /// # Arguments
    ///
    /// * `app` - The application to check validity for
    ///
    /// # Returns
    ///
    /// `true` if the token is valid for the given app
    pub fn is_valid_for(&self, app: AppId) -> bool {
        !self.is_expired() && self.aud.contains(&app)
    }

    /// Check if the token has a specific permission.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission to check for
    ///
    /// # Returns
    ///
    /// `true` if the token includes the specified permission
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.iter().any(|p| p == permission || p == "*")
    }
}

impl ServiceToken {
    /// Create a new service token.
    ///
    /// # Arguments
    ///
    /// * `source` - The issuing service
    /// * `target` - The target service
    /// * `capabilities` - Allowed capabilities for this token
    ///
    /// # Returns
    ///
    /// A new service token valid for 15 minutes
    pub fn new(source: AppId, target: AppId, capabilities: Vec<String>) -> Self {
        let now = Utc::now();
        Self {
            jti: Uuid::now_v7(),
            iss: source,
            aud: target,
            iat: now,
            exp: now + Duration::minutes(15),
            capabilities,
        }
    }

    /// Check if the token has a specific capability.
    ///
    /// # Arguments
    ///
    /// * `cap` - The capability to check for
    ///
    /// # Returns
    ///
    /// `true` if the token has the capability or has wildcard access
    pub fn has_capability(&self, cap: &str) -> bool {
        self.capabilities.iter().any(|c| c == cap || c == "*")
    }

    /// Check if the token is expired.
    ///
    /// # Returns
    ///
    /// `true` if the current time is past the expiration time
    pub fn is_expired(&self) -> bool {
        Utc::now() > self.exp
    }

    /// Check if the token is valid for a specific target service.
    ///
    /// # Arguments
    ///
    /// * `app` - The application to check validity for
    ///
    /// # Returns
    ///
    /// `true` if the token is valid for the given app
    pub fn is_valid_for(&self, app: AppId) -> bool {
        !self.is_expired() && self.aud == app
    }
}

/// Token exchange request payload.
///
/// This is sent by a client to exchange their current authentication
/// token for a cross-app token that can be used to access another application.
#[derive(Debug, Deserialize)]
pub struct TokenExchangeRequest {
    /// Target application
    pub target_app: AppId,

    /// Requested permissions (will be validated against user's actual permissions)
    pub permissions: Vec<String>,

    /// Optional source context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<SourceContext>,
}

/// Token exchange response.
///
/// Contains the newly issued cross-app token and metadata about its validity.
#[derive(Debug, Serialize)]
pub struct TokenExchangeResponse {
    /// The cross-app token (JWT encoded)
    pub token: String,

    /// Token type (always "Bearer")
    pub token_type: String,

    /// Expires in seconds
    pub expires_in: i64,

    /// Target application this token is valid for
    pub target_app: String,
}

impl TokenExchangeResponse {
    /// Create a new token exchange response.
    ///
    /// # Arguments
    ///
    /// * `token` - The encoded JWT token
    /// * `target_app` - The target application
    /// * `expires_in` - Expiration time in seconds
    ///
    /// # Returns
    ///
    /// A new token exchange response
    pub fn new(token: String, target_app: AppId, expires_in: i64) -> Self {
        Self {
            token,
            token_type: "Bearer".to_string(),
            expires_in,
            target_app: target_app.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_id_conversion() {
        assert_eq!(AppId::Verity.as_str(), "verity");
        assert_eq!(AppId::NoteMan.as_str(), "noteman");
        assert_eq!(AppId::ShipCheck.as_str(), "shipcheck");

        assert_eq!(AppId::from_str("verity"), Some(AppId::Verity));
        assert_eq!(AppId::from_str("VERITY"), Some(AppId::Verity));
        assert_eq!(AppId::from_str("invalid"), None);
    }

    #[test]
    fn test_cross_app_token_creation() {
        let user_id = Uuid::now_v7();
        let token = CrossAppToken::new(
            user_id,
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.read".to_string()],
        );

        assert_eq!(token.sub, user_id);
        assert_eq!(token.email, "test@example.com");
        assert_eq!(token.iss, AppId::Verity);
        assert_eq!(token.aud, vec![AppId::NoteMan]);
        assert_eq!(token.permissions, vec!["notes.read"]);
        assert!(!token.is_expired());
    }

    #[test]
    fn test_cross_app_token_validity() {
        let token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan, AppId::ShipCheck],
            vec!["notes.read".to_string()],
        );

        assert!(token.is_valid_for(AppId::NoteMan));
        assert!(token.is_valid_for(AppId::ShipCheck));
        assert!(!token.is_valid_for(AppId::Verity));
    }

    #[test]
    fn test_cross_app_token_permissions() {
        let token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.read".to_string(), "notes.write".to_string()],
        );

        assert!(token.has_permission("notes.read"));
        assert!(token.has_permission("notes.write"));
        assert!(!token.has_permission("notes.delete"));
    }

    #[test]
    fn test_cross_app_token_with_wildcard() {
        let token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["*".to_string()],
        );

        assert!(token.has_permission("anything"));
    }

    #[test]
    fn test_service_token_creation() {
        let token = ServiceToken::new(
            AppId::Verity,
            AppId::NoteMan,
            vec!["webhooks.receive".to_string()],
        );

        assert_eq!(token.iss, AppId::Verity);
        assert_eq!(token.aud, AppId::NoteMan);
        assert!(!token.is_expired());
    }

    #[test]
    fn test_service_token_capabilities() {
        let token = ServiceToken::new(
            AppId::Verity,
            AppId::NoteMan,
            vec!["webhooks.receive".to_string(), "jobs.execute".to_string()],
        );

        assert!(token.has_capability("webhooks.receive"));
        assert!(token.has_capability("jobs.execute"));
        assert!(!token.has_capability("admin.access"));
    }

    #[test]
    fn test_service_token_validity() {
        let token = ServiceToken::new(
            AppId::Verity,
            AppId::NoteMan,
            vec!["webhooks.receive".to_string()],
        );

        assert!(token.is_valid_for(AppId::NoteMan));
        assert!(!token.is_valid_for(AppId::Verity));
        assert!(!token.is_valid_for(AppId::ShipCheck));
    }

    #[test]
    fn test_source_context() {
        let context = SourceContext {
            resource_type: "document".to_string(),
            resource_id: "doc-123".to_string(),
            action: "sync".to_string(),
            correlation_id: Uuid::now_v7(),
        };

        let token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.write".to_string()],
        ).with_context(context);

        assert!(token.source_context.is_some());
        let ctx = token.source_context.unwrap();
        assert_eq!(ctx.resource_type, "document");
        assert_eq!(ctx.action, "sync");
    }

    #[test]
    fn test_token_expiration() {
        let mut token = CrossAppToken::new(
            Uuid::now_v7(),
            "test@example.com",
            AppId::Verity,
            vec![AppId::NoteMan],
            vec!["notes.read".to_string()],
        );

        // Set expiration to the past
        token.exp = Utc::now() - Duration::hours(1);
        assert!(token.is_expired());
        assert!(!token.is_valid_for(AppId::NoteMan));
    }
}
