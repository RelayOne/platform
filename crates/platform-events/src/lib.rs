//! # Platform Events
//!
//! This crate provides a cross-app event bus for the Relay platform,
//! enabling communication between Verity, NoteMan, and ShipCheck applications.
//!
//! ## Overview
//!
//! The platform-events crate handles:
//! - **Event Types**: Strongly-typed events for each application
//! - **Event Bus**: Publish/subscribe messaging
//! - **Cross-App Events**: Events for workflows spanning multiple apps
//! - **Event Handlers**: Async event processing
//!
//! ## Features
//!
//! - `memory` (default): In-memory event bus for single-process apps
//! - `redis`: Redis-backed event bus for distributed systems
//! - `nats`: NATS-backed event bus for high-throughput systems
//!
//! ## Event Types
//!
//! ### Verity Events
//! - `DocumentEvent`: Document lifecycle and verification
//! - `AssertionEvent`: Assertion extraction and verification
//!
//! ### NoteMan Events
//! - `MeetingEvent`: Meeting lifecycle and transcription
//!
//! ### ShipCheck Events
//! - `RepositoryEvent`: Repository and code analysis
//!
//! ### Cross-App Events
//! - `CrossAppEvent`: Events for cross-app workflows
//!
//! ## Usage
//!
//! ### Publishing Events
//!
//! ```rust,no_run
//! use platform_events::{Event, EventBus, MemoryEventBus, DocumentEvent};
//! use platform_rbac::App;
//! use uuid::Uuid;
//!
//! async fn publish_example() {
//!     let bus = MemoryEventBus::new();
//!
//!     // Create a typed event
//!     let doc_event = DocumentEvent::Created {
//!         document_id: Uuid::now_v7(),
//!         title: "My Document".to_string(),
//!         source_type: "upload".to_string(),
//!     };
//!
//!     // Publish
//!     bus.publish(doc_event.to_event()).await.unwrap();
//! }
//! ```
//!
//! ### Subscribing to Events
//!
//! ```rust,no_run
//! use platform_events::{EventBus, MemoryEventBus};
//!
//! async fn subscribe_example() {
//!     let bus = MemoryEventBus::new();
//!
//!     // Subscribe to all Verity document events
//!     let mut sub = bus.subscribe("verity.document.*").await.unwrap();
//!
//!     // Or subscribe to all events from any app
//!     let mut all_sub = bus.subscribe("#").await.unwrap();
//!
//!     // Receive events
//!     while let Ok(event) = sub.recv().await {
//!         println!("Received: {}", event.event_type);
//!     }
//! }
//! ```
//!
//! ## Topic Patterns
//!
//! Topics are structured as `{app}.{event_type}`:
//! - `verity.document.created` - Specific event
//! - `verity.document.*` - All document events from Verity
//! - `*.document.#` - All document events from any app
//! - `#` - All events
//!
//! Wildcards:
//! - `*` matches exactly one segment
//! - `#` matches zero or more segments
//!
//! ## Cross-App Workflows
//!
//! Common cross-app workflows:
//!
//! 1. **Meeting Notes Verification** (NoteMan → Verity)
//!    - NoteMan publishes `MeetingNotesForVerification`
//!    - Verity subscribes and processes
//!    - Verity publishes `MeetingNotesVerified`
//!
//! 2. **Code Decision Tracking** (NoteMan → ShipCheck)
//!    - NoteMan publishes `CodeDecisionTracked`
//!    - ShipCheck links to relevant repositories
//!
//! 3. **Documentation Verification** (ShipCheck → Verity)
//!    - ShipCheck publishes `DocumentationVerificationRequest`
//!    - Verity verifies repository documentation

pub mod bus;
pub mod types;

#[cfg(feature = "redis")]
pub mod redis;

// Re-export main types
pub use bus::{EventBus, EventBusError, EventBusResult, EventBusStats, EventHandler, MemoryEventBus, Subscription};
pub use types::{
    ActionItem, AssertionEvent, CrossAppEvent, DocumentEvent, Event, EventCategory, MeetingEvent,
    RepositoryEvent,
};

#[cfg(feature = "redis")]
pub use redis::RedisEventBus;
