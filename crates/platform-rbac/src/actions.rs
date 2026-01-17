//! # Actions
//!
//! Defines all actions that can be performed on resources.
//! Actions represent the operations users can perform on resources.

use serde::{Deserialize, Serialize};

/// Actions that can be performed on resources.
///
/// Actions represent different levels of access and operations:
/// - **Read**: View/access resource data
/// - **Create**: Create new resource instances
/// - **Update**: Modify existing resource data
/// - **Delete**: Remove resource instances
/// - **List**: Query/browse multiple resources
/// - **Export**: Download/export resource data
/// - **Import**: Upload/import data
/// - **Share**: Share resources with others
/// - **Manage**: Administer resource settings
/// - **Approve**: Approve pending actions/changes
/// - **Execute**: Trigger actions/processes
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    /// Read/view resource.
    ///
    /// Grants access to view resource details and data.
    Read,

    /// Create new resource.
    ///
    /// Grants permission to create new instances of the resource.
    Create,

    /// Update existing resource.
    ///
    /// Grants permission to modify existing resource data.
    Update,

    /// Delete resource.
    ///
    /// Grants permission to permanently remove resources.
    Delete,

    /// List/query resources.
    ///
    /// Grants permission to browse and search through multiple resources.
    List,

    /// Export resource data.
    ///
    /// Grants permission to download or export resource data.
    Export,

    /// Import data into resource.
    ///
    /// Grants permission to upload or import data.
    Import,

    /// Share resource with others.
    ///
    /// Grants permission to share resources with other users or teams.
    Share,

    /// Manage resource settings.
    ///
    /// Grants administrative access to resource configuration and settings.
    Manage,

    /// Approve pending actions.
    ///
    /// Grants permission to approve or reject pending actions or changes.
    Approve,

    /// Execute/trigger actions.
    ///
    /// Grants permission to run processes or trigger automated actions.
    Execute,
}

impl Action {
    /// Get the string representation of the action.
    ///
    /// # Returns
    ///
    /// A static string representation of the action.
    pub fn as_str(&self) -> &'static str {
        match self {
            Action::Read => "read",
            Action::Create => "create",
            Action::Update => "update",
            Action::Delete => "delete",
            Action::List => "list",
            Action::Export => "export",
            Action::Import => "import",
            Action::Share => "share",
            Action::Manage => "manage",
            Action::Approve => "approve",
            Action::Execute => "execute",
        }
    }

    /// Parse action from string representation.
    ///
    /// # Arguments
    ///
    /// * `s` - String to parse (case-insensitive, supports aliases)
    ///
    /// # Returns
    ///
    /// `Some(Action)` if valid, `None` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::actions::Action;
    ///
    /// assert_eq!(Action::parse("read"), Some(Action::Read));
    /// assert_eq!(Action::parse("view"), Some(Action::Read)); // Alias
    /// assert_eq!(Action::parse("write"), Some(Action::Update)); // Alias
    /// assert_eq!(Action::parse("invalid"), None);
    /// ```
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "read" | "view" | "get" => Some(Action::Read),
            "create" | "add" | "new" => Some(Action::Create),
            "update" | "edit" | "write" | "modify" | "put" | "patch" => Some(Action::Update),
            "delete" | "remove" | "destroy" => Some(Action::Delete),
            "list" | "query" | "browse" | "search" | "index" => Some(Action::List),
            "export" | "download" => Some(Action::Export),
            "import" | "upload" => Some(Action::Import),
            "share" => Some(Action::Share),
            "manage" | "admin" | "administer" => Some(Action::Manage),
            "approve" | "accept" => Some(Action::Approve),
            "execute" | "run" | "trigger" | "start" => Some(Action::Execute),
            _ => None,
        }
    }

    /// Get all actions.
    ///
    /// # Returns
    ///
    /// A vector containing all available actions.
    pub fn all() -> Vec<Self> {
        vec![
            Action::Read,
            Action::Create,
            Action::Update,
            Action::Delete,
            Action::List,
            Action::Export,
            Action::Import,
            Action::Share,
            Action::Manage,
            Action::Approve,
            Action::Execute,
        ]
    }

    /// Check if this action implies another action.
    ///
    /// Some actions implicitly grant other actions:
    /// - `Manage` implies all other actions
    /// - `Update` implies `Read`
    /// - `Delete` implies `Read`
    /// - `Create` implies `Read`
    ///
    /// # Arguments
    ///
    /// * `other` - The action to check if it's implied
    ///
    /// # Returns
    ///
    /// `true` if this action implies the other action, `false` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::actions::Action;
    ///
    /// assert!(Action::Manage.implies(Action::Read));
    /// assert!(Action::Manage.implies(Action::Create));
    /// assert!(Action::Update.implies(Action::Read));
    /// assert!(!Action::Read.implies(Action::Update));
    /// ```
    pub fn implies(&self, other: Action) -> bool {
        match self {
            Action::Manage => true, // Manage implies all actions
            Action::Update | Action::Delete | Action::Create => other == Action::Read,
            _ => false,
        }
    }

    /// Get the inverse action, if applicable.
    ///
    /// Some actions have logical inverses:
    /// - `Create` <-> `Delete`
    /// - `Export` <-> `Import`
    /// - Others return `None`
    ///
    /// # Returns
    ///
    /// `Some(Action)` if there's a logical inverse, `None` otherwise
    pub fn inverse(&self) -> Option<Self> {
        match self {
            Action::Create => Some(Action::Delete),
            Action::Delete => Some(Action::Create),
            Action::Export => Some(Action::Import),
            Action::Import => Some(Action::Export),
            _ => None,
        }
    }

    /// Check if this is a destructive action.
    ///
    /// Destructive actions permanently modify or remove data.
    ///
    /// # Returns
    ///
    /// `true` if the action is destructive, `false` otherwise
    pub fn is_destructive(&self) -> bool {
        matches!(self, Action::Delete)
    }

    /// Check if this is a read-only action.
    ///
    /// Read-only actions don't modify resources.
    ///
    /// # Returns
    ///
    /// `true` if the action is read-only, `false` otherwise
    pub fn is_read_only(&self) -> bool {
        matches!(self, Action::Read | Action::List | Action::Export)
    }

    /// Check if this is a write action.
    ///
    /// Write actions modify or create resources.
    ///
    /// # Returns
    ///
    /// `true` if the action modifies data, `false` otherwise
    pub fn is_write(&self) -> bool {
        matches!(
            self,
            Action::Create | Action::Update | Action::Delete | Action::Import
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_parsing() {
        assert_eq!(Action::parse("read"), Some(Action::Read));
        assert_eq!(Action::parse("view"), Some(Action::Read));
        assert_eq!(Action::parse("get"), Some(Action::Read));

        assert_eq!(Action::parse("create"), Some(Action::Create));
        assert_eq!(Action::parse("add"), Some(Action::Create));

        assert_eq!(Action::parse("update"), Some(Action::Update));
        assert_eq!(Action::parse("write"), Some(Action::Update));
        assert_eq!(Action::parse("edit"), Some(Action::Update));
        assert_eq!(Action::parse("patch"), Some(Action::Update));

        assert_eq!(Action::parse("delete"), Some(Action::Delete));
        assert_eq!(Action::parse("remove"), Some(Action::Delete));

        assert_eq!(Action::parse("invalid"), None);
    }

    #[test]
    fn test_action_as_str() {
        assert_eq!(Action::Read.as_str(), "read");
        assert_eq!(Action::Create.as_str(), "create");
        assert_eq!(Action::Update.as_str(), "update");
        assert_eq!(Action::Delete.as_str(), "delete");
        assert_eq!(Action::Manage.as_str(), "manage");
    }

    #[test]
    fn test_action_implies() {
        // Manage implies everything
        assert!(Action::Manage.implies(Action::Read));
        assert!(Action::Manage.implies(Action::Create));
        assert!(Action::Manage.implies(Action::Update));
        assert!(Action::Manage.implies(Action::Delete));
        assert!(Action::Manage.implies(Action::List));

        // Write actions imply read
        assert!(Action::Update.implies(Action::Read));
        assert!(Action::Delete.implies(Action::Read));
        assert!(Action::Create.implies(Action::Read));

        // Read doesn't imply write
        assert!(!Action::Read.implies(Action::Update));
        assert!(!Action::Read.implies(Action::Create));
        assert!(!Action::Read.implies(Action::Delete));
    }

    #[test]
    fn test_action_inverse() {
        assert_eq!(Action::Create.inverse(), Some(Action::Delete));
        assert_eq!(Action::Delete.inverse(), Some(Action::Create));
        assert_eq!(Action::Export.inverse(), Some(Action::Import));
        assert_eq!(Action::Import.inverse(), Some(Action::Export));
        assert_eq!(Action::Read.inverse(), None);
        assert_eq!(Action::Update.inverse(), None);
    }

    #[test]
    fn test_is_destructive() {
        assert!(Action::Delete.is_destructive());
        assert!(!Action::Read.is_destructive());
        assert!(!Action::Create.is_destructive());
        assert!(!Action::Update.is_destructive());
    }

    #[test]
    fn test_is_read_only() {
        assert!(Action::Read.is_read_only());
        assert!(Action::List.is_read_only());
        assert!(Action::Export.is_read_only());
        assert!(!Action::Create.is_read_only());
        assert!(!Action::Update.is_read_only());
        assert!(!Action::Delete.is_read_only());
    }

    #[test]
    fn test_is_write() {
        assert!(Action::Create.is_write());
        assert!(Action::Update.is_write());
        assert!(Action::Delete.is_write());
        assert!(Action::Import.is_write());
        assert!(!Action::Read.is_write());
        assert!(!Action::List.is_write());
        assert!(!Action::Export.is_write());
    }

    #[test]
    fn test_all_actions_count() {
        let all = Action::all();
        assert_eq!(all.len(), 11);
    }
}
