//! NoteMan service client.
//!
//! HTTP client for communicating with the NoteMan meeting intelligence service.
//! Provides methods for meeting transcription, summarization, action item extraction,
//! and meeting search.

use super::config::ServiceEndpoint;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, error, instrument, warn};

/// NoteMan client errors.
#[derive(Debug, Error)]
pub enum NoteManError {
    /// HTTP request failed.
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    /// API returned an error response.
    #[error("API error ({status}): {message}")]
    ApiError {
        /// HTTP status code.
        status: u16,
        /// Error message from the API.
        message: String,
    },

    /// Invalid response from the API.
    #[error("Invalid API response: {0}")]
    InvalidResponse(String),

    /// Meeting not found.
    #[error("Meeting not found: {0}")]
    MeetingNotFound(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,
}

/// NoteMan service client.
///
/// Provides methods for interacting with the NoteMan meeting intelligence API.
#[derive(Clone)]
pub struct NoteManClient {
    /// HTTP client instance.
    client: Client,

    /// Service endpoint configuration.
    endpoint: ServiceEndpoint,

    /// Request timeout.
    timeout: Duration,
}

impl NoteManClient {
    /// Create a new NoteMan client.
    pub fn new(endpoint: ServiceEndpoint, timeout: Duration) -> Self {
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            endpoint,
            timeout,
        }
    }

    /// Start transcription for a meeting.
    ///
    /// Initiates audio/video transcription for the specified meeting.
    /// Returns a transcription job ID that can be used to poll for status.
    #[instrument(skip(self), fields(meeting_id = %params.meeting_id))]
    pub async fn transcribe_meeting(
        &self,
        params: TranscribeMeetingParams,
    ) -> Result<TranscribeMeetingResponse, NoteManError> {
        debug!("Starting transcription for meeting {}", params.meeting_id);

        let url = self.endpoint.url("/api/v1/meetings/transcribe");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Generate a meeting summary.
    ///
    /// Creates a summary from the meeting transcript or notes.
    #[instrument(skip(self), fields(meeting_id = %params.meeting_id))]
    pub async fn summarize_meeting(
        &self,
        params: SummarizeMeetingParams,
    ) -> Result<SummarizeMeetingResponse, NoteManError> {
        debug!("Generating summary for meeting {}", params.meeting_id);

        let url = self.endpoint.url("/api/v1/meetings/summarize");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Extract action items from a meeting.
    ///
    /// Identifies and extracts action items with assignees and due dates.
    #[instrument(skip(self), fields(meeting_id = %params.meeting_id))]
    pub async fn extract_action_items(
        &self,
        params: ExtractActionItemsParams,
    ) -> Result<ExtractActionItemsResponse, NoteManError> {
        debug!("Extracting action items from meeting {}", params.meeting_id);

        let url = self.endpoint.url("/api/v1/meetings/action-items");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Search past meetings.
    ///
    /// Searches through meeting transcripts and summaries.
    #[instrument(skip(self), fields(query = %params.query))]
    pub async fn search_meetings(
        &self,
        params: SearchMeetingsParams,
    ) -> Result<SearchMeetingsResponse, NoteManError> {
        debug!("Searching meetings with query: {}", params.query);

        let url = self.endpoint.url("/api/v1/meetings/search");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get meeting details by ID.
    ///
    /// Retrieves full meeting information including transcript and summary.
    #[instrument(skip(self), fields(meeting_id = %meeting_id))]
    pub async fn get_meeting(&self, meeting_id: &str) -> Result<Meeting, NoteManError> {
        debug!("Fetching meeting {}", meeting_id);

        let url = self
            .endpoint
            .url(&format!("/api/v1/meetings/{}", meeting_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(NoteManError::MeetingNotFound(meeting_id.to_string()));
        }

        self.handle_response(response).await
    }

    /// Get meeting content for verification.
    ///
    /// Retrieves meeting content in a format suitable for verification by Verity.
    #[instrument(skip(self), fields(meeting_id = %meeting_id))]
    pub async fn get_meeting_content(
        &self,
        meeting_id: &str,
        content_type: &str,
    ) -> Result<MeetingContent, NoteManError> {
        debug!(
            "Fetching {} content for meeting {}",
            content_type, meeting_id
        );

        let url = self.endpoint.url(&format!(
            "/api/v1/meetings/{}/content?type={}",
            meeting_id, content_type
        ));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get decisions from a meeting.
    ///
    /// Retrieves all decisions recorded in a meeting.
    #[instrument(skip(self), fields(meeting_id = %meeting_id))]
    pub async fn get_meeting_decisions(
        &self,
        meeting_id: &str,
    ) -> Result<Vec<Decision>, NoteManError> {
        debug!("Fetching decisions for meeting {}", meeting_id);

        let url = self
            .endpoint
            .url(&format!("/api/v1/meetings/{}/decisions", meeting_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        let result: DecisionsResponse = self.handle_response(response).await?;
        Ok(result.decisions)
    }

    /// Create a discussion topic in a workspace.
    ///
    /// Creates a new discussion topic for team review.
    #[instrument(skip(self), fields(workspace_id = %params.workspace_id))]
    pub async fn create_discussion(
        &self,
        params: CreateDiscussionParams,
    ) -> Result<CreateDiscussionResponse, NoteManError> {
        debug!("Creating discussion in workspace {}", params.workspace_id);

        let url = self.endpoint.url("/api/v1/discussions");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Handle API response and parse JSON.
    async fn handle_response<T>(&self, response: reqwest::Response) -> Result<T, NoteManError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let status = response.status();

        if status == reqwest::StatusCode::UNAUTHORIZED {
            error!("NoteMan authentication failed");
            return Err(NoteManError::AuthenticationFailed);
        }

        if !status.is_success() {
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            warn!("NoteMan API error ({}): {}", status.as_u16(), message);
            return Err(NoteManError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        response
            .json()
            .await
            .map_err(|e| NoteManError::InvalidResponse(e.to_string()))
    }
}

/// Parameters for transcribing a meeting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscribeMeetingParams {
    /// Meeting ID to transcribe.
    pub meeting_id: String,

    /// Language code (e.g., "en", "es", "fr").
    #[serde(default = "default_language")]
    pub language: String,

    /// Whether to identify different speakers.
    #[serde(default = "default_true")]
    pub speaker_diarization: bool,
}

/// Response from transcribe meeting request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscribeMeetingResponse {
    /// Meeting ID.
    pub meeting_id: String,

    /// Transcription job ID for polling status.
    pub job_id: String,

    /// Current status.
    pub status: String,

    /// Language being used.
    pub language: String,

    /// Whether speaker diarization is enabled.
    pub speaker_diarization: bool,
}

/// Parameters for summarizing a meeting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizeMeetingParams {
    /// Meeting ID to summarize.
    pub meeting_id: String,

    /// Summary format: "bullet_points", "narrative", or "structured".
    #[serde(default = "default_format")]
    pub format: String,

    /// Include decisions made in the meeting.
    #[serde(default = "default_true")]
    pub include_decisions: bool,

    /// Include action items.
    #[serde(default = "default_true")]
    pub include_action_items: bool,
}

/// Response from summarize meeting request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizeMeetingResponse {
    /// Meeting ID.
    pub meeting_id: String,

    /// Current status.
    pub status: String,

    /// Summary format used.
    pub format: String,

    /// The generated summary.
    pub summary: MeetingSummary,
}

/// Meeting summary content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSummary {
    /// Key points from the meeting.
    pub key_points: Vec<String>,

    /// Decisions made.
    pub decisions: Vec<String>,

    /// Action items identified.
    pub action_items: Vec<ActionItem>,

    /// Full summary text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_text: Option<String>,
}

/// Parameters for extracting action items.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractActionItemsParams {
    /// Meeting ID to extract from.
    pub meeting_id: String,

    /// Automatically assign items based on context.
    #[serde(default = "default_true")]
    pub auto_assign: bool,

    /// Create tasks in connected project management tools.
    #[serde(default)]
    pub create_tasks: bool,
}

/// Response from extract action items request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractActionItemsResponse {
    /// Meeting ID.
    pub meeting_id: String,

    /// Current status.
    pub status: String,

    /// Extracted action items.
    pub action_items: Vec<ActionItem>,

    /// Number of tasks created in external systems.
    pub tasks_created: u32,
}

/// An action item from a meeting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    /// Action item ID.
    pub id: String,

    /// Description of the action.
    pub description: String,

    /// Assigned user ID or email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,

    /// Due date (ISO 8601).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,

    /// Priority level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,

    /// Whether the item is completed.
    #[serde(default)]
    pub completed: bool,
}

/// Parameters for searching meetings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMeetingsParams {
    /// Search query.
    pub query: String,

    /// Date range filter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_range: Option<DateRange>,

    /// Filter by participant names/emails.
    #[serde(default)]
    pub participants: Vec<String>,

    /// Maximum results.
    #[serde(default = "default_limit")]
    pub limit: u32,
}

/// Date range for filtering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    /// Start date (ISO 8601).
    pub start: String,

    /// End date (ISO 8601).
    pub end: String,
}

/// Response from search meetings request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMeetingsResponse {
    /// Search query used.
    pub query: String,

    /// Total number of matching results.
    pub total_results: u32,

    /// Matching meetings.
    pub meetings: Vec<MeetingSearchResult>,
}

/// A meeting search result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSearchResult {
    /// Meeting ID.
    pub id: String,

    /// Meeting title.
    pub title: String,

    /// Meeting date.
    pub date: String,

    /// Participants.
    pub participants: Vec<String>,

    /// Relevance score.
    pub score: f64,

    /// Matching excerpt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<String>,
}

/// Full meeting details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    /// Meeting ID.
    pub id: String,

    /// Meeting title.
    pub title: String,

    /// Meeting date.
    pub date: String,

    /// Duration in minutes.
    pub duration_minutes: u32,

    /// Participants.
    pub participants: Vec<String>,

    /// Transcript text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,

    /// Summary.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<MeetingSummary>,

    /// Status.
    pub status: String,
}

/// Meeting content for verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingContent {
    /// Meeting ID.
    pub meeting_id: String,

    /// Content type (transcript, summary, notes).
    pub content_type: String,

    /// The actual content text.
    pub content: String,

    /// Content metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// A decision from a meeting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    /// Decision ID.
    pub id: String,

    /// Decision text.
    pub text: String,

    /// Meeting ID where the decision was made.
    pub meeting_id: String,

    /// Timestamp of the decision.
    pub timestamp: String,

    /// Participants involved.
    pub participants: Vec<String>,

    /// Tags or categories.
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Response containing decisions.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DecisionsResponse {
    decisions: Vec<Decision>,
}

/// Parameters for creating a discussion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDiscussionParams {
    /// Workspace ID.
    pub workspace_id: String,

    /// Discussion title.
    pub title: String,

    /// Discussion content.
    pub content: String,

    /// Priority level.
    #[serde(default = "default_priority")]
    pub priority: String,

    /// Assigned user IDs.
    #[serde(default)]
    pub assign_to: Vec<String>,

    /// Optional meeting ID to add as agenda item.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meeting_id: Option<String>,

    /// Additional metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Response from create discussion request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDiscussionResponse {
    /// Discussion ID.
    pub discussion_id: String,

    /// Current status.
    pub status: String,

    /// Message.
    pub message: String,
}

fn default_language() -> String {
    "en".to_string()
}

fn default_format() -> String {
    "structured".to_string()
}

fn default_true() -> bool {
    true
}

fn default_limit() -> u32 {
    20
}

fn default_priority() -> String {
    "medium".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transcribe_params_defaults() {
        let params = TranscribeMeetingParams {
            meeting_id: "test".to_string(),
            language: default_language(),
            speaker_diarization: default_true(),
        };
        assert_eq!(params.language, "en");
        assert!(params.speaker_diarization);
    }

    #[test]
    fn test_client_creation() {
        let endpoint = ServiceEndpoint {
            base_url: "http://localhost:3001".to_string(),
            api_key: Some("test-key".to_string()),
            webhook_secret: None,
        };
        let client = NoteManClient::new(endpoint, Duration::from_secs(30));
        assert!(client.endpoint.has_auth());
    }
}
