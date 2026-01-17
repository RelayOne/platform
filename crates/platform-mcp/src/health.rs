//! Health check and monitoring for cross-app integration.
//!
//! This module provides comprehensive health checking capabilities for the platform
//! integration layer, including:
//!
//! - Individual service health checks
//! - Cross-app connectivity verification
//! - Latency monitoring and metrics
//! - Dependency status aggregation
//!
//! ## Health Check Types
//!
//! - **Liveness**: Is the service running?
//! - **Readiness**: Is the service ready to handle requests?
//! - **Deep**: Are all dependencies healthy?
//!
//! ## Usage
//!
//! ```rust,no_run
//! use platform_mcp::health::{HealthChecker, HealthStatus};
//!
//! async fn check_health() {
//!     let checker = HealthChecker::from_env();
//!
//!     // Quick liveness check
//!     let liveness = checker.check_liveness().await;
//!
//!     // Full health check including dependencies
//!     let health = checker.check_all().await;
//!     println!("Status: {:?}", health.status);
//!
//!     for service in &health.services {
//!         println!("  {}: {:?} ({}ms)",
//!             service.name, service.status, service.latency_ms);
//!     }
//! }
//! ```

use crate::clients::config::{ServiceConfig, ServiceEndpoint};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};

/// Health check errors.
#[derive(Debug, Error)]
pub enum HealthError {
    /// HTTP request failed.
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    /// Service unreachable.
    #[error("Service unreachable: {service}")]
    ServiceUnreachable {
        /// Service name.
        service: String,
    },

    /// Health check timed out.
    #[error("Health check timed out after {timeout_ms}ms")]
    Timeout {
        /// Timeout in milliseconds.
        timeout_ms: u64,
    },
}

/// Overall health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    /// All services healthy.
    Healthy,
    /// Some services degraded but functional.
    Degraded,
    /// Critical services unhealthy.
    Unhealthy,
}

/// Individual service health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    /// Service is healthy.
    Up,
    /// Service is degraded (slow responses).
    Degraded,
    /// Service is down.
    Down,
    /// Service status unknown.
    Unknown,
}

/// Health check result for a single service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceHealth {
    /// Service name.
    pub name: String,

    /// Service status.
    pub status: ServiceStatus,

    /// Response latency in milliseconds.
    pub latency_ms: u64,

    /// Service URL.
    pub url: String,

    /// Error message if unhealthy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Last successful check timestamp (ISO 8601).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_success: Option<String>,

    /// Service version if available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// Aggregated health check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    /// Overall status.
    pub status: HealthStatus,

    /// Timestamp of the check (ISO 8601).
    pub timestamp: String,

    /// Individual service health.
    pub services: Vec<ServiceHealth>,

    /// Total check duration in milliseconds.
    pub check_duration_ms: u64,

    /// Platform version.
    pub platform_version: String,

    /// Summary message.
    pub message: String,
}

/// Liveness check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivenessResult {
    /// Is the service alive?
    pub alive: bool,

    /// Timestamp.
    pub timestamp: String,

    /// Uptime in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_secs: Option<u64>,
}

/// Readiness check result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadinessResult {
    /// Is the service ready?
    pub ready: bool,

    /// Timestamp.
    pub timestamp: String,

    /// Reason if not ready.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,

    /// Dependencies status.
    pub dependencies: DependencyStatus,
}

/// Status of service dependencies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    /// NoteMan service available.
    pub noteman: bool,

    /// ShipCheck service available.
    pub shipcheck: bool,

    /// Verity service available.
    pub verity: bool,
}

/// Health check configuration.
#[derive(Debug, Clone)]
pub struct HealthCheckConfig {
    /// Timeout for individual health checks.
    pub check_timeout: Duration,

    /// Latency threshold for degraded status (ms).
    pub degraded_threshold_ms: u64,

    /// Whether to run checks in parallel.
    pub parallel_checks: bool,

    /// Include detailed error messages.
    pub include_details: bool,
}

impl Default for HealthCheckConfig {
    fn default() -> Self {
        Self {
            check_timeout: Duration::from_secs(5),
            degraded_threshold_ms: 1000,
            parallel_checks: true,
            include_details: true,
        }
    }
}

/// Health checker for platform services.
///
/// Provides methods for checking the health of all platform services
/// including NoteMan, ShipCheck, and Verity.
pub struct HealthChecker {
    /// HTTP client for health checks.
    client: Client,

    /// Service configuration.
    config: ServiceConfig,

    /// Health check configuration.
    health_config: HealthCheckConfig,

    /// Start time for uptime calculation.
    start_time: Instant,
}

impl HealthChecker {
    /// Create a new health checker with the given configuration.
    pub fn new(config: ServiceConfig, health_config: HealthCheckConfig) -> Self {
        let client = Client::builder()
            .timeout(health_config.check_timeout)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            config,
            health_config,
            start_time: Instant::now(),
        }
    }

    /// Create a health checker from environment variables.
    pub fn from_env() -> Self {
        Self::new(ServiceConfig::from_env(), HealthCheckConfig::default())
    }

    /// Quick liveness check.
    ///
    /// Returns immediately - just confirms the service is running.
    pub async fn check_liveness(&self) -> LivenessResult {
        LivenessResult {
            alive: true,
            timestamp: chrono::Utc::now().to_rfc3339(),
            uptime_secs: Some(self.start_time.elapsed().as_secs()),
        }
    }

    /// Readiness check.
    ///
    /// Verifies the service can handle requests by checking basic connectivity
    /// to dependent services.
    #[instrument(skip(self))]
    pub async fn check_readiness(&self) -> ReadinessResult {
        debug!("Performing readiness check");

        let (noteman_ok, shipcheck_ok, verity_ok) = tokio::join!(
            self.ping_service(&self.config.noteman, "noteman"),
            self.ping_service(&self.config.shipcheck, "shipcheck"),
            self.ping_service(&self.config.verity, "verity"),
        );

        let all_ready = noteman_ok && shipcheck_ok && verity_ok;
        let reason = if !all_ready {
            let mut unavailable = Vec::new();
            if !noteman_ok {
                unavailable.push("noteman");
            }
            if !shipcheck_ok {
                unavailable.push("shipcheck");
            }
            if !verity_ok {
                unavailable.push("verity");
            }
            Some(format!("Services unavailable: {}", unavailable.join(", ")))
        } else {
            None
        };

        ReadinessResult {
            ready: all_ready,
            timestamp: chrono::Utc::now().to_rfc3339(),
            reason,
            dependencies: DependencyStatus {
                noteman: noteman_ok,
                shipcheck: shipcheck_ok,
                verity: verity_ok,
            },
        }
    }

    /// Full health check of all services.
    ///
    /// Performs detailed health checks including latency measurement
    /// and version detection.
    #[instrument(skip(self))]
    pub async fn check_all(&self) -> HealthReport {
        info!("Performing full health check");
        let start = Instant::now();

        let (noteman_health, shipcheck_health, verity_health) = if self.health_config.parallel_checks
        {
            tokio::join!(
                self.check_service(&self.config.noteman, "NoteMan"),
                self.check_service(&self.config.shipcheck, "ShipCheck"),
                self.check_service(&self.config.verity, "Verity"),
            )
        } else {
            let n = self.check_service(&self.config.noteman, "NoteMan").await;
            let s = self.check_service(&self.config.shipcheck, "ShipCheck").await;
            let v = self.check_service(&self.config.verity, "Verity").await;
            (n, s, v)
        };

        let services = vec![noteman_health, shipcheck_health, verity_health];
        let status = Self::aggregate_status(&services);
        let duration = start.elapsed();

        let message = match status {
            HealthStatus::Healthy => "All services operational".to_string(),
            HealthStatus::Degraded => {
                let degraded: Vec<_> = services
                    .iter()
                    .filter(|s| s.status == ServiceStatus::Degraded)
                    .map(|s| s.name.as_str())
                    .collect();
                format!("Degraded services: {}", degraded.join(", "))
            }
            HealthStatus::Unhealthy => {
                let down: Vec<_> = services
                    .iter()
                    .filter(|s| s.status == ServiceStatus::Down)
                    .map(|s| s.name.as_str())
                    .collect();
                format!("Services down: {}", down.join(", "))
            }
        };

        info!(
            status = ?status,
            duration_ms = duration.as_millis(),
            "Health check complete"
        );

        HealthReport {
            status,
            timestamp: chrono::Utc::now().to_rfc3339(),
            services,
            check_duration_ms: duration.as_millis() as u64,
            platform_version: env!("CARGO_PKG_VERSION").to_string(),
            message,
        }
    }

    /// Check a specific service's health.
    #[instrument(skip(self, endpoint), fields(service = name))]
    async fn check_service(&self, endpoint: &ServiceEndpoint, name: &str) -> ServiceHealth {
        let start = Instant::now();
        let health_url = endpoint.url("/health");

        debug!("Checking health for {} at {}", name, health_url);

        let mut request = self.client.get(&health_url);
        if let Some(ref api_key) = endpoint.api_key {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }

        match request.send().await {
            Ok(response) => {
                let latency = start.elapsed().as_millis() as u64;
                let status_code = response.status();

                if status_code.is_success() {
                    // Try to extract version from response
                    let version = response
                        .json::<serde_json::Value>()
                        .await
                        .ok()
                        .and_then(|v| v.get("version").and_then(|v| v.as_str()).map(String::from));

                    let status = if latency > self.health_config.degraded_threshold_ms {
                        warn!(
                            service = name,
                            latency_ms = latency,
                            "Service response time exceeds threshold"
                        );
                        ServiceStatus::Degraded
                    } else {
                        ServiceStatus::Up
                    };

                    ServiceHealth {
                        name: name.to_string(),
                        status,
                        latency_ms: latency,
                        url: endpoint.base_url.clone(),
                        error: None,
                        last_success: Some(chrono::Utc::now().to_rfc3339()),
                        version,
                    }
                } else {
                    warn!(
                        service = name,
                        status_code = status_code.as_u16(),
                        "Service health check returned non-success status"
                    );

                    ServiceHealth {
                        name: name.to_string(),
                        status: ServiceStatus::Down,
                        latency_ms: latency,
                        url: endpoint.base_url.clone(),
                        error: if self.health_config.include_details {
                            Some(format!("HTTP {}", status_code))
                        } else {
                            None
                        },
                        last_success: None,
                        version: None,
                    }
                }
            }
            Err(e) => {
                let latency = start.elapsed().as_millis() as u64;
                error!(
                    service = name,
                    error = %e,
                    "Service health check failed"
                );

                ServiceHealth {
                    name: name.to_string(),
                    status: ServiceStatus::Down,
                    latency_ms: latency,
                    url: endpoint.base_url.clone(),
                    error: if self.health_config.include_details {
                        Some(e.to_string())
                    } else {
                        Some("Connection failed".to_string())
                    },
                    last_success: None,
                    version: None,
                }
            }
        }
    }

    /// Quick ping to verify service is reachable.
    async fn ping_service(&self, endpoint: &ServiceEndpoint, name: &str) -> bool {
        let health_url = endpoint.url("/health");

        match self.client.get(&health_url).send().await {
            Ok(response) => response.status().is_success(),
            Err(e) => {
                debug!(service = name, error = %e, "Service ping failed");
                false
            }
        }
    }

    /// Aggregate individual service statuses into overall status.
    fn aggregate_status(services: &[ServiceHealth]) -> HealthStatus {
        let down_count = services
            .iter()
            .filter(|s| s.status == ServiceStatus::Down)
            .count();
        let degraded_count = services
            .iter()
            .filter(|s| s.status == ServiceStatus::Degraded)
            .count();

        if down_count > 0 {
            HealthStatus::Unhealthy
        } else if degraded_count > 0 {
            HealthStatus::Degraded
        } else {
            HealthStatus::Healthy
        }
    }
}

/// Metrics for cross-app communication.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IntegrationMetrics {
    /// Total requests made to NoteMan.
    pub noteman_requests: u64,

    /// Total requests made to ShipCheck.
    pub shipcheck_requests: u64,

    /// Total requests made to Verity.
    pub verity_requests: u64,

    /// Total failed requests.
    pub failed_requests: u64,

    /// Average latency in milliseconds.
    pub avg_latency_ms: f64,

    /// 95th percentile latency in milliseconds.
    pub p95_latency_ms: f64,

    /// 99th percentile latency in milliseconds.
    pub p99_latency_ms: f64,

    /// Success rate (0.0 - 1.0).
    pub success_rate: f64,

    /// Requests per second (last minute).
    pub requests_per_second: f64,
}

/// Metrics collector for integration monitoring.
///
/// Collects and aggregates metrics for cross-app communication.
pub struct MetricsCollector {
    /// Request latencies (stored for percentile calculation).
    latencies: std::sync::Mutex<Vec<u64>>,

    /// Request counts by service.
    request_counts: std::sync::Mutex<RequestCounts>,

    /// Start time.
    start_time: Instant,
}

#[derive(Debug, Default)]
struct RequestCounts {
    noteman: u64,
    shipcheck: u64,
    verity: u64,
    failed: u64,
}

impl MetricsCollector {
    /// Create a new metrics collector.
    pub fn new() -> Self {
        Self {
            latencies: std::sync::Mutex::new(Vec::new()),
            request_counts: std::sync::Mutex::new(RequestCounts::default()),
            start_time: Instant::now(),
        }
    }

    /// Record a request.
    pub fn record_request(&self, service: &str, latency_ms: u64, success: bool) {
        {
            let mut latencies = self.latencies.lock().unwrap();
            latencies.push(latency_ms);

            // Keep last 10000 latencies for percentile calculation
            if latencies.len() > 10000 {
                latencies.remove(0);
            }
        }

        {
            let mut counts = self.request_counts.lock().unwrap();
            match service {
                "noteman" => counts.noteman += 1,
                "shipcheck" => counts.shipcheck += 1,
                "verity" => counts.verity += 1,
                _ => {}
            }
            if !success {
                counts.failed += 1;
            }
        }
    }

    /// Get current metrics.
    pub fn get_metrics(&self) -> IntegrationMetrics {
        let latencies = self.latencies.lock().unwrap();
        let counts = self.request_counts.lock().unwrap();

        let total_requests = counts.noteman + counts.shipcheck + counts.verity;
        let elapsed_secs = self.start_time.elapsed().as_secs_f64();

        let (avg, p95, p99) = if !latencies.is_empty() {
            let mut sorted: Vec<_> = latencies.clone();
            sorted.sort_unstable();

            let avg = sorted.iter().sum::<u64>() as f64 / sorted.len() as f64;
            let p95_idx = (sorted.len() as f64 * 0.95) as usize;
            let p99_idx = (sorted.len() as f64 * 0.99) as usize;

            let p95 = sorted.get(p95_idx.min(sorted.len() - 1)).copied().unwrap_or(0) as f64;
            let p99 = sorted.get(p99_idx.min(sorted.len() - 1)).copied().unwrap_or(0) as f64;

            (avg, p95, p99)
        } else {
            (0.0, 0.0, 0.0)
        };

        let success_rate = if total_requests > 0 {
            (total_requests - counts.failed) as f64 / total_requests as f64
        } else {
            1.0
        };

        IntegrationMetrics {
            noteman_requests: counts.noteman,
            shipcheck_requests: counts.shipcheck,
            verity_requests: counts.verity,
            failed_requests: counts.failed,
            avg_latency_ms: avg,
            p95_latency_ms: p95,
            p99_latency_ms: p99,
            success_rate,
            requests_per_second: if elapsed_secs > 0.0 {
                total_requests as f64 / elapsed_secs
            } else {
                0.0
            },
        }
    }

    /// Reset all metrics.
    pub fn reset(&self) {
        *self.latencies.lock().unwrap() = Vec::new();
        *self.request_counts.lock().unwrap() = RequestCounts::default();
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_liveness() {
        let checker = HealthChecker::from_env();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(checker.check_liveness());
        assert!(result.alive);
        assert!(result.uptime_secs.is_some());
    }

    #[test]
    fn test_health_status_aggregation() {
        let healthy = vec![
            ServiceHealth {
                name: "a".into(),
                status: ServiceStatus::Up,
                latency_ms: 100,
                url: "http://a".into(),
                error: None,
                last_success: None,
                version: None,
            },
            ServiceHealth {
                name: "b".into(),
                status: ServiceStatus::Up,
                latency_ms: 100,
                url: "http://b".into(),
                error: None,
                last_success: None,
                version: None,
            },
        ];
        assert_eq!(HealthChecker::aggregate_status(&healthy), HealthStatus::Healthy);

        let degraded = vec![
            ServiceHealth {
                name: "a".into(),
                status: ServiceStatus::Up,
                latency_ms: 100,
                url: "http://a".into(),
                error: None,
                last_success: None,
                version: None,
            },
            ServiceHealth {
                name: "b".into(),
                status: ServiceStatus::Degraded,
                latency_ms: 2000,
                url: "http://b".into(),
                error: None,
                last_success: None,
                version: None,
            },
        ];
        assert_eq!(HealthChecker::aggregate_status(&degraded), HealthStatus::Degraded);

        let unhealthy = vec![
            ServiceHealth {
                name: "a".into(),
                status: ServiceStatus::Down,
                latency_ms: 0,
                url: "http://a".into(),
                error: Some("Connection refused".into()),
                last_success: None,
                version: None,
            },
        ];
        assert_eq!(HealthChecker::aggregate_status(&unhealthy), HealthStatus::Unhealthy);
    }

    #[test]
    fn test_metrics_collector() {
        let collector = MetricsCollector::new();

        collector.record_request("noteman", 100, true);
        collector.record_request("shipcheck", 150, true);
        collector.record_request("verity", 200, true);
        collector.record_request("noteman", 500, false);

        let metrics = collector.get_metrics();

        assert_eq!(metrics.noteman_requests, 2);
        assert_eq!(metrics.shipcheck_requests, 1);
        assert_eq!(metrics.verity_requests, 1);
        assert_eq!(metrics.failed_requests, 1);
        assert!(metrics.avg_latency_ms > 0.0);
    }

    #[test]
    fn test_health_check_config_defaults() {
        let config = HealthCheckConfig::default();
        assert_eq!(config.check_timeout, Duration::from_secs(5));
        assert_eq!(config.degraded_threshold_ms, 1000);
        assert!(config.parallel_checks);
        assert!(config.include_details);
    }
}
