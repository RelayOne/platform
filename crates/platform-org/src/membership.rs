//! Membership domain models
//!
//! This module provides membership entities that link users to organizations and projects.
//! Memberships define a user's role and permissions within an organization or project.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::roles::{OrganizationRole, ProjectRole};

/// Organization membership linking a user to an organization.
///
/// This represents a user's membership in an organization, including their role,
/// when they joined, and any custom permissions or metadata.
///
/// # Examples
///
/// ```
/// use uuid::Uuid;
/// use platform_org::{OrganizationMembership, OrganizationRole};
///
/// let org_id = Uuid::now_v7();
/// let user_id = Uuid::now_v7();
/// let membership = OrganizationMembership::new(org_id, user_id, OrganizationRole::Editor);
/// assert!(membership.is_active);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationMembership {
    /// Unique membership ID
    pub id: Uuid,

    /// Organization ID
    pub organization_id: Uuid,

    /// User ID
    pub user_id: Uuid,

    /// Role within the organization
    pub role: OrganizationRole,

    /// When the user joined
    pub joined_at: DateTime<Utc>,

    /// Who invited this user (if applicable)
    pub invited_by: Option<Uuid>,

    /// Whether the membership is active
    pub is_active: bool,

    /// Custom permissions beyond the role
    ///
    /// These are string identifiers for specific permissions that may
    /// override or extend the base role permissions.
    #[serde(default)]
    pub custom_permissions: Vec<String>,

    /// User's display name within org (if different from profile)
    pub display_name: Option<String>,

    /// User's title/job role within org
    pub title: Option<String>,
}

impl OrganizationMembership {
    /// Creates a new organization membership.
    ///
    /// The membership is created with:
    /// - A newly generated UUID v7 ID
    /// - Active status
    /// - Current timestamp for joined_at
    /// - No custom permissions
    ///
    /// # Arguments
    ///
    /// * `organization_id` - The organization ID
    /// * `user_id` - The user ID
    /// * `role` - The user's role in the organization
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::{OrganizationMembership, OrganizationRole};
    ///
    /// let org_id = Uuid::now_v7();
    /// let user_id = Uuid::now_v7();
    /// let membership = OrganizationMembership::new(org_id, user_id, OrganizationRole::Viewer);
    /// ```
    pub fn new(organization_id: Uuid, user_id: Uuid, role: OrganizationRole) -> Self {
        Self {
            id: Uuid::now_v7(),
            organization_id,
            user_id,
            role,
            joined_at: Utc::now(),
            invited_by: None,
            is_active: true,
            custom_permissions: Vec::new(),
            display_name: None,
            title: None,
        }
    }

    /// Set who invited this user.
    ///
    /// # Arguments
    ///
    /// * `inviter_id` - The user ID of who invited this user
    pub fn with_inviter(mut self, inviter_id: Uuid) -> Self {
        self.invited_by = Some(inviter_id);
        self
    }

    /// Set the display name for this user within the organization.
    ///
    /// # Arguments
    ///
    /// * `name` - The display name
    pub fn with_display_name(mut self, name: impl Into<String>) -> Self {
        self.display_name = Some(name.into());
        self
    }

    /// Set the job title for this user within the organization.
    ///
    /// # Arguments
    ///
    /// * `title` - The job title
    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    /// Add a custom permission to this membership.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission identifier to add
    pub fn add_permission(&mut self, permission: impl Into<String>) {
        let perm = permission.into();
        if !self.custom_permissions.contains(&perm) {
            self.custom_permissions.push(perm);
        }
    }

    /// Remove a custom permission from this membership.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission identifier to remove
    pub fn remove_permission(&mut self, permission: &str) {
        self.custom_permissions.retain(|p| p != permission);
    }

    /// Check if this membership has a specific custom permission.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission identifier to check
    ///
    /// # Returns
    ///
    /// `true` if the membership has this permission
    pub fn has_permission(&self, permission: &str) -> bool {
        self.custom_permissions.contains(&permission.to_string())
    }
}

/// Project membership for private projects.
///
/// This represents a user's membership in a specific project, including their role
/// and when they were added. For organization-wide projects, this is only needed
/// for private projects with restricted access.
///
/// # Examples
///
/// ```
/// use uuid::Uuid;
/// use platform_org::{ProjectMembership, ProjectRole};
///
/// let project_id = Uuid::now_v7();
/// let user_id = Uuid::now_v7();
/// let membership = ProjectMembership::new(project_id, user_id, ProjectRole::Editor);
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMembership {
    /// Unique membership ID
    pub id: Uuid,

    /// Project ID
    pub project_id: Uuid,

    /// User ID
    pub user_id: Uuid,

    /// Role within the project
    pub role: ProjectRole,

    /// When the user was added
    pub added_at: DateTime<Utc>,

    /// Who added this user (if applicable)
    pub added_by: Option<Uuid>,
}

impl ProjectMembership {
    /// Creates a new project membership.
    ///
    /// The membership is created with:
    /// - A newly generated UUID v7 ID
    /// - Current timestamp for added_at
    ///
    /// # Arguments
    ///
    /// * `project_id` - The project ID
    /// * `user_id` - The user ID
    /// * `role` - The user's role in the project
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::{ProjectMembership, ProjectRole};
    ///
    /// let project_id = Uuid::now_v7();
    /// let user_id = Uuid::now_v7();
    /// let membership = ProjectMembership::new(project_id, user_id, ProjectRole::Viewer);
    /// ```
    pub fn new(project_id: Uuid, user_id: Uuid, role: ProjectRole) -> Self {
        Self {
            id: Uuid::now_v7(),
            project_id,
            user_id,
            role,
            added_at: Utc::now(),
            added_by: None,
        }
    }

    /// Set who added this user to the project.
    ///
    /// # Arguments
    ///
    /// * `adder_id` - The user ID of who added this user
    pub fn with_adder(mut self, adder_id: Uuid) -> Self {
        self.added_by = Some(adder_id);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_organization_membership_creation() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let membership = OrganizationMembership::new(org_id, user_id, OrganizationRole::Editor);

        assert_eq!(membership.organization_id, org_id);
        assert_eq!(membership.user_id, user_id);
        assert_eq!(membership.role, OrganizationRole::Editor);
        assert!(membership.is_active);
        assert!(membership.custom_permissions.is_empty());
    }

    #[test]
    fn test_organization_membership_with_inviter() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let inviter_id = Uuid::now_v7();

        let membership = OrganizationMembership::new(org_id, user_id, OrganizationRole::Viewer)
            .with_inviter(inviter_id);

        assert_eq!(membership.invited_by, Some(inviter_id));
    }

    #[test]
    fn test_custom_permissions() {
        let org_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let mut membership = OrganizationMembership::new(org_id, user_id, OrganizationRole::Editor);

        membership.add_permission("billing.manage");
        assert!(membership.has_permission("billing.manage"));

        membership.add_permission("billing.manage"); // Duplicate
        assert_eq!(membership.custom_permissions.len(), 1);

        membership.remove_permission("billing.manage");
        assert!(!membership.has_permission("billing.manage"));
    }

    #[test]
    fn test_project_membership_creation() {
        let project_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let membership = ProjectMembership::new(project_id, user_id, ProjectRole::Admin);

        assert_eq!(membership.project_id, project_id);
        assert_eq!(membership.user_id, user_id);
        assert_eq!(membership.role, ProjectRole::Admin);
    }

    #[test]
    fn test_project_membership_with_adder() {
        let project_id = Uuid::now_v7();
        let user_id = Uuid::now_v7();
        let adder_id = Uuid::now_v7();

        let membership =
            ProjectMembership::new(project_id, user_id, ProjectRole::Editor).with_adder(adder_id);

        assert_eq!(membership.added_by, Some(adder_id));
    }
}
