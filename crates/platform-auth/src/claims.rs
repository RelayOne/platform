//! JWT Claims for cross-app authentication
//!
//! This module defines the unified JWT claims structure used across
//! all Relay platform applications (Verity, NoteMan, ShipCheck).

use chrono::{DateTime, Utc};
use platform_org::{OrganizationRole, ProjectRole};
use platform_rbac::App;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Standard JWT claims with platform-specific extensions.
///
/// These claims provide unified authentication context across
/// all platform applications. The structure supports:
/// - Multi-organization access
/// - Multi-app permissions
/// - Session management
/// - Cross-app context sharing
///
/// # Example
///
/// ```rust,no_run
/// use platform_auth::claims::PlatformClaims;
///
/// let claims = PlatformClaims::new(
///     user_id,
///     "user@example.com",
///     chrono::Duration::hours(24),
/// );
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformClaims {
    // Standard JWT claims (RFC 7519)
    /// Subject (user ID)
    pub sub: String,

    /// Issuer
    pub iss: String,

    /// Audience (allowed apps/services)
    pub aud: Vec<String>,

    /// Expiration time (Unix timestamp)
    pub exp: i64,

    /// Issued at (Unix timestamp)
    pub iat: i64,

    /// Not before (Unix timestamp)
    pub nbf: i64,

    /// JWT ID (unique identifier for this token)
    pub jti: String,

    // Platform-specific claims
    /// User email
    pub email: String,

    /// User display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Email verified status
    #[serde(default)]
    pub email_verified: bool,

    /// Current organization ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_id: Option<Uuid>,

    /// Current project ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<Uuid>,

    /// Organization memberships with roles
    #[serde(default)]
    pub orgs: HashMap<String, OrgClaim>,

    /// App-specific permissions
    #[serde(default)]
    pub app_permissions: HashMap<String, Vec<String>>,

    /// Session ID for session management
    pub session_id: String,

    /// Token type (access, refresh, api_key)
    pub token_type: TokenType,

    /// MFA verified status
    #[serde(default)]
    pub mfa_verified: bool,

    /// Authentication method used
    pub auth_method: AuthMethod,

    /// Custom claims for extensibility
    #[serde(default, flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

impl PlatformClaims {
    /// Create new platform claims for a user.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user's unique identifier
    /// * `email` - The user's email address
    /// * `duration` - Token validity duration
    ///
    /// # Returns
    ///
    /// New claims with default settings
    pub fn new(user_id: Uuid, email: impl Into<String>, duration: chrono::Duration) -> Self {
        let now = Utc::now();
        let exp = now + duration;

        Self {
            sub: user_id.to_string(),
            iss: "relay-platform".to_string(),
            aud: vec![
                "verity".to_string(),
                "noteman".to_string(),
                "shipcheck".to_string(),
            ],
            exp: exp.timestamp(),
            iat: now.timestamp(),
            nbf: now.timestamp(),
            jti: Uuid::now_v7().to_string(),
            email: email.into(),
            name: None,
            email_verified: false,
            org_id: None,
            project_id: None,
            orgs: HashMap::new(),
            app_permissions: HashMap::new(),
            session_id: Uuid::now_v7().to_string(),
            token_type: TokenType::Access,
            mfa_verified: false,
            auth_method: AuthMethod::Password,
            custom: HashMap::new(),
        }
    }

    /// Get the user ID as UUID.
    pub fn user_id(&self) -> Option<Uuid> {
        Uuid::parse_str(&self.sub).ok()
    }

    /// Check if the token is expired.
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() >= self.exp
    }

    /// Get expiration as DateTime.
    pub fn expires_at(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(self.exp, 0).unwrap_or_default()
    }

    /// Check if user has access to a specific organization.
    pub fn has_org_access(&self, org_id: Uuid) -> bool {
        self.orgs.contains_key(&org_id.to_string())
    }

    /// Get user's role in an organization.
    pub fn org_role(&self, org_id: Uuid) -> Option<OrganizationRole> {
        self.orgs.get(&org_id.to_string()).map(|c| c.role)
    }

    /// Check if user has access to a specific app.
    pub fn has_app_access(&self, app: App) -> bool {
        self.aud.contains(&app.as_str().to_string())
    }

    /// Get permissions for a specific app.
    pub fn app_permissions(&self, app: App) -> Vec<String> {
        self.app_permissions
            .get(app.as_str())
            .cloned()
            .unwrap_or_default()
    }

    /// Add organization access.
    pub fn with_org(mut self, org_id: Uuid, role: OrganizationRole) -> Self {
        self.orgs.insert(
            org_id.to_string(),
            OrgClaim {
                role,
                projects: HashMap::new(),
            },
        );
        self
    }

    /// Set current organization context.
    pub fn with_current_org(mut self, org_id: Uuid) -> Self {
        self.org_id = Some(org_id);
        self
    }

    /// Set current project context.
    pub fn with_current_project(mut self, project_id: Uuid) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Add app permissions.
    pub fn with_app_permissions(mut self, app: App, permissions: Vec<String>) -> Self {
        self.app_permissions
            .insert(app.as_str().to_string(), permissions);
        self
    }

    /// Set the token type.
    pub fn with_token_type(mut self, token_type: TokenType) -> Self {
        self.token_type = token_type;
        self
    }

    /// Set MFA verified status.
    pub fn with_mfa_verified(mut self, verified: bool) -> Self {
        self.mfa_verified = verified;
        self
    }

    /// Set authentication method.
    pub fn with_auth_method(mut self, method: AuthMethod) -> Self {
        self.auth_method = method;
        self
    }
}

/// Organization claim with role and project access.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgClaim {
    /// Role in the organization
    pub role: OrganizationRole,

    /// Project-specific roles (project_id -> role)
    #[serde(default)]
    pub projects: HashMap<String, ProjectRole>,
}

/// Token type enumeration.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TokenType {
    /// Access token (short-lived)
    Access,

    /// Refresh token (long-lived)
    Refresh,

    /// API key token (very long-lived)
    ApiKey,

    /// Service-to-service token
    Service,
}

impl Default for TokenType {
    fn default() -> Self {
        TokenType::Access
    }
}

/// Authentication method used.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    /// Username/password authentication
    Password,

    /// OAuth 2.0 provider
    OAuth,

    /// OpenID Connect
    Oidc,

    /// SAML SSO
    Saml,

    /// API key
    ApiKey,

    /// Magic link
    MagicLink,

    /// Service account
    Service,
}

impl Default for AuthMethod {
    fn default() -> Self {
        AuthMethod::Password
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_claims_creation() {
        let user_id = Uuid::now_v7();
        let claims = PlatformClaims::new(user_id, "test@example.com", Duration::hours(1));

        assert_eq!(claims.user_id(), Some(user_id));
        assert_eq!(claims.email, "test@example.com");
        assert!(!claims.is_expired());
    }

    #[test]
    fn test_claims_with_org() {
        let user_id = Uuid::now_v7();
        let org_id = Uuid::now_v7();

        let claims = PlatformClaims::new(user_id, "test@example.com", Duration::hours(1))
            .with_org(org_id, OrganizationRole::Admin);

        assert!(claims.has_org_access(org_id));
        assert_eq!(claims.org_role(org_id), Some(OrganizationRole::Admin));
    }

    #[test]
    fn test_claims_expiration() {
        let user_id = Uuid::now_v7();

        // Create expired token
        let mut claims = PlatformClaims::new(user_id, "test@example.com", Duration::hours(1));
        claims.exp = Utc::now().timestamp() - 3600; // 1 hour ago

        assert!(claims.is_expired());
    }
}
