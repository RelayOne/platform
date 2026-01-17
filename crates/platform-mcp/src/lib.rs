//! # Platform MCP
//!
//! This crate provides a unified MCP (Model Context Protocol) server for the Relay platform,
//! aggregating tools from Verity, NoteMan, and ShipCheck applications.
//!
//! ## Overview
//!
//! The platform-mcp crate handles:
//! - **Tools**: Tool definitions and execution from all apps
//! - **Resources**: Resource access and subscriptions
//! - **JSON-RPC**: MCP protocol implementation
//! - **Permissions**: Permission-aware tool execution
//! - **Clients**: HTTP clients for cross-app communication
//!
//! ## MCP Protocol
//!
//! This implementation follows the Model Context Protocol specification,
//! enabling AI assistants like Claude to interact with platform tools.
//!
//! Supported methods:
//! - `initialize`: Initialize the MCP session
//! - `tools/list`: List available tools
//! - `tools/call`: Execute a tool
//! - `resources/list`: List available resources
//! - `resources/read`: Read a resource
//!
//! ## Available Tools
//!
//! ### Verity Tools (Content Verification)
//! - `verify_document`: Verify document assertions
//! - `extract_assertions`: Extract assertions from content
//! - `search_knowledge`: Search the knowledge base
//! - `check_propagation`: Check assertion propagation
//!
//! ### NoteMan Tools (Meeting Intelligence)
//! - `transcribe_meeting`: Transcribe a meeting
//! - `summarize_meeting`: Generate meeting summary
//! - `extract_action_items`: Extract action items
//! - `search_meetings`: Search past meetings
//!
//! ### ShipCheck Tools (Code Verification)
//! - `analyze_code`: Analyze code for issues
//! - `verify_pr`: Verify a pull request
//! - `search_findings`: Search code findings
//! - `run_pipeline`: Run verification pipeline
//!
//! ### Cross-App Workflow Tools
//! - `verify_meeting_notes`: Verify meeting notes (NoteMan→Verity)
//! - `link_code_decision`: Link code to meeting decision (NoteMan→ShipCheck)
//! - `verify_documentation`: Verify repo documentation (ShipCheck→Verity)
//! - `create_finding_discussion`: Create discussion from finding (ShipCheck→NoteMan)
//! - `sync_action_items`: Sync action items to tasks (NoteMan→ShipCheck)
//!
//! ## Service Clients
//!
//! The crate provides HTTP clients for cross-app communication:
//! - `NoteManClient`: Meeting transcription and intelligence
//! - `ShipCheckClient`: Code analysis and verification
//! - `VerityClient`: Content verification
//!
//! ## Usage
//!
//! ### Creating an MCP Server
//!
//! ```rust,no_run
//! use platform_mcp::{McpServer, Tool, ToolDefinition, ToolResult, ToolContext};
//! use platform_rbac::App;
//! use async_trait::async_trait;
//! use std::sync::Arc;
//!
//! struct MyTool;
//!
//! #[async_trait]
//! impl Tool for MyTool {
//!     fn definition(&self) -> ToolDefinition {
//!         ToolDefinition::new("my_tool", "Does something useful")
//!             .with_app(App::Verity)
//!     }
//!
//!     async fn execute(
//!         &self,
//!         args: serde_json::Value,
//!         context: &ToolContext,
//!     ) -> Result<ToolResult, platform_mcp::McpServerError> {
//!         Ok(ToolResult::text("Done!"))
//!     }
//! }
//!
//! async fn setup() {
//!     let server = McpServer::platform();
//!     server.register_tool(Arc::new(MyTool)).await;
//!
//!     let tools = server.list_tools().await;
//!     println!("Registered {} tools", tools.len());
//! }
//! ```
//!
//! ### Handling MCP Requests
//!
//! ```rust,no_run
//! use platform_mcp::{McpServer, McpRequest};
//!
//! async fn handle(server: &McpServer, json: &str) {
//!     let request: McpRequest = serde_json::from_str(json).unwrap();
//!     let response = server.handle_request(request).await;
//!     println!("{}", serde_json::to_string(&response).unwrap());
//! }
//! ```
//!
//! ## Tool Categories
//!
//! Tools are organized into categories:
//! - `verification`: Document and code verification
//! - `extraction`: Content extraction (assertions, action items)
//! - `analysis`: Analysis tools (code, documents)
//! - `search`: Search tools (knowledge, meetings, findings)
//! - `workflow`: Cross-app workflow tools
//! - `pipeline`: Automated pipeline tools

pub mod clients;
pub mod health;
pub mod retry;
pub mod server;
pub mod tools;
pub mod types;

// Re-export main types
pub use retry::{with_retry, with_retry_if, RetryConfig};
pub use server::{FunctionTool, McpServer, McpServerError, McpServerResult, Tool, ToolContext};
pub use types::{
    ContentBlock, McpError, McpRequest, McpResponse, PromptCapabilities, RequestId,
    ResourceCapabilities, ResourceDefinition, ServerCapabilities, ServerInfo, ToolCall,
    ToolCapabilities, ToolDefinition, ToolResult,
};

// Re-export tool collections
pub use tools::{
    noteman_tools, shipcheck_tools, verity_tools, workflow_tools,
};

// Re-export service clients
pub use clients::{
    NoteManClient, ShipCheckClient, VerityClient, ServiceConfig,
};

// Re-export health check types
pub use health::{
    HealthChecker, HealthReport, HealthStatus, ServiceHealth, ServiceStatus,
    IntegrationMetrics, MetricsCollector, LivenessResult, ReadinessResult,
};
