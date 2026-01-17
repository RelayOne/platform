//! Organization domain models
//!
//! This module provides the core Organization entity for multi-tenant
//! organization management. Organizations are the top-level tenant entities
//! that contain projects and members.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::tiers::Tier;

/// An organization represents a tenant in the multi-tenant system.
///
/// Users can belong to multiple organizations with different roles.
/// Each organization has its own settings, members, projects, and subscription tier.
///
/// # Architecture
///
/// ```text
/// Organization
///   ├─ Members (via OrganizationMembership)
///   ├─ Projects
///   ├─ Settings
///   └─ Subscription Tier
/// ```
///
/// # Examples
///
/// ```
/// use uuid::Uuid;
/// use platform_org::Organization;
///
/// let owner_id = Uuid::now_v7();
/// let org = Organization::new("Acme Corp", "acme-corp", owner_id);
/// assert_eq!(org.name, "Acme Corp");
/// assert!(org.is_active);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    /// Unique identifier for the organization
    pub id: Uuid,

    /// Human-readable name
    pub name: String,

    /// URL-friendly slug (unique across platform)
    pub slug: String,

    /// Optional description
    pub description: Option<String>,

    /// Logo URL for branding
    pub logo_url: Option<String>,

    /// Primary website URL
    pub website_url: Option<String>,

    /// Subscription tier for feature gating
    pub tier: Tier,

    /// Owner user ID (the user who created the org)
    pub owner_id: Uuid,

    /// Whether the organization is active
    pub is_active: bool,

    /// When the organization was created
    pub created_at: DateTime<Utc>,

    /// When the organization was last updated
    pub updated_at: DateTime<Utc>,

    /// Organization-level settings
    pub settings: crate::settings::OrganizationSettings,

    /// Custom metadata for extensibility
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Organization {
    /// Creates a new organization with default settings.
    ///
    /// The organization is created with:
    /// - A newly generated UUID v7 ID
    /// - Default IndividualFree tier
    /// - Active status
    /// - Current timestamp for created_at and updated_at
    /// - Default organization settings
    ///
    /// # Arguments
    ///
    /// * `name` - The organization name
    /// * `slug` - URL-friendly slug (must be unique)
    /// * `owner_id` - The user ID who owns this organization
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::Organization;
    ///
    /// let owner_id = Uuid::now_v7();
    /// let org = Organization::new("Acme Corp", "acme-corp", owner_id);
    /// ```
    pub fn new(name: impl Into<String>, slug: impl Into<String>, owner_id: Uuid) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::now_v7(),
            name: name.into(),
            slug: slug.into(),
            description: None,
            logo_url: None,
            website_url: None,
            tier: Tier::IndividualFree,
            owner_id,
            is_active: true,
            created_at: now,
            updated_at: now,
            settings: crate::settings::OrganizationSettings::default(),
            metadata: HashMap::new(),
        }
    }

    /// Check if the organization is on a team tier or higher.
    ///
    /// Team tiers include:
    /// - TeamStarter
    /// - TeamBusiness
    /// - TeamScale
    /// - Enterprise
    /// - EnterprisePlus
    ///
    /// # Returns
    ///
    /// `true` if the organization is on a team tier or higher
    pub fn is_team_tier(&self) -> bool {
        matches!(
            self.tier,
            Tier::TeamStarter
                | Tier::TeamBusiness
                | Tier::TeamScale
                | Tier::Enterprise
                | Tier::EnterprisePlus
        )
    }

    /// Get the maximum number of projects allowed for this tier.
    ///
    /// # Returns
    ///
    /// Maximum number of projects, with `u32::MAX` representing unlimited
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::{Organization, Tier};
    ///
    /// let owner_id = Uuid::now_v7();
    /// let mut org = Organization::new("Test", "test", owner_id);
    ///
    /// org.tier = Tier::IndividualFree;
    /// assert_eq!(org.max_projects(), 3);
    ///
    /// org.tier = Tier::TeamBusiness;
    /// assert_eq!(org.max_projects(), 100);
    /// ```
    pub fn max_projects(&self) -> u32 {
        match self.tier {
            Tier::IndividualFree => 3,
            Tier::IndividualPro | Tier::IndividualPower => 10,
            Tier::TeamStarter => 25,
            Tier::TeamBusiness => 100,
            Tier::TeamScale => 250,
            Tier::Enterprise => 500,
            Tier::EnterprisePlus => u32::MAX,
        }
    }

    /// Get the maximum number of members allowed for this tier.
    ///
    /// # Returns
    ///
    /// Maximum number of members, with `u32::MAX` representing unlimited
    pub fn max_members(&self) -> u32 {
        self.tier.limits().users.unwrap_or(u32::MAX)
    }
}

/// Summary of an organization for list displays.
///
/// This is a lightweight representation of an organization that includes
/// aggregated counts and user-specific information like role and default status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationSummary {
    /// Organization ID
    pub id: Uuid,

    /// Organization name
    pub name: String,

    /// Slug
    pub slug: String,

    /// Logo URL
    pub logo_url: Option<String>,

    /// Tier
    pub tier: Tier,

    /// User's role in this organization
    pub user_role: crate::roles::OrganizationRole,

    /// Number of projects
    pub project_count: u32,

    /// Number of members
    pub member_count: u32,

    /// Whether this is the user's default org
    pub is_default: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_organization_creation() {
        let owner_id = Uuid::now_v7();
        let org = Organization::new("Acme Corp", "acme-corp", owner_id);

        assert_eq!(org.name, "Acme Corp");
        assert_eq!(org.slug, "acme-corp");
        assert_eq!(org.owner_id, owner_id);
        assert!(org.is_active);
        assert_eq!(org.tier, Tier::IndividualFree);
    }

    #[test]
    fn test_is_team_tier() {
        let owner_id = Uuid::now_v7();
        let mut org = Organization::new("Test", "test", owner_id);

        org.tier = Tier::IndividualFree;
        assert!(!org.is_team_tier());

        org.tier = Tier::TeamStarter;
        assert!(org.is_team_tier());

        org.tier = Tier::Enterprise;
        assert!(org.is_team_tier());
    }

    #[test]
    fn test_max_projects_by_tier() {
        let owner_id = Uuid::now_v7();
        let mut org = Organization::new("Test", "test", owner_id);

        org.tier = Tier::IndividualFree;
        assert_eq!(org.max_projects(), 3);

        org.tier = Tier::TeamBusiness;
        assert_eq!(org.max_projects(), 100);

        org.tier = Tier::EnterprisePlus;
        assert_eq!(org.max_projects(), u32::MAX);
    }
}
