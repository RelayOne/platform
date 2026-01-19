//! Service client modules for cross-app communication.
//!
//! This module provides HTTP clients for communicating with each Relay Platform app:
//! - NoteMan: Meeting transcription and intelligence service
//! - ShipCheck: Code analysis and verification service
//! - Verity: Content verification service
//!
//! Each client handles authentication, request signing, and error handling for
//! its respective service. The clients use shared configuration for service URLs.

pub mod config;
pub mod noteman;
pub mod shipcheck;
pub mod verity;

pub use config::ServiceConfig;
pub use noteman::NoteManClient;
pub use shipcheck::ShipCheckClient;
pub use verity::VerityClient;
