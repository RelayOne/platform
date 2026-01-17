//! Settings for organizations and projects
//!
//! This module provides settings types for configuring organization and project behavior.
//! Settings control feature flags, defaults, and customization options.

use serde::{Deserialize, Serialize};

/// Organization-level settings.
///
/// These settings control behavior and defaults for an organization.
///
/// # Categories
///
/// - **Security**: MFA requirements, SSO enforcement, session policies
/// - **Defaults**: Default project visibility, member roles
/// - **Integrations**: Enabled integrations, API access
/// - **Notifications**: Digest settings, alert preferences
///
/// # Examples
///
/// ```
/// use platform_org::settings::OrganizationSettings;
///
/// let settings = OrganizationSettings::default();
/// assert!(!settings.security.require_mfa);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationSettings {
    /// Security settings
    #[serde(default)]
    pub security: SecuritySettings,

    /// Default settings for new projects
    #[serde(default)]
    pub defaults: DefaultSettings,

    /// Integration settings
    #[serde(default)]
    pub integrations: IntegrationSettings,

    /// Notification settings
    #[serde(default)]
    pub notifications: NotificationSettings,

    /// Feature flags
    #[serde(default)]
    pub features: FeatureFlags,
}

impl Default for OrganizationSettings {
    fn default() -> Self {
        Self {
            security: SecuritySettings::default(),
            defaults: DefaultSettings::default(),
            integrations: IntegrationSettings::default(),
            notifications: NotificationSettings::default(),
            features: FeatureFlags::default(),
        }
    }
}

/// Security settings for an organization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySettings {
    /// Require multi-factor authentication for all members
    #[serde(default)]
    pub require_mfa: bool,

    /// Enforce SSO for all members (enterprise feature)
    #[serde(default)]
    pub enforce_sso: bool,

    /// Session timeout in hours (0 = never)
    #[serde(default = "default_session_timeout")]
    pub session_timeout_hours: u32,

    /// Allowed email domains for invitations (empty = all allowed)
    #[serde(default)]
    pub allowed_email_domains: Vec<String>,

    /// IP allowlist (empty = all allowed)
    #[serde(default)]
    pub ip_allowlist: Vec<String>,

    /// Require approval for new member invitations
    #[serde(default)]
    pub require_invite_approval: bool,
}

fn default_session_timeout() -> u32 {
    24
}

impl Default for SecuritySettings {
    fn default() -> Self {
        Self {
            require_mfa: false,
            enforce_sso: false,
            session_timeout_hours: default_session_timeout(),
            allowed_email_domains: Vec::new(),
            ip_allowlist: Vec::new(),
            require_invite_approval: false,
        }
    }
}

/// Default settings for new projects and members.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultSettings {
    /// Default visibility for new projects
    #[serde(default)]
    pub project_visibility: super::project::ProjectVisibility,

    /// Default role for new members
    #[serde(default)]
    pub member_role: super::roles::OrganizationRole,

    /// Default project role when adding members to projects
    #[serde(default)]
    pub project_member_role: super::roles::ProjectRole,
}

impl Default for DefaultSettings {
    fn default() -> Self {
        Self {
            project_visibility: super::project::ProjectVisibility::Organization,
            member_role: super::roles::OrganizationRole::Viewer,
            project_member_role: super::roles::ProjectRole::Viewer,
        }
    }
}

/// Integration settings for an organization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationSettings {
    /// Allow public API access
    #[serde(default = "default_true")]
    pub api_access_enabled: bool,

    /// Allowed OAuth providers
    #[serde(default)]
    pub allowed_oauth_providers: Vec<String>,

    /// Enabled integrations
    #[serde(default)]
    pub enabled_integrations: Vec<String>,

    /// Allow webhooks
    #[serde(default = "default_true")]
    pub webhooks_enabled: bool,
}

fn default_true() -> bool {
    true
}

impl Default for IntegrationSettings {
    fn default() -> Self {
        Self {
            api_access_enabled: true,
            allowed_oauth_providers: Vec::new(),
            enabled_integrations: Vec::new(),
            webhooks_enabled: true,
        }
    }
}

/// Notification settings for an organization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    /// Send weekly digest to admins
    #[serde(default = "default_true")]
    pub admin_weekly_digest: bool,

    /// Send security alerts to all admins
    #[serde(default = "default_true")]
    pub security_alerts: bool,

    /// Send billing alerts to owners
    #[serde(default = "default_true")]
    pub billing_alerts: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            admin_weekly_digest: true,
            security_alerts: true,
            billing_alerts: true,
        }
    }
}

/// Feature flags for an organization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlags {
    /// Enable AI-powered features
    #[serde(default = "default_true")]
    pub ai_features: bool,

    /// Enable experimental features
    #[serde(default)]
    pub experimental_features: bool,

    /// Enable advanced analytics
    #[serde(default)]
    pub advanced_analytics: bool,

    /// Enable custom branding
    #[serde(default)]
    pub custom_branding: bool,
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            ai_features: true,
            experimental_features: false,
            advanced_analytics: false,
            custom_branding: false,
        }
    }
}

/// Project-level settings.
///
/// These settings control behavior for a specific project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    /// Allow external sharing links
    #[serde(default = "default_true")]
    pub allow_sharing: bool,

    /// Enable version history
    #[serde(default = "default_true")]
    pub version_history: bool,

    /// Enable comments
    #[serde(default = "default_true")]
    pub comments_enabled: bool,

    /// Default document format
    #[serde(default)]
    pub default_format: Option<String>,

    /// Auto-archive after days of inactivity (0 = never)
    #[serde(default)]
    pub auto_archive_days: u32,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            allow_sharing: true,
            version_history: true,
            comments_enabled: true,
            default_format: None,
            auto_archive_days: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_organization_settings_default() {
        let settings = OrganizationSettings::default();
        assert!(!settings.security.require_mfa);
        assert_eq!(settings.security.session_timeout_hours, 24);
        assert!(settings.integrations.api_access_enabled);
    }

    #[test]
    fn test_project_settings_default() {
        let settings = ProjectSettings::default();
        assert!(settings.allow_sharing);
        assert!(settings.version_history);
        assert!(settings.comments_enabled);
    }
}
