//! # Platform RBAC (Role-Based Access Control)
//!
//! This crate provides comprehensive RBAC for the Relay platform,
//! shared across Verity, NoteMan, and ShipCheck applications.
//!
//! ## Overview
//!
//! The platform-rbac crate handles:
//! - **Resources**: All resource types across all apps
//! - **Actions**: Operations that can be performed on resources
//! - **Permissions**: Resource + Action combinations
//! - **Permission Sets**: Collections of permissions for roles
//!
//! ## Architecture
//!
//! ```text
//! Permission = Resource + Action [+ Resource ID]
//!
//! Examples:
//!   "document:read"              - Read any document
//!   "document:read:doc-123"      - Read specific document
//!   "meeting:manage"             - Full management of meetings
//! ```
//!
//! ## Cross-App Resources
//!
//! Resources are organized by application:
//!
//! **Shared Resources** (all apps):
//! - User, Team, Organization, Project
//! - Integration, ApiKey, AuditLog, Settings
//! - Notification, Webhook
//!
//! **Verity Resources**:
//! - Document, Assertion, Verification
//! - Remediation, Knowledge, Propagation
//!
//! **NoteMan Resources**:
//! - Meeting, Transcript, MeetingTask, MeetingSummary
//! - Workspace, Calendar, Note, Decision
//!
//! **ShipCheck Resources**:
//! - Repository, CodeVerification, CodeFinding
//! - PullRequest, Pipeline, Agent, AnalysisReport
//!
//! ## Usage
//!
//! ```rust,no_run
//! use platform_rbac::{Permission, PermissionSet, ResourceType, Action};
//!
//! // Create a permission
//! let perm = Permission::new(ResourceType::Document, Action::Read);
//! assert_eq!(perm.to_string(), "document:read");
//!
//! // Create a permission set
//! let mut set = PermissionSet::new();
//! set.add(Permission::new(ResourceType::Document, Action::Read));
//! set.add(Permission::new(ResourceType::Document, Action::Create));
//!
//! // Check permissions
//! assert!(set.has(&Permission::new(ResourceType::Document, Action::Read)));
//!
//! // Wildcard matching
//! let specific = Permission::for_resource(ResourceType::Document, Action::Read, "doc-123");
//! assert!(set.has(&specific)); // Global permission matches specific resource
//! ```
//!
//! ## Action Implications
//!
//! Some actions imply others:
//! - `Manage` implies all actions
//! - `Update`, `Delete`, `Create` imply `Read`
//!
//! ## Integration with platform-org
//!
//! This crate works with `platform-org` roles:
//! - Organization roles have default permission sets
//! - Project roles have scoped permission sets
//! - Custom permissions can be added to memberships

pub mod actions;
pub mod permissions;
pub mod resources;

// Re-export main types for convenience
pub use actions::Action;
pub use permissions::{Permission, PermissionSet};
pub use resources::{App, ResourceType};
