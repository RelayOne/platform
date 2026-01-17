//! # Permissions
//!
//! Core permission types and sets for the RBAC system.
//! A permission combines a resource type with an action.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::actions::Action;
use crate::resources::ResourceType;

/// A permission is a combination of resource type and action.
///
/// Permissions can be:
/// - **Global**: Apply to all instances of a resource type (no resource_id)
/// - **Resource-specific**: Apply only to a specific resource instance (with resource_id)
///
/// # Example
///
/// ```
/// use platform_rbac::permissions::Permission;
/// use platform_rbac::resources::ResourceType;
/// use platform_rbac::actions::Action;
///
/// // Global permission
/// let perm = Permission::new(ResourceType::Document, Action::Read);
/// assert_eq!(perm.to_string(), "document:read");
///
/// // Resource-specific permission
/// let perm = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
/// assert_eq!(perm.to_string(), "document:read:doc-123");
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Permission {
    /// The resource type this permission applies to.
    pub resource: ResourceType,
    /// The action allowed on the resource.
    pub action: Action,
    /// Optional: specific resource ID this permission applies to.
    /// If None, applies to all resources of this type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
}

impl Permission {
    /// Create a new global permission.
    ///
    /// # Arguments
    ///
    /// * `resource` - The resource type
    /// * `action` - The action allowed
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::permissions::Permission;
    /// use platform_rbac::resources::ResourceType;
    /// use platform_rbac::actions::Action;
    ///
    /// let perm = Permission::new(ResourceType::Document, Action::Read);
    /// assert!(perm.resource_id.is_none());
    /// ```
    pub fn new(resource: ResourceType, action: Action) -> Self {
        Self {
            resource,
            action,
            resource_id: None,
        }
    }

    /// Create a permission for a specific resource instance.
    ///
    /// # Arguments
    ///
    /// * `resource` - The resource type
    /// * `action` - The action allowed
    /// * `resource_id` - The specific resource ID
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::permissions::Permission;
    /// use platform_rbac::resources::ResourceType;
    /// use platform_rbac::actions::Action;
    ///
    /// let perm = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
    /// assert_eq!(perm.resource_id, Some("doc-123".to_string()));
    /// ```
    pub fn for_resource(resource: ResourceType, action: Action, resource_id: impl Into<String>) -> Self {
        Self {
            resource,
            action,
            resource_id: Some(resource_id.into()),
        }
    }

    /// Get the string representation (e.g., "document:read" or "document:read:doc-123").
    ///
    /// # Returns
    ///
    /// A string in the format `resource:action` or `resource:action:id`
    pub fn to_string(&self) -> String {
        if let Some(ref id) = self.resource_id {
            format!("{}:{}:{}", self.resource.as_str(), self.action.as_str(), id)
        } else {
            format!("{}:{}", self.resource.as_str(), self.action.as_str())
        }
    }

    /// Parse from string (e.g., "document:read" or "document:read:uuid").
    ///
    /// # Arguments
    ///
    /// * `s` - The permission string to parse
    ///
    /// # Returns
    ///
    /// `Some(Permission)` if valid, `None` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::permissions::Permission;
    /// use platform_rbac::resources::ResourceType;
    /// use platform_rbac::actions::Action;
    ///
    /// let perm = Permission::from_string("document:read").unwrap();
    /// assert_eq!(perm.resource, ResourceType::Document);
    /// assert_eq!(perm.action, Action::Read);
    /// assert!(perm.resource_id.is_none());
    ///
    /// let perm = Permission::from_string("document:read:doc-123").unwrap();
    /// assert_eq!(perm.resource_id, Some("doc-123".to_string()));
    /// ```
    pub fn from_string(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() < 2 {
            return None;
        }

        let resource = ResourceType::parse(parts[0])?;
        let action = Action::parse(parts[1])?;
        let resource_id = if parts.len() > 2 {
            Some(parts[2..].join(":"))
        } else {
            None
        };

        Some(Self {
            resource,
            action,
            resource_id,
        })
    }

    /// Check if this permission matches another (considering wildcards).
    ///
    /// A permission matches if:
    /// - Resource types match
    /// - Actions match (or this action implies the other)
    /// - Either has no resource_id (wildcard), or resource_ids match
    ///
    /// # Arguments
    ///
    /// * `other` - The permission to check against
    ///
    /// # Returns
    ///
    /// `true` if this permission matches the other, `false` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::permissions::Permission;
    /// use platform_rbac::resources::ResourceType;
    /// use platform_rbac::actions::Action;
    ///
    /// let global = Permission::new(ResourceType::Document, Action::Read);
    /// let specific = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
    ///
    /// // Global permission matches specific resource
    /// assert!(global.matches(&specific));
    /// ```
    pub fn matches(&self, other: &Permission) -> bool {
        if self.resource != other.resource {
            return false;
        }

        // Check if actions match or if this action implies the other
        if self.action != other.action && !self.action.implies(other.action) {
            return false;
        }

        // If either has no resource_id, it's a wildcard match
        match (&self.resource_id, &other.resource_id) {
            (None, _) | (_, None) => true,
            (Some(a), Some(b)) => a == b,
        }
    }

    /// Check if this is a global permission (applies to all resources of this type).
    pub fn is_global(&self) -> bool {
        self.resource_id.is_none()
    }

    /// Check if this is a resource-specific permission.
    pub fn is_specific(&self) -> bool {
        self.resource_id.is_some()
    }
}

/// A set of permissions that can be assigned to roles or users.
///
/// Uses internal string representation for efficient storage and comparison.
///
/// # Example
///
/// ```
/// use platform_rbac::permissions::{Permission, PermissionSet};
/// use platform_rbac::resources::ResourceType;
/// use platform_rbac::actions::Action;
///
/// let mut set = PermissionSet::new();
/// set.add(Permission::new(ResourceType::Document, Action::Read));
/// set.add(Permission::new(ResourceType::Document, Action::Create));
///
/// assert!(set.has(&Permission::new(ResourceType::Document, Action::Read)));
/// assert_eq!(set.len(), 2);
/// ```
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PermissionSet {
    /// The permissions in this set (stored as strings for efficiency).
    permissions: HashSet<String>,
}

impl PermissionSet {
    /// Create a new empty permission set.
    pub fn new() -> Self {
        Self {
            permissions: HashSet::new(),
        }
    }

    /// Add a permission to the set.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission to add
    pub fn add(&mut self, permission: Permission) {
        self.permissions.insert(permission.to_string());
    }

    /// Add multiple permissions to the set.
    ///
    /// # Arguments
    ///
    /// * `permissions` - An iterator of permissions to add
    pub fn add_all<I>(&mut self, permissions: I)
    where
        I: IntoIterator<Item = Permission>,
    {
        for perm in permissions {
            self.add(perm);
        }
    }

    /// Remove a permission from the set.
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission to remove
    ///
    /// # Returns
    ///
    /// `true` if the permission was present, `false` otherwise
    pub fn remove(&mut self, permission: &Permission) -> bool {
        self.permissions.remove(&permission.to_string())
    }

    /// Check if the set contains a permission.
    ///
    /// This checks for:
    /// 1. Exact match
    /// 2. Wildcard match (permission without resource_id)
    /// 3. Implied match (e.g., Manage implies Read)
    ///
    /// # Arguments
    ///
    /// * `permission` - The permission to check for
    ///
    /// # Returns
    ///
    /// `true` if the permission is granted, `false` otherwise
    pub fn has(&self, permission: &Permission) -> bool {
        let perm_str = permission.to_string();
        if self.permissions.contains(&perm_str) {
            return true;
        }

        // Check for wildcard match (permission without resource_id)
        if permission.resource_id.is_some() {
            let wildcard = format!("{}:{}", permission.resource.as_str(), permission.action.as_str());
            if self.permissions.contains(&wildcard) {
                return true;
            }
        }

        // Check for implied permissions (e.g., Manage implies all actions)
        for action in Action::all() {
            if action.implies(permission.action) {
                let implied_perm = if let Some(ref id) = permission.resource_id {
                    Permission::for_resource(permission.resource, action, id.clone())
                } else {
                    Permission::new(permission.resource, action)
                };
                if self.permissions.contains(&implied_perm.to_string()) {
                    return true;
                }
            }
        }

        false
    }

    /// Get all permissions in the set.
    ///
    /// # Returns
    ///
    /// A vector of all permissions
    pub fn all(&self) -> Vec<Permission> {
        self.permissions
            .iter()
            .filter_map(|s| Permission::from_string(s))
            .collect()
    }

    /// Merge another permission set into this one.
    ///
    /// # Arguments
    ///
    /// * `other` - The permission set to merge
    pub fn merge(&mut self, other: &PermissionSet) {
        for perm in &other.permissions {
            self.permissions.insert(perm.clone());
        }
    }

    /// Create from a list of permission strings.
    ///
    /// # Arguments
    ///
    /// * `perms` - Slice of permission strings (e.g., "document:read")
    ///
    /// # Returns
    ///
    /// A new permission set with the parsed permissions
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::permissions::PermissionSet;
    ///
    /// let set = PermissionSet::from_strings(&["document:read", "document:create"]);
    /// assert_eq!(set.len(), 2);
    /// ```
    pub fn from_strings(perms: &[&str]) -> Self {
        let mut set = Self::new();
        for perm in perms {
            if let Some(p) = Permission::from_string(perm) {
                set.add(p);
            }
        }
        set
    }

    /// Get the count of permissions.
    pub fn len(&self) -> usize {
        self.permissions.len()
    }

    /// Check if empty.
    pub fn is_empty(&self) -> bool {
        self.permissions.is_empty()
    }

    /// Clear all permissions.
    pub fn clear(&mut self) {
        self.permissions.clear();
    }

    /// Check if this set contains all permissions from another set.
    ///
    /// # Arguments
    ///
    /// * `other` - The permission set to check against
    ///
    /// # Returns
    ///
    /// `true` if this set contains all permissions from the other set
    pub fn contains_all(&self, other: &PermissionSet) -> bool {
        other.all().iter().all(|perm| self.has(perm))
    }

    /// Check if this set contains any permission from another set.
    ///
    /// # Arguments
    ///
    /// * `other` - The permission set to check against
    ///
    /// # Returns
    ///
    /// `true` if this set contains at least one permission from the other set
    pub fn contains_any(&self, other: &PermissionSet) -> bool {
        other.all().iter().any(|perm| self.has(perm))
    }
}

impl FromIterator<Permission> for PermissionSet {
    fn from_iter<T: IntoIterator<Item = Permission>>(iter: T) -> Self {
        let mut set = PermissionSet::new();
        for perm in iter {
            set.add(perm);
        }
        set
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_creation() {
        let perm = Permission::new(ResourceType::Document, Action::Read);
        assert_eq!(perm.to_string(), "document:read");
        assert!(perm.is_global());
        assert!(!perm.is_specific());
    }

    #[test]
    fn test_permission_with_resource_id() {
        let perm = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
        assert_eq!(perm.to_string(), "document:read:doc-123");
        assert!(!perm.is_global());
        assert!(perm.is_specific());
    }

    #[test]
    fn test_permission_parsing() {
        let perm = Permission::from_string("document:read").unwrap();
        assert_eq!(perm.resource, ResourceType::Document);
        assert_eq!(perm.action, Action::Read);
        assert!(perm.resource_id.is_none());

        let perm2 = Permission::from_string("assertion:update:asr-456").unwrap();
        assert_eq!(perm2.resource, ResourceType::Assertion);
        assert_eq!(perm2.action, Action::Update);
        assert_eq!(perm2.resource_id, Some("asr-456".to_string()));

        // Test with UUID containing colons
        let perm3 = Permission::from_string("meeting:read:uuid:12:34").unwrap();
        assert_eq!(perm3.resource_id, Some("uuid:12:34".to_string()));
    }

    #[test]
    fn test_permission_matches() {
        let global = Permission::new(ResourceType::Document, Action::Read);
        let specific = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");

        // Global matches specific
        assert!(global.matches(&specific));

        // Specific matches global
        assert!(specific.matches(&global));

        // Same specific matches
        assert!(specific.matches(&specific));

        // Different actions don't match
        let different_action = Permission::for_resource(ResourceType::Document, Action::Create, "doc-123");
        assert!(!specific.matches(&different_action));
    }

    #[test]
    fn test_permission_set() {
        let mut set = PermissionSet::new();
        set.add(Permission::new(ResourceType::Document, Action::Read));
        set.add(Permission::new(ResourceType::Document, Action::Create));

        assert!(set.has(&Permission::new(ResourceType::Document, Action::Read)));
        assert!(set.has(&Permission::new(ResourceType::Document, Action::Create)));
        assert!(!set.has(&Permission::new(ResourceType::Document, Action::Delete)));
        assert_eq!(set.len(), 2);
    }

    #[test]
    fn test_permission_wildcard_match() {
        let mut set = PermissionSet::new();
        set.add(Permission::new(ResourceType::Document, Action::Read));

        // Wildcard should match specific resource
        let specific = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
        assert!(set.has(&specific));
    }

    #[test]
    fn test_permission_set_merge() {
        let mut set1 = PermissionSet::new();
        set1.add(Permission::new(ResourceType::Document, Action::Read));

        let mut set2 = PermissionSet::new();
        set2.add(Permission::new(ResourceType::Document, Action::Create));

        set1.merge(&set2);
        assert_eq!(set1.len(), 2);
        assert!(set1.has(&Permission::new(ResourceType::Document, Action::Read)));
        assert!(set1.has(&Permission::new(ResourceType::Document, Action::Create)));
    }

    #[test]
    fn test_permission_set_from_strings() {
        let set = PermissionSet::from_strings(&["document:read", "document:create", "meeting:update"]);
        assert_eq!(set.len(), 3);
        assert!(set.has(&Permission::new(ResourceType::Document, Action::Read)));
        assert!(set.has(&Permission::new(ResourceType::Meeting, Action::Update)));
    }

    #[test]
    fn test_permission_set_remove() {
        let mut set = PermissionSet::new();
        set.add(Permission::new(ResourceType::Document, Action::Read));
        assert_eq!(set.len(), 1);

        let removed = set.remove(&Permission::new(ResourceType::Document, Action::Read));
        assert!(removed);
        assert_eq!(set.len(), 0);
        assert!(!set.has(&Permission::new(ResourceType::Document, Action::Read)));
    }

    #[test]
    fn test_permission_set_contains_all() {
        let mut set1 = PermissionSet::new();
        set1.add(Permission::new(ResourceType::Document, Action::Read));
        set1.add(Permission::new(ResourceType::Document, Action::Create));
        set1.add(Permission::new(ResourceType::Meeting, Action::Read));

        let mut set2 = PermissionSet::new();
        set2.add(Permission::new(ResourceType::Document, Action::Read));
        set2.add(Permission::new(ResourceType::Document, Action::Create));

        assert!(set1.contains_all(&set2));
        assert!(!set2.contains_all(&set1));
    }

    #[test]
    fn test_permission_set_contains_any() {
        let mut set1 = PermissionSet::new();
        set1.add(Permission::new(ResourceType::Document, Action::Read));

        let mut set2 = PermissionSet::new();
        set2.add(Permission::new(ResourceType::Document, Action::Read));
        set2.add(Permission::new(ResourceType::Meeting, Action::Create));

        assert!(set1.contains_any(&set2));

        let mut set3 = PermissionSet::new();
        set3.add(Permission::new(ResourceType::Meeting, Action::Delete));
        assert!(!set1.contains_any(&set3));
    }
}
