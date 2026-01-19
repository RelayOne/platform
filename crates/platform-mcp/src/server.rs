//! MCP server implementation
//!
//! This module provides the unified MCP server that aggregates tools
//! from all Relay platform applications.

use crate::types::*;
use async_trait::async_trait;
use platform_rbac::App;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

/// MCP server error types.
#[derive(Debug, Error)]
pub enum McpServerError {
    /// Tool not found
    #[error("Tool not found: {0}")]
    ToolNotFound(String),

    /// Tool execution failed
    #[error("Tool execution failed: {0}")]
    ExecutionError(String),

    /// Permission denied
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// Invalid parameters
    #[error("Invalid parameters: {0}")]
    InvalidParams(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}

/// Result type for MCP server operations.
pub type McpServerResult<T> = Result<T, McpServerError>;

/// Trait for tool implementations.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Get the tool definition.
    fn definition(&self) -> ToolDefinition;

    /// Execute the tool with given arguments.
    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult>;
}

/// Context for tool execution.
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// User ID
    pub user_id: Option<uuid::Uuid>,

    /// Organization ID
    pub org_id: Option<uuid::Uuid>,

    /// Project ID
    pub project_id: Option<uuid::Uuid>,

    /// User permissions
    pub permissions: Vec<String>,

    /// Request correlation ID
    pub correlation_id: Option<String>,

    /// API key for external service calls
    pub api_key: Option<String>,
}

impl ToolContext {
    /// Create an empty context.
    pub fn empty() -> Self {
        Self {
            user_id: None,
            org_id: None,
            project_id: None,
            permissions: Vec::new(),
            correlation_id: None,
            api_key: None,
        }
    }

    /// Check if user has a specific permission.
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.contains(&permission.to_string())
    }
}

/// Unified MCP server.
///
/// Aggregates tools from all platform applications and provides
/// a single interface for AI assistants.
pub struct McpServer {
    /// Server info
    info: ServerInfo,

    /// Server capabilities
    capabilities: ServerCapabilities,

    /// Registered tools
    tools: Arc<RwLock<HashMap<String, Arc<dyn Tool>>>>,

    /// Registered resources
    resources: Arc<RwLock<HashMap<String, ResourceDefinition>>>,

    /// Tool categories
    categories: Arc<RwLock<Vec<String>>>,
}

impl McpServer {
    /// Create a new MCP server.
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            info: ServerInfo {
                name: name.into(),
                version: version.into(),
            },
            capabilities: ServerCapabilities {
                tools: Some(ToolCapabilities { list_changed: true }),
                resources: Some(ResourceCapabilities {
                    subscribe: true,
                    list_changed: true,
                }),
                prompts: Some(PromptCapabilities { list_changed: true }),
                experimental: HashMap::new(),
            },
            tools: Arc::new(RwLock::new(HashMap::new())),
            resources: Arc::new(RwLock::new(HashMap::new())),
            categories: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Create with default platform configuration.
    pub fn platform() -> Self {
        Self::new("relay-platform-mcp", env!("CARGO_PKG_VERSION"))
    }

    /// Register a tool.
    pub async fn register_tool(&self, tool: Arc<dyn Tool>) {
        let definition = tool.definition();
        let name = definition.name.clone();

        // Add category if new
        if let Some(ref category) = definition.category {
            let mut categories = self.categories.write().await;
            if !categories.contains(category) {
                categories.push(category.clone());
            }
        }

        let mut tools = self.tools.write().await;
        tools.insert(name, tool);
    }

    /// Register multiple tools.
    pub async fn register_tools(&self, tools: Vec<Arc<dyn Tool>>) {
        for tool in tools {
            self.register_tool(tool).await;
        }
    }

    /// Register a resource.
    pub async fn register_resource(&self, resource: ResourceDefinition) {
        let mut resources = self.resources.write().await;
        resources.insert(resource.uri.clone(), resource);
    }

    /// Get all tool definitions.
    pub async fn list_tools(&self) -> Vec<ToolDefinition> {
        let tools = self.tools.read().await;
        tools.values().map(|t| t.definition()).collect()
    }

    /// Get tools by category.
    pub async fn list_tools_by_category(&self, category: &str) -> Vec<ToolDefinition> {
        let tools = self.tools.read().await;
        tools
            .values()
            .map(|t| t.definition())
            .filter(|d| d.category.as_deref() == Some(category))
            .collect()
    }

    /// Get tools by source app.
    pub async fn list_tools_by_app(&self, app: App) -> Vec<ToolDefinition> {
        let tools = self.tools.read().await;
        tools
            .values()
            .map(|t| t.definition())
            .filter(|d| d.source_app == Some(app))
            .collect()
    }

    /// Get all categories.
    pub async fn list_categories(&self) -> Vec<String> {
        self.categories.read().await.clone()
    }

    /// Get all resources.
    pub async fn list_resources(&self) -> Vec<ResourceDefinition> {
        let resources = self.resources.read().await;
        resources.values().cloned().collect()
    }

    /// Execute a tool.
    pub async fn call_tool(
        &self,
        name: &str,
        arguments: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        let tools = self.tools.read().await;

        let tool = tools
            .get(name)
            .ok_or_else(|| McpServerError::ToolNotFound(name.to_string()))?;

        // Check permissions
        let definition = tool.definition();
        for required in &definition.required_permissions {
            if !context.has_permission(required) {
                return Err(McpServerError::PermissionDenied(format!(
                    "Missing permission: {}",
                    required
                )));
            }
        }

        tool.execute(arguments, context).await
    }

    /// Handle an MCP request.
    pub async fn handle_request(&self, request: McpRequest) -> McpResponse {
        match request.method.as_str() {
            "initialize" => self.handle_initialize(request.id),
            "tools/list" => self.handle_tools_list(request.id).await,
            "tools/call" => self.handle_tools_call(request.id, request.params).await,
            "resources/list" => self.handle_resources_list(request.id).await,
            "resources/read" => self.handle_resources_read(request.id, request.params).await,
            _ => McpResponse::error(request.id, McpError::method_not_found(&request.method)),
        }
    }

    fn handle_initialize(&self, id: RequestId) -> McpResponse {
        McpResponse::success(
            id,
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": self.capabilities,
                "serverInfo": self.info
            }),
        )
    }

    async fn handle_tools_list(&self, id: RequestId) -> McpResponse {
        let tools = self.list_tools().await;
        McpResponse::success(id, serde_json::json!({ "tools": tools }))
    }

    async fn handle_tools_call(
        &self,
        id: RequestId,
        params: Option<serde_json::Value>,
    ) -> McpResponse {
        let params = match params {
            Some(p) => p,
            None => return McpResponse::error(id, McpError::invalid_params("Missing params")),
        };

        let call: ToolCall = match serde_json::from_value(params) {
            Ok(c) => c,
            Err(e) => return McpResponse::error(id, McpError::invalid_params(e.to_string())),
        };

        // Create empty context (in real use, this would come from auth)
        let context = ToolContext::empty();

        match self.call_tool(&call.name, call.arguments, &context).await {
            Ok(result) => McpResponse::success(id, serde_json::to_value(result).unwrap()),
            Err(e) => McpResponse::error(id, McpError::internal_error(e.to_string())),
        }
    }

    async fn handle_resources_list(&self, id: RequestId) -> McpResponse {
        let resources = self.list_resources().await;
        McpResponse::success(id, serde_json::json!({ "resources": resources }))
    }

    async fn handle_resources_read(
        &self,
        id: RequestId,
        params: Option<serde_json::Value>,
    ) -> McpResponse {
        let _params = match params {
            Some(p) => p,
            None => return McpResponse::error(id, McpError::invalid_params("Missing params")),
        };

        // Resource reading would be implemented per-resource
        McpResponse::error(id, McpError::internal_error("Not implemented"))
    }

    /// Get server info.
    pub fn info(&self) -> &ServerInfo {
        &self.info
    }

    /// Get server capabilities.
    pub fn capabilities(&self) -> &ServerCapabilities {
        &self.capabilities
    }
}

/// Simple tool wrapper for function-based tools.
pub struct FunctionTool<F>
where
    F: Fn(serde_json::Value, &ToolContext) -> McpServerResult<ToolResult> + Send + Sync,
{
    definition: ToolDefinition,
    handler: F,
}

impl<F> FunctionTool<F>
where
    F: Fn(serde_json::Value, &ToolContext) -> McpServerResult<ToolResult> + Send + Sync,
{
    /// Create a new function-based tool.
    pub fn new(definition: ToolDefinition, handler: F) -> Self {
        Self {
            definition,
            handler,
        }
    }
}

#[async_trait]
impl<F> Tool for FunctionTool<F>
where
    F: Fn(serde_json::Value, &ToolContext) -> McpServerResult<ToolResult> + Send + Sync,
{
    fn definition(&self) -> ToolDefinition {
        self.definition.clone()
    }

    async fn execute(
        &self,
        args: serde_json::Value,
        context: &ToolContext,
    ) -> McpServerResult<ToolResult> {
        (self.handler)(args, context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestTool;

    #[async_trait]
    impl Tool for TestTool {
        fn definition(&self) -> ToolDefinition {
            ToolDefinition::new("test_tool", "A test tool")
                .with_app(App::Verity)
                .with_category("test")
        }

        async fn execute(
            &self,
            _args: serde_json::Value,
            _context: &ToolContext,
        ) -> McpServerResult<ToolResult> {
            Ok(ToolResult::text("Test result"))
        }
    }

    #[tokio::test]
    async fn test_server_creation() {
        let server = McpServer::platform();
        assert_eq!(server.info().name, "relay-platform-mcp");
    }

    #[tokio::test]
    async fn test_register_tool() {
        let server = McpServer::platform();
        server.register_tool(Arc::new(TestTool)).await;

        let tools = server.list_tools().await;
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "test_tool");
    }

    #[tokio::test]
    async fn test_call_tool() {
        let server = McpServer::platform();
        server.register_tool(Arc::new(TestTool)).await;

        let context = ToolContext::empty();
        let result = server
            .call_tool("test_tool", serde_json::json!({}), &context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(!result.is_error);
    }

    #[tokio::test]
    async fn test_list_by_app() {
        let server = McpServer::platform();
        server.register_tool(Arc::new(TestTool)).await;

        let verity_tools = server.list_tools_by_app(App::Verity).await;
        assert_eq!(verity_tools.len(), 1);

        let noteman_tools = server.list_tools_by_app(App::NoteMan).await;
        assert_eq!(noteman_tools.len(), 0);
    }

    #[tokio::test]
    async fn test_handle_request() {
        let server = McpServer::platform();

        let req = McpRequest::new("1", "initialize");
        let resp = server.handle_request(req).await;

        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }
}
