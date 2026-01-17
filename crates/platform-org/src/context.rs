//! User context for organization and project switching
//!
//! This module provides the UserContext type that tracks a user's current
//! working context within the system, including their selected organization
//! and project, as well as recent access history.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// User's current working context (selected org and project).
///
/// This tracks which organization and project a user is currently working in,
/// as well as their recent access history and preferences for context switching.
///
/// # Use Cases
///
/// - Multi-tenant UI navigation
/// - Default context on login
/// - Recent items quick-switching
/// - Session restoration
///
/// # Examples
///
/// ```
/// use uuid::Uuid;
/// use platform_org::UserContext;
///
/// let user_id = Uuid::now_v7();
/// let mut ctx = UserContext::new(user_id);
///
/// let org_id = Uuid::now_v7();
/// ctx.switch_organization(org_id);
/// assert_eq!(ctx.current_organization_id, Some(org_id));
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    /// User ID
    pub user_id: Uuid,

    /// Currently selected organization
    pub current_organization_id: Option<Uuid>,

    /// Currently selected project
    pub current_project_id: Option<Uuid>,

    /// Recently accessed organizations (most recent first)
    #[serde(default)]
    pub recent_organizations: Vec<Uuid>,

    /// Recently accessed projects (most recent first)
    #[serde(default)]
    pub recent_projects: Vec<Uuid>,

    /// Default organization for new sessions
    pub default_organization_id: Option<Uuid>,

    /// Default project for new sessions
    pub default_project_id: Option<Uuid>,

    /// User preferences for context switching
    pub preferences: ContextPreferences,

    /// Last updated timestamp
    pub updated_at: DateTime<Utc>,
}

impl UserContext {
    /// Creates a new user context with no selected organization or project.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The user ID this context belongs to
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::UserContext;
    ///
    /// let user_id = Uuid::now_v7();
    /// let ctx = UserContext::new(user_id);
    /// assert_eq!(ctx.user_id, user_id);
    /// assert!(ctx.current_organization_id.is_none());
    /// ```
    pub fn new(user_id: Uuid) -> Self {
        Self {
            user_id,
            current_organization_id: None,
            current_project_id: None,
            recent_organizations: Vec::new(),
            recent_projects: Vec::new(),
            default_organization_id: None,
            default_project_id: None,
            preferences: ContextPreferences::default(),
            updated_at: Utc::now(),
        }
    }

    /// Switch to a different organization.
    ///
    /// This will:
    /// - Set the current organization
    /// - Clear the current project (since projects belong to organizations)
    /// - Add the organization to recent history
    /// - Update the timestamp
    ///
    /// # Arguments
    ///
    /// * `org_id` - The organization ID to switch to
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::UserContext;
    ///
    /// let user_id = Uuid::now_v7();
    /// let mut ctx = UserContext::new(user_id);
    /// let org_id = Uuid::now_v7();
    ///
    /// ctx.switch_organization(org_id);
    /// assert_eq!(ctx.current_organization_id, Some(org_id));
    /// assert!(ctx.current_project_id.is_none());
    /// ```
    pub fn switch_organization(&mut self, org_id: Uuid) {
        self.current_organization_id = Some(org_id);
        // Clear project when switching orgs
        self.current_project_id = None;
        // Add to recent list
        self.add_recent_organization(org_id);
        self.updated_at = Utc::now();
    }

    /// Switch to a different project.
    ///
    /// This will:
    /// - Set the current project
    /// - Add the project to recent history
    /// - Update the timestamp
    ///
    /// Note: This does not automatically set the organization.
    /// Ensure the organization is set separately.
    ///
    /// # Arguments
    ///
    /// * `project_id` - The project ID to switch to
    ///
    /// # Examples
    ///
    /// ```
    /// use uuid::Uuid;
    /// use platform_org::UserContext;
    ///
    /// let user_id = Uuid::now_v7();
    /// let mut ctx = UserContext::new(user_id);
    /// let project_id = Uuid::now_v7();
    ///
    /// ctx.switch_project(project_id);
    /// assert_eq!(ctx.current_project_id, Some(project_id));
    /// ```
    pub fn switch_project(&mut self, project_id: Uuid) {
        self.current_project_id = Some(project_id);
        self.add_recent_project(project_id);
        self.updated_at = Utc::now();
    }

    /// Set the default organization for this user.
    ///
    /// This organization will be used when the user logs in.
    ///
    /// # Arguments
    ///
    /// * `org_id` - The organization ID to set as default
    pub fn set_default_organization(&mut self, org_id: Uuid) {
        self.default_organization_id = Some(org_id);
        self.updated_at = Utc::now();
    }

    /// Set the default project for this user.
    ///
    /// This project will be used when the user logs in.
    ///
    /// # Arguments
    ///
    /// * `project_id` - The project ID to set as default
    pub fn set_default_project(&mut self, project_id: Uuid) {
        self.default_project_id = Some(project_id);
        self.updated_at = Utc::now();
    }

    /// Clear the current organization and project.
    ///
    /// This is useful when a user logs out or when context should be reset.
    pub fn clear_context(&mut self) {
        self.current_organization_id = None;
        self.current_project_id = None;
        self.updated_at = Utc::now();
    }

    /// Get the most recent organizations.
    ///
    /// # Arguments
    ///
    /// * `limit` - Maximum number of organizations to return
    ///
    /// # Returns
    ///
    /// A slice of organization IDs, most recent first
    pub fn get_recent_organizations(&self, limit: usize) -> &[Uuid] {
        let end = limit.min(self.recent_organizations.len());
        &self.recent_organizations[..end]
    }

    /// Get the most recent projects.
    ///
    /// # Arguments
    ///
    /// * `limit` - Maximum number of projects to return
    ///
    /// # Returns
    ///
    /// A slice of project IDs, most recent first
    pub fn get_recent_projects(&self, limit: usize) -> &[Uuid] {
        let end = limit.min(self.recent_projects.len());
        &self.recent_projects[..end]
    }

    /// Add organization to recent list (internal helper).
    fn add_recent_organization(&mut self, org_id: Uuid) {
        // Remove if already in list
        self.recent_organizations.retain(|id| *id != org_id);
        // Add to front
        self.recent_organizations.insert(0, org_id);
        // Keep max 10
        self.recent_organizations.truncate(10);
    }

    /// Add project to recent list (internal helper).
    fn add_recent_project(&mut self, project_id: Uuid) {
        self.recent_projects.retain(|id| *id != project_id);
        self.recent_projects.insert(0, project_id);
        self.recent_projects.truncate(10);
    }
}

/// User preferences for context switching behavior.
///
/// These preferences control how the context switching UI behaves
/// and what defaults are applied.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPreferences {
    /// Remember last org/project on login
    pub remember_last_context: bool,

    /// Show confirmation dialog when switching
    pub confirm_context_switch: bool,

    /// Maximum number of recent items to show
    pub max_recent_items: u32,

    /// Show projects from all orgs or just current
    pub show_all_org_projects: bool,

    /// Keyboard shortcut for switcher (e.g., "Ctrl+K")
    pub switcher_shortcut: Option<String>,
}

impl Default for ContextPreferences {
    fn default() -> Self {
        Self {
            remember_last_context: true,
            confirm_context_switch: false,
            max_recent_items: 5,
            show_all_org_projects: false,
            switcher_shortcut: Some("Ctrl+K".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_context_creation() {
        let user_id = Uuid::now_v7();
        let ctx = UserContext::new(user_id);

        assert_eq!(ctx.user_id, user_id);
        assert!(ctx.current_organization_id.is_none());
        assert!(ctx.current_project_id.is_none());
    }

    #[test]
    fn test_switch_organization() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        let org1 = Uuid::now_v7();
        let org2 = Uuid::now_v7();

        ctx.switch_organization(org1);
        assert_eq!(ctx.current_organization_id, Some(org1));
        assert!(ctx.recent_organizations.contains(&org1));

        ctx.switch_organization(org2);
        assert_eq!(ctx.current_organization_id, Some(org2));
        assert_eq!(ctx.recent_organizations[0], org2);
        assert_eq!(ctx.recent_organizations[1], org1);
    }

    #[test]
    fn test_switch_project() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        let project1 = Uuid::now_v7();
        let project2 = Uuid::now_v7();

        ctx.switch_project(project1);
        assert_eq!(ctx.current_project_id, Some(project1));

        ctx.switch_project(project2);
        assert_eq!(ctx.current_project_id, Some(project2));
        assert_eq!(ctx.recent_projects[0], project2);
        assert_eq!(ctx.recent_projects[1], project1);
    }

    #[test]
    fn test_switching_org_clears_project() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        let org1 = Uuid::now_v7();
        let org2 = Uuid::now_v7();
        let project1 = Uuid::now_v7();

        ctx.switch_organization(org1);
        ctx.switch_project(project1);
        assert_eq!(ctx.current_project_id, Some(project1));

        // Switching org should clear project
        ctx.switch_organization(org2);
        assert_eq!(ctx.current_organization_id, Some(org2));
        assert!(ctx.current_project_id.is_none());
    }

    #[test]
    fn test_recent_organizations_limit() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        // Add more than 10 organizations
        for _ in 0..15 {
            ctx.switch_organization(Uuid::now_v7());
        }

        // Should only keep 10
        assert_eq!(ctx.recent_organizations.len(), 10);
    }

    #[test]
    fn test_default_organization() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        let org_id = Uuid::now_v7();
        ctx.set_default_organization(org_id);
        assert_eq!(ctx.default_organization_id, Some(org_id));
    }

    #[test]
    fn test_get_recent_organizations() {
        let user_id = Uuid::now_v7();
        let mut ctx = UserContext::new(user_id);

        let org1 = Uuid::now_v7();
        let org2 = Uuid::now_v7();
        let org3 = Uuid::now_v7();

        ctx.switch_organization(org1);
        ctx.switch_organization(org2);
        ctx.switch_organization(org3);

        let recent = ctx.get_recent_organizations(2);
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0], org3);
        assert_eq!(recent[1], org2);
    }
}
