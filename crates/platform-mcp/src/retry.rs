//! Retry utilities with exponential backoff.
//!
//! This module provides utilities for retrying operations that may fail
//! transiently, using exponential backoff to avoid overwhelming services.
//!
//! # Example
//!
//! ```rust,no_run
//! use platform_mcp::retry::{with_retry, RetryConfig};
//! use std::time::Duration;
//!
//! async fn example() -> Result<String, std::io::Error> {
//!     let config = RetryConfig {
//!         max_attempts: 3,
//!         initial_delay: Duration::from_millis(100),
//!         max_delay: Duration::from_secs(10),
//!         exponential_base: 2.0,
//!     };
//!
//!     with_retry(&config, || async {
//!         // Your operation here
//!         Ok("success".to_string())
//!     }).await
//! }
//! ```

use std::time::Duration;
use tokio::time::sleep;

/// Configuration for retry behavior.
///
/// Controls how many times to retry an operation and how long to wait
/// between retries.
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_attempts: u32,

    /// Initial delay before the first retry
    pub initial_delay: Duration,

    /// Maximum delay between retries
    pub max_delay: Duration,

    /// Base for exponential backoff (typically 2.0)
    pub exponential_base: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            exponential_base: 2.0,
        }
    }
}

impl RetryConfig {
    /// Create a configuration for fast retries.
    ///
    /// Useful for operations that typically fail quickly and should be
    /// retried immediately.
    ///
    /// # Returns
    ///
    /// A `RetryConfig` with short delays
    pub fn fast() -> Self {
        Self {
            max_attempts: 3,
            initial_delay: Duration::from_millis(50),
            max_delay: Duration::from_secs(1),
            exponential_base: 2.0,
        }
    }

    /// Create a configuration for standard retries.
    ///
    /// Balanced configuration for most use cases.
    ///
    /// # Returns
    ///
    /// A `RetryConfig` with moderate delays
    pub fn standard() -> Self {
        Self::default()
    }

    /// Create a configuration for slow retries.
    ///
    /// Useful for operations that should be retried after longer delays,
    /// such as external API calls.
    ///
    /// # Returns
    ///
    /// A `RetryConfig` with longer delays
    pub fn slow() -> Self {
        Self {
            max_attempts: 5,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            exponential_base: 2.0,
        }
    }

    /// Create a configuration that never retries.
    ///
    /// Useful for operations that should not be retried.
    ///
    /// # Returns
    ///
    /// A `RetryConfig` with zero retries
    pub fn no_retry() -> Self {
        Self {
            max_attempts: 1,
            initial_delay: Duration::from_millis(0),
            max_delay: Duration::from_millis(0),
            exponential_base: 1.0,
        }
    }
}

/// Execute a function with retries.
///
/// The function will be called up to `max_attempts` times. If it fails,
/// the call will wait with exponential backoff before retrying.
///
/// # Arguments
///
/// * `config` - Retry configuration
/// * `f` - Function to execute (must be `FnMut` and return a `Future`)
///
/// # Returns
///
/// The result of the function call, or the last error if all retries fail
///
/// # Example
///
/// ```rust,no_run
/// use platform_mcp::retry::{with_retry, RetryConfig};
///
/// async fn example() -> Result<(), String> {
///     let config = RetryConfig::default();
///
///     with_retry(&config, || async {
///         // Your operation that might fail
///         Ok(())
///     }).await
/// }
/// ```
pub async fn with_retry<F, Fut, T, E>(config: &RetryConfig, mut f: F) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempt = 0;
    let mut delay = config.initial_delay;

    loop {
        attempt += 1;

        match f().await {
            Ok(result) => {
                if attempt > 1 {
                    tracing::info!(
                        attempts = attempt,
                        "Operation succeeded after retry"
                    );
                }
                return Ok(result);
            }
            Err(e) if attempt >= config.max_attempts => {
                tracing::error!(
                    attempts = attempt,
                    error = ?e,
                    "All retry attempts exhausted"
                );
                return Err(e);
            }
            Err(e) => {
                tracing::warn!(
                    attempt = attempt,
                    max_attempts = config.max_attempts,
                    delay_ms = delay.as_millis(),
                    error = ?e,
                    "Attempt failed, retrying"
                );

                sleep(delay).await;

                // Calculate next delay with exponential backoff
                delay = Duration::from_secs_f64(
                    (delay.as_secs_f64() * config.exponential_base).min(config.max_delay.as_secs_f64()),
                );
            }
        }
    }
}

/// Execute a function with retries and a custom predicate for retryable errors.
///
/// Similar to `with_retry`, but allows you to specify which errors should
/// trigger a retry and which should be returned immediately.
///
/// # Arguments
///
/// * `config` - Retry configuration
/// * `f` - Function to execute
/// * `is_retryable` - Predicate to determine if an error is retryable
///
/// # Returns
///
/// The result of the function call, or the error if it's not retryable
/// or all retries fail
///
/// # Example
///
/// ```rust,no_run
/// use platform_mcp::retry::{with_retry_if, RetryConfig};
///
/// #[derive(Debug)]
/// enum MyError {
///     Transient,
///     Permanent,
/// }
///
/// async fn example() -> Result<(), MyError> {
///     let config = RetryConfig::default();
///
///     with_retry_if(
///         &config,
///         || async {
///             // Your operation
///             Err(MyError::Transient)
///         },
///         |err| matches!(err, MyError::Transient),
///     ).await
/// }
/// ```
pub async fn with_retry_if<F, Fut, T, E, P>(
    config: &RetryConfig,
    mut f: F,
    mut is_retryable: P,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
    P: FnMut(&E) -> bool,
{
    let mut attempt = 0;
    let mut delay = config.initial_delay;

    loop {
        attempt += 1;

        match f().await {
            Ok(result) => {
                if attempt > 1 {
                    tracing::info!(
                        attempts = attempt,
                        "Operation succeeded after retry"
                    );
                }
                return Ok(result);
            }
            Err(e) if !is_retryable(&e) => {
                tracing::debug!(
                    error = ?e,
                    "Error is not retryable, returning immediately"
                );
                return Err(e);
            }
            Err(e) if attempt >= config.max_attempts => {
                tracing::error!(
                    attempts = attempt,
                    error = ?e,
                    "All retry attempts exhausted"
                );
                return Err(e);
            }
            Err(e) => {
                tracing::warn!(
                    attempt = attempt,
                    max_attempts = config.max_attempts,
                    delay_ms = delay.as_millis(),
                    error = ?e,
                    "Attempt failed, retrying"
                );

                sleep(delay).await;

                // Calculate next delay with exponential backoff
                delay = Duration::from_secs_f64(
                    (delay.as_secs_f64() * config.exponential_base).min(config.max_delay.as_secs_f64()),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.initial_delay, Duration::from_millis(100));
        assert_eq!(config.max_delay, Duration::from_secs(10));
        assert_eq!(config.exponential_base, 2.0);
    }

    #[test]
    fn test_retry_config_presets() {
        let fast = RetryConfig::fast();
        assert_eq!(fast.initial_delay, Duration::from_millis(50));

        let slow = RetryConfig::slow();
        assert_eq!(slow.max_attempts, 5);

        let no_retry = RetryConfig::no_retry();
        assert_eq!(no_retry.max_attempts, 1);
    }

    #[tokio::test]
    async fn test_with_retry_succeeds_first_try() {
        let config = RetryConfig::default();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = with_retry(&config, || {
            let counter = counter_clone.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Ok::<_, String>(42)
            }
        })
        .await;

        assert_eq!(result, Ok(42));
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_with_retry_succeeds_after_retries() {
        let config = RetryConfig::fast();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = with_retry(&config, || {
            let counter = counter_clone.clone();
            async move {
                let count = counter.fetch_add(1, Ordering::SeqCst);
                if count < 2 {
                    Err("not yet")
                } else {
                    Ok(42)
                }
            }
        })
        .await;

        assert_eq!(result, Ok(42));
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_with_retry_exhausts_attempts() {
        let config = RetryConfig {
            max_attempts: 2,
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(10),
            exponential_base: 2.0,
        };

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = with_retry(&config, || {
            let counter = counter_clone.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Err::<i32, _>("always fails")
            }
        })
        .await;

        assert_eq!(result, Err("always fails"));
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_with_retry_if_non_retryable_error() {
        let config = RetryConfig::fast();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = with_retry_if(
            &config,
            || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Err::<i32, _>("permanent failure")
                }
            },
            |_| false, // Nothing is retryable
        )
        .await;

        assert_eq!(result, Err("permanent failure"));
        assert_eq!(counter.load(Ordering::SeqCst), 1); // Only tried once
    }
}
