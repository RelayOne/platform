//! Cross-app workflow MCP tools
//!
//! Tools that orchestrate workflows spanning multiple applications:
//! - NoteMan ↔ Verity: Meeting notes verification
//! - NoteMan ↔ ShipCheck: Code decision tracking
//! - Verity ↔ ShipCheck: Documentation verification
//!
//! These tools coordinate HTTP calls between services to enable seamless
//! cross-app integrations.

use crate::clients::config::ServiceConfig;
use crate::clients::noteman::{
    NoteManClient, CreateDiscussionParams as ClientDiscussionParams,
};
use crate::clients::shipcheck::{
    ShipCheckClient, LinkDecisionParams as ClientLinkParams,
    SyncTasksParams as ClientSyncParams, ActionItemSync,
};
use crate::clients::verity::{
    VerityClient, CreateDocumentParams as ClientCreateDocParams,
    VerifyContentParams as ClientVerifyContentParams,
};
use crate::server::{McpServerError, McpServerResult, Tool, ToolContext};
use crate::types::{ToolDefinition, ToolResult};
use async_trait::async_trait;
use platform_rbac::App;
use serde::Deserialize;
use std::sync::{Arc, OnceLock};
use tracing::{debug, error, info, instrument};

/// Lazily initialized service clients.
static NOTEMAN_CLIENT: OnceLock<NoteManClient> = OnceLock::new();
static SHIPCHECK_CLIENT: OnceLock<ShipCheckClient> = OnceLock::new();
static VERITY_CLIENT: OnceLock<VerityClient> = OnceLock::new();

/// Get or initialize the NoteMan client.
fn get_noteman_client() -> &'static NoteManClient {
    NOTEMAN_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        NoteManClient::new(config.noteman, timeout)
    })
}

/// Get or initialize the ShipCheck client.
fn get_shipcheck_client() -> &'static ShipCheckClient {
    SHIPCHECK_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        ShipCheckClient::new(config.shipcheck, timeout)
    })
}

/// Get or initialize the Verity client.
fn get_verity_client() -> &'static VerityClient {
    VERITY_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        VerityClient::new(config.verity, timeout)
    })
}

/// Tool to verify meeting notes with Verity.
///
/// Sends meeting notes or transcripts to Verity for fact verification.
/// This enables automated verification of claims made during meetings.
///
/// Workflow:
/// 1. Fetch meeting content from NoteMan
/// 2. Create a document in Verity
/// 3. Trigger verification
/// 4. Return verification ID for tracking
pub struct VerifyMeetingNotesTool;

#[async_trait]
impl Tool for VerifyMeetingNotesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "workflow_verify_meeting_notes",
            "Verify factual claims in meeting notes using Verity"
        )
            .with_app(App::Shared)
            .with_category("workflow")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "meeting_id": {
                        "type": "string",
                        "description": "NoteMan meeting ID"
                    },
                    "content_type": {
                        "type": "string",
                        "enum": ["transcript", "summary", "notes"],
                        "description": "Type of content to verify",
                        "default": "summary"
                    },
                    "verification_level": {
                        "type": "string",
                        "enum": ["quick", "standard", "thorough"],
                        "description": "Depth of verification",
                        "default": "standard"
                    },
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Categories to focus on (e.g., 'statistics', 'dates', 'technical_claims')"
                    },
                    "notify_attendees": {
                        "type": "boolean",
                        "description": "Notify meeting attendees of verification results",
                        "default": false
                    }
                },
                "required": ["meeting_id"]
            }))
            .with_permissions(vec![
                "meeting:read".to_string(),
                "document:create".to_string(),
                "verification:execute".to_string(),
            ])
    }

    #[instrument(skip(self, context), fields(tool = "verify_meeting_notes"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: VerifyMeetingNotesParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        info!("Starting meeting notes verification workflow for meeting: {}", params.meeting_id);

        let noteman = get_noteman_client();
        let verity = get_verity_client();

        // Step 1: Fetch meeting content from NoteMan
        debug!("Fetching {} content from NoteMan for meeting {}", params.content_type, params.meeting_id);
        let meeting_content = match noteman.get_meeting_content(&params.meeting_id, &params.content_type).await {
            Ok(content) => content,
            Err(e) => {
                error!("Failed to fetch meeting content: {}", e);
                return Ok(ToolResult::error(format!("Failed to fetch meeting content: {}", e)));
            }
        };

        // Step 2: Create document in Verity and start verification
        debug!("Creating document in Verity and starting verification");
        let create_params = ClientCreateDocParams {
            title: format!("Meeting {} - {}", params.meeting_id, params.content_type),
            content: meeting_content.content.clone(),
            source_app: Some("noteman".to_string()),
            external_id: Some(params.meeting_id.clone()),
            auto_verify: true,
            verification_level: Some(params.verification_level.clone()),
            metadata: Some(serde_json::json!({
                "meeting_id": params.meeting_id,
                "content_type": params.content_type,
                "notify_attendees": params.notify_attendees
            })),
        };

        match verity.create_document(create_params).await {
            Ok(response) => {
                info!("Verification initiated for meeting {}: doc={}, verification={}",
                    params.meeting_id,
                    response.document_id,
                    response.verification_id.as_deref().unwrap_or("pending")
                );

                Ok(ToolResult::json(serde_json::json!({
                    "meeting_id": params.meeting_id,
                    "content_type": params.content_type,
                    "verification_level": params.verification_level,
                    "status": "verification_initiated",
                    "document_id": response.document_id,
                    "verification_id": response.verification_id,
                    "message": "Meeting notes sent to Verity for verification"
                })))
            }
            Err(e) => {
                error!("Failed to create document in Verity: {}", e);
                Ok(ToolResult::error(format!("Failed to initiate verification: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct VerifyMeetingNotesParams {
    meeting_id: String,
    #[serde(default = "default_content_type")]
    content_type: String,
    #[serde(default = "default_verification_level")]
    verification_level: String,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    notify_attendees: bool,
}

fn default_content_type() -> String {
    "summary".to_string()
}

fn default_verification_level() -> String {
    "standard".to_string()
}

/// Tool to link code decisions to meetings.
///
/// Tracks architectural decisions and code changes discussed in meetings
/// and links them to ShipCheck repositories.
///
/// Workflow:
/// 1. Fetch decision from NoteMan (if decision_id provided)
/// 2. Create a decision record in ShipCheck
/// 3. Link to repository files
/// 4. Optionally create tracking issue
pub struct LinkCodeDecisionTool;

#[async_trait]
impl Tool for LinkCodeDecisionTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "workflow_link_code_decision",
            "Link a meeting decision to a code repository in ShipCheck"
        )
            .with_app(App::Shared)
            .with_category("workflow")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "meeting_id": {
                        "type": "string",
                        "description": "NoteMan meeting ID"
                    },
                    "decision_id": {
                        "type": "string",
                        "description": "Decision ID from the meeting (optional if providing decision text)"
                    },
                    "decision_text": {
                        "type": "string",
                        "description": "The decision text (if not using decision_id)"
                    },
                    "repository_id": {
                        "type": "string",
                        "description": "ShipCheck repository ID to link"
                    },
                    "files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific files related to the decision"
                    },
                    "create_tracking_issue": {
                        "type": "boolean",
                        "description": "Create a GitHub issue to track implementation",
                        "default": false
                    },
                    "labels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Labels for the tracking issue"
                    }
                },
                "required": ["meeting_id", "repository_id"]
            }))
            .with_permissions(vec![
                "meeting:read".to_string(),
                "decision:read".to_string(),
                "repository:read".to_string(),
                "repository:update".to_string(),
            ])
    }

    #[instrument(skip(self, context), fields(tool = "link_code_decision"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: LinkCodeDecisionParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        info!("Linking code decision from meeting {} to repository {}", params.meeting_id, params.repository_id);

        let noteman = get_noteman_client();
        let shipcheck = get_shipcheck_client();

        // Step 1: Get decision text (from NoteMan or directly from params)
        let decision_text = if let Some(text) = &params.decision_text {
            text.clone()
        } else if let Some(decision_id) = &params.decision_id {
            // Fetch decision from NoteMan
            debug!("Fetching decision {} from NoteMan", decision_id);
            match noteman.get_meeting_decisions(&params.meeting_id).await {
                Ok(decisions) => {
                    decisions.iter()
                        .find(|d| &d.id == decision_id)
                        .map(|d| d.text.clone())
                        .unwrap_or_else(|| format!("Decision {}", decision_id))
                }
                Err(e) => {
                    error!("Failed to fetch decisions from NoteMan: {}", e);
                    return Ok(ToolResult::error(format!("Failed to fetch decision: {}", e)));
                }
            }
        } else {
            return Ok(ToolResult::error("Either decision_id or decision_text must be provided"));
        };

        // Step 2: Link decision in ShipCheck
        debug!("Linking decision to ShipCheck repository");
        let link_params = ClientLinkParams {
            repository_id: params.repository_id.clone(),
            decision_id: params.decision_id.clone(),
            decision_text: Some(decision_text),
            meeting_id: params.meeting_id.clone(),
            files: params.files.clone(),
            create_issue: params.create_tracking_issue,
            labels: params.labels.clone(),
        };

        match shipcheck.link_decision(link_params).await {
            Ok(response) => {
                info!("Decision linked successfully: link_id={}", response.link_id);

                Ok(ToolResult::json(serde_json::json!({
                    "meeting_id": params.meeting_id,
                    "repository_id": params.repository_id,
                    "status": "decision_linked",
                    "link_id": response.link_id,
                    "issue_number": response.issue_number,
                    "issue_created": response.issue_number.is_some(),
                    "message": response.message
                })))
            }
            Err(e) => {
                error!("Failed to link decision: {}", e);
                Ok(ToolResult::error(format!("Failed to link decision: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct LinkCodeDecisionParams {
    meeting_id: String,
    decision_id: Option<String>,
    decision_text: Option<String>,
    repository_id: String,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    create_tracking_issue: bool,
    #[serde(default)]
    labels: Vec<String>,
}

/// Tool to verify repository documentation.
///
/// Sends repository documentation (README, docs/, etc.) to Verity
/// for accuracy verification against the codebase.
///
/// Workflow:
/// 1. Fetch documentation from ShipCheck/GitHub
/// 2. Create documents in Verity
/// 3. Trigger verification with code cross-reference
/// 4. Return verification results
pub struct VerifyDocumentationTool;

#[async_trait]
impl Tool for VerifyDocumentationTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "workflow_verify_documentation",
            "Verify repository documentation accuracy using Verity"
        )
            .with_app(App::Shared)
            .with_category("workflow")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "repository_id": {
                        "type": "string",
                        "description": "ShipCheck repository ID"
                    },
                    "paths": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Documentation paths to verify (default: README.md, docs/)",
                        "default": ["README.md", "docs/"]
                    },
                    "check_code_examples": {
                        "type": "boolean",
                        "description": "Verify that code examples are accurate",
                        "default": true
                    },
                    "check_api_docs": {
                        "type": "boolean",
                        "description": "Verify API documentation against actual implementation",
                        "default": true
                    },
                    "compare_to_code": {
                        "type": "boolean",
                        "description": "Cross-reference documentation claims with codebase",
                        "default": true
                    }
                },
                "required": ["repository_id"]
            }))
            .with_permissions(vec![
                "repository:read".to_string(),
                "document:create".to_string(),
                "verification:execute".to_string(),
            ])
    }

    #[instrument(skip(self, context), fields(tool = "verify_documentation"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: VerifyDocumentationParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        info!("Starting documentation verification for repository: {}", params.repository_id);

        let shipcheck = get_shipcheck_client();
        let verity = get_verity_client();

        // Step 1: Fetch documentation from ShipCheck
        debug!("Fetching documentation from ShipCheck for paths: {:?}", params.paths);
        let repo_docs = match shipcheck.get_repository_docs(&params.repository_id, &params.paths).await {
            Ok(docs) => docs,
            Err(e) => {
                error!("Failed to fetch documentation: {}", e);
                return Ok(ToolResult::error(format!("Failed to fetch documentation: {}", e)));
            }
        };

        // Step 2: Create documents and verify each one
        let mut verification_ids: Vec<String> = Vec::new();

        for doc_file in &repo_docs.files {
            debug!("Verifying documentation file: {}", doc_file.path);

            let verify_params = ClientVerifyContentParams {
                content: doc_file.content.clone(),
                verification_level: "standard".to_string(),
                categories: vec![
                    "code_examples".to_string(),
                    "api_documentation".to_string(),
                    "technical_accuracy".to_string(),
                ],
                source_app: Some("shipcheck".to_string()),
                external_id: Some(format!("{}:{}", params.repository_id, doc_file.path)),
            };

            match verity.verify_content(verify_params).await {
                Ok(response) => {
                    verification_ids.push(response.verification_id.clone());
                    info!("Verification started for {}: {}", doc_file.path, response.verification_id);
                }
                Err(e) => {
                    error!("Failed to verify {}: {}", doc_file.path, e);
                }
            }
        }

        Ok(ToolResult::json(serde_json::json!({
            "repository_id": params.repository_id,
            "paths": params.paths,
            "status": "verification_initiated",
            "documents_created": repo_docs.files.len(),
            "verification_ids": verification_ids,
            "checks": {
                "code_examples": params.check_code_examples,
                "api_docs": params.check_api_docs,
                "compare_to_code": params.compare_to_code
            },
            "message": format!("Verification initiated for {} documentation files", repo_docs.files.len())
        })))
    }
}

#[derive(Debug, Deserialize)]
struct VerifyDocumentationParams {
    repository_id: String,
    #[serde(default = "default_doc_paths")]
    paths: Vec<String>,
    #[serde(default = "default_true")]
    check_code_examples: bool,
    #[serde(default = "default_true")]
    check_api_docs: bool,
    #[serde(default = "default_true")]
    compare_to_code: bool,
}

fn default_doc_paths() -> Vec<String> {
    vec!["README.md".to_string(), "docs/".to_string()]
}

fn default_true() -> bool {
    true
}

/// Tool to create a code finding discussion.
///
/// Creates a discussion about a ShipCheck finding in NoteMan
/// for team review in the next meeting.
///
/// Workflow:
/// 1. Fetch finding details from ShipCheck
/// 2. Create a discussion topic in NoteMan
/// 3. Optionally add to meeting agenda
pub struct CreateFindingDiscussionTool;

#[async_trait]
impl Tool for CreateFindingDiscussionTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "workflow_create_finding_discussion",
            "Create a discussion topic from a code finding for team review"
        )
            .with_app(App::Shared)
            .with_category("workflow")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "finding_id": {
                        "type": "string",
                        "description": "ShipCheck finding ID"
                    },
                    "meeting_id": {
                        "type": "string",
                        "description": "NoteMan meeting ID to add agenda item to (optional)"
                    },
                    "workspace_id": {
                        "type": "string",
                        "description": "NoteMan workspace ID for the discussion"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": "Discussion priority",
                        "default": "medium"
                    },
                    "assign_to": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "User IDs or emails to assign"
                    },
                    "include_context": {
                        "type": "boolean",
                        "description": "Include code context in the discussion",
                        "default": true
                    }
                },
                "required": ["finding_id"]
            }))
            .with_permissions(vec![
                "code_finding:read".to_string(),
                "workspace:read".to_string(),
                "note:create".to_string(),
            ])
    }

    #[instrument(skip(self, context), fields(tool = "create_finding_discussion"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: CreateFindingDiscussionParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        info!("Creating discussion for finding: {}", params.finding_id);

        let shipcheck = get_shipcheck_client();
        let noteman = get_noteman_client();

        // Step 1: Fetch finding details from ShipCheck
        debug!("Fetching finding {} from ShipCheck", params.finding_id);
        let finding = match shipcheck.get_finding(&params.finding_id).await {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to fetch finding: {}", e);
                return Ok(ToolResult::error(format!("Failed to fetch finding: {}", e)));
            }
        };

        // Step 2: Build discussion content
        let content = if params.include_context {
            format!(
                "## Code Finding: {}\n\n**Severity:** {}\n**File:** {}:{}\n\n### Description\n{}\n\n### Code Snippet\n```\n{}\n```\n\n### Suggested Fix\n{}",
                finding.title,
                finding.severity,
                finding.file_path,
                finding.line.unwrap_or(0),
                finding.description,
                finding.snippet.as_deref().unwrap_or("(no snippet available)"),
                finding.suggestion.as_deref().unwrap_or("(no suggestion available)")
            )
        } else {
            format!(
                "## Code Finding: {}\n\n**Severity:** {}\n**File:** {}\n\n{}",
                finding.title,
                finding.severity,
                finding.file_path,
                finding.description
            )
        };

        // Step 3: Create discussion in NoteMan
        let workspace_id = params.workspace_id.unwrap_or_else(|| "default".to_string());
        let discussion_params = ClientDiscussionParams {
            workspace_id: workspace_id.clone(),
            title: format!("[{}] {}", finding.severity.to_uppercase(), finding.title),
            content,
            priority: params.priority.clone(),
            assign_to: params.assign_to.clone(),
            meeting_id: params.meeting_id.clone(),
            metadata: Some(serde_json::json!({
                "finding_id": params.finding_id,
                "repository_id": finding.repository_id,
                "severity": finding.severity,
                "file_path": finding.file_path
            })),
        };

        match noteman.create_discussion(discussion_params).await {
            Ok(response) => {
                info!("Discussion created: {}", response.discussion_id);

                Ok(ToolResult::json(serde_json::json!({
                    "finding_id": params.finding_id,
                    "status": "discussion_created",
                    "discussion_id": response.discussion_id,
                    "priority": params.priority,
                    "meeting_id": params.meeting_id,
                    "workspace_id": workspace_id,
                    "message": "Discussion topic created for team review"
                })))
            }
            Err(e) => {
                error!("Failed to create discussion: {}", e);
                Ok(ToolResult::error(format!("Failed to create discussion: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct CreateFindingDiscussionParams {
    finding_id: String,
    meeting_id: Option<String>,
    workspace_id: Option<String>,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    assign_to: Vec<String>,
    #[serde(default = "default_true")]
    include_context: bool,
}

fn default_priority() -> String {
    "medium".to_string()
}

/// Tool to sync meeting action items to code tasks.
///
/// Converts meeting action items to tracked tasks in ShipCheck repositories.
///
/// Workflow:
/// 1. Fetch action items from NoteMan
/// 2. Filter for code-related items
/// 3. Create tasks in ShipCheck
/// 4. Optionally create GitHub issues
pub struct SyncActionItemsToTasksTool;

#[async_trait]
impl Tool for SyncActionItemsToTasksTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "workflow_sync_action_items",
            "Sync meeting action items to ShipCheck repository tasks"
        )
            .with_app(App::Shared)
            .with_category("workflow")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "meeting_id": {
                        "type": "string",
                        "description": "NoteMan meeting ID"
                    },
                    "repository_id": {
                        "type": "string",
                        "description": "Target ShipCheck repository"
                    },
                    "action_item_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific action item IDs (default: all code-related items)"
                    },
                    "create_issues": {
                        "type": "boolean",
                        "description": "Create GitHub issues for tasks",
                        "default": true
                    },
                    "link_to_prs": {
                        "type": "boolean",
                        "description": "Auto-link to related PRs when resolved",
                        "default": true
                    },
                    "default_labels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Default labels for created issues"
                    }
                },
                "required": ["meeting_id", "repository_id"]
            }))
            .with_permissions(vec![
                "meeting:read".to_string(),
                "meeting_task:read".to_string(),
                "repository:update".to_string(),
            ])
    }

    #[instrument(skip(self, context), fields(tool = "sync_action_items"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: SyncActionItemsParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        info!("Syncing action items from meeting {} to repository {}", params.meeting_id, params.repository_id);

        let noteman = get_noteman_client();
        let shipcheck = get_shipcheck_client();

        // Step 1: Extract action items from NoteMan
        debug!("Extracting action items from meeting {}", params.meeting_id);
        let extract_response = match noteman.extract_action_items(
            crate::clients::noteman::ExtractActionItemsParams {
                meeting_id: params.meeting_id.clone(),
                auto_assign: true,
                create_tasks: false, // We'll create tasks in ShipCheck instead
            }
        ).await {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to extract action items: {}", e);
                return Ok(ToolResult::error(format!("Failed to extract action items: {}", e)));
            }
        };

        // Step 2: Filter items (if specific IDs provided)
        let action_items: Vec<_> = if params.action_item_ids.is_empty() {
            extract_response.action_items.iter().collect()
        } else {
            extract_response.action_items.iter()
                .filter(|item| params.action_item_ids.contains(&item.id))
                .collect()
        };

        if action_items.is_empty() {
            return Ok(ToolResult::json(serde_json::json!({
                "meeting_id": params.meeting_id,
                "repository_id": params.repository_id,
                "status": "no_items",
                "items_synced": 0,
                "issues_created": 0,
                "message": "No action items found to sync"
            })));
        }

        // Step 3: Sync to ShipCheck
        debug!("Syncing {} action items to ShipCheck", action_items.len());
        let sync_params = ClientSyncParams {
            repository_id: params.repository_id.clone(),
            meeting_id: params.meeting_id.clone(),
            action_items: action_items.iter().map(|item| ActionItemSync {
                id: item.id.clone(),
                description: item.description.clone(),
                assignee: item.assignee.clone(),
                due_date: item.due_date.clone(),
            }).collect(),
            create_issues: params.create_issues,
            link_to_prs: params.link_to_prs,
            default_labels: params.default_labels.clone(),
        };

        match shipcheck.sync_tasks(sync_params).await {
            Ok(response) => {
                info!("Synced {} items, created {} issues", response.items_synced, response.issues_created);

                Ok(ToolResult::json(serde_json::json!({
                    "meeting_id": params.meeting_id,
                    "repository_id": params.repository_id,
                    "status": "sync_complete",
                    "items_synced": response.items_synced,
                    "issues_created": response.issues_created,
                    "issue_numbers": response.issue_numbers,
                    "message": response.message
                })))
            }
            Err(e) => {
                error!("Failed to sync tasks: {}", e);
                Ok(ToolResult::error(format!("Failed to sync tasks: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct SyncActionItemsParams {
    meeting_id: String,
    repository_id: String,
    #[serde(default)]
    action_item_ids: Vec<String>,
    #[serde(default = "default_true")]
    create_issues: bool,
    #[serde(default = "default_true")]
    link_to_prs: bool,
    #[serde(default)]
    default_labels: Vec<String>,
}

/// Get all workflow tools.
///
/// Returns a vector of all cross-app workflow MCP tools that can be registered
/// with an MCP server.
pub fn workflow_tools() -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(VerifyMeetingNotesTool),
        Arc::new(LinkCodeDecisionTool),
        Arc::new(VerifyDocumentationTool),
        Arc::new(CreateFindingDiscussionTool),
        Arc::new(SyncActionItemsToTasksTool),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_meeting_notes_definition() {
        let tool = VerifyMeetingNotesTool;
        let def = tool.definition();
        assert_eq!(def.name, "workflow_verify_meeting_notes");
        assert_eq!(def.source_app, Some(App::Shared));
        assert_eq!(def.category, Some("workflow".to_string()));
    }

    #[test]
    fn test_all_workflow_tools() {
        let tools = workflow_tools();
        assert_eq!(tools.len(), 5);
    }

    #[test]
    fn test_workflow_tools_have_cross_app_permissions() {
        let tools = workflow_tools();
        for tool in tools {
            let def = tool.definition();
            // All workflow tools should have permissions from multiple apps
            assert!(!def.required_permissions.is_empty(),
                "Tool {} should have required permissions", def.name);
        }
    }

    #[test]
    fn test_default_values() {
        assert_eq!(default_content_type(), "summary");
        assert_eq!(default_verification_level(), "standard");
        assert_eq!(default_priority(), "medium");
        assert!(default_true());
        assert_eq!(default_doc_paths(), vec!["README.md", "docs/"]);
    }
}
