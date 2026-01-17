//! Role-based access control
//!
//! This module defines role hierarchies for organizations and projects,
//! along with their associated permissions.

use serde::{Deserialize, Serialize};

/// User role within an organization.
///
/// Roles are hierarchical, with each role inheriting the permissions of lower roles.
/// The hierarchy is: Guest < Viewer < Editor < Admin < Owner
///
/// # Permission Model
///
/// - **Guest**: Limited visibility, read-only for specific resources
/// - **Viewer**: Read-only access to organization resources
/// - **Editor**: Can create and edit content
/// - **Admin**: Can manage projects and members
/// - **Owner**: Full organization control including settings and billing
///
/// # Examples
///
/// ```
/// use platform_org::OrganizationRole;
///
/// let role = OrganizationRole::Editor;
/// assert!(role.can_edit());
/// assert!(!role.can_manage_projects());
///
/// let admin = OrganizationRole::Admin;
/// assert!(admin.can_manage_projects());
/// assert!(!admin.can_manage_settings());
/// ```
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OrganizationRole {
    /// Guest access (limited visibility)
    Guest = 0,

    /// Read-only access to organization resources
    Viewer = 1,

    /// Can create and edit content
    Editor = 2,

    /// Can manage projects and members
    Admin = 3,

    /// Full organization control
    Owner = 4,
}

impl OrganizationRole {
    /// Check if this role has admin privileges.
    ///
    /// Admin privileges allow managing projects and members.
    ///
    /// # Returns
    ///
    /// `true` for Admin and Owner roles
    pub fn is_admin(&self) -> bool {
        *self >= OrganizationRole::Admin
    }

    /// Check if this role can edit content.
    ///
    /// # Returns
    ///
    /// `true` for Editor, Admin, and Owner roles
    pub fn can_edit(&self) -> bool {
        *self >= OrganizationRole::Editor
    }

    /// Check if this role can manage projects.
    ///
    /// This includes creating, archiving, and configuring projects.
    ///
    /// # Returns
    ///
    /// `true` for Admin and Owner roles
    pub fn can_manage_projects(&self) -> bool {
        *self >= OrganizationRole::Admin
    }

    /// Check if this role can manage members.
    ///
    /// This includes inviting, removing, and changing member roles.
    ///
    /// # Returns
    ///
    /// `true` for Admin and Owner roles
    pub fn can_manage_members(&self) -> bool {
        *self >= OrganizationRole::Admin
    }

    /// Check if this role can manage organization settings.
    ///
    /// This includes billing, SSO configuration, and other org-level settings.
    ///
    /// # Returns
    ///
    /// `true` only for Owner role
    pub fn can_manage_settings(&self) -> bool {
        *self >= OrganizationRole::Owner
    }

    /// Parse role from string representation.
    ///
    /// # Arguments
    ///
    /// * `s` - String to parse (case-insensitive)
    ///
    /// # Returns
    ///
    /// `Some(OrganizationRole)` if valid, `None` otherwise
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::OrganizationRole;
    ///
    /// assert_eq!(OrganizationRole::parse("admin"), Some(OrganizationRole::Admin));
    /// assert_eq!(OrganizationRole::parse("VIEWER"), Some(OrganizationRole::Viewer));
    /// assert_eq!(OrganizationRole::parse("invalid"), None);
    /// ```
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "guest" => Some(Self::Guest),
            "viewer" => Some(Self::Viewer),
            "editor" => Some(Self::Editor),
            "admin" => Some(Self::Admin),
            "owner" => Some(Self::Owner),
            _ => None,
        }
    }

    /// Get string representation of the role.
    ///
    /// # Returns
    ///
    /// Lowercase string representation
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::OrganizationRole;
    ///
    /// assert_eq!(OrganizationRole::Admin.as_str(), "admin");
    /// ```
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Guest => "guest",
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Admin => "admin",
            Self::Owner => "owner",
        }
    }

    /// Get a human-readable display name for the role.
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::OrganizationRole;
    ///
    /// assert_eq!(OrganizationRole::Admin.display_name(), "Admin");
    /// ```
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Guest => "Guest",
            Self::Viewer => "Viewer",
            Self::Editor => "Editor",
            Self::Admin => "Admin",
            Self::Owner => "Owner",
        }
    }
}

impl Default for OrganizationRole {
    fn default() -> Self {
        Self::Viewer
    }
}

/// User role within a project.
///
/// Similar to organization roles but scoped to a specific project.
/// The hierarchy is: Viewer < Editor < Admin < Owner
///
/// # Permission Model
///
/// - **Viewer**: Read-only access to project resources
/// - **Editor**: Can create and edit content
/// - **Admin**: Can manage project settings and members
/// - **Owner**: Full project control including deletion
///
/// # Examples
///
/// ```
/// use platform_org::ProjectRole;
///
/// let role = ProjectRole::Editor;
/// assert_eq!(role.as_str(), "editor");
/// ```
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProjectRole {
    /// Read-only access
    Viewer = 1,

    /// Can create and edit content
    Editor = 2,

    /// Can manage project settings and members
    Admin = 3,

    /// Project owner (can delete)
    Owner = 4,
}

impl ProjectRole {
    /// Check if this role can edit content.
    ///
    /// # Returns
    ///
    /// `true` for Editor, Admin, and Owner roles
    pub fn can_edit(&self) -> bool {
        *self >= ProjectRole::Editor
    }

    /// Check if this role can manage the project.
    ///
    /// This includes managing settings and members.
    ///
    /// # Returns
    ///
    /// `true` for Admin and Owner roles
    pub fn can_manage(&self) -> bool {
        *self >= ProjectRole::Admin
    }

    /// Check if this role can delete the project.
    ///
    /// # Returns
    ///
    /// `true` only for Owner role
    pub fn can_delete(&self) -> bool {
        *self >= ProjectRole::Owner
    }

    /// Parse role from string representation.
    ///
    /// # Arguments
    ///
    /// * `s` - String to parse (case-insensitive)
    ///
    /// # Returns
    ///
    /// `Some(ProjectRole)` if valid, `None` otherwise
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::ProjectRole;
    ///
    /// assert_eq!(ProjectRole::parse("admin"), Some(ProjectRole::Admin));
    /// assert_eq!(ProjectRole::parse("VIEWER"), Some(ProjectRole::Viewer));
    /// assert_eq!(ProjectRole::parse("invalid"), None);
    /// ```
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "viewer" => Some(Self::Viewer),
            "editor" => Some(Self::Editor),
            "admin" => Some(Self::Admin),
            "owner" => Some(Self::Owner),
            _ => None,
        }
    }

    /// Get string representation of the role.
    ///
    /// # Returns
    ///
    /// Lowercase string representation
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::ProjectRole;
    ///
    /// assert_eq!(ProjectRole::Admin.as_str(), "admin");
    /// ```
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Viewer => "viewer",
            Self::Editor => "editor",
            Self::Admin => "admin",
            Self::Owner => "owner",
        }
    }

    /// Get a human-readable display name for the role.
    ///
    /// # Examples
    ///
    /// ```
    /// use platform_org::ProjectRole;
    ///
    /// assert_eq!(ProjectRole::Admin.display_name(), "Admin");
    /// ```
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Viewer => "Viewer",
            Self::Editor => "Editor",
            Self::Admin => "Admin",
            Self::Owner => "Owner",
        }
    }
}

impl Default for ProjectRole {
    fn default() -> Self {
        Self::Viewer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_organization_role_hierarchy() {
        assert!(OrganizationRole::Owner > OrganizationRole::Admin);
        assert!(OrganizationRole::Admin > OrganizationRole::Editor);
        assert!(OrganizationRole::Editor > OrganizationRole::Viewer);
        assert!(OrganizationRole::Viewer > OrganizationRole::Guest);
    }

    #[test]
    fn test_organization_role_permissions() {
        assert!(!OrganizationRole::Viewer.can_edit());
        assert!(OrganizationRole::Editor.can_edit());
        assert!(!OrganizationRole::Editor.can_manage_projects());
        assert!(OrganizationRole::Admin.can_manage_projects());
        assert!(!OrganizationRole::Admin.can_manage_settings());
        assert!(OrganizationRole::Owner.can_manage_settings());
    }

    #[test]
    fn test_organization_role_parse() {
        assert_eq!(
            OrganizationRole::parse("admin"),
            Some(OrganizationRole::Admin)
        );
        assert_eq!(
            OrganizationRole::parse("VIEWER"),
            Some(OrganizationRole::Viewer)
        );
        assert_eq!(OrganizationRole::parse("invalid"), None);
    }

    #[test]
    fn test_project_role_hierarchy() {
        assert!(ProjectRole::Owner > ProjectRole::Admin);
        assert!(ProjectRole::Admin > ProjectRole::Editor);
        assert!(ProjectRole::Editor > ProjectRole::Viewer);
    }

    #[test]
    fn test_project_role_permissions() {
        assert!(!ProjectRole::Viewer.can_edit());
        assert!(ProjectRole::Editor.can_edit());
        assert!(!ProjectRole::Editor.can_manage());
        assert!(ProjectRole::Admin.can_manage());
        assert!(!ProjectRole::Admin.can_delete());
        assert!(ProjectRole::Owner.can_delete());
    }

    #[test]
    fn test_project_role_parse() {
        assert_eq!(ProjectRole::parse("admin"), Some(ProjectRole::Admin));
        assert_eq!(ProjectRole::parse("VIEWER"), Some(ProjectRole::Viewer));
        assert_eq!(ProjectRole::parse("invalid"), None);
    }
}
