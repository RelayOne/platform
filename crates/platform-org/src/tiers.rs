//! Subscription tiers and feature limits
//!
//! This module defines the subscription tiers available in the platform
//! and the feature limits associated with each tier.

use serde::{Deserialize, Serialize};

/// Subscription tier for an organization.
///
/// Tiers determine feature access and usage limits.
///
/// # Tier Hierarchy
///
/// Individual tiers (single user):
/// - **IndividualFree**: Basic free tier
/// - **IndividualPro**: Professional individual tier
/// - **IndividualPower**: Power user tier
///
/// Team tiers (multiple users):
/// - **TeamStarter**: Small teams
/// - **TeamBusiness**: Business teams
/// - **TeamScale**: Large teams
///
/// Enterprise tiers (organizations):
/// - **Enterprise**: Enterprise tier
/// - **EnterprisePlus**: Full-featured enterprise
///
/// # Examples
///
/// ```
/// use platform_org::Tier;
///
/// let tier = Tier::TeamBusiness;
/// let limits = tier.limits();
/// assert_eq!(limits.users, Some(50));
/// ```
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Free individual tier
    IndividualFree,

    /// Professional individual tier
    IndividualPro,

    /// Power user individual tier
    IndividualPower,

    /// Small team tier
    TeamStarter,

    /// Business team tier
    TeamBusiness,

    /// Large team tier
    TeamScale,

    /// Enterprise tier
    Enterprise,

    /// Full-featured enterprise tier
    EnterprisePlus,
}

impl Tier {
    /// Get the feature limits for this tier.
    ///
    /// # Returns
    ///
    /// A `TierLimits` struct containing the limits for this tier
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::Tier;
    ///
    /// let limits = Tier::IndividualFree.limits();
    /// assert_eq!(limits.users, Some(1));
    /// assert_eq!(limits.projects, Some(3));
    /// ```
    pub fn limits(&self) -> TierLimits {
        match self {
            Tier::IndividualFree => TierLimits {
                users: Some(1),
                projects: Some(3),
                documents_per_month: Some(50),
                storage_gb: Some(1),
                api_requests_per_day: Some(100),
                integrations: Some(2),
                ai_queries_per_month: Some(100),
                export_formats: vec!["pdf".to_string()],
                support_level: SupportLevel::Community,
                sso_enabled: false,
                audit_log_days: 7,
                custom_branding: false,
            },
            Tier::IndividualPro => TierLimits {
                users: Some(1),
                projects: Some(10),
                documents_per_month: Some(500),
                storage_gb: Some(10),
                api_requests_per_day: Some(1000),
                integrations: Some(5),
                ai_queries_per_month: Some(1000),
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                ],
                support_level: SupportLevel::Email,
                sso_enabled: false,
                audit_log_days: 30,
                custom_branding: false,
            },
            Tier::IndividualPower => TierLimits {
                users: Some(1),
                projects: Some(25),
                documents_per_month: Some(2000),
                storage_gb: Some(50),
                api_requests_per_day: Some(5000),
                integrations: Some(10),
                ai_queries_per_month: Some(5000),
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                ],
                support_level: SupportLevel::Priority,
                sso_enabled: false,
                audit_log_days: 90,
                custom_branding: false,
            },
            Tier::TeamStarter => TierLimits {
                users: Some(10),
                projects: Some(25),
                documents_per_month: Some(1000),
                storage_gb: Some(25),
                api_requests_per_day: Some(5000),
                integrations: Some(10),
                ai_queries_per_month: Some(2500),
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                ],
                support_level: SupportLevel::Email,
                sso_enabled: false,
                audit_log_days: 30,
                custom_branding: false,
            },
            Tier::TeamBusiness => TierLimits {
                users: Some(50),
                projects: Some(100),
                documents_per_month: Some(5000),
                storage_gb: Some(100),
                api_requests_per_day: Some(25000),
                integrations: None, // Unlimited
                ai_queries_per_month: Some(10000),
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                    "xml".to_string(),
                ],
                support_level: SupportLevel::Priority,
                sso_enabled: true,
                audit_log_days: 90,
                custom_branding: true,
            },
            Tier::TeamScale => TierLimits {
                users: Some(200),
                projects: Some(250),
                documents_per_month: Some(20000),
                storage_gb: Some(500),
                api_requests_per_day: Some(100000),
                integrations: None,
                ai_queries_per_month: Some(50000),
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                    "xml".to_string(),
                    "csv".to_string(),
                ],
                support_level: SupportLevel::Dedicated,
                sso_enabled: true,
                audit_log_days: 365,
                custom_branding: true,
            },
            Tier::Enterprise => TierLimits {
                users: Some(1000),
                projects: Some(500),
                documents_per_month: None, // Unlimited
                storage_gb: Some(2000),
                api_requests_per_day: None, // Unlimited
                integrations: None,
                ai_queries_per_month: None,
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                    "xml".to_string(),
                    "csv".to_string(),
                ],
                support_level: SupportLevel::Dedicated,
                sso_enabled: true,
                audit_log_days: 730, // 2 years
                custom_branding: true,
            },
            Tier::EnterprisePlus => TierLimits {
                users: None, // Unlimited
                projects: None,
                documents_per_month: None,
                storage_gb: None,
                api_requests_per_day: None,
                integrations: None,
                ai_queries_per_month: None,
                export_formats: vec![
                    "pdf".to_string(),
                    "docx".to_string(),
                    "json".to_string(),
                    "html".to_string(),
                    "xml".to_string(),
                    "csv".to_string(),
                    "custom".to_string(),
                ],
                support_level: SupportLevel::Dedicated,
                sso_enabled: true,
                audit_log_days: 2555, // 7 years
                custom_branding: true,
            },
        }
    }

    /// Parse tier from string representation.
    ///
    /// # Arguments
    ///
    /// * `s` - String to parse (case-insensitive)
    ///
    /// # Returns
    ///
    /// `Some(Tier)` if valid, `None` otherwise
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().replace(['-', '_'], "").as_str() {
            "individualfree" | "free" => Some(Tier::IndividualFree),
            "individualpro" | "pro" => Some(Tier::IndividualPro),
            "individualpower" | "power" => Some(Tier::IndividualPower),
            "teamstarter" | "starter" => Some(Tier::TeamStarter),
            "teambusiness" | "business" => Some(Tier::TeamBusiness),
            "teamscale" | "scale" => Some(Tier::TeamScale),
            "enterprise" => Some(Tier::Enterprise),
            "enterpriseplus" | "plus" => Some(Tier::EnterprisePlus),
            _ => None,
        }
    }

    /// Get string representation of the tier.
    pub fn as_str(&self) -> &'static str {
        match self {
            Tier::IndividualFree => "individual_free",
            Tier::IndividualPro => "individual_pro",
            Tier::IndividualPower => "individual_power",
            Tier::TeamStarter => "team_starter",
            Tier::TeamBusiness => "team_business",
            Tier::TeamScale => "team_scale",
            Tier::Enterprise => "enterprise",
            Tier::EnterprisePlus => "enterprise_plus",
        }
    }

    /// Get a human-readable display name for the tier.
    pub fn display_name(&self) -> &'static str {
        match self {
            Tier::IndividualFree => "Free",
            Tier::IndividualPro => "Pro",
            Tier::IndividualPower => "Power",
            Tier::TeamStarter => "Team Starter",
            Tier::TeamBusiness => "Team Business",
            Tier::TeamScale => "Team Scale",
            Tier::Enterprise => "Enterprise",
            Tier::EnterprisePlus => "Enterprise Plus",
        }
    }

    /// Check if this is a paid tier.
    pub fn is_paid(&self) -> bool {
        !matches!(self, Tier::IndividualFree)
    }

    /// Check if this is a team tier.
    pub fn is_team(&self) -> bool {
        matches!(
            self,
            Tier::TeamStarter
                | Tier::TeamBusiness
                | Tier::TeamScale
                | Tier::Enterprise
                | Tier::EnterprisePlus
        )
    }

    /// Check if this is an enterprise tier.
    pub fn is_enterprise(&self) -> bool {
        matches!(self, Tier::Enterprise | Tier::EnterprisePlus)
    }
}

impl Default for Tier {
    fn default() -> Self {
        Tier::IndividualFree
    }
}

/// Feature limits for a subscription tier.
///
/// Values of `None` indicate unlimited.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierLimits {
    /// Maximum number of users (None = unlimited)
    pub users: Option<u32>,

    /// Maximum number of projects (None = unlimited)
    pub projects: Option<u32>,

    /// Maximum documents per month (None = unlimited)
    pub documents_per_month: Option<u32>,

    /// Storage limit in GB (None = unlimited)
    pub storage_gb: Option<u32>,

    /// API requests per day (None = unlimited)
    pub api_requests_per_day: Option<u32>,

    /// Maximum integrations (None = unlimited)
    pub integrations: Option<u32>,

    /// AI queries per month (None = unlimited)
    pub ai_queries_per_month: Option<u32>,

    /// Available export formats
    pub export_formats: Vec<String>,

    /// Support level
    pub support_level: SupportLevel,

    /// SSO enabled
    pub sso_enabled: bool,

    /// Audit log retention in days
    pub audit_log_days: u32,

    /// Custom branding enabled
    pub custom_branding: bool,
}

/// Support level for a subscription tier.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SupportLevel {
    /// Community support (forums, docs)
    Community,

    /// Email support
    Email,

    /// Priority support with faster response
    Priority,

    /// Dedicated support representative
    Dedicated,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier_limits() {
        let free_limits = Tier::IndividualFree.limits();
        assert_eq!(free_limits.users, Some(1));
        assert_eq!(free_limits.projects, Some(3));

        let enterprise_limits = Tier::EnterprisePlus.limits();
        assert!(enterprise_limits.users.is_none()); // Unlimited
        assert!(enterprise_limits.sso_enabled);
    }

    #[test]
    fn test_tier_parsing() {
        assert_eq!(Tier::parse("free"), Some(Tier::IndividualFree));
        assert_eq!(Tier::parse("team_business"), Some(Tier::TeamBusiness));
        assert_eq!(Tier::parse("enterprise"), Some(Tier::Enterprise));
        assert_eq!(Tier::parse("invalid"), None);
    }

    #[test]
    fn test_tier_hierarchy() {
        assert!(Tier::IndividualPro > Tier::IndividualFree);
        assert!(Tier::TeamBusiness > Tier::TeamStarter);
        assert!(Tier::Enterprise > Tier::TeamScale);
        assert!(Tier::EnterprisePlus > Tier::Enterprise);
    }

    #[test]
    fn test_tier_is_team() {
        assert!(!Tier::IndividualFree.is_team());
        assert!(!Tier::IndividualPro.is_team());
        assert!(Tier::TeamStarter.is_team());
        assert!(Tier::Enterprise.is_team());
    }

    #[test]
    fn test_tier_is_enterprise() {
        assert!(!Tier::TeamBusiness.is_enterprise());
        assert!(Tier::Enterprise.is_enterprise());
        assert!(Tier::EnterprisePlus.is_enterprise());
    }
}
