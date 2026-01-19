//! MCP protocol types
//!
//! This module defines the types for the Model Context Protocol (MCP),
//! which enables AI assistants to interact with external tools and resources.

use platform_rbac::App;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MCP JSON-RPC request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRequest {
    /// JSON-RPC version (always "2.0")
    pub jsonrpc: String,

    /// Request ID
    pub id: RequestId,

    /// Method name
    pub method: String,

    /// Optional parameters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl McpRequest {
    /// Create a new MCP request.
    pub fn new(id: impl Into<RequestId>, method: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: id.into(),
            method: method.into(),
            params: None,
        }
    }

    /// Add parameters to the request.
    pub fn with_params(mut self, params: serde_json::Value) -> Self {
        self.params = Some(params);
        self
    }
}

/// MCP JSON-RPC response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    /// JSON-RPC version (always "2.0")
    pub jsonrpc: String,

    /// Request ID (same as request)
    pub id: RequestId,

    /// Result (mutually exclusive with error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,

    /// Error (mutually exclusive with result)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

impl McpResponse {
    /// Create a success response.
    pub fn success(id: RequestId, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    /// Create an error response.
    pub fn error(id: RequestId, error: McpError) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(error),
        }
    }
}

/// Request ID (can be string, number, or null).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum RequestId {
    /// String ID
    String(String),
    /// Number ID
    Number(i64),
    /// Null ID (for notifications)
    Null,
}

impl From<String> for RequestId {
    fn from(s: String) -> Self {
        RequestId::String(s)
    }
}

impl From<&str> for RequestId {
    fn from(s: &str) -> Self {
        RequestId::String(s.to_string())
    }
}

impl From<i64> for RequestId {
    fn from(n: i64) -> Self {
        RequestId::Number(n)
    }
}

/// MCP error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpError {
    /// Error code
    pub code: i32,

    /// Error message
    pub message: String,

    /// Additional data
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl McpError {
    /// Standard JSON-RPC error codes.
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;

    /// Create a new error.
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    /// Add data to the error.
    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }

    /// Parse error.
    pub fn parse_error() -> Self {
        Self::new(Self::PARSE_ERROR, "Parse error")
    }

    /// Invalid request.
    pub fn invalid_request() -> Self {
        Self::new(Self::INVALID_REQUEST, "Invalid request")
    }

    /// Method not found.
    pub fn method_not_found(method: &str) -> Self {
        Self::new(
            Self::METHOD_NOT_FOUND,
            format!("Method not found: {}", method),
        )
    }

    /// Invalid params.
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self::new(Self::INVALID_PARAMS, message)
    }

    /// Internal error.
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::new(Self::INTERNAL_ERROR, message)
    }
}

/// Tool definition for MCP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    /// Tool name (unique identifier)
    pub name: String,

    /// Human-readable description
    pub description: String,

    /// Input schema (JSON Schema)
    pub input_schema: serde_json::Value,

    /// Source application
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<App>,

    /// Tool category
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,

    /// Required permissions
    #[serde(default)]
    pub required_permissions: Vec<String>,
}

impl ToolDefinition {
    /// Create a new tool definition.
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            source_app: None,
            category: None,
            required_permissions: Vec::new(),
        }
    }

    /// Set the input schema.
    pub fn with_schema(mut self, schema: serde_json::Value) -> Self {
        self.input_schema = schema;
        self
    }

    /// Set the source application.
    pub fn with_app(mut self, app: App) -> Self {
        self.source_app = Some(app);
        self
    }

    /// Set the category.
    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }

    /// Add required permissions.
    pub fn with_permissions(mut self, permissions: Vec<String>) -> Self {
        self.required_permissions = permissions;
        self
    }
}

/// Tool call request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Tool name
    pub name: String,

    /// Arguments
    pub arguments: serde_json::Value,
}

/// Tool call result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// Content (usually text)
    pub content: Vec<ContentBlock>,

    /// Whether the tool call was successful
    #[serde(default = "default_true")]
    pub is_error: bool,
}

fn default_true() -> bool {
    false
}

impl ToolResult {
    /// Create a success result with text content.
    pub fn text(content: impl Into<String>) -> Self {
        Self {
            content: vec![ContentBlock::Text {
                text: content.into(),
            }],
            is_error: false,
        }
    }

    /// Create an error result.
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            content: vec![ContentBlock::Text {
                text: message.into(),
            }],
            is_error: true,
        }
    }

    /// Create a result with JSON content.
    pub fn json(value: serde_json::Value) -> Self {
        Self {
            content: vec![ContentBlock::Text {
                text: serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string()),
            }],
            is_error: false,
        }
    }
}

/// Content block in tool results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    /// Text content
    Text { text: String },

    /// Image content
    Image { data: String, mime_type: String },

    /// Resource reference
    Resource {
        uri: String,
        mime_type: Option<String>,
    },
}

/// Resource definition for MCP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceDefinition {
    /// Resource URI
    pub uri: String,

    /// Human-readable name
    pub name: String,

    /// Description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// Source application
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<App>,
}

/// Server capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServerCapabilities {
    /// Tool support
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<ToolCapabilities>,

    /// Resource support
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<ResourceCapabilities>,

    /// Prompt support
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<PromptCapabilities>,

    /// Experimental features
    #[serde(default)]
    pub experimental: HashMap<String, serde_json::Value>,
}

/// Tool capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolCapabilities {
    /// List tools changed notification
    #[serde(default)]
    pub list_changed: bool,
}

/// Resource capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResourceCapabilities {
    /// Subscribe to resource changes
    #[serde(default)]
    pub subscribe: bool,

    /// List resources changed notification
    #[serde(default)]
    pub list_changed: bool,
}

/// Prompt capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PromptCapabilities {
    /// List prompts changed notification
    #[serde(default)]
    pub list_changed: bool,
}

/// Server info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    /// Server name
    pub name: String,

    /// Server version
    pub version: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_request() {
        let req = McpRequest::new("1", "tools/list");
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "tools/list");
    }

    #[test]
    fn test_mcp_response() {
        let resp = McpResponse::success(
            RequestId::String("1".to_string()),
            serde_json::json!({"tools": []}),
        );
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_tool_definition() {
        let tool = ToolDefinition::new("verify_document", "Verify document assertions")
            .with_app(App::Verity)
            .with_category("verification")
            .with_schema(serde_json::json!({
                "type": "object",
                "properties": {
                    "document_id": {"type": "string"}
                },
                "required": ["document_id"]
            }));

        assert_eq!(tool.name, "verify_document");
        assert_eq!(tool.source_app, Some(App::Verity));
    }

    #[test]
    fn test_tool_result() {
        let result = ToolResult::text("Success");
        assert!(!result.is_error);
        assert_eq!(result.content.len(), 1);

        let error = ToolResult::error("Something went wrong");
        assert!(error.is_error);
    }
}
