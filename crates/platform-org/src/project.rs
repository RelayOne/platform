//! Project domain models
//!
//! This module provides the Project entity for organizing work within organizations.
//! Projects group related content and can have different visibility levels and settings.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::roles::OrganizationRole;

/// A project within an organization for grouping related work.
///
/// Projects belong to an organization and can have:
/// - Different visibility levels (public, organization, private)
/// - Project-specific settings and metadata
/// - Their own member list (for private projects)
/// - Tags for categorization
///
/// # Examples
///
/// ```
/// use uuid::Uuid;
/// use platform_org::Project;
///
/// let org_id = Uuid::now_v7();
/// let user_id = Uuid::now_v7();
/// let project = Project::new(org_id, "Marketing Docs", "marketing-docs", user_id);
/// assert_eq!(project.name, "Marketing Docs");
/// assert!(!project.is_archived);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// Unique identifier for the project
    pub id: Uuid,

    /// Organization this project belongs to
    pub organization_id: Uuid,

    /// Human-readable name
    pub name: String,

    /// URL-friendly slug (unique within organization)
    pub slug: String,

    /// Project description
    pub description: Option<String>,

    /// Project icon/emoji for visual identification
    pub icon: Option<String>,

    /// Project color for UI theming
    pub color: Option<String>,

    /// Visibility level determining who can see the project
    pub visibility: ProjectVisibility,

    /// Whether the project is archived (soft delete)
    pub is_archived: bool,

    /// User who created the project
    pub created_by: Uuid,

    /// When the project was created
    pub created_at: DateTime<Utc>,

    /// When the project was last updated
    pub updated_at: DateTime<Utc>,

    /// Project-specific settings
    pub settings: crate::settings::ProjectSettings,

    /// Custom metadata for extensibility
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,

    /// Tags for categorization and filtering
    #[serde(default)]
    pub tags: Vec<String>,
}

impl Project {
    /// Creates a new project with default settings.
    ///
    /// The project is created with:
    /// - A newly generated UUID v7 ID
    /// - Organization visibility by default
    /// - Not archived
    /// - Current timestamp for created_at and updated_at
    /// - Default project settings
    ///
    /// # Arguments
    ///
    /// * `organization_id` - The parent organization
    /// * `name` - Project name
    /// * `slug` - URL-friendly slug (must be unique within organization)
    /// * `created_by` - User who created the project
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::Project;
    ///
    /// let org_id = Uuid::now_v7();
    /// let user_id = Uuid::now_v7();
    /// let project = Project::new(org_id, "My Project", "my-project", user_id);
    /// ```
    pub fn new(
        organization_id: Uuid,
        name: impl Into<String>,
        slug: impl Into<String>,
        created_by: Uuid,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::now_v7(),
            organization_id,
            name: name.into(),
            slug: slug.into(),
            description: None,
            icon: None,
            color: None,
            visibility: ProjectVisibility::Organization,
            is_archived: false,
            created_by,
            created_at: now,
            updated_at: now,
            settings: crate::settings::ProjectSettings::default(),
            metadata: HashMap::new(),
            tags: Vec::new(),
        }
    }

    /// Check if the project is visible to a user based on visibility settings.
    ///
    /// # Visibility Rules
    ///
    /// - **Public**: Visible to everyone
    /// - **Organization**: Visible to all organization members
    /// - **Private**: Only visible to the creator (check membership separately)
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user ID to check
    /// * `user_org_role` - The user's role in the parent organization (if any)
    ///
    /// # Returns
    ///
    /// `true` if the project is visible to the user
    ///
    /// # Note
    ///
    /// For private projects, this only checks if the user is the creator.
    /// For full access control, check ProjectMembership separately.
    pub fn is_visible_to(&self, user_id: Uuid, user_org_role: Option<OrganizationRole>) -> bool {
        match self.visibility {
            ProjectVisibility::Public => true,
            ProjectVisibility::Organization => user_org_role.is_some(),
            ProjectVisibility::Private => {
                // Need to check project membership
                self.created_by == user_id
            }
        }
    }
}

/// Project visibility levels.
///
/// Determines who can see and access a project.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectVisibility {
    /// Visible to everyone (public projects)
    Public,

    /// Visible to all organization members
    Organization,

    /// Visible only to explicitly added members
    Private,
}

impl Default for ProjectVisibility {
    fn default() -> Self {
        Self::Organization
    }
}

/// Summary of a project for list displays.
///
/// This is a lightweight representation of a project that includes
/// aggregated counts and user-specific information like role and default status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    /// Project ID
    pub id: Uuid,

    /// Organization ID
    pub organization_id: Uuid,

    /// Project name
    pub name: String,

    /// Slug
    pub slug: String,

    /// Icon
    pub icon: Option<String>,

    /// Color
    pub color: Option<String>,

    /// Visibility
    pub visibility: ProjectVisibility,

    /// Whether archived
    pub is_archived: bool,

    /// User's role in this project (if any)
    pub user_role: Option<crate::roles::ProjectRole>,

    /// Document count
    pub document_count: u32,

    /// Whether this is the user's default project
    pub is_default: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_creation() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let project = Project::new(org_id, "Marketing Docs", "marketing-docs", user_id);

        assert_eq!(project.name, "Marketing Docs");
        assert_eq!(project.organization_id, org_id);
        assert_eq!(project.created_by, user_id);
        assert!(!project.is_archived);
        assert_eq!(project.visibility, ProjectVisibility::Organization);
    }

    #[test]
    fn test_project_visibility_public() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let mut project = Project::new(org_id, "Public Project", "public", user_id);
        project.visibility = ProjectVisibility::Public;

        let random_user = Uuid::now_v7();
        assert!(project.is_visible_to(random_user, None));
    }

    #[test]
    fn test_project_visibility_organization() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let project = Project::new(org_id, "Org Project", "org", user_id);

        let org_member = Uuid::now_v7();
        assert!(project.is_visible_to(org_member, Some(OrganizationRole::Viewer)));

        let non_member = Uuid::now_v7();
        assert!(!project.is_visible_to(non_member, None));
    }

    #[test]
    fn test_project_visibility_private() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let mut project = Project::new(org_id, "Private Project", "private", user_id);
        project.visibility = ProjectVisibility::Private;

        // Creator can see it
        assert!(project.is_visible_to(user_id, None));

        // Other users cannot (without explicit membership)
        let other_user = Uuid::now_v7();
        assert!(!project.is_visible_to(other_user, Some(OrganizationRole::Admin)));
    }
}
