//! Event types for cross-app communication
//!
//! This module defines all event types that can be published and subscribed to
//! across the Relay platform applications.

use chrono::{DateTime, Utc};
use platform_rbac::App;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Cross-app event envelope.
///
/// All events are wrapped in this envelope which provides metadata
/// for routing, tracing, and processing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// Unique event ID
    pub id: Uuid,

    /// Event type (e.g., "document.verified", "meeting.completed")
    pub event_type: String,

    /// Source application
    pub source: App,

    /// Timestamp when event was created
    pub timestamp: DateTime<Utc>,

    /// Organization context
    pub org_id: Option<Uuid>,

    /// Project context
    pub project_id: Option<Uuid>,

    /// User who triggered the event
    pub user_id: Option<Uuid>,

    /// Correlation ID for tracing
    pub correlation_id: Option<String>,

    /// Event version for schema evolution
    pub version: u32,

    /// Event payload
    pub payload: serde_json::Value,

    /// Additional metadata
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Event {
    /// Create a new event.
    ///
    /// # Arguments
    ///
    /// * `event_type` - The event type string
    /// * `source` - The source application
    /// * `payload` - The event payload
    pub fn new(event_type: impl Into<String>, source: App, payload: serde_json::Value) -> Self {
        Self {
            id: Uuid::now_v7(),
            event_type: event_type.into(),
            source,
            timestamp: Utc::now(),
            org_id: None,
            project_id: None,
            user_id: None,
            correlation_id: None,
            version: 1,
            payload,
            metadata: HashMap::new(),
        }
    }

    /// Set organization context.
    pub fn with_org(mut self, org_id: Uuid) -> Self {
        self.org_id = Some(org_id);
        self
    }

    /// Set project context.
    pub fn with_project(mut self, project_id: Uuid) -> Self {
        self.project_id = Some(project_id);
        self
    }

    /// Set user context.
    pub fn with_user(mut self, user_id: Uuid) -> Self {
        self.user_id = Some(user_id);
        self
    }

    /// Set correlation ID.
    pub fn with_correlation_id(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }

    /// Add metadata.
    pub fn with_metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    /// Get the topic for this event.
    ///
    /// Topics are structured as: `{source}.{event_type}`
    pub fn topic(&self) -> String {
        format!("{}.{}", self.source.as_str(), self.event_type)
    }

    /// Parse the payload into a specific type.
    pub fn parse_payload<T: for<'de> Deserialize<'de>>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_value(self.payload.clone())
    }
}

/// Event categories for filtering.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EventCategory {
    /// Document-related events
    Document,
    /// Verification events
    Verification,
    /// Meeting events
    Meeting,
    /// Repository events
    Repository,
    /// User events
    User,
    /// Organization events
    Organization,
    /// Billing events
    Billing,
    /// Security events
    Security,
    /// Integration events
    Integration,
    /// System events
    System,
}

impl EventCategory {
    /// Parse from event type string.
    pub fn from_event_type(event_type: &str) -> Option<Self> {
        let prefix = event_type.split('.').next()?;
        match prefix {
            "document" | "assertion" | "knowledge" => Some(EventCategory::Document),
            "verification" | "remediation" => Some(EventCategory::Verification),
            "meeting" | "transcript" | "summary" => Some(EventCategory::Meeting),
            "repository" | "code" | "pr" | "pipeline" => Some(EventCategory::Repository),
            "user" | "profile" | "session" => Some(EventCategory::User),
            "org" | "organization" | "project" | "team" => Some(EventCategory::Organization),
            "billing" | "subscription" | "invoice" => Some(EventCategory::Billing),
            "security" | "audit" | "mfa" => Some(EventCategory::Security),
            "integration" | "webhook" | "api" => Some(EventCategory::Integration),
            "system" | "health" | "maintenance" => Some(EventCategory::System),
            _ => None,
        }
    }
}

// ============================================================================
// Verity Events
// ============================================================================

/// Document-related events from Verity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocumentEvent {
    /// Document was created
    Created {
        document_id: Uuid,
        title: String,
        source_type: String,
    },
    /// Document was updated
    Updated {
        document_id: Uuid,
        changes: Vec<String>,
    },
    /// Document was deleted
    Deleted { document_id: Uuid },
    /// Document was verified
    Verified {
        document_id: Uuid,
        score: f64,
        assertion_count: u32,
    },
    /// Document verification failed
    VerificationFailed { document_id: Uuid, error: String },
}

impl DocumentEvent {
    /// Convert to generic event.
    pub fn to_event(&self) -> Event {
        let event_type = match self {
            DocumentEvent::Created { .. } => "document.created",
            DocumentEvent::Updated { .. } => "document.updated",
            DocumentEvent::Deleted { .. } => "document.deleted",
            DocumentEvent::Verified { .. } => "document.verified",
            DocumentEvent::VerificationFailed { .. } => "document.verification_failed",
        };
        Event::new(event_type, App::Verity, serde_json::to_value(self).unwrap())
    }
}

/// Assertion events from Verity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AssertionEvent {
    /// Assertion was extracted
    Extracted {
        assertion_id: Uuid,
        document_id: Uuid,
        text: String,
    },
    /// Assertion was verified
    Verified {
        assertion_id: Uuid,
        verdict: String,
        confidence: f64,
    },
    /// Assertion needs remediation
    NeedsRemediation { assertion_id: Uuid, reason: String },
    /// Assertion was remediated
    Remediated {
        assertion_id: Uuid,
        old_text: String,
        new_text: String,
    },
}

// ============================================================================
// NoteMan Events
// ============================================================================

/// Meeting events from NoteMan.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MeetingEvent {
    /// Meeting was scheduled
    Scheduled {
        meeting_id: Uuid,
        title: String,
        scheduled_at: DateTime<Utc>,
    },
    /// Meeting started
    Started {
        meeting_id: Uuid,
        participants: Vec<String>,
    },
    /// Meeting ended
    Ended {
        meeting_id: Uuid,
        duration_seconds: u64,
    },
    /// Transcript completed
    TranscriptCompleted {
        meeting_id: Uuid,
        transcript_id: Uuid,
        word_count: u32,
    },
    /// Summary generated
    SummaryGenerated {
        meeting_id: Uuid,
        summary_id: Uuid,
        key_points: Vec<String>,
    },
    /// Action items extracted
    ActionItemsExtracted {
        meeting_id: Uuid,
        items: Vec<ActionItem>,
    },
    /// Decision recorded
    DecisionRecorded {
        meeting_id: Uuid,
        decision_id: Uuid,
        decision: String,
    },
}

/// Action item from a meeting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    /// Action item ID
    pub id: Uuid,
    /// Description
    pub description: String,
    /// Assigned to
    pub assignee: Option<String>,
    /// Due date
    pub due_date: Option<DateTime<Utc>>,
}

impl MeetingEvent {
    /// Convert to generic event.
    pub fn to_event(&self) -> Event {
        let event_type = match self {
            MeetingEvent::Scheduled { .. } => "meeting.scheduled",
            MeetingEvent::Started { .. } => "meeting.started",
            MeetingEvent::Ended { .. } => "meeting.ended",
            MeetingEvent::TranscriptCompleted { .. } => "meeting.transcript_completed",
            MeetingEvent::SummaryGenerated { .. } => "meeting.summary_generated",
            MeetingEvent::ActionItemsExtracted { .. } => "meeting.action_items_extracted",
            MeetingEvent::DecisionRecorded { .. } => "meeting.decision_recorded",
        };
        Event::new(
            event_type,
            App::NoteMan,
            serde_json::to_value(self).unwrap(),
        )
    }
}

// ============================================================================
// ShipCheck Events
// ============================================================================

/// Repository events from ShipCheck.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RepositoryEvent {
    /// Repository was connected
    Connected {
        repository_id: Uuid,
        provider: String,
        full_name: String,
    },
    /// Repository was disconnected
    Disconnected { repository_id: Uuid },
    /// Analysis started
    AnalysisStarted {
        repository_id: Uuid,
        analysis_id: Uuid,
        commit_sha: String,
    },
    /// Analysis completed
    AnalysisCompleted {
        repository_id: Uuid,
        analysis_id: Uuid,
        findings_count: u32,
        critical_count: u32,
    },
    /// Finding created
    FindingCreated {
        repository_id: Uuid,
        finding_id: Uuid,
        severity: String,
        file_path: String,
    },
    /// Finding resolved
    FindingResolved {
        repository_id: Uuid,
        finding_id: Uuid,
    },
    /// PR review completed
    PrReviewCompleted {
        repository_id: Uuid,
        pr_number: u32,
        approved: bool,
    },
}

impl RepositoryEvent {
    /// Convert to generic event.
    pub fn to_event(&self) -> Event {
        let event_type = match self {
            RepositoryEvent::Connected { .. } => "repository.connected",
            RepositoryEvent::Disconnected { .. } => "repository.disconnected",
            RepositoryEvent::AnalysisStarted { .. } => "repository.analysis_started",
            RepositoryEvent::AnalysisCompleted { .. } => "repository.analysis_completed",
            RepositoryEvent::FindingCreated { .. } => "repository.finding_created",
            RepositoryEvent::FindingResolved { .. } => "repository.finding_resolved",
            RepositoryEvent::PrReviewCompleted { .. } => "repository.pr_review_completed",
        };
        Event::new(
            event_type,
            App::ShipCheck,
            serde_json::to_value(self).unwrap(),
        )
    }
}

// ============================================================================
// Cross-App Events
// ============================================================================

/// Cross-app workflow events.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CrossAppEvent {
    /// Meeting notes need verification (NoteMan → Verity)
    MeetingNotesForVerification {
        meeting_id: Uuid,
        document_id: Uuid,
        content_hash: String,
    },
    /// Verification complete for meeting notes (Verity → NoteMan)
    MeetingNotesVerified {
        meeting_id: Uuid,
        document_id: Uuid,
        score: f64,
        issues: Vec<String>,
    },
    /// Code decisions need tracking (Meeting → ShipCheck)
    CodeDecisionTracked {
        meeting_id: Uuid,
        decision_id: Uuid,
        repository_id: Option<Uuid>,
        description: String,
    },
    /// Code finding needs discussion (ShipCheck → NoteMan)
    CodeFindingForDiscussion {
        finding_id: Uuid,
        repository_id: Uuid,
        meeting_id: Option<Uuid>,
        description: String,
    },
    /// Documentation verification request (ShipCheck → Verity)
    DocumentationVerificationRequest {
        repository_id: Uuid,
        document_id: Uuid,
        file_path: String,
    },
}

impl CrossAppEvent {
    /// Convert to generic event.
    pub fn to_event(&self) -> Event {
        let (event_type, source) = match self {
            CrossAppEvent::MeetingNotesForVerification { .. } => {
                ("cross_app.meeting_notes_for_verification", App::NoteMan)
            }
            CrossAppEvent::MeetingNotesVerified { .. } => {
                ("cross_app.meeting_notes_verified", App::Verity)
            }
            CrossAppEvent::CodeDecisionTracked { .. } => {
                ("cross_app.code_decision_tracked", App::NoteMan)
            }
            CrossAppEvent::CodeFindingForDiscussion { .. } => {
                ("cross_app.code_finding_for_discussion", App::ShipCheck)
            }
            CrossAppEvent::DocumentationVerificationRequest { .. } => (
                "cross_app.documentation_verification_request",
                App::ShipCheck,
            ),
        };
        Event::new(event_type, source, serde_json::to_value(self).unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_creation() {
        let payload = serde_json::json!({"key": "value"});
        let event = Event::new("test.event", App::Verity, payload)
            .with_org(Uuid::now_v7())
            .with_user(Uuid::now_v7());

        assert_eq!(event.event_type, "test.event");
        assert_eq!(event.source, App::Verity);
        assert!(event.org_id.is_some());
        assert!(event.user_id.is_some());
    }

    #[test]
    fn test_event_topic() {
        let event = Event::new("document.created", App::Verity, serde_json::json!({}));
        assert_eq!(event.topic(), "verity.document.created");
    }

    #[test]
    fn test_document_event() {
        let doc_event = DocumentEvent::Created {
            document_id: Uuid::now_v7(),
            title: "Test Doc".to_string(),
            source_type: "upload".to_string(),
        };
        let event = doc_event.to_event();
        assert_eq!(event.event_type, "document.created");
        assert_eq!(event.source, App::Verity);
    }

    #[test]
    fn test_meeting_event() {
        let meeting_event = MeetingEvent::Started {
            meeting_id: Uuid::now_v7(),
            participants: vec!["Alice".to_string(), "Bob".to_string()],
        };
        let event = meeting_event.to_event();
        assert_eq!(event.event_type, "meeting.started");
        assert_eq!(event.source, App::NoteMan);
    }

    #[test]
    fn test_cross_app_event() {
        let cross_event = CrossAppEvent::MeetingNotesForVerification {
            meeting_id: Uuid::now_v7(),
            document_id: Uuid::now_v7(),
            content_hash: "abc123".to_string(),
        };
        let event = cross_event.to_event();
        assert!(event.event_type.starts_with("cross_app."));
    }

    #[test]
    fn test_event_category() {
        assert_eq!(
            EventCategory::from_event_type("document.created"),
            Some(EventCategory::Document)
        );
        assert_eq!(
            EventCategory::from_event_type("meeting.started"),
            Some(EventCategory::Meeting)
        );
        assert_eq!(
            EventCategory::from_event_type("repository.connected"),
            Some(EventCategory::Repository)
        );
    }
}
