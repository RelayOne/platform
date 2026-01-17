//! # Resource Types
//!
//! Defines all resource types across the platform (Verity, NoteMan, ShipCheck).
//! Resources are categorized by the application that owns them.

use serde::{Deserialize, Serialize};

/// Application that owns a resource.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum App {
    /// Shared resources across all apps.
    Shared,
    /// Verity: AI-powered fact verification platform.
    Verity,
    /// NoteMan: Meeting notes and transcription platform.
    NoteMan,
    /// ShipCheck: Code verification and security platform.
    ShipCheck,
}

impl App {
    /// Get the string representation of the app.
    pub fn as_str(&self) -> &'static str {
        match self {
            App::Shared => "shared",
            App::Verity => "verity",
            App::NoteMan => "noteman",
            App::ShipCheck => "shipcheck",
        }
    }

    /// Parse app from string representation.
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "shared" => Some(App::Shared),
            "verity" => Some(App::Verity),
            "noteman" | "note_man" => Some(App::NoteMan),
            "shipcheck" | "ship_check" => Some(App::ShipCheck),
            _ => None,
        }
    }
}

/// Resource types that can have permissions assigned.
///
/// Resources are organized by the application that owns them:
/// - **Shared**: User, Team, Organization, Project, Integration, ApiKey, AuditLog, Settings, Notification, Webhook
/// - **Verity**: Document, Assertion, Verification, Remediation, Knowledge, Propagation
/// - **NoteMan**: Meeting, Transcript, MeetingTask, MeetingSummary, Workspace, Calendar, Note, Decision
/// - **ShipCheck**: Repository, CodeVerification, CodeFinding, PullRequest, Pipeline, Agent, AnalysisReport
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ResourceType {
    // Shared Resources
    /// User resources (shared across all apps).
    User,
    /// Team/group resources (shared across all apps).
    Team,
    /// Organization resources (shared across all apps).
    Organization,
    /// Project resources (shared across all apps).
    Project,
    /// Integration resources (shared across all apps).
    Integration,
    /// API key resources (shared across all apps).
    ApiKey,
    /// Audit log resources (shared across all apps).
    AuditLog,
    /// Settings resources (shared across all apps).
    Settings,
    /// Notification resources (shared across all apps).
    Notification,
    /// Webhook resources (shared across all apps).
    Webhook,

    // Verity Resources
    /// Document resources (Verity).
    Document,
    /// Assertion resources (Verity).
    Assertion,
    /// Verification resources (Verity).
    Verification,
    /// Remediation task resources (Verity).
    Remediation,
    /// Knowledge base resources (Verity).
    Knowledge,
    /// Propagation analysis resources (Verity).
    Propagation,

    // NoteMan Resources
    /// Meeting resources (NoteMan).
    Meeting,
    /// Transcript resources (NoteMan).
    Transcript,
    /// Meeting task resources (NoteMan).
    MeetingTask,
    /// Meeting summary resources (NoteMan).
    MeetingSummary,
    /// Workspace resources (NoteMan).
    Workspace,
    /// Calendar resources (NoteMan).
    Calendar,
    /// Note resources (NoteMan).
    Note,
    /// Decision resources (NoteMan).
    Decision,

    // ShipCheck Resources
    /// Repository resources (ShipCheck).
    Repository,
    /// Code verification resources (ShipCheck).
    CodeVerification,
    /// Code finding resources (ShipCheck).
    CodeFinding,
    /// Pull request resources (ShipCheck).
    PullRequest,
    /// CI/CD pipeline resources (ShipCheck).
    Pipeline,
    /// AI agent resources (ShipCheck).
    Agent,
    /// Analysis report resources (ShipCheck).
    AnalysisReport,
}

impl ResourceType {
    /// Get the string representation of the resource type.
    pub fn as_str(&self) -> &'static str {
        match self {
            // Shared
            ResourceType::User => "user",
            ResourceType::Team => "team",
            ResourceType::Organization => "organization",
            ResourceType::Project => "project",
            ResourceType::Integration => "integration",
            ResourceType::ApiKey => "api_key",
            ResourceType::AuditLog => "audit_log",
            ResourceType::Settings => "settings",
            ResourceType::Notification => "notification",
            ResourceType::Webhook => "webhook",
            // Verity
            ResourceType::Document => "document",
            ResourceType::Assertion => "assertion",
            ResourceType::Verification => "verification",
            ResourceType::Remediation => "remediation",
            ResourceType::Knowledge => "knowledge",
            ResourceType::Propagation => "propagation",
            // NoteMan
            ResourceType::Meeting => "meeting",
            ResourceType::Transcript => "transcript",
            ResourceType::MeetingTask => "meeting_task",
            ResourceType::MeetingSummary => "meeting_summary",
            ResourceType::Workspace => "workspace",
            ResourceType::Calendar => "calendar",
            ResourceType::Note => "note",
            ResourceType::Decision => "decision",
            // ShipCheck
            ResourceType::Repository => "repository",
            ResourceType::CodeVerification => "code_verification",
            ResourceType::CodeFinding => "code_finding",
            ResourceType::PullRequest => "pull_request",
            ResourceType::Pipeline => "pipeline",
            ResourceType::Agent => "agent",
            ResourceType::AnalysisReport => "analysis_report",
        }
    }

    /// Get the application that owns this resource type.
    ///
    /// # Returns
    ///
    /// The `App` that owns this resource type.
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::resources::{ResourceType, App};
    ///
    /// assert_eq!(ResourceType::Document.app(), App::Verity);
    /// assert_eq!(ResourceType::Meeting.app(), App::NoteMan);
    /// assert_eq!(ResourceType::Repository.app(), App::ShipCheck);
    /// assert_eq!(ResourceType::User.app(), App::Shared);
    /// ```
    pub fn app(&self) -> App {
        match self {
            // Shared
            ResourceType::User
            | ResourceType::Team
            | ResourceType::Organization
            | ResourceType::Project
            | ResourceType::Integration
            | ResourceType::ApiKey
            | ResourceType::AuditLog
            | ResourceType::Settings
            | ResourceType::Notification
            | ResourceType::Webhook => App::Shared,
            // Verity
            ResourceType::Document
            | ResourceType::Assertion
            | ResourceType::Verification
            | ResourceType::Remediation
            | ResourceType::Knowledge
            | ResourceType::Propagation => App::Verity,
            // NoteMan
            ResourceType::Meeting
            | ResourceType::Transcript
            | ResourceType::MeetingTask
            | ResourceType::MeetingSummary
            | ResourceType::Workspace
            | ResourceType::Calendar
            | ResourceType::Note
            | ResourceType::Decision => App::NoteMan,
            // ShipCheck
            ResourceType::Repository
            | ResourceType::CodeVerification
            | ResourceType::CodeFinding
            | ResourceType::PullRequest
            | ResourceType::Pipeline
            | ResourceType::Agent
            | ResourceType::AnalysisReport => App::ShipCheck,
        }
    }

    /// Parse resource type from string representation.
    ///
    /// # Arguments
    ///
    /// * `s` - String to parse (case-insensitive, supports plural forms)
    ///
    /// # Returns
    ///
    /// `Some(ResourceType)` if valid, `None` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::resources::ResourceType;
    ///
    /// assert_eq!(ResourceType::parse("document"), Some(ResourceType::Document));
    /// assert_eq!(ResourceType::parse("documents"), Some(ResourceType::Document));
    /// assert_eq!(ResourceType::parse("meeting_task"), Some(ResourceType::MeetingTask));
    /// assert_eq!(ResourceType::parse("invalid"), None);
    /// ```
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            // Shared
            "user" | "users" => Some(ResourceType::User),
            "team" | "teams" => Some(ResourceType::Team),
            "organization" | "organizations" | "org" | "orgs" => Some(ResourceType::Organization),
            "project" | "projects" => Some(ResourceType::Project),
            "integration" | "integrations" => Some(ResourceType::Integration),
            "api_key" | "apikey" | "api_keys" | "apikeys" => Some(ResourceType::ApiKey),
            "audit_log" | "auditlog" | "audit_logs" | "auditlogs" => Some(ResourceType::AuditLog),
            "settings" | "setting" => Some(ResourceType::Settings),
            "notification" | "notifications" => Some(ResourceType::Notification),
            "webhook" | "webhooks" => Some(ResourceType::Webhook),
            // Verity
            "document" | "documents" | "doc" | "docs" => Some(ResourceType::Document),
            "assertion" | "assertions" => Some(ResourceType::Assertion),
            "verification" | "verifications" => Some(ResourceType::Verification),
            "remediation" | "remediations" => Some(ResourceType::Remediation),
            "knowledge" => Some(ResourceType::Knowledge),
            "propagation" | "propagations" => Some(ResourceType::Propagation),
            // NoteMan
            "meeting" | "meetings" => Some(ResourceType::Meeting),
            "transcript" | "transcripts" => Some(ResourceType::Transcript),
            "meeting_task" | "meetingtask" | "meeting_tasks" | "meetingtasks" => {
                Some(ResourceType::MeetingTask)
            }
            "meeting_summary" | "meetingsummary" | "meeting_summaries" | "meetingsummaries" => {
                Some(ResourceType::MeetingSummary)
            }
            "workspace" | "workspaces" => Some(ResourceType::Workspace),
            "calendar" | "calendars" => Some(ResourceType::Calendar),
            "note" | "notes" => Some(ResourceType::Note),
            "decision" | "decisions" => Some(ResourceType::Decision),
            // ShipCheck
            "repository" | "repositories" | "repo" | "repos" => Some(ResourceType::Repository),
            "code_verification" | "codeverification" | "code_verifications" => {
                Some(ResourceType::CodeVerification)
            }
            "code_finding" | "codefinding" | "code_findings" | "codefindings" | "finding"
            | "findings" => Some(ResourceType::CodeFinding),
            "pull_request" | "pullrequest" | "pull_requests" | "pullrequests" | "pr" | "prs" => {
                Some(ResourceType::PullRequest)
            }
            "pipeline" | "pipelines" => Some(ResourceType::Pipeline),
            "agent" | "agents" => Some(ResourceType::Agent),
            "analysis_report" | "analysisreport" | "analysis_reports" | "analysisreports"
            | "report" | "reports" => Some(ResourceType::AnalysisReport),
            _ => None,
        }
    }

    /// Get all resource types.
    ///
    /// # Returns
    ///
    /// A vector of all available resource types.
    pub fn all() -> Vec<Self> {
        vec![
            // Shared
            ResourceType::User,
            ResourceType::Team,
            ResourceType::Organization,
            ResourceType::Project,
            ResourceType::Integration,
            ResourceType::ApiKey,
            ResourceType::AuditLog,
            ResourceType::Settings,
            ResourceType::Notification,
            ResourceType::Webhook,
            // Verity
            ResourceType::Document,
            ResourceType::Assertion,
            ResourceType::Verification,
            ResourceType::Remediation,
            ResourceType::Knowledge,
            ResourceType::Propagation,
            // NoteMan
            ResourceType::Meeting,
            ResourceType::Transcript,
            ResourceType::MeetingTask,
            ResourceType::MeetingSummary,
            ResourceType::Workspace,
            ResourceType::Calendar,
            ResourceType::Note,
            ResourceType::Decision,
            // ShipCheck
            ResourceType::Repository,
            ResourceType::CodeVerification,
            ResourceType::CodeFinding,
            ResourceType::PullRequest,
            ResourceType::Pipeline,
            ResourceType::Agent,
            ResourceType::AnalysisReport,
        ]
    }

    /// Get all resource types for a specific app.
    ///
    /// # Arguments
    ///
    /// * `app` - The app to filter by
    ///
    /// # Returns
    ///
    /// A vector of resource types belonging to the specified app.
    ///
    /// # Example
    ///
    /// ```
    /// use platform_rbac::resources::{ResourceType, App};
    ///
    /// let verity_resources = ResourceType::for_app(App::Verity);
    /// assert!(verity_resources.contains(&ResourceType::Document));
    /// assert!(verity_resources.contains(&ResourceType::Assertion));
    /// ```
    pub fn for_app(app: App) -> Vec<Self> {
        Self::all()
            .into_iter()
            .filter(|r| r.app() == app)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_type_app_mapping() {
        assert_eq!(ResourceType::Document.app(), App::Verity);
        assert_eq!(ResourceType::Meeting.app(), App::NoteMan);
        assert_eq!(ResourceType::Repository.app(), App::ShipCheck);
        assert_eq!(ResourceType::User.app(), App::Shared);
        assert_eq!(ResourceType::Team.app(), App::Shared);
        assert_eq!(ResourceType::Organization.app(), App::Shared);
    }

    #[test]
    fn test_for_app() {
        let verity_resources = ResourceType::for_app(App::Verity);
        assert_eq!(verity_resources.len(), 6);
        assert!(verity_resources.contains(&ResourceType::Document));
        assert!(verity_resources.contains(&ResourceType::Assertion));
        assert!(verity_resources.contains(&ResourceType::Verification));
        assert!(verity_resources.contains(&ResourceType::Remediation));
        assert!(verity_resources.contains(&ResourceType::Knowledge));
        assert!(verity_resources.contains(&ResourceType::Propagation));

        let noteman_resources = ResourceType::for_app(App::NoteMan);
        assert_eq!(noteman_resources.len(), 8);
        assert!(noteman_resources.contains(&ResourceType::Meeting));
        assert!(noteman_resources.contains(&ResourceType::Transcript));

        let shipcheck_resources = ResourceType::for_app(App::ShipCheck);
        assert_eq!(shipcheck_resources.len(), 7);
        assert!(shipcheck_resources.contains(&ResourceType::Repository));
        assert!(shipcheck_resources.contains(&ResourceType::CodeVerification));

        let shared_resources = ResourceType::for_app(App::Shared);
        assert_eq!(shared_resources.len(), 10);
        assert!(shared_resources.contains(&ResourceType::User));
        assert!(shared_resources.contains(&ResourceType::Organization));
    }

    #[test]
    fn test_resource_type_parsing() {
        // Shared
        assert_eq!(ResourceType::parse("user"), Some(ResourceType::User));
        assert_eq!(ResourceType::parse("users"), Some(ResourceType::User));
        assert_eq!(
            ResourceType::parse("organization"),
            Some(ResourceType::Organization)
        );
        assert_eq!(ResourceType::parse("org"), Some(ResourceType::Organization));
        assert_eq!(
            ResourceType::parse("api_key"),
            Some(ResourceType::ApiKey)
        );
        assert_eq!(
            ResourceType::parse("webhook"),
            Some(ResourceType::Webhook)
        );

        // Verity
        assert_eq!(
            ResourceType::parse("document"),
            Some(ResourceType::Document)
        );
        assert_eq!(
            ResourceType::parse("documents"),
            Some(ResourceType::Document)
        );
        assert_eq!(ResourceType::parse("doc"), Some(ResourceType::Document));
        assert_eq!(
            ResourceType::parse("assertion"),
            Some(ResourceType::Assertion)
        );
        assert_eq!(
            ResourceType::parse("verification"),
            Some(ResourceType::Verification)
        );

        // NoteMan
        assert_eq!(
            ResourceType::parse("meeting"),
            Some(ResourceType::Meeting)
        );
        assert_eq!(
            ResourceType::parse("transcript"),
            Some(ResourceType::Transcript)
        );
        assert_eq!(
            ResourceType::parse("meeting_task"),
            Some(ResourceType::MeetingTask)
        );
        assert_eq!(
            ResourceType::parse("workspace"),
            Some(ResourceType::Workspace)
        );
        assert_eq!(
            ResourceType::parse("decision"),
            Some(ResourceType::Decision)
        );

        // ShipCheck
        assert_eq!(
            ResourceType::parse("repository"),
            Some(ResourceType::Repository)
        );
        assert_eq!(
            ResourceType::parse("repo"),
            Some(ResourceType::Repository)
        );
        assert_eq!(
            ResourceType::parse("code_verification"),
            Some(ResourceType::CodeVerification)
        );
        assert_eq!(
            ResourceType::parse("pull_request"),
            Some(ResourceType::PullRequest)
        );
        assert_eq!(ResourceType::parse("pr"), Some(ResourceType::PullRequest));
        assert_eq!(
            ResourceType::parse("pipeline"),
            Some(ResourceType::Pipeline)
        );

        // Invalid
        assert_eq!(ResourceType::parse("invalid"), None);
    }

    #[test]
    fn test_app_parsing() {
        assert_eq!(App::parse("shared"), Some(App::Shared));
        assert_eq!(App::parse("verity"), Some(App::Verity));
        assert_eq!(App::parse("noteman"), Some(App::NoteMan));
        assert_eq!(App::parse("note_man"), Some(App::NoteMan));
        assert_eq!(App::parse("shipcheck"), Some(App::ShipCheck));
        assert_eq!(App::parse("ship_check"), Some(App::ShipCheck));
        assert_eq!(App::parse("invalid"), None);
    }

    #[test]
    fn test_all_resources_count() {
        let all = ResourceType::all();
        assert_eq!(all.len(), 31); // 10 shared + 6 verity + 8 noteman + 7 shipcheck
    }
}
