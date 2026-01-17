//! Verity service client.
//!
//! HTTP client for communicating with the Verity content verification service.
//! Provides methods for document verification, assertion extraction,
//! knowledge base search, and propagation analysis.

use super::config::ServiceEndpoint;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, error, instrument, warn};

/// Verity client errors.
#[derive(Debug, Error)]
pub enum VerityError {
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

    /// Document not found.
    #[error("Document not found: {0}")]
    DocumentNotFound(String),

    /// Assertion not found.
    #[error("Assertion not found: {0}")]
    AssertionNotFound(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,
}

/// Verity service client.
///
/// Provides methods for interacting with the Verity content verification API.
#[derive(Clone)]
pub struct VerityClient {
    /// HTTP client instance.
    client: Client,

    /// Service endpoint configuration.
    endpoint: ServiceEndpoint,

    /// Request timeout.
    timeout: Duration,
}

impl VerityClient {
    /// Create a new Verity client.
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

    /// Verify a document.
    ///
    /// Analyzes a document and verifies all factual claims against trusted sources.
    #[instrument(skip(self), fields(document_id = %params.document_id))]
    pub async fn verify_document(
        &self,
        params: VerifyDocumentParams,
    ) -> Result<VerifyDocumentResponse, VerityError> {
        debug!("Starting verification for document {}", params.document_id);

        let url = self.endpoint.url("/api/v1/documents/verify");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Extract assertions from content.
    ///
    /// Analyzes text content and extracts factual claims that can be verified.
    #[instrument(skip(self, params))]
    pub async fn extract_assertions(
        &self,
        params: ExtractAssertionsParams,
    ) -> Result<ExtractAssertionsResponse, VerityError> {
        debug!("Extracting assertions from content");

        let url = self.endpoint.url("/api/v1/assertions/extract");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Search the knowledge base.
    ///
    /// Searches for verified facts and sources in the knowledge base.
    #[instrument(skip(self), fields(query = %params.query))]
    pub async fn search_knowledge(
        &self,
        params: SearchKnowledgeParams,
    ) -> Result<SearchKnowledgeResponse, VerityError> {
        debug!("Searching knowledge base with query: {}", params.query);

        let url = self.endpoint.url("/api/v1/knowledge/search");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Check assertion propagation.
    ///
    /// Analyzes how an assertion or correction propagates through related documents.
    #[instrument(skip(self), fields(assertion_id = %params.assertion_id))]
    pub async fn check_propagation(
        &self,
        params: CheckPropagationParams,
    ) -> Result<CheckPropagationResponse, VerityError> {
        debug!("Checking propagation for assertion {}", params.assertion_id);

        let url = self.endpoint.url("/api/v1/propagation/check");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get document details.
    ///
    /// Retrieves full document information including verification status.
    #[instrument(skip(self), fields(document_id = %document_id))]
    pub async fn get_document(&self, document_id: &str) -> Result<Document, VerityError> {
        debug!("Fetching document {}", document_id);

        let url = self.endpoint.url(&format!("/api/v1/documents/{}", document_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(VerityError::DocumentNotFound(document_id.to_string()));
        }

        self.handle_response(response).await
    }

    /// Create a document from external content.
    ///
    /// Creates a new document in Verity from external content (e.g., meeting notes).
    #[instrument(skip(self, params))]
    pub async fn create_document(
        &self,
        params: CreateDocumentParams,
    ) -> Result<CreateDocumentResponse, VerityError> {
        debug!("Creating document: {}", params.title);

        let url = self.endpoint.url("/api/v1/documents");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Verify content directly.
    ///
    /// Verifies content without creating a permanent document.
    #[instrument(skip(self, params))]
    pub async fn verify_content(
        &self,
        params: VerifyContentParams,
    ) -> Result<VerifyContentResponse, VerityError> {
        debug!("Verifying content with level: {}", params.verification_level);

        let url = self.endpoint.url("/api/v1/verify");
        let mut request = self.client.post(&url).json(&params);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    /// Get assertion details.
    ///
    /// Retrieves full details for a specific assertion.
    #[instrument(skip(self), fields(assertion_id = %assertion_id))]
    pub async fn get_assertion(&self, assertion_id: &str) -> Result<Assertion, VerityError> {
        debug!("Fetching assertion {}", assertion_id);

        let url = self.endpoint.url(&format!("/api/v1/assertions/{}", assertion_id));
        let mut request = self.client.get(&url);

        if let Some(ref api_key) = self.endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        let response = request.send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(VerityError::AssertionNotFound(assertion_id.to_string()));
        }

        self.handle_response(response).await
    }

    /// Handle API response and parse JSON.
    async fn handle_response<T>(&self, response: reqwest::Response) -> Result<T, VerityError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let status = response.status();

        if status == reqwest::StatusCode::UNAUTHORIZED {
            error!("Verity authentication failed");
            return Err(VerityError::AuthenticationFailed);
        }

        if !status.is_success() {
            let message = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            warn!("Verity API error ({}): {}", status.as_u16(), message);
            return Err(VerityError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        response
            .json()
            .await
            .map_err(|e| VerityError::InvalidResponse(e.to_string()))
    }
}

/// Parameters for document verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyDocumentParams {
    /// Document ID to verify.
    pub document_id: String,

    /// Whether to perform thorough verification.
    #[serde(default)]
    pub thorough: bool,
}

/// Response from document verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyDocumentResponse {
    /// Document ID.
    pub document_id: String,

    /// Verification job ID.
    pub job_id: String,

    /// Current status.
    pub status: String,

    /// Estimated time in seconds.
    pub estimated_time_seconds: u32,

    /// Message.
    pub message: String,
}

/// Parameters for assertion extraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractAssertionsParams {
    /// Content to analyze.
    pub content: String,

    /// Optional document ID to associate assertions with.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,

    /// Categories to focus on.
    #[serde(default)]
    pub categories: Vec<String>,
}

/// Response from assertion extraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractAssertionsResponse {
    /// Status.
    pub status: String,

    /// Number of assertions extracted.
    pub assertion_count: u32,

    /// Message.
    pub message: String,

    /// Extracted assertions.
    pub assertions: Vec<Assertion>,
}

/// An assertion (factual claim).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assertion {
    /// Assertion ID.
    pub id: String,

    /// The assertion text.
    pub text: String,

    /// Category.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,

    /// Confidence score.
    #[serde(default)]
    pub confidence: f64,

    /// Verification status.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_status: Option<String>,

    /// Supporting sources.
    #[serde(default)]
    pub sources: Vec<String>,

    /// Associated document ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
}

/// Parameters for knowledge search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchKnowledgeParams {
    /// Search query.
    pub query: String,

    /// Maximum results.
    #[serde(default = "default_limit")]
    pub limit: u32,

    /// Search filters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filters: Option<SearchFilters>,
}

/// Search filters for knowledge search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilters {
    /// Source types to include.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_types: Option<Vec<String>>,

    /// Minimum confidence score.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_confidence: Option<f64>,

    /// Date range.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_range: Option<DateRange>,
}

/// Date range for filtering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    /// Start date (ISO 8601).
    pub start: String,

    /// End date (ISO 8601).
    pub end: String,
}

/// Response from knowledge search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchKnowledgeResponse {
    /// Search query used.
    pub query: String,

    /// Total number of results.
    pub total_results: u32,

    /// Search results.
    pub results: Vec<KnowledgeResult>,
}

/// A knowledge search result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeResult {
    /// Result ID.
    pub id: String,

    /// Fact text.
    pub fact: String,

    /// Confidence score.
    pub confidence: f64,

    /// Source.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,

    /// Relevance score.
    pub relevance: f64,

    /// Last verified timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_verified: Option<String>,
}

/// Parameters for propagation check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckPropagationParams {
    /// Assertion ID to trace.
    pub assertion_id: String,

    /// How many levels of references to follow.
    #[serde(default = "default_depth")]
    pub depth: u32,
}

/// Response from propagation check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckPropagationResponse {
    /// Assertion ID.
    pub assertion_id: String,

    /// Propagation depth analyzed.
    pub propagation_depth: u32,

    /// Affected documents.
    pub affected_documents: Vec<AffectedDocument>,

    /// Overall impact score.
    pub impact_score: f64,
}

/// A document affected by assertion propagation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AffectedDocument {
    /// Document ID.
    pub id: String,

    /// Document title.
    pub title: String,

    /// How the document is affected.
    pub impact_type: String,

    /// Distance from original assertion.
    pub distance: u32,
}

/// Full document details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Document ID.
    pub id: String,

    /// Document title.
    pub title: String,

    /// Document content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,

    /// Verification status.
    pub status: String,

    /// Creation timestamp.
    pub created_at: String,

    /// Last verification timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_verified: Option<String>,

    /// Number of assertions.
    #[serde(default)]
    pub assertion_count: u32,

    /// Source application.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,

    /// External reference ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
}

/// Parameters for creating a document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDocumentParams {
    /// Document title.
    pub title: String,

    /// Document content.
    pub content: String,

    /// Source application.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,

    /// External reference ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,

    /// Whether to auto-verify on creation.
    #[serde(default)]
    pub auto_verify: bool,

    /// Verification level if auto-verifying.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_level: Option<String>,

    /// Additional metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Response from create document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDocumentResponse {
    /// Document ID.
    pub document_id: String,

    /// Status.
    pub status: String,

    /// Verification job ID if auto-verifying.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_id: Option<String>,

    /// Message.
    pub message: String,
}

/// Parameters for direct content verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyContentParams {
    /// Content to verify.
    pub content: String,

    /// Verification level: "quick", "standard", or "thorough".
    #[serde(default = "default_verification_level")]
    pub verification_level: String,

    /// Categories to focus on.
    #[serde(default)]
    pub categories: Vec<String>,

    /// Source application making the request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,

    /// External reference ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
}

/// Response from content verification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyContentResponse {
    /// Verification ID.
    pub verification_id: String,

    /// Status.
    pub status: String,

    /// Assertions found.
    pub assertions_found: u32,

    /// Assertions verified.
    pub assertions_verified: u32,

    /// Issues found.
    #[serde(default)]
    pub issues: Vec<VerificationIssue>,

    /// Overall confidence score.
    #[serde(default)]
    pub confidence: f64,
}

/// A verification issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationIssue {
    /// Issue ID.
    pub id: String,

    /// Issue type.
    pub issue_type: String,

    /// The problematic assertion.
    pub assertion: String,

    /// Issue description.
    pub description: String,

    /// Severity.
    pub severity: String,

    /// Suggested correction.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

fn default_limit() -> u32 {
    10
}

fn default_depth() -> u32 {
    2
}

fn default_verification_level() -> String {
    "standard".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_params_defaults() {
        let params = VerifyDocumentParams {
            document_id: "test".to_string(),
            thorough: false,
        };
        assert!(!params.thorough);
    }

    #[test]
    fn test_client_creation() {
        let endpoint = ServiceEndpoint {
            base_url: "http://localhost:3000".to_string(),
            api_key: Some("test-key".to_string()),
            webhook_secret: None,
        };
        let client = VerityClient::new(endpoint, Duration::from_secs(30));
        assert!(client.endpoint.has_auth());
    }

    #[test]
    fn test_search_filters() {
        let filters = SearchFilters {
            source_types: Some(vec!["academic".to_string()]),
            min_confidence: Some(0.8),
            date_range: None,
        };
        assert_eq!(filters.min_confidence, Some(0.8));
    }
}
