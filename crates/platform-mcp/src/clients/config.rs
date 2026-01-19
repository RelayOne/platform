//! Service configuration for cross-app clients.
//!
//! Provides centralized configuration for all platform service endpoints,
//! API keys, and timeout settings. Configuration is loaded from environment
//! variables with sensible defaults for local development.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

/// Configuration errors.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// Missing required environment variable.
    #[error("Missing required environment variable: {0}")]
    MissingEnvVar(String),

    /// Invalid configuration value.
    #[error("Invalid configuration value for {key}: {message}")]
    InvalidValue {
        /// Configuration key.
        key: String,
        /// Error message.
        message: String,
    },
}

/// Service configuration for all platform services.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceConfig {
    /// NoteMan API configuration.
    pub noteman: ServiceEndpoint,

    /// ShipCheck API configuration.
    pub shipcheck: ServiceEndpoint,

    /// Verity API configuration.
    pub verity: ServiceEndpoint,

    /// Default request timeout in seconds.
    pub default_timeout_secs: u64,

    /// Maximum retry attempts for failed requests.
    pub max_retries: u32,

    /// Whether to verify TLS certificates (disable only for testing).
    pub verify_tls: bool,
}

impl Default for ServiceConfig {
    /// Returns default configuration suitable for local development.
    fn default() -> Self {
        Self {
            noteman: ServiceEndpoint {
                base_url: "http://localhost:3001".to_string(),
                api_key: None,
                webhook_secret: None,
            },
            shipcheck: ServiceEndpoint {
                base_url: "http://localhost:8080".to_string(),
                api_key: None,
                webhook_secret: None,
            },
            verity: ServiceEndpoint {
                base_url: "http://localhost:3000".to_string(),
                api_key: None,
                webhook_secret: None,
            },
            default_timeout_secs: 30,
            max_retries: 3,
            verify_tls: true,
        }
    }
}

impl ServiceConfig {
    /// Load configuration from environment variables.
    ///
    /// Environment variables:
    /// - `NOTEMAN_API_URL`: NoteMan service URL (default: http://localhost:3001)
    /// - `NOTEMAN_API_KEY`: NoteMan service API key
    /// - `NOTEMAN_WEBHOOK_SECRET`: NoteMan webhook signing secret
    /// - `SHIPCHECK_API_URL`: ShipCheck service URL (default: http://localhost:8080)
    /// - `SHIPCHECK_API_KEY`: ShipCheck service API key
    /// - `SHIPCHECK_WEBHOOK_SECRET`: ShipCheck webhook signing secret
    /// - `VERITY_API_URL`: Verity service URL (default: http://localhost:3000)
    /// - `VERITY_API_KEY`: Verity service API key
    /// - `VERITY_WEBHOOK_SECRET`: Verity webhook signing secret
    /// - `SERVICE_TIMEOUT_SECS`: Request timeout in seconds (default: 30)
    /// - `SERVICE_MAX_RETRIES`: Maximum retry attempts (default: 3)
    /// - `SERVICE_VERIFY_TLS`: Whether to verify TLS (default: true)
    pub fn from_env() -> Self {
        let default = Self::default();

        Self {
            noteman: ServiceEndpoint {
                base_url: std::env::var("NOTEMAN_API_URL").unwrap_or(default.noteman.base_url),
                api_key: std::env::var("NOTEMAN_API_KEY").ok(),
                webhook_secret: std::env::var("NOTEMAN_WEBHOOK_SECRET").ok(),
            },
            shipcheck: ServiceEndpoint {
                base_url: std::env::var("SHIPCHECK_API_URL").unwrap_or(default.shipcheck.base_url),
                api_key: std::env::var("SHIPCHECK_API_KEY").ok(),
                webhook_secret: std::env::var("SHIPCHECK_WEBHOOK_SECRET").ok(),
            },
            verity: ServiceEndpoint {
                base_url: std::env::var("VERITY_API_URL").unwrap_or(default.verity.base_url),
                api_key: std::env::var("VERITY_API_KEY").ok(),
                webhook_secret: std::env::var("VERITY_WEBHOOK_SECRET").ok(),
            },
            default_timeout_secs: std::env::var("SERVICE_TIMEOUT_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default.default_timeout_secs),
            max_retries: std::env::var("SERVICE_MAX_RETRIES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default.max_retries),
            verify_tls: std::env::var("SERVICE_VERIFY_TLS")
                .map(|s| s != "false" && s != "0")
                .unwrap_or(default.verify_tls),
        }
    }

    /// Get the default request timeout as a Duration.
    pub fn timeout(&self) -> Duration {
        Duration::from_secs(self.default_timeout_secs)
    }

    /// Validate that all required configuration is present for production.
    ///
    /// In production, API keys and webhook secrets should be configured.
    pub fn validate_for_production(&self) -> Result<(), ConfigError> {
        if self.noteman.api_key.is_none() {
            return Err(ConfigError::MissingEnvVar("NOTEMAN_API_KEY".to_string()));
        }
        if self.shipcheck.api_key.is_none() {
            return Err(ConfigError::MissingEnvVar("SHIPCHECK_API_KEY".to_string()));
        }
        if self.verity.api_key.is_none() {
            return Err(ConfigError::MissingEnvVar("VERITY_API_KEY".to_string()));
        }
        Ok(())
    }
}

/// Configuration for a single service endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceEndpoint {
    /// Base URL for the service (e.g., "https://api.noteman.io").
    pub base_url: String,

    /// API key for service-to-service authentication.
    pub api_key: Option<String>,

    /// Webhook signing secret for verifying incoming webhooks.
    pub webhook_secret: Option<String>,
}

impl ServiceEndpoint {
    /// Build a full URL by appending a path to the base URL.
    pub fn url(&self, path: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{}/{}", base, path)
    }

    /// Check if API key authentication is available.
    pub fn has_auth(&self) -> bool {
        self.api_key.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ServiceConfig::default();
        assert_eq!(config.default_timeout_secs, 30);
        assert_eq!(config.max_retries, 3);
        assert!(config.verify_tls);
    }

    #[test]
    fn test_service_endpoint_url() {
        let endpoint = ServiceEndpoint {
            base_url: "https://api.example.com".to_string(),
            api_key: None,
            webhook_secret: None,
        };

        assert_eq!(
            endpoint.url("/v1/meetings"),
            "https://api.example.com/v1/meetings"
        );
        assert_eq!(
            endpoint.url("v1/meetings"),
            "https://api.example.com/v1/meetings"
        );
    }

    #[test]
    fn test_service_endpoint_url_trailing_slash() {
        let endpoint = ServiceEndpoint {
            base_url: "https://api.example.com/".to_string(),
            api_key: None,
            webhook_secret: None,
        };

        assert_eq!(
            endpoint.url("/v1/meetings"),
            "https://api.example.com/v1/meetings"
        );
    }

    #[test]
    fn test_validate_for_production() {
        let mut config = ServiceConfig::default();
        assert!(config.validate_for_production().is_err());

        config.noteman.api_key = Some("key1".to_string());
        config.shipcheck.api_key = Some("key2".to_string());
        config.verity.api_key = Some("key3".to_string());
        assert!(config.validate_for_production().is_ok());
    }
}
