//! # Platform Organization Management
//!
//! This crate provides multi-tenant organization management for the Relay platform,
//! shared across Verity, NoteMan, and ShipCheck applications.
//!
//! ## Overview
//!
//! The platform-org crate handles:
//! - **Organizations**: Top-level tenant entities with settings and billing
//! - **Projects**: Workspaces within organizations for grouping content
//! - **Memberships**: User-organization and user-project relationships
//! - **Roles**: Hierarchical role-based access control
//! - **Tiers**: Subscription tiers with feature limits
//! - **Context**: User context for org/project switching
//!
//! ## Architecture
//!
//! ```text
//! User
//!   ├─ OrganizationMembership ─→ Organization
//!   │                               ├─ Settings
//!   │                               ├─ Tier (limits)
//!   │                               └─ Projects
//!   │                                     └─ ProjectMembership
//!   └─ UserContext (current org/project)
//! ```
//!
//! ## Usage
//!
//! ```rust,no_run
//! use platform_org::{Organization, Project, OrganizationMembership, OrganizationRole};
//! use uuid::Uuid;
//!
//! // Create an organization
//! let owner_id = Uuid::now_v7();
//! let org = Organization::new("Acme Corp", "acme-corp", owner_id);
//!
//! // Create a project within the org
//! let project = Project::new(org.id, "Marketing Docs", "marketing-docs", owner_id);
//!
//! // Add a member
//! let user_id = Uuid::now_v7();
//! let membership = OrganizationMembership::new(org.id, user_id, OrganizationRole::Editor);
//! ```
//!
//! ## Cross-App Integration
//!
//! This crate is designed to work with:
//! - `platform-rbac`: Fine-grained permission management
//! - `platform-auth`: Authentication and session management
//! - `platform-events`: Cross-app event bus
//!
//! ## Feature Flags
//!
//! - `serde`: Serialization support (enabled by default)
//! - `async`: Async service support

pub mod context;
pub mod membership;
pub mod organization;
pub mod project;
pub mod roles;
pub mod settings;
pub mod tiers;

// Re-export main types for convenience
pub use context::{ContextPreferences, UserContext};
pub use membership::{OrganizationMembership, ProjectMembership};
pub use organization::{Organization, OrganizationSummary};
pub use project::{Project, ProjectSummary, ProjectVisibility};
pub use roles::{OrganizationRole, ProjectRole};
pub use settings::{OrganizationSettings, ProjectSettings};
pub use tiers::{SupportLevel, Tier, TierLimits};
