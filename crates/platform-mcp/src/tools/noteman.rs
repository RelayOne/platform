//! NoteMan MCP tools
//!
//! Tools for meeting transcription, summarization, and action item extraction.
//! These tools communicate with the NoteMan service via HTTP to perform
//! meeting intelligence operations.

use crate::clients::config::ServiceConfig;
use crate::clients::noteman::{
    DateRange, ExtractActionItemsParams as ClientExtractParams, NoteManClient,
    SearchMeetingsParams as ClientSearchParams, SummarizeMeetingParams as ClientSummarizeParams,
    TranscribeMeetingParams as ClientTranscribeParams,
};
use crate::server::{McpServerError, McpServerResult, Tool, ToolContext};
use crate::types::{ToolDefinition, ToolResult};
use async_trait::async_trait;
use platform_rbac::App;
use serde::Deserialize;
use std::sync::{Arc, OnceLock};
use tracing::{debug, error, instrument};

/// Lazily initialized NoteMan client singleton.
static NOTEMAN_CLIENT: OnceLock<NoteManClient> = OnceLock::new();

/// Get or initialize the NoteMan client.
fn get_client() -> &'static NoteManClient {
    NOTEMAN_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        NoteManClient::new(config.noteman, timeout)
    })
}

/// Tool to transcribe a meeting.
///
/// Generates a transcript from meeting audio/video by calling the NoteMan
/// transcription service. Supports speaker diarization and multiple languages.
pub struct TranscribeMeetingTool;

#[async_trait]
impl Tool for TranscribeMeetingTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "noteman_transcribe_meeting",
            "Transcribe a meeting from audio/video",
        )
        .with_app(App::NoteMan)
        .with_category("transcription")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "meeting_id": {
                    "type": "string",
                    "description": "The meeting ID to transcribe"
                },
                "language": {
                    "type": "string",
                    "description": "Language code (e.g., 'en', 'es', 'fr')",
                    "default": "en"
                },
                "speaker_diarization": {
                    "type": "boolean",
                    "description": "Whether to identify different speakers",
                    "default": true
                }
            },
            "required": ["meeting_id"]
        }))
        .with_permissions(vec![
            "meeting:read".to_string(),
            "transcript:create".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "transcribe_meeting"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: TranscribeMeetingParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Transcribing meeting: {}", params.meeting_id);

        let client = get_client();

        let client_params = ClientTranscribeParams {
            meeting_id: params.meeting_id.clone(),
            language: params.language.clone(),
            speaker_diarization: params.speaker_diarization,
        };

        match client.transcribe_meeting(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "meeting_id": response.meeting_id,
                "job_id": response.job_id,
                "status": response.status,
                "language": response.language,
                "speaker_diarization": response.speaker_diarization,
                "message": "Transcription job started successfully"
            }))),
            Err(e) => {
                error!("Failed to transcribe meeting: {}", e);
                Ok(ToolResult::error(format!(
                    "Failed to transcribe meeting: {}",
                    e
                )))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct TranscribeMeetingParams {
    meeting_id: String,
    #[serde(default = "default_language")]
    language: String,
    #[serde(default = "default_true")]
    speaker_diarization: bool,
}

fn default_language() -> String {
    "en".to_string()
}

fn default_true() -> bool {
    true
}

/// Tool to summarize a meeting.
///
/// Generates a summary from meeting transcript or notes by calling the
/// NoteMan summarization service. Supports multiple output formats.
pub struct SummarizeMeetingTool;

#[async_trait]
impl Tool for SummarizeMeetingTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "noteman_summarize_meeting",
            "Generate a summary of a meeting",
        )
        .with_app(App::NoteMan)
        .with_category("summarization")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "meeting_id": {
                    "type": "string",
                    "description": "The meeting ID to summarize"
                },
                "format": {
                    "type": "string",
                    "enum": ["bullet_points", "narrative", "structured"],
                    "description": "Summary format",
                    "default": "structured"
                },
                "include_decisions": {
                    "type": "boolean",
                    "description": "Include decisions made in the meeting",
                    "default": true
                },
                "include_action_items": {
                    "type": "boolean",
                    "description": "Include action items",
                    "default": true
                }
            },
            "required": ["meeting_id"]
        }))
        .with_permissions(vec![
            "meeting:read".to_string(),
            "meeting_summary:create".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "summarize_meeting"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: SummarizeMeetingParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Summarizing meeting: {}", params.meeting_id);

        let client = get_client();

        let client_params = ClientSummarizeParams {
            meeting_id: params.meeting_id.clone(),
            format: params.format.clone(),
            include_decisions: params.include_decisions,
            include_action_items: params.include_action_items,
        };

        match client.summarize_meeting(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "meeting_id": response.meeting_id,
                "status": response.status,
                "format": response.format,
                "summary": {
                    "key_points": response.summary.key_points,
                    "decisions": response.summary.decisions,
                    "action_items": response.summary.action_items,
                    "full_text": response.summary.full_text
                }
            }))),
            Err(e) => {
                error!("Failed to summarize meeting: {}", e);
                Ok(ToolResult::error(format!(
                    "Failed to summarize meeting: {}",
                    e
                )))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct SummarizeMeetingParams {
    meeting_id: String,
    #[serde(default = "default_format")]
    format: String,
    #[serde(default = "default_true")]
    include_decisions: bool,
    #[serde(default = "default_true")]
    include_action_items: bool,
}

fn default_format() -> String {
    "structured".to_string()
}

/// Tool to extract action items from a meeting.
///
/// Identifies and extracts action items with assignees and due dates
/// by calling the NoteMan extraction service.
pub struct ExtractActionItemsTool;

#[async_trait]
impl Tool for ExtractActionItemsTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "noteman_extract_action_items",
            "Extract action items from a meeting",
        )
        .with_app(App::NoteMan)
        .with_category("extraction")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "meeting_id": {
                    "type": "string",
                    "description": "The meeting ID to extract from"
                },
                "auto_assign": {
                    "type": "boolean",
                    "description": "Automatically assign items based on context",
                    "default": true
                },
                "create_tasks": {
                    "type": "boolean",
                    "description": "Create tasks in connected project management tools",
                    "default": false
                }
            },
            "required": ["meeting_id"]
        }))
        .with_permissions(vec![
            "meeting:read".to_string(),
            "meeting_task:create".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "extract_action_items"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: ExtractActionItemsParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!(
            "Extracting action items from meeting: {}",
            params.meeting_id
        );

        let client = get_client();

        let client_params = ClientExtractParams {
            meeting_id: params.meeting_id.clone(),
            auto_assign: params.auto_assign,
            create_tasks: params.create_tasks,
        };

        match client.extract_action_items(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "meeting_id": response.meeting_id,
                "status": response.status,
                "action_items": response.action_items,
                "tasks_created": response.tasks_created
            }))),
            Err(e) => {
                error!("Failed to extract action items: {}", e);
                Ok(ToolResult::error(format!(
                    "Failed to extract action items: {}",
                    e
                )))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct ExtractActionItemsParams {
    meeting_id: String,
    #[serde(default = "default_true")]
    auto_assign: bool,
    #[serde(default)]
    create_tasks: bool,
}

/// Tool to search past meetings.
///
/// Searches through meeting transcripts and summaries using the
/// NoteMan search service.
pub struct SearchMeetingsTool;

#[async_trait]
impl Tool for SearchMeetingsTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("noteman_search_meetings", "Search through past meetings")
            .with_app(App::NoteMan)
            .with_category("search")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "date_range": {
                        "type": "object",
                        "properties": {
                            "start": {"type": "string", "format": "date"},
                            "end": {"type": "string", "format": "date"}
                        }
                    },
                    "participants": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by participant names/emails"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results",
                        "default": 20
                    }
                },
                "required": ["query"]
            }))
            .with_permissions(vec!["meeting:read".to_string()])
    }

    #[instrument(skip(self, context), fields(tool = "search_meetings"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: SearchMeetingsParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Searching meetings with query: {}", params.query);

        let client = get_client();

        // Convert date range if provided
        let date_range = params
            .date_range
            .and_then(|dr| match (dr.get("start"), dr.get("end")) {
                (Some(start), Some(end)) => Some(DateRange {
                    start: start.as_str().unwrap_or_default().to_string(),
                    end: end.as_str().unwrap_or_default().to_string(),
                }),
                _ => None,
            });

        let client_params = ClientSearchParams {
            query: params.query.clone(),
            date_range,
            participants: params.participants.clone(),
            limit: params.limit,
        };

        match client.search_meetings(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "query": response.query,
                "total_results": response.total_results,
                "meetings": response.meetings
            }))),
            Err(e) => {
                error!("Failed to search meetings: {}", e);
                Ok(ToolResult::error(format!(
                    "Failed to search meetings: {}",
                    e
                )))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct SearchMeetingsParams {
    query: String,
    date_range: Option<serde_json::Value>,
    #[serde(default)]
    participants: Vec<String>,
    #[serde(default = "default_limit")]
    limit: u32,
}

fn default_limit() -> u32 {
    20
}

/// Get all NoteMan tools.
///
/// Returns a vector of all NoteMan MCP tools that can be registered
/// with an MCP server.
pub fn noteman_tools() -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(TranscribeMeetingTool),
        Arc::new(SummarizeMeetingTool),
        Arc::new(ExtractActionItemsTool),
        Arc::new(SearchMeetingsTool),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transcribe_meeting_tool_definition() {
        let tool = TranscribeMeetingTool;
        let def = tool.definition();
        assert_eq!(def.name, "noteman_transcribe_meeting");
        assert_eq!(def.source_app, Some(App::NoteMan));
    }

    #[test]
    fn test_all_noteman_tools() {
        let tools = noteman_tools();
        assert_eq!(tools.len(), 4);
    }

    #[test]
    fn test_tool_categories() {
        let tools = noteman_tools();
        let categories: Vec<_> = tools
            .iter()
            .map(|t| t.definition().category.clone())
            .collect();

        assert!(categories.contains(&Some("transcription".to_string())));
        assert!(categories.contains(&Some("summarization".to_string())));
        assert!(categories.contains(&Some("extraction".to_string())));
        assert!(categories.contains(&Some("search".to_string())));
    }
}
