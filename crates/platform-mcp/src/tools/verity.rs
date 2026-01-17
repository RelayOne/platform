//! Verity MCP tools
//!
//! Tools for document verification, assertion extraction, and knowledge management.
//! These tools communicate with the Verity service via HTTP to perform
//! content verification operations.

use crate::clients::config::ServiceConfig;
use crate::clients::verity::{
    VerityClient, VerifyDocumentParams as ClientVerifyParams,
    ExtractAssertionsParams as ClientExtractParams,
    SearchKnowledgeParams as ClientSearchParams,
    CheckPropagationParams as ClientPropagationParams,
    SearchFilters,
};
use crate::server::{McpServerError, McpServerResult, Tool, ToolContext};
use crate::types::{ToolDefinition, ToolResult};
use async_trait::async_trait;
use platform_rbac::App;
use serde::Deserialize;
use std::sync::{Arc, OnceLock};
use tracing::{debug, error, instrument};

/// Lazily initialized Verity client singleton.
static VERITY_CLIENT: OnceLock<VerityClient> = OnceLock::new();

/// Get or initialize the Verity client.
fn get_client() -> &'static VerityClient {
    VERITY_CLIENT.get_or_init(|| {
        let config = ServiceConfig::from_env();
        let timeout = config.timeout();
        VerityClient::new(config.verity, timeout)
    })
}

/// Tool to verify document assertions.
///
/// Analyzes a document and verifies all factual claims against trusted knowledge
/// sources by calling the Verity verification service.
pub struct VerifyDocumentTool;

#[async_trait]
impl Tool for VerifyDocumentTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("verity_verify_document", "Verify all assertions in a document against trusted sources")
            .with_app(App::Verity)
            .with_category("verification")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "document_id": {
                        "type": "string",
                        "description": "The document ID to verify"
                    },
                    "thorough": {
                        "type": "boolean",
                        "description": "Whether to perform thorough verification (slower but more accurate)",
                        "default": false
                    }
                },
                "required": ["document_id"]
            }))
            .with_permissions(vec!["document:read".to_string(), "verification:execute".to_string()])
    }

    #[instrument(skip(self, context), fields(tool = "verify_document"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: VerifyDocumentParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Verifying document: {}", params.document_id);

        let client = get_client();

        let client_params = ClientVerifyParams {
            document_id: params.document_id.clone(),
            thorough: params.thorough,
        };

        match client.verify_document(client_params).await {
            Ok(response) => {
                Ok(ToolResult::json(serde_json::json!({
                    "document_id": response.document_id,
                    "job_id": response.job_id,
                    "status": response.status,
                    "message": response.message,
                    "estimated_time_seconds": response.estimated_time_seconds
                })))
            }
            Err(e) => {
                error!("Failed to verify document: {}", e);
                Ok(ToolResult::error(format!("Failed to verify document: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct VerifyDocumentParams {
    document_id: String,
    #[serde(default)]
    thorough: bool,
}

/// Tool to extract assertions from content.
///
/// Analyzes text content and extracts factual claims that can be verified
/// by calling the Verity extraction service.
pub struct ExtractAssertionsTool;

#[async_trait]
impl Tool for ExtractAssertionsTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("verity_extract_assertions", "Extract factual assertions from text content")
            .with_app(App::Verity)
            .with_category("extraction")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The text content to analyze"
                    },
                    "document_id": {
                        "type": "string",
                        "description": "Optional document ID to associate assertions with"
                    },
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Categories to focus on (e.g., 'statistics', 'dates', 'claims')"
                    }
                },
                "required": ["content"]
            }))
            .with_permissions(vec!["assertion:create".to_string()])
    }

    #[instrument(skip(self, context, args), fields(tool = "extract_assertions"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: ExtractAssertionsParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Extracting assertions from content (length: {} chars)", params.content.len());

        let client = get_client();

        let client_params = ClientExtractParams {
            content: params.content.clone(),
            document_id: params.document_id.clone(),
            categories: params.categories.clone(),
        };

        match client.extract_assertions(client_params).await {
            Ok(response) => {
                Ok(ToolResult::json(serde_json::json!({
                    "status": response.status,
                    "assertion_count": response.assertion_count,
                    "message": response.message,
                    "assertions": response.assertions
                })))
            }
            Err(e) => {
                error!("Failed to extract assertions: {}", e);
                Ok(ToolResult::error(format!("Failed to extract assertions: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct ExtractAssertionsParams {
    content: String,
    document_id: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
}

/// Tool to search the knowledge base.
///
/// Searches for verified facts and sources in the knowledge base using the
/// Verity search service.
pub struct SearchKnowledgeTool;

#[async_trait]
impl Tool for SearchKnowledgeTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("verity_search_knowledge", "Search the verified knowledge base for facts and sources")
            .with_app(App::Verity)
            .with_category("search")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results",
                        "default": 10
                    },
                    "filters": {
                        "type": "object",
                        "properties": {
                            "source_types": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "min_confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1
                            },
                            "date_range": {
                                "type": "object",
                                "properties": {
                                    "start": {"type": "string", "format": "date"},
                                    "end": {"type": "string", "format": "date"}
                                }
                            }
                        }
                    }
                },
                "required": ["query"]
            }))
            .with_permissions(vec!["knowledge:read".to_string()])
    }

    #[instrument(skip(self, context), fields(tool = "search_knowledge"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: SearchKnowledgeParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Searching knowledge base with query: {}", params.query);

        let client = get_client();

        // Convert filters if provided
        let filters = params.filters.map(|f| {
            SearchFilters {
                source_types: f.get("source_types")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()),
                min_confidence: f.get("min_confidence")
                    .and_then(|v| v.as_f64()),
                date_range: f.get("date_range")
                    .and_then(|dr| {
                        let start = dr.get("start")?.as_str()?;
                        let end = dr.get("end")?.as_str()?;
                        Some(crate::clients::verity::DateRange {
                            start: start.to_string(),
                            end: end.to_string(),
                        })
                    }),
            }
        });

        let client_params = ClientSearchParams {
            query: params.query.clone(),
            limit: params.limit,
            filters,
        };

        match client.search_knowledge(client_params).await {
            Ok(response) => {
                Ok(ToolResult::json(serde_json::json!({
                    "query": response.query,
                    "total_results": response.total_results,
                    "results": response.results
                })))
            }
            Err(e) => {
                error!("Failed to search knowledge: {}", e);
                Ok(ToolResult::error(format!("Failed to search knowledge: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct SearchKnowledgeParams {
    query: String,
    #[serde(default = "default_limit")]
    limit: u32,
    filters: Option<serde_json::Value>,
}

fn default_limit() -> u32 {
    10
}

/// Tool to check assertion propagation.
///
/// Analyzes how an assertion or correction propagates through related documents
/// using the Verity propagation analysis service.
pub struct CheckPropagationTool;

#[async_trait]
impl Tool for CheckPropagationTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition::new("verity_check_propagation", "Check how an assertion propagates through related documents")
            .with_app(App::Verity)
            .with_category("analysis")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "assertion_id": {
                        "type": "string",
                        "description": "The assertion ID to trace"
                    },
                    "depth": {
                        "type": "integer",
                        "description": "How many levels of references to follow",
                        "default": 2,
                        "minimum": 1,
                        "maximum": 5
                    }
                },
                "required": ["assertion_id"]
            }))
            .with_permissions(vec!["propagation:read".to_string()])
    }

    #[instrument(skip(self, context), fields(tool = "check_propagation"))]
    async fn execute(&self, args: serde_json::Value, context: &ToolContext) -> McpServerResult<ToolResult> {
        let params: CheckPropagationParams = serde_json::from_value(args)
            .map_err(|e| McpServerError::InvalidParams(e.to_string()))?;

        debug!("Checking propagation for assertion: {}", params.assertion_id);

        let client = get_client();

        let client_params = ClientPropagationParams {
            assertion_id: params.assertion_id.clone(),
            depth: params.depth,
        };

        match client.check_propagation(client_params).await {
            Ok(response) => {
                Ok(ToolResult::json(serde_json::json!({
                    "assertion_id": response.assertion_id,
                    "propagation_depth": response.propagation_depth,
                    "affected_documents": response.affected_documents,
                    "impact_score": response.impact_score
                })))
            }
            Err(e) => {
                error!("Failed to check propagation: {}", e);
                Ok(ToolResult::error(format!("Failed to check propagation: {}", e)))
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct CheckPropagationParams {
    assertion_id: String,
    #[serde(default = "default_depth")]
    depth: u32,
}

fn default_depth() -> u32 {
    2
}

/// Get all Verity tools.
///
/// Returns a vector of all Verity MCP tools that can be registered
/// with an MCP server.
pub fn verity_tools() -> Vec<Arc<dyn Tool>> {
    vec![
        Arc::new(VerifyDocumentTool),
        Arc::new(ExtractAssertionsTool),
        Arc::new(SearchKnowledgeTool),
        Arc::new(CheckPropagationTool),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_document_tool_definition() {
        let tool = VerifyDocumentTool;
        let def = tool.definition();
        assert_eq!(def.name, "verity_verify_document");
        assert_eq!(def.source_app, Some(App::Verity));
    }

    #[test]
    fn test_all_verity_tools() {
        let tools = verity_tools();
        assert_eq!(tools.len(), 4);
    }

    #[test]
    fn test_tool_categories() {
        let tools = verity_tools();
        let categories: Vec<_> = tools.iter()
            .map(|t| t.definition().category.clone())
            .collect();

        assert!(categories.contains(&Some("verification".to_string())));
        assert!(categories.contains(&Some("extraction".to_string())));
        assert!(categories.contains(&Some("search".to_string())));
        assert!(categories.contains(&Some("analysis".to_string())));
    }

    #[test]
    fn test_default_depth() {
        assert_eq!(default_depth(), 2);
    }

    #[test]
    fn test_default_limit() {
        assert_eq!(default_limit(), 10);
    }
}
