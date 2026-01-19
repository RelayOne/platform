//! End-to-End tests for cross-app workflow MCP tools.
//!
//! These tests verify that the workflow tools correctly coordinate HTTP calls
//! between NoteMan, ShipCheck, and Verity services. We use wiremock to simulate
//! the service endpoints and verify the correct request/response sequences.
//!
//! Test workflows:
//! 1. verify_meeting_notes: NoteMan → Verity
//! 2. link_code_decision: NoteMan → ShipCheck
//! 3. verify_documentation: ShipCheck → Verity
//! 4. create_finding_discussion: ShipCheck → NoteMan
//! 5. sync_action_items: NoteMan → ShipCheck

use platform_mcp::clients::config::{ServiceConfig, ServiceEndpoint};
use platform_mcp::clients::noteman::NoteManClient;
use platform_mcp::clients::shipcheck::ShipCheckClient;
use platform_mcp::clients::verity::VerityClient;
use std::time::Duration;
use wiremock::matchers::{header, method, path, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// Test fixture providing mock servers for all platform services.
struct TestFixture {
    /// Mock NoteMan server.
    noteman_server: MockServer,
    /// Mock ShipCheck server.
    shipcheck_server: MockServer,
    /// Mock Verity server.
    verity_server: MockServer,
    /// Test service configuration.
    config: ServiceConfig,
}

impl TestFixture {
    /// Create a new test fixture with mock servers.
    async fn new() -> Self {
        let noteman_server = MockServer::start().await;
        let shipcheck_server = MockServer::start().await;
        let verity_server = MockServer::start().await;

        let config = ServiceConfig {
            noteman: ServiceEndpoint {
                base_url: noteman_server.uri(),
                api_key: Some("test-noteman-key".to_string()),
                webhook_secret: Some("test-noteman-secret".to_string()),
            },
            shipcheck: ServiceEndpoint {
                base_url: shipcheck_server.uri(),
                api_key: Some("test-shipcheck-key".to_string()),
                webhook_secret: Some("test-shipcheck-secret".to_string()),
            },
            verity: ServiceEndpoint {
                base_url: verity_server.uri(),
                api_key: Some("test-verity-key".to_string()),
                webhook_secret: Some("test-verity-secret".to_string()),
            },
            default_timeout_secs: 10,
            max_retries: 1,
            verify_tls: false,
        };

        Self {
            noteman_server,
            shipcheck_server,
            verity_server,
            config,
        }
    }

    /// Get a NoteMan client configured for the mock server.
    fn noteman_client(&self) -> NoteManClient {
        NoteManClient::new(self.config.noteman.clone(), self.config.timeout())
    }

    /// Get a ShipCheck client configured for the mock server.
    fn shipcheck_client(&self) -> ShipCheckClient {
        ShipCheckClient::new(self.config.shipcheck.clone(), self.config.timeout())
    }

    /// Get a Verity client configured for the mock server.
    fn verity_client(&self) -> VerityClient {
        VerityClient::new(self.config.verity.clone(), self.config.timeout())
    }
}

// =============================================================================
// Test 1: verify_meeting_notes (NoteMan → Verity)
// =============================================================================

/// Test the full workflow of verifying meeting notes.
///
/// Steps:
/// 1. Fetch meeting content from NoteMan
/// 2. Create document in Verity with auto-verify
/// 3. Return verification ID
#[tokio::test]
async fn test_verify_meeting_notes_workflow() {
    let fixture = TestFixture::new().await;

    // Mock NoteMan: GET /api/v1/meetings/{id}/content
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/meetings/.+/content"))
        .and(header("Authorization", "Bearer test-noteman-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "meeting_id": "mtg-123",
            "content_type": "summary",
            "content": "Key decisions from the meeting:\n1. We decided to use Rust for the backend.\n2. The deadline is January 15, 2026.\n3. Q4 revenue increased by 25%.",
            "metadata": {
                "participants": ["alice@example.com", "bob@example.com"],
                "duration_minutes": 45
            }
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Mock Verity: POST /api/v1/documents
    Mock::given(method("POST"))
        .and(path("/api/v1/documents"))
        .and(header("Authorization", "Bearer test-verity-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "document_id": "doc-456",
            "verification_id": "ver-789",
            "status": "verification_started",
            "message": "Document created and verification initiated"
        })))
        .expect(1)
        .mount(&fixture.verity_server)
        .await;

    // Execute: Fetch meeting content from NoteMan
    let noteman = fixture.noteman_client();
    let meeting_content = noteman
        .get_meeting_content("mtg-123", "summary")
        .await
        .expect("Should fetch meeting content");

    assert_eq!(meeting_content.meeting_id, "mtg-123");
    assert_eq!(meeting_content.content_type, "summary");
    assert!(meeting_content.content.contains("Rust for the backend"));

    // Execute: Create document in Verity (using verity client directly for test)
    let verity = fixture.verity_client();
    let create_response = verity
        .create_document(platform_mcp::clients::verity::CreateDocumentParams {
            title: format!("Meeting {} - summary", meeting_content.meeting_id),
            content: meeting_content.content,
            source_app: Some("noteman".to_string()),
            external_id: Some("mtg-123".to_string()),
            auto_verify: true,
            verification_level: Some("standard".to_string()),
            metadata: None,
        })
        .await
        .expect("Should create document in Verity");

    assert_eq!(create_response.document_id, "doc-456");
    assert_eq!(create_response.verification_id, Some("ver-789".to_string()));
}

/// Test meeting notes verification with missing meeting.
#[tokio::test]
async fn test_verify_meeting_notes_meeting_not_found() {
    let fixture = TestFixture::new().await;

    // Mock NoteMan: 404 Not Found
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/meetings/.+/content"))
        .respond_with(ResponseTemplate::new(404).set_body_json(serde_json::json!({
            "error": "Meeting not found",
            "meeting_id": "mtg-nonexistent"
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    let noteman = fixture.noteman_client();
    let result = noteman
        .get_meeting_content("mtg-nonexistent", "summary")
        .await;

    assert!(result.is_err());
}

// =============================================================================
// Test 2: link_code_decision (NoteMan → ShipCheck)
// =============================================================================

/// Test linking a meeting decision to a code repository.
///
/// Steps:
/// 1. Fetch decision from NoteMan
/// 2. Create decision link in ShipCheck
/// 3. Optionally create GitHub issue
#[tokio::test]
async fn test_link_code_decision_workflow() {
    let fixture = TestFixture::new().await;

    // Mock NoteMan: GET /api/v1/meetings/{id}/decisions
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/meetings/.+/decisions"))
        .and(header("Authorization", "Bearer test-noteman-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "decisions": [
                {
                    "id": "dec-001",
                    "text": "Use PostgreSQL for the new user service instead of MongoDB",
                    "meeting_id": "mtg-123",
                    "timestamp": "2026-01-10T14:30:00Z",
                    "participants": ["alice@example.com", "bob@example.com"],
                    "tags": ["architecture", "database"]
                },
                {
                    "id": "dec-002",
                    "text": "Implement rate limiting using Redis",
                    "meeting_id": "mtg-123",
                    "timestamp": "2026-01-10T14:45:00Z",
                    "participants": ["bob@example.com", "carol@example.com"],
                    "tags": ["architecture", "security"]
                }
            ]
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Mock ShipCheck: POST /api/v1/decisions/link
    Mock::given(method("POST"))
        .and(path("/api/v1/decisions/link"))
        .and(header("Authorization", "Bearer test-shipcheck-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "link_id": "link-123",
            "status": "linked",
            "issue_number": 42,
            "message": "Decision linked and GitHub issue created"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Execute: Fetch decisions from NoteMan
    let noteman = fixture.noteman_client();
    let decisions = noteman
        .get_meeting_decisions("mtg-123")
        .await
        .expect("Should fetch decisions");

    assert_eq!(decisions.len(), 2);
    assert_eq!(decisions[0].id, "dec-001");
    assert!(decisions[0].text.contains("PostgreSQL"));

    // Execute: Link decision in ShipCheck
    let shipcheck = fixture.shipcheck_client();
    let link_response = shipcheck
        .link_decision(platform_mcp::clients::shipcheck::LinkDecisionParams {
            repository_id: "repo-456".to_string(),
            decision_id: Some("dec-001".to_string()),
            decision_text: Some(decisions[0].text.clone()),
            meeting_id: "mtg-123".to_string(),
            files: vec!["src/db/mod.rs".to_string()],
            create_issue: true,
            labels: vec!["architecture".to_string()],
        })
        .await
        .expect("Should link decision");

    assert_eq!(link_response.link_id, "link-123");
    assert_eq!(link_response.issue_number, Some(42));
}

/// Test linking decision without creating GitHub issue.
#[tokio::test]
async fn test_link_code_decision_no_issue() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck: POST /api/v1/decisions/link (no issue)
    Mock::given(method("POST"))
        .and(path("/api/v1/decisions/link"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "link_id": "link-456",
            "status": "linked",
            "issue_number": null,
            "message": "Decision linked"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    let shipcheck = fixture.shipcheck_client();
    let link_response = shipcheck
        .link_decision(platform_mcp::clients::shipcheck::LinkDecisionParams {
            repository_id: "repo-789".to_string(),
            decision_id: None,
            decision_text: Some("Use async/await throughout the codebase".to_string()),
            meeting_id: "mtg-456".to_string(),
            files: vec![],
            create_issue: false,
            labels: vec![],
        })
        .await
        .expect("Should link decision without issue");

    assert_eq!(link_response.link_id, "link-456");
    assert!(link_response.issue_number.is_none());
}

// =============================================================================
// Test 3: verify_documentation (ShipCheck → Verity)
// =============================================================================

/// Test verifying repository documentation.
///
/// Steps:
/// 1. Fetch documentation from ShipCheck
/// 2. Create documents in Verity for each doc file
/// 3. Trigger verification
#[tokio::test]
async fn test_verify_documentation_workflow() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck: POST /api/v1/repositories/{id}/docs
    Mock::given(method("POST"))
        .and(path_regex(r"^/api/v1/repositories/.+/docs"))
        .and(header("Authorization", "Bearer test-shipcheck-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "repository_id": "repo-123",
            "files": [
                {
                    "path": "README.md",
                    "content": "# MyProject\n\nA Rust library for processing data.\n\n## Installation\n\n```bash\ncargo add myproject\n```\n\n## Usage\n\n```rust\nuse myproject::process;\nlet result = process(data);\n```",
                    "size_bytes": 256,
                    "last_modified": "2026-01-10T10:00:00Z"
                },
                {
                    "path": "docs/API.md",
                    "content": "# API Reference\n\n## process(data)\n\nProcesses the input data and returns a Result.",
                    "size_bytes": 128,
                    "last_modified": "2026-01-09T15:00:00Z"
                }
            ]
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Mock Verity: POST /api/v1/verify (called twice, once per doc)
    Mock::given(method("POST"))
        .and(path("/api/v1/verify"))
        .and(header("Authorization", "Bearer test-verity-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "verification_id": "ver-doc-001",
            "status": "verification_started",
            "assertions_found": 5,
            "assertions_verified": 0,
            "issues": [],
            "confidence": 0.0
        })))
        .expect(2)
        .mount(&fixture.verity_server)
        .await;

    // Execute: Fetch documentation from ShipCheck
    let shipcheck = fixture.shipcheck_client();
    let docs = shipcheck
        .get_repository_docs("repo-123", &["README.md".to_string(), "docs/".to_string()])
        .await
        .expect("Should fetch documentation");

    assert_eq!(docs.files.len(), 2);
    assert!(docs.files[0].content.contains("MyProject"));

    // Execute: Verify each document in Verity
    let verity = fixture.verity_client();
    let mut verification_ids = Vec::new();

    for doc_file in &docs.files {
        let verify_response = verity
            .verify_content(platform_mcp::clients::verity::VerifyContentParams {
                content: doc_file.content.clone(),
                verification_level: "standard".to_string(),
                categories: vec!["code_examples".to_string(), "api_documentation".to_string()],
                source_app: Some("shipcheck".to_string()),
                external_id: Some(format!("repo-123:{}", doc_file.path)),
            })
            .await
            .expect("Should verify content");

        verification_ids.push(verify_response.verification_id);
    }

    assert_eq!(verification_ids.len(), 2);
}

/// Test documentation verification when repository has no docs.
#[tokio::test]
async fn test_verify_documentation_empty_docs() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck: POST /api/v1/repositories/{id}/docs (empty)
    Mock::given(method("POST"))
        .and(path_regex(r"^/api/v1/repositories/.+/docs"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "repository_id": "repo-empty",
            "files": []
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    let shipcheck = fixture.shipcheck_client();
    let docs = shipcheck
        .get_repository_docs("repo-empty", &["README.md".to_string()])
        .await
        .expect("Should return empty docs");

    assert!(docs.files.is_empty());
}

// =============================================================================
// Test 4: create_finding_discussion (ShipCheck → NoteMan)
// =============================================================================

/// Test creating a discussion from a code finding.
///
/// Steps:
/// 1. Fetch finding from ShipCheck
/// 2. Create discussion in NoteMan
#[tokio::test]
async fn test_create_finding_discussion_workflow() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck: GET /api/v1/findings/{id}
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/findings/.+"))
        .and(header("Authorization", "Bearer test-shipcheck-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "finding-123",
            "title": "SQL Injection Vulnerability",
            "description": "User input is directly interpolated into SQL query without sanitization.",
            "severity": "critical",
            "repository_id": "repo-456",
            "file_path": "src/db/queries.rs",
            "line": 42,
            "snippet": "let query = format!(\"SELECT * FROM users WHERE id = {}\", user_input);",
            "suggestion": "Use parameterized queries: sqlx::query(\"SELECT * FROM users WHERE id = $1\").bind(user_input)",
            "cwe_id": "CWE-89",
            "created_at": "2026-01-10T08:00:00Z"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Mock NoteMan: POST /api/v1/discussions
    Mock::given(method("POST"))
        .and(path("/api/v1/discussions"))
        .and(header("Authorization", "Bearer test-noteman-key"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "discussion_id": "disc-789",
            "status": "created",
            "message": "Discussion created successfully"
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Execute: Fetch finding from ShipCheck
    let shipcheck = fixture.shipcheck_client();
    let finding = shipcheck
        .get_finding("finding-123")
        .await
        .expect("Should fetch finding");

    assert_eq!(finding.id, "finding-123");
    assert_eq!(finding.severity, "critical");
    assert_eq!(finding.file_path, "src/db/queries.rs");

    // Execute: Create discussion in NoteMan
    let noteman = fixture.noteman_client();
    let discussion_content = format!(
        "## Code Finding: {}\n\n**Severity:** {}\n**File:** {}:{}\n\n### Description\n{}\n\n### Suggested Fix\n{}",
        finding.title,
        finding.severity,
        finding.file_path,
        finding.line.unwrap_or(0),
        finding.description,
        finding.suggestion.as_deref().unwrap_or("N/A")
    );

    let discussion_response = noteman
        .create_discussion(platform_mcp::clients::noteman::CreateDiscussionParams {
            workspace_id: "ws-001".to_string(),
            title: format!("[CRITICAL] {}", finding.title),
            content: discussion_content,
            priority: "high".to_string(),
            assign_to: vec!["security-team@example.com".to_string()],
            meeting_id: None,
            metadata: Some(serde_json::json!({
                "finding_id": finding.id,
                "severity": finding.severity
            })),
        })
        .await
        .expect("Should create discussion");

    assert_eq!(discussion_response.discussion_id, "disc-789");
}

/// Test finding discussion with meeting agenda integration.
#[tokio::test]
async fn test_create_finding_discussion_with_meeting() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck finding
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/findings/.+"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "finding-456",
            "title": "Memory Leak in Connection Pool",
            "description": "Connections are not properly released back to the pool.",
            "severity": "high",
            "repository_id": "repo-789",
            "file_path": "src/pool.rs",
            "line": 128,
            "snippet": null,
            "suggestion": "Ensure Drop implementation releases connections",
            "cwe_id": null,
            "created_at": "2026-01-11T09:00:00Z"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Mock NoteMan discussion with meeting
    Mock::given(method("POST"))
        .and(path("/api/v1/discussions"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "discussion_id": "disc-agenda",
            "status": "created",
            "message": "Discussion created and added to meeting agenda"
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    let shipcheck = fixture.shipcheck_client();
    let finding = shipcheck.get_finding("finding-456").await.unwrap();

    let noteman = fixture.noteman_client();
    let response = noteman
        .create_discussion(platform_mcp::clients::noteman::CreateDiscussionParams {
            workspace_id: "ws-001".to_string(),
            title: format!("[HIGH] {}", finding.title),
            content: finding.description.clone(),
            priority: "high".to_string(),
            assign_to: vec![],
            meeting_id: Some("mtg-weekly".to_string()),
            metadata: None,
        })
        .await
        .expect("Should create discussion with meeting");

    assert_eq!(response.discussion_id, "disc-agenda");
}

// =============================================================================
// Test 5: sync_action_items (NoteMan → ShipCheck)
// =============================================================================

/// Test syncing action items from meeting to repository tasks.
///
/// Steps:
/// 1. Extract action items from NoteMan
/// 2. Sync to ShipCheck repository
/// 3. Create GitHub issues
#[tokio::test]
async fn test_sync_action_items_workflow() {
    let fixture = TestFixture::new().await;

    // Mock NoteMan: POST /api/v1/meetings/action-items
    Mock::given(method("POST"))
        .and(path("/api/v1/meetings/action-items"))
        .and(header("Authorization", "Bearer test-noteman-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "meeting_id": "mtg-sprint",
            "status": "extracted",
            "action_items": [
                {
                    "id": "ai-001",
                    "description": "Implement user authentication flow",
                    "assignee": "alice@example.com",
                    "due_date": "2026-01-15",
                    "priority": "high",
                    "completed": false
                },
                {
                    "id": "ai-002",
                    "description": "Write unit tests for payment module",
                    "assignee": "bob@example.com",
                    "due_date": "2026-01-18",
                    "priority": "medium",
                    "completed": false
                },
                {
                    "id": "ai-003",
                    "description": "Update API documentation",
                    "assignee": "carol@example.com",
                    "due_date": "2026-01-20",
                    "priority": "low",
                    "completed": false
                }
            ],
            "tasks_created": 0
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Mock ShipCheck: POST /api/v1/tasks/sync
    Mock::given(method("POST"))
        .and(path("/api/v1/tasks/sync"))
        .and(header("Authorization", "Bearer test-shipcheck-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "items_synced": 3,
            "issues_created": 3,
            "issue_numbers": [101, 102, 103],
            "status": "synced",
            "message": "3 action items synced, 3 GitHub issues created"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Execute: Extract action items from NoteMan
    let noteman = fixture.noteman_client();
    let extract_response = noteman
        .extract_action_items(platform_mcp::clients::noteman::ExtractActionItemsParams {
            meeting_id: "mtg-sprint".to_string(),
            auto_assign: true,
            create_tasks: false,
        })
        .await
        .expect("Should extract action items");

    assert_eq!(extract_response.action_items.len(), 3);
    assert_eq!(extract_response.action_items[0].id, "ai-001");

    // Execute: Sync to ShipCheck
    let shipcheck = fixture.shipcheck_client();
    let sync_response = shipcheck
        .sync_tasks(platform_mcp::clients::shipcheck::SyncTasksParams {
            repository_id: "repo-main".to_string(),
            meeting_id: "mtg-sprint".to_string(),
            action_items: extract_response
                .action_items
                .iter()
                .map(|item| platform_mcp::clients::shipcheck::ActionItemSync {
                    id: item.id.clone(),
                    description: item.description.clone(),
                    assignee: item.assignee.clone(),
                    due_date: item.due_date.clone(),
                })
                .collect(),
            create_issues: true,
            link_to_prs: true,
            default_labels: vec!["from-meeting".to_string()],
        })
        .await
        .expect("Should sync tasks");

    assert_eq!(sync_response.items_synced, 3);
    assert_eq!(sync_response.issues_created, 3);
    assert_eq!(sync_response.issue_numbers, vec![101, 102, 103]);
}

/// Test syncing specific action items only.
#[tokio::test]
async fn test_sync_action_items_selective() {
    let fixture = TestFixture::new().await;

    // Mock ShipCheck: POST /api/v1/tasks/sync (selective)
    Mock::given(method("POST"))
        .and(path("/api/v1/tasks/sync"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "items_synced": 1,
            "issues_created": 1,
            "issue_numbers": [105],
            "status": "synced",
            "message": "1 action item synced"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    let shipcheck = fixture.shipcheck_client();
    let sync_response = shipcheck
        .sync_tasks(platform_mcp::clients::shipcheck::SyncTasksParams {
            repository_id: "repo-main".to_string(),
            meeting_id: "mtg-review".to_string(),
            action_items: vec![platform_mcp::clients::shipcheck::ActionItemSync {
                id: "ai-specific".to_string(),
                description: "Fix critical bug in login".to_string(),
                assignee: Some("urgent@example.com".to_string()),
                due_date: Some("2026-01-12".to_string()),
            }],
            create_issues: true,
            link_to_prs: false,
            default_labels: vec!["urgent".to_string(), "bug".to_string()],
        })
        .await
        .expect("Should sync selective items");

    assert_eq!(sync_response.items_synced, 1);
}

/// Test syncing when no action items found.
#[tokio::test]
async fn test_sync_action_items_empty() {
    let fixture = TestFixture::new().await;

    // Mock NoteMan: POST /api/v1/meetings/action-items (empty)
    Mock::given(method("POST"))
        .and(path("/api/v1/meetings/action-items"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "meeting_id": "mtg-casual",
            "status": "extracted",
            "action_items": [],
            "tasks_created": 0
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    let noteman = fixture.noteman_client();
    let extract_response = noteman
        .extract_action_items(platform_mcp::clients::noteman::ExtractActionItemsParams {
            meeting_id: "mtg-casual".to_string(),
            auto_assign: false,
            create_tasks: false,
        })
        .await
        .expect("Should handle empty action items");

    assert!(extract_response.action_items.is_empty());
}

// =============================================================================
// Error handling tests
// =============================================================================

/// Test handling of service timeouts.
#[tokio::test]
async fn test_service_timeout_handling() {
    let fixture = TestFixture::new().await;

    // Mock with delay longer than timeout
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/meetings/.+"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(15)))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    let noteman = fixture.noteman_client();
    let result = noteman.get_meeting("mtg-timeout").await;

    assert!(result.is_err());
}

/// Test handling of authentication failures.
#[tokio::test]
async fn test_authentication_failure() {
    let fixture = TestFixture::new().await;

    // Mock 401 response
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/meetings/.+"))
        .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
            "error": "Invalid API key"
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    let noteman = fixture.noteman_client();
    let result = noteman.get_meeting("mtg-auth").await;

    assert!(result.is_err());
}

/// Test handling of server errors.
#[tokio::test]
async fn test_server_error_handling() {
    let fixture = TestFixture::new().await;

    // Mock 500 response
    Mock::given(method("POST"))
        .and(path("/api/v1/documents"))
        .respond_with(ResponseTemplate::new(500).set_body_json(serde_json::json!({
            "error": "Internal server error",
            "request_id": "req-123"
        })))
        .expect(1)
        .mount(&fixture.verity_server)
        .await;

    let verity = fixture.verity_client();
    let result = verity
        .create_document(platform_mcp::clients::verity::CreateDocumentParams {
            title: "Test".to_string(),
            content: "Content".to_string(),
            source_app: None,
            external_id: None,
            auto_verify: false,
            verification_level: None,
            metadata: None,
        })
        .await;

    assert!(result.is_err());
}

// =============================================================================
// Integration sequence tests
// =============================================================================

/// Test complete cross-app workflow sequence.
///
/// Simulates a real-world scenario:
/// 1. Meeting ends → extract action items
/// 2. Sync action items to repository
/// 3. Create discussion for a code finding
/// 4. Link decision back to the code
#[tokio::test]
async fn test_complete_cross_app_sequence() {
    let fixture = TestFixture::new().await;

    // Step 1: Mock NoteMan action items extraction
    Mock::given(method("POST"))
        .and(path("/api/v1/meetings/action-items"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "meeting_id": "mtg-sequence",
            "status": "extracted",
            "action_items": [{
                "id": "ai-seq-001",
                "description": "Fix security vulnerability",
                "assignee": "security@example.com",
                "due_date": "2026-01-14",
                "priority": "critical",
                "completed": false
            }],
            "tasks_created": 0
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Step 2: Mock ShipCheck task sync
    Mock::given(method("POST"))
        .and(path("/api/v1/tasks/sync"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "items_synced": 1,
            "issues_created": 1,
            "issue_numbers": [200],
            "status": "synced",
            "message": "Action items synced"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Step 3: Mock ShipCheck finding
    Mock::given(method("GET"))
        .and(path_regex(r"^/api/v1/findings/.+"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "id": "finding-seq",
            "title": "Related Security Issue",
            "description": "Found during investigation",
            "severity": "high",
            "repository_id": "repo-seq",
            "file_path": "src/auth.rs",
            "line": 50,
            "snippet": "// vulnerable code",
            "suggestion": "Use safe pattern",
            "cwe_id": "CWE-123",
            "created_at": "2026-01-11T10:00:00Z"
        })))
        .expect(1)
        .mount(&fixture.shipcheck_server)
        .await;

    // Step 4: Mock NoteMan discussion creation
    Mock::given(method("POST"))
        .and(path("/api/v1/discussions"))
        .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
            "discussion_id": "disc-seq",
            "status": "created",
            "message": "Discussion created"
        })))
        .expect(1)
        .mount(&fixture.noteman_server)
        .await;

    // Execute sequence
    let noteman = fixture.noteman_client();
    let shipcheck = fixture.shipcheck_client();

    // 1. Extract action items
    let action_items = noteman
        .extract_action_items(platform_mcp::clients::noteman::ExtractActionItemsParams {
            meeting_id: "mtg-sequence".to_string(),
            auto_assign: true,
            create_tasks: false,
        })
        .await
        .expect("Should extract action items");
    assert_eq!(action_items.action_items.len(), 1);

    // 2. Sync to ShipCheck
    let sync = shipcheck
        .sync_tasks(platform_mcp::clients::shipcheck::SyncTasksParams {
            repository_id: "repo-seq".to_string(),
            meeting_id: "mtg-sequence".to_string(),
            action_items: vec![platform_mcp::clients::shipcheck::ActionItemSync {
                id: action_items.action_items[0].id.clone(),
                description: action_items.action_items[0].description.clone(),
                assignee: action_items.action_items[0].assignee.clone(),
                due_date: action_items.action_items[0].due_date.clone(),
            }],
            create_issues: true,
            link_to_prs: false,
            default_labels: vec!["security".to_string()],
        })
        .await
        .expect("Should sync tasks");
    assert_eq!(sync.issues_created, 1);

    // 3. Get related finding
    let finding = shipcheck
        .get_finding("finding-seq")
        .await
        .expect("Should get finding");
    assert_eq!(finding.severity, "high");

    // 4. Create discussion
    let discussion = noteman
        .create_discussion(platform_mcp::clients::noteman::CreateDiscussionParams {
            workspace_id: "ws-security".to_string(),
            title: format!("[{}] {}", finding.severity.to_uppercase(), finding.title),
            content: finding.description,
            priority: "high".to_string(),
            assign_to: vec![],
            meeting_id: None,
            metadata: None,
        })
        .await
        .expect("Should create discussion");
    assert_eq!(discussion.discussion_id, "disc-seq");
}
