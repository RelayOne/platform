//! Cross-app MCP tools
//!
//! This module provides pre-built tools for cross-app workflows.
//! Each tool category handles integration between specific apps.

pub mod verity;
pub mod noteman;
pub mod shipcheck;
pub mod workflow;

pub use verity::*;
pub use noteman::*;
pub use shipcheck::*;
pub use workflow::*;

use crate::server::Tool;
use std::sync::Arc;

/// Get all available MCP tools.
///
/// Returns a vector containing all implemented tools across all categories:
/// - NoteMan: Meeting transcription, summarization, and action items
/// - ShipCheck: Code analysis, verification, and security scanning
/// - Verity: Document verification, assertion extraction, and knowledge management
/// - Workflow: Cross-app orchestration tools
///
/// # Example
///
/// ```rust,no_run
/// use platform_mcp::tools::all_tools;
///
/// let tools = all_tools();
/// println!("Available tools: {}", tools.len());
/// ```
pub fn all_tools() -> Vec<Arc<dyn Tool>> {
    let mut tools = Vec::new();

    // NoteMan tools (4)
    tools.extend(noteman_tools());

    // ShipCheck tools (4)
    tools.extend(shipcheck_tools());

    // Verity tools (4)
    tools.extend(verity_tools());

    // Workflow tools (5)
    tools.extend(workflow_tools());

    tools
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_tools_count() {
        let tools = all_tools();
        // 4 NoteMan + 4 ShipCheck + 4 Verity + 5 Workflow = 17 tools
        assert_eq!(tools.len(), 17, "Expected 17 total tools");
    }

    #[test]
    fn test_all_tools_unique_names() {
        let tools = all_tools();
        let mut names = std::collections::HashSet::new();

        for tool in tools {
            let def = tool.definition();
            assert!(
                names.insert(def.name.clone()),
                "Duplicate tool name: {}",
                def.name
            );
        }
    }

    #[test]
    fn test_tool_categories() {
        let noteman = noteman_tools();
        let shipcheck = shipcheck_tools();
        let verity = verity_tools();
        let workflow = workflow_tools();

        assert_eq!(noteman.len(), 4, "Expected 4 NoteMan tools");
        assert_eq!(shipcheck.len(), 4, "Expected 4 ShipCheck tools");
        assert_eq!(verity.len(), 4, "Expected 4 Verity tools");
        assert_eq!(workflow.len(), 5, "Expected 5 Workflow tools");
    }
}
