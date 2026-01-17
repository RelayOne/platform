//! ShipCheck service client.
//!
//! HTTP client for communicating with the ShipCheck code analysis service.
//! Provides methods for code analysis, PR verification, finding search,
//! and pipeline execution.

use super::config::ServiceEndpoint;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, error, instrument, warn};

/// ShipCheck client errors.
#[derive(Debug, Error)]
pub enum ShipCheckError {
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

    /// Repository not found.
    #[error("Repository not found: {0}")]
    RepositoryNotFound(String),

    /// Finding not found.
    #[error("Finding not found: {0}")]
    FindingNotFound(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,
}

/// ShipCheck service client.
///
/// Provides methods for interacting with the ShipCheck code analysis API.
#[derive(Clone)]
pub struct ShipCheckClient {
    /// HTTP client instance.
    client: Client,

    /// Service endpoint configuration.
    endpoint: ServiceEndpoint,

    /// Request timeout.
    timeout: Duration,
}

impl ShipCheckClient {
    /// Create a new ShipCheck client.
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

    /// Analyze code in a repository.
    ///
    /// Performs static analysis on code to find bugs, security issues, and style problems.
    #[instrument(skip(self), fields(repository_id = %params.repository_id))]
    pub async fn analyze_code(
        &self,
        params: AnalyzeCodeParams,
    ) -> Result<AnalyzeCodeResponse, ShipCheckError> {
        debug!("Starting code analysis for repository {}", params.repository_id);

        let url = self.endpoint.url("/api/v1/analyze");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Verify a pull request.
    ///
    /// Analyzes a PR for code quality, security, and compliance.
    #[instrument(skip(self), fields(repository_id = %params.repository_id, pr_number = %params.pr_number))]
    pub async fn verify_pr(
        &self,
        params: VerifyPRParams,
    ) -> Result<VerifyPRResponse, ShipCheckError> {
        debug!(
            "Verifying PR #{} in repository {}",
            params.pr_number, params.repository_id
        );

        let url = self.endpoint.url("/api/v1/verify-pr");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Search code analysis findings.
    ///
    /// Searches through code analysis findings across repositories.
    #[instrument(skip(self), fields(query = %params.query))]
    pub async fn search_findings(
        &self,
        params: SearchFindingsParams,
    ) -> Result<SearchFindingsResponse, ShipCheckError> {
        debug!("Searching findings with query: {}", params.query);

        let url = self.endpoint.url("/api/v1/findings/search");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Run a verification pipeline.
    ///
    /// Triggers a full verification pipeline on a repository or branch.
    #[instrument(skip(self), fields(repository_id = %params.repository_id))]
    pub async fn run_pipeline(
        &self,
        params: RunPipelineParams,
    ) -> Result<RunPipelineResponse, ShipCheckError> {
        debug!("Running pipeline for repository {}", params.repository_id);

        let url = self.endpoint.url("/api/v1/pipelines/run");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get repository details.
    ///
    /// Retrieves repository information including analysis status.
    #[instrument(skip(self), fields(repository_id = %repository_id))]
    pub async fn get_repository(
        &self,
        repository_id: &str,
    ) -> Result<Repository, ShipCheckError> {
        debug!("Fetching repository {}", repository_id);

        let url = self.endpoint.url(&format!("/api/v1/repositories/{}", repository_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(ShipCheckError::RepositoryNotFound(repository_id.to_string()));
        }

        self.handle_response(response).await
    }

    /// Get finding details.
    ///
    /// Retrieves full details for a specific code finding.
    #[instrument(skip(self), fields(finding_id = %finding_id))]
    pub async fn get_finding(&self, finding_id: &str) -> Result<Finding, ShipCheckError> {
        debug!("Fetching finding {}", finding_id);

        let url = self.endpoint.url(&format!("/api/v1/findings/{}", finding_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(ShipCheckError::FindingNotFound(finding_id.to_string()));
        }

        self.handle_response(response).await
    }

    /// Get repository documentation.
    ///
    /// Retrieves documentation files from a repository for verification.
    #[instrument(skip(self), fields(repository_id = %repository_id))]
    pub async fn get_repository_docs(
        &self,
        repository_id: &str,
        paths: &[String],
    ) -> Result<RepositoryDocs, ShipCheckError> {
        debug!("Fetching documentation for repository {}", repository_id);

        let url = self.endpoint.url(&format!("/api/v1/repositories/{}/docs", repository_id));
        let mut request = self.client.post(&url).json(&serde_json::json!({
            "paths": paths
        }));

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Link a decision to a repository.
    ///
    /// Creates a link between a decision and repository files.
    #[instrument(skip(self), fields(repository_id = %params.repository_id))]
    pub async fn link_decision(
        &self,
        params: LinkDecisionParams,
    ) -> Result<LinkDecisionResponse, ShipCheckError> {
        debug!("Linking decision to repository {}", params.repository_id);

        let url = self.endpoint.url("/api/v1/decisions/link");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Sync action items to repository tasks.
    ///
    /// Creates tasks in the repository from action items.
    #[instrument(skip(self), fields(repository_id = %params.repository_id))]
    pub async fn sync_tasks(
        &self,
        params: SyncTasksParams,
    ) -> Result<SyncTasksResponse, ShipCheckError> {
        debug!("Syncing tasks to repository {}", params.repository_id);

        let url = self.endpoint.url("/api/v1/tasks/sync");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Handle API response and parse JSON.
    async fn handle_response<T>(&self, response: reqwest::Response) -> Result<T, ShipCheckError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let status = response.status();

        if status == reqwest::StatusCode::UNAUTHORIZED {
            error!("ShipCheck authentication failed");
            return Err(ShipCheckError::AuthenticationFailed);
        }

        if !status.is_success() {
            let message = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            warn!("ShipCheck API error ({}): {}", status.as_u16(), message);
            return Err(ShipCheckError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        response
            .json()
            .await
            .map_err(|e| ShipCheckError::InvalidResponse(e.to_string()))
    }
}

/// Parameters for code analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeCodeParams {
    /// Repository ID to analyze.
    pub repository_id: String,

    /// Path within the repository to analyze.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,

    /// Specific commit SHA to analyze.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,

    /// Types of checks to run.
    #[serde(default = "default_checks")]
    pub checks: Vec<String>,
}

/// Response from code analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeCodeResponse {
    /// Repository ID.
    pub repository_id: String,

    /// Analysis job ID.
    pub job_id: String,

    /// Current status.
    pub status: String,

    /// Path analyzed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,

    /// Checks being run.
    pub checks: Vec<String>,

    /// Commit SHA analyzed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
}

/// Parameters for PR verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyPRParams {
    /// Repository ID.
    pub repository_id: String,

    /// Pull request number.
    pub pr_number: u32,

    /// Automatically approve if all checks pass.
    #[serde(default)]
    pub auto_approve: bool,

    /// Post inline comments on issues found.
    #[serde(default = "default_true")]
    pub post_comments: bool,
}

/// Response from PR verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyPRResponse {
    /// Repository ID.
    pub repository_id: String,

    /// Pull request number.
    pub pr_number: u32,

    /// Verification job ID.
    pub job_id: String,

    /// Current status.
    pub status: String,

    /// Whether auto-approve is enabled.
    pub auto_approve: bool,

    /// Initial findings count.
    #[serde(default)]
    pub findings_count: u32,
}

/// Parameters for searching findings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFindingsParams {
    /// Search query.
    pub query: String,

    /// Filter by repository.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository_id: Option<String>,

    /// Filter by severity levels.
    #[serde(default)]
    pub severity: Vec<String>,

    /// Filter by status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,

    /// Maximum results.
    #[serde(default = "default_limit")]
    pub limit: u32,
}

/// Response from findings search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFindingsResponse {
    /// Search query used.
    pub query: String,

    /// Total number of matching results.
    pub total_results: u32,

    /// Matching findings.
    pub findings: Vec<FindingSearchResult>,
}

/// A finding search result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindingSearchResult {
    /// Finding ID.
    pub id: String,

    /// Finding title.
    pub title: String,

    /// Severity level.
    pub severity: String,

    /// Repository ID.
    pub repository_id: String,

    /// File path.
    pub file_path: String,

    /// Line number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,

    /// Relevance score.
    pub score: f64,
}

/// Full finding details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    /// Finding ID.
    pub id: String,

    /// Finding title.
    pub title: String,

    /// Description.
    pub description: String,

    /// Severity level.
    pub severity: String,

    /// Repository ID.
    pub repository_id: String,

    /// File path.
    pub file_path: String,

    /// Line number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,

    /// Column number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,

    /// Code snippet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,

    /// Suggested fix.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,

    /// CWE ID for security findings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwe_id: Option<String>,

    /// Check type that found this.
    #[serde(default)]
    pub check_type: String,

    /// Current status.
    #[serde(default)]
    pub status: String,

    /// Creation timestamp.
    pub created_at: String,
}

/// Parameters for running a pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunPipelineParams {
    /// Repository ID.
    pub repository_id: String,

    /// Branch to run on.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,

    /// Pipeline type to run.
    #[serde(default = "default_pipeline")]
    pub pipeline: String,

    /// Send notification when complete.
    #[serde(default = "default_true")]
    pub notify_on_complete: bool,
}

/// Response from run pipeline request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunPipelineResponse {
    /// Repository ID.
    pub repository_id: String,

    /// Pipeline ID.
    pub pipeline_id: String,

    /// Current status.
    pub status: String,

    /// Branch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,

    /// Pipeline type.
    pub pipeline: String,
}

/// Repository details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    /// Repository ID.
    pub id: String,

    /// Repository name.
    pub name: String,

    /// Repository URL.
    pub url: String,

    /// Default branch.
    pub default_branch: String,

    /// Last analysis timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_analysis: Option<String>,

    /// Total findings count.
    #[serde(default)]
    pub findings_count: u32,

    /// Analysis status.
    pub status: String,
}

/// Repository documentation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryDocs {
    /// Repository ID.
    pub repository_id: String,

    /// Documentation files.
    pub files: Vec<DocumentationFile>,
}

/// A documentation file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentationFile {
    /// File path.
    pub path: String,

    /// File content.
    pub content: String,

    /// Last modified timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
}

/// Parameters for linking a decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkDecisionParams {
    /// Repository ID.
    pub repository_id: String,

    /// Decision ID from NoteMan.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision_id: Option<String>,

    /// Decision text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision_text: Option<String>,

    /// Meeting ID from NoteMan.
    pub meeting_id: String,

    /// Related files.
    #[serde(default)]
    pub files: Vec<String>,

    /// Create a tracking issue.
    #[serde(default)]
    pub create_issue: bool,

    /// Labels for the issue.
    #[serde(default)]
    pub labels: Vec<String>,
}

/// Response from link decision request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkDecisionResponse {
    /// Link ID.
    pub link_id: String,

    /// Status.
    pub status: String,

    /// Issue number if created.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issue_number: Option<u32>,

    /// Message.
    pub message: String,
}

/// Parameters for syncing tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncTasksParams {
    /// Repository ID.
    pub repository_id: String,

    /// Meeting ID from NoteMan.
    pub meeting_id: String,

    /// Action items to sync.
    pub action_items: Vec<ActionItemSync>,

    /// Create GitHub issues.
    #[serde(default = "default_true")]
    pub create_issues: bool,

    /// Auto-link to related PRs.
    #[serde(default = "default_true")]
    pub link_to_prs: bool,

    /// Default labels for issues.
    #[serde(default)]
    pub default_labels: Vec<String>,
}

/// An action item for syncing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItemSync {
    /// Action item ID.
    pub id: String,

    /// Description.
    pub description: String,

    /// Assignee.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,

    /// Due date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
}

/// Response from sync tasks request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncTasksResponse {
    /// Number of items synced.
    pub items_synced: u32,

    /// Number of issues created.
    pub issues_created: u32,

    /// Created issue numbers.
    #[serde(default)]
    pub issue_numbers: Vec<u32>,

    /// Status.
    pub status: String,

    /// Message.
    pub message: String,
}

fn default_checks() -> Vec<String> {
    vec!["security".to_string(), "bugs".to_string()]
}

fn default_true() -> bool {
    true
}

fn default_limit() -> u32 {
    50
}

fn default_pipeline() -> String {
    "full".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_params_defaults() {
        let params = AnalyzeCodeParams {
            repository_id: "test".to_string(),
            path: None,
            commit: None,
            checks: default_checks(),
        };
        assert_eq!(params.checks, vec!["security", "bugs"]);
    }

    #[test]
    fn test_client_creation() {
        let endpoint = ServiceEndpoint {
            base_url: "http://localhost:8080".to_string(),
            api_key: Some("test-key".to_string()),
            webhook_secret: None,
        };
        let client = ShipCheckClient::new(endpoint, Duration::from_secs(30));
        assert!(client.endpoint.has_auth());
    }
}
