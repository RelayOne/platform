//! ShipCheck MCP tools
//!
//! Tools for code analysis, verification, and security scanning.
//! These tools communicate with the ShipCheck service via HTTP to perform
//! code verification operations.

use crate::clients::config::ServiceConfig;
use crate::clients::shipcheck::{
    AnalyzeCodeParams as ClientAnalyzeParams, RunPipelineParams as ClientPipelineParams,
    SearchFindingsParams as ClientSearchParams, ShipCheckClient,
    VerifyPRParams as ClientVerifyPRParams,
};
use crate::server::{McpServerError, McpServerResult, Tool, ToolContext};
use crate::types::{ToolDefinition, ToolResult};
use async_trait::async_trait;
use platform_rbac::App;
use serde::Deserialize;
use std::sync::{Arc, OnceLock};
use tracing::{debug, error, instrument};

/// Lazily initialized ShipCheck client singleton.
static SHIPCHECK_CLIENT: OnceLock<ShipCheckClient> = OnceLock::new();

/// Get or initialize the ShipCheck client.
fn get_client() -> &'static ShipCheckClient {
    SHIPCHECK_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        ShipCheckClient::new(config.shipcheck, timeout)
    })
}

/// Tool to analyze code for issues.
///
/// Performs static analysis on code to find bugs, security issues, and style problems
/// by calling the ShipCheck analysis service.
pub struct AnalyzeCodeTool;

#[async_trait]
impl Tool for AnalyzeCodeTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "shipcheck_analyze_code",
            "Analyze code for bugs, security issues, and style problems",
        )
        .with_app(App::ShipCheck)
        .with_category("analysis")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "repository_id": {
                    "type": "string",
                    "description": "The repository ID to analyze"
                },
                "path": {
                    "type": "string",
                    "description": "Path within the repository to analyze (default: entire repo)"
                },
                "commit": {
                    "type": "string",
                    "description": "Specific commit SHA to analyze"
                },
                "checks": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["security", "bugs", "style", "performance", "complexity"]
                    },
                    "description": "Types of checks to run"
                }
            },
            "required": ["repository_id"]
        }))
        .with_permissions(vec![
            "repository:read".to_string(),
            "code_verification:execute".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "analyze_code"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: AnalyzeCodeParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Analyzing code for repository: {}", params.repository_id);

        let client = get_client();

        let client_params = ClientAnalyzeParams {
            repository_id: params.repository_id.clone(),
            path: params.path.clone(),
            commit: params.commit.clone(),
            checks: params.checks.clone(),
        };

        match client.analyze_code(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "repository_id": response.repository_id,
                "job_id": response.job_id,
                "status": response.status,
                "path": response.path,
                "checks": response.checks,
                "commit": response.commit,
                "message": "Code analysis job started successfully"
            }))),
            Err(e) => {
                error!("Failed to analyze code: {}", e);
                Ok(ToolResult::error(format!("Failed to analyze code: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct AnalyzeCodeParams {
    repository_id: String,
    path: Option<String>,
    commit: Option<String>,
    #[serde(default = "default_checks")]
    checks: Vec<String>,
}

fn default_checks() -> Vec<String> {
    vec!["security".to_string(), "bugs".to_string()]
}

/// Tool to verify a pull request.
///
/// Analyzes a PR for code quality, security, and compliance by calling
/// the ShipCheck PR verification service.
pub struct VerifyPRTool;

#[async_trait]
impl Tool for VerifyPRTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "shipcheck_verify_pr",
            "Verify a pull request for code quality and security",
        )
        .with_app(App::ShipCheck)
        .with_category("verification")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "repository_id": {
                    "type": "string",
                    "description": "The repository ID"
                },
                "pr_number": {
                    "type": "integer",
                    "description": "The pull request number"
                },
                "auto_approve": {
                    "type": "boolean",
                    "description": "Automatically approve if all checks pass",
                    "default": false
                },
                "post_comments": {
                    "type": "boolean",
                    "description": "Post inline comments on issues found",
                    "default": true
                }
            },
            "required": ["repository_id", "pr_number"]
        }))
        .with_permissions(vec![
            "repository:read".to_string(),
            "pull_request:read".to_string(),
            "pull_request:update".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "verify_pr"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: VerifyPRParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!(
            "Verifying PR #{} for repository: {}",
            params.pr_number, params.repository_id
        );

        let client = get_client();

        let client_params = ClientVerifyPRParams {
            repository_id: params.repository_id.clone(),
            pr_number: params.pr_number,
            auto_approve: params.auto_approve,
            post_comments: params.post_comments,
        };

        match client.verify_pr(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "repository_id": response.repository_id,
                "pr_number": response.pr_number,
                "job_id": response.job_id,
                "status": response.status,
                "auto_approve": response.auto_approve,
                "findings_count": response.findings_count,
                "message": "PR verification job started successfully"
            }))),
            Err(e) => {
                error!("Failed to verify PR: {}", e);
                Ok(ToolResult::error(format!("Failed to verify PR: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct VerifyPRParams {
    repository_id: String,
    pr_number: u32,
    #[serde(default)]
    auto_approve: bool,
    #[serde(default = "default_true")]
    post_comments: bool,
}

fn default_true() -> bool {
    true
}

/// Tool to search code findings.
///
/// Searches through code analysis findings across repositories using the
/// ShipCheck search service.
pub struct SearchFindingsTool;

#[async_trait]
impl Tool for SearchFindingsTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("shipcheck_search_findings", "Search code analysis findings")
            .with_app(App::ShipCheck)
            .with_category("search")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "repository_id": {
                        "type": "string",
                        "description": "Filter by repository"
                    },
                    "severity": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["critical", "high", "medium", "low", "info"]
                        },
                        "description": "Filter by severity levels"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "resolved", "ignored", "false_positive"],
                        "description": "Filter by status"
                    },
                    "limit": {
                        "type": "integer",
                        "default": 50
                    }
                },
                "required": ["query"]
            }))
            .with_permissions(vec!["code_finding:read".to_string()])
    }

    #[instrument(skip(self, context), fields(tool = "search_findings"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: SearchFindingsParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Searching findings with query: {}", params.query);

        let client = get_client();

        let client_params = ClientSearchParams {
            query: params.query.clone(),
            repository_id: params.repository_id.clone(),
            severity: params.severity.clone(),
            status: params.status.clone(),
            limit: params.limit,
        };

        match client.search_findings(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "query": response.query,
                "total_results": response.total_results,
                "findings": response.findings
            }))),
            Err(e) => {
                error!("Failed to search findings: {}", e);
                Ok(ToolResult::error(format!(
                    "Failed to search findings: {}",
                    e
                )))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct SearchFindingsParams {
    query: String,
    repository_id: Option<String>,
    #[serde(default)]
    severity: Vec<String>,
    status: Option<String>,
    #[serde(default = "default_limit")]
    limit: u32,
}

fn default_limit() -> u32 {
    50
}

/// Tool to run a verification pipeline.
///
/// Triggers a full verification pipeline on a repository or branch by calling
/// the ShipCheck pipeline service.
pub struct RunPipelineTool;

#[async_trait]
impl Tool for RunPipelineTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new(
            "shipcheck_run_pipeline",
            "Run a verification pipeline on a repository",
        )
        .with_app(App::ShipCheck)
        .with_category("pipeline")
        .with_schema(serde_json::json!({
            "type": "object",
            "properties": {
                "repository_id": {
                    "type": "string",
                    "description": "The repository ID"
                },
                "branch": {
                    "type": "string",
                    "description": "Branch to run on (default: main/master)"
                },
                "pipeline": {
                    "type": "string",
                    "enum": ["full", "security", "quality", "custom"],
                    "description": "Pipeline type to run",
                    "default": "full"
                },
                "notify_on_complete": {
                    "type": "boolean",
                    "description": "Send notification when complete",
                    "default": true
                }
            },
            "required": ["repository_id"]
        }))
        .with_permissions(vec![
            "repository:read".to_string(),
            "pipeline:execute".to_string(),
        ])
    }

    #[instrument(skip(self, context), fields(tool = "run_pipeline"))]
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let params: RunPipelineParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Running pipeline for repository: {}", params.repository_id);

        let client = get_client();

        let client_params = ClientPipelineParams {
            repository_id: params.repository_id.clone(),
            branch: params.branch.clone(),
            pipeline: params.pipeline.clone(),
            notify_on_complete: params.notify_on_complete,
        };

        match client.run_pipeline(client_params).await {
            Ok(response) => Ok(ToolResult::json(serde_json::json!({
                "repository_id": response.repository_id,
                "pipeline_id": response.pipeline_id,
                "status": response.status,
                "branch": response.branch,
                "pipeline": response.pipeline,
                "message": "Pipeline started successfully"
            }))),
            Err(e) => {
                error!("Failed to run pipeline: {}", e);
                Ok(ToolResult::error(format!("Failed to run pipeline: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct RunPipelineParams {
    repository_id: String,
    branch: Option<String>,
    #[serde(default = "default_pipeline")]
    pipeline: String,
    #[serde(default = "default_true")]
    notify_on_complete: bool,
}

fn default_pipeline() -> String {
    "full".to_string()
}

/// Get all ShipCheck tools.
///
/// Returns a vector of all ShipCheck MCP tools that can be registered
/// with an MCP server.
pub fn shipcheck_tools() -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(AnalyzeCodeTool),
        Arc::new(VerifyPRTool),
        Arc::new(SearchFindingsTool),
        Arc::new(RunPipelineTool),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_code_tool_definition() {
        let tool = AnalyzeCodeTool;
        let def = tool.definition();
        assert_eq!(def.name, "shipcheck_analyze_code");
        assert_eq!(def.source_app, Some(App::ShipCheck));
    }

    #[test]
    fn test_all_shipcheck_tools() {
        let tools = shipcheck_tools();
        assert_eq!(tools.len(), 4);
    }

    #[test]
    fn test_tool_categories() {
        let tools = shipcheck_tools();
        let categories: Vec<_> = tools
            .iter()
            .map(|t| t.definition().category.clone())
            .collect();

        assert!(categories.contains(&Some("analysis".to_string())));
        assert!(categories.contains(&Some("verification".to_string())));
        assert!(categories.contains(&Some("search".to_string())));
        assert!(categories.contains(&Some("pipeline".to_string())));
    }

    #[test]
    fn test_default_checks() {
        let checks = default_checks();
        assert_eq!(checks, vec!["security", "bugs"]);
    }
}
