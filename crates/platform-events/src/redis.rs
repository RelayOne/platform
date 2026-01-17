//! Redis-backed event bus for distributed deployments.
//!
//! This module provides a Redis-based implementation of the event bus,
//! enabling multiple application instances to communicate across servers.

use crate::types::Event;
use crate::bus::{EventBus, EventBusError, EventBusResult, EventBusStats, EventHandler, Subscription};
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, Client, RedisError};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tokio::task::JoinHandle;

/// Redis-backed event bus for distributed applications.
///
/// Uses Redis pub/sub for cross-process event distribution.
/// Maintains a local broadcast channel for efficient in-process delivery.
///
/// # Example
///
/// ```rust,no_run
/// use platform_events::RedisEventBus;
///
/// async fn example() -> Result<(), Box<dyn std::error::Error>> {
///     let bus = RedisEventBus::new("redis://localhost:6379", "relay").await?;
///     bus.start_listener().await?;
///     Ok(())
/// }
/// ```
pub struct RedisEventBus {
    /// Redis client
    client: Client,

    /// Key prefix for all Redis operations
    prefix: String,

    /// Local broadcast channel for efficient in-process delivery
    local_bus: broadcast::Sender<Event>,

    /// Background listener task handle
    listener_handle: Arc<RwLock<Option<JoinHandle<()>>>>,

    /// Event statistics
    stats: Arc<RwLock<EventBusStats>>,

    /// Registered event handlers
    handlers: Arc<RwLock<HashMap<String, Vec<Arc<dyn EventHandler>>>>>,
}

impl RedisEventBus {
    /// Create a new Redis event bus.
    ///
    /// # Arguments
    ///
    /// * `redis_url` - Redis connection URL (e.g., `redis://localhost:6379`)
    /// * `prefix` - Key prefix for Redis operations (e.g., `relay`)
    ///
    /// # Returns
    ///
    /// A new `RedisEventBus` instance or an error
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use platform_events::RedisEventBus;
    ///
    /// async fn example() -> Result<(), Box<dyn std::error::Error>> {
    ///     let bus = RedisEventBus::new("redis://localhost:6379", "relay").await?;
    ///     Ok(())
    /// }
    /// ```
    pub async fn new(redis_url: &str, prefix: &str) -> EventBusResult<Self> {
        let client = Client::open(redis_url)
            .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

        // Test connection
        let _ = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

        let (tx, _) = broadcast::channel(1000);

        Ok(Self {
            client,
            prefix: prefix.to_string(),
            local_bus: tx,
            listener_handle: Arc::new(RwLock::new(None)),
            stats: Arc::new(RwLock::new(EventBusStats::default())),
            handlers: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Start the Redis subscription listener.
    ///
    /// This spawns a background task that listens for events from Redis
    /// and broadcasts them to local subscribers.
    ///
    /// # Returns
    ///
    /// Ok if the listener started successfully, or an error
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use platform_events::RedisEventBus;
    ///
    /// async fn example() -> Result<(), Box<dyn std::error::Error>> {
    ///     let bus = RedisEventBus::new("redis://localhost:6379", "relay").await?;
    ///     bus.start_listener().await?;
    ///     Ok(())
    /// }
    /// ```
    pub async fn start_listener(&self) -> EventBusResult<()> {
        let mut handle_lock = self.listener_handle.write().await;

        // Don't start if already running
        if handle_lock.is_some() {
            return Ok(());
        }

        let client = self.client.clone();
        let prefix = self.prefix.clone();
        let tx = self.local_bus.clone();
        let stats = self.stats.clone();
        let handlers = self.handlers.clone();

        let handle = tokio::spawn(async move {
            if let Err(e) = redis_listener_loop(client, prefix, tx, stats, handlers).await {
                tracing::error!(error = %e, "Redis listener loop failed");
            }
        });

        *handle_lock = Some(handle);

        Ok(())
    }

    /// Stop the Redis subscription listener.
    pub async fn stop_listener(&self) {
        let mut handle_lock = self.listener_handle.write().await;

        if let Some(handle) = handle_lock.take() {
            handle.abort();
        }
    }

    /// Get a Redis connection.
    async fn get_connection(&self) -> EventBusResult<MultiplexedConnection> {
        self.client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| EventBusError::ConnectionError(e.to_string()))
    }
}

/// Redis listener loop that receives events and broadcasts them locally.
async fn redis_listener_loop(
    client: Client,
    prefix: String,
    tx: broadcast::Sender<Event>,
    stats: Arc<RwLock<EventBusStats>>,
    handlers: Arc<RwLock<HashMap<String, Vec<Arc<dyn EventHandler>>>>>,
) -> EventBusResult<()> {
    use redis::aio::PubSub;

    let mut conn = client
        .get_async_pubsub()
        .await
        .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

    // Subscribe to all events with the prefix
    let pattern = format!("{}:*", prefix);
    conn.psubscribe(&pattern)
        .await
        .map_err(|e| EventBusError::SubscribeError(e.to_string()))?;

    tracing::info!(pattern = %pattern, "Redis event bus listener started");

    loop {
        match conn.on_message().next().await {
            Some(msg) => {
                let payload: String = match msg.get_payload() {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to get message payload");
                        continue;
                    }
                };

                let event: Event = match serde_json::from_str(&payload) {
                    Ok(e) => e,
                    Err(e) => {
                        tracing::warn!(error = %e, payload = %payload, "Failed to deserialize event");
                        continue;
                    }
                };

                // Update stats
                {
                    let mut stats = stats.write().await;
                    stats.events_received += 1;
                }

                // Broadcast to local subscribers
                if let Err(e) = tx.send(event.clone()) {
                    tracing::warn!(error = %e, "Failed to broadcast event locally");
                }

                // Invoke registered handlers
                let handlers = handlers.read().await;
                for handler_list in handlers.values() {
                    for handler in handler_list {
                        let handler = handler.clone();
                        let event = event.clone();
                        tokio::spawn(async move {
                            if let Err(e) = handler.handle(event).await {
                                tracing::warn!(error = %e, "Event handler failed");
                            }
                        });
                    }
                }
            }
            None => {
                tracing::warn!("Redis pub/sub stream ended");
                break;
            }
        }
    }

    Ok(())
}

#[async_trait]
impl EventBus for RedisEventBus {
    /// Publish an event to Redis.
    ///
    /// The event is serialized to JSON and published to a Redis channel
    /// based on its topic.
    async fn publish(&self, event: Event) -> EventBusResult<()> {
        let mut conn = self.get_connection().await?;

        let channel = format!("{}:{}", self.prefix, event.topic);
        let payload = serde_json::to_string(&event)
            .map_err(|e| EventBusError::SerializationError(e.to_string()))?;

        conn.publish::<_, _, ()>(&channel, &payload)
            .await
            .map_err(|e| EventBusError::PublishError(e.to_string()))?;

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.events_published += 1;
        }

        tracing::debug!(topic = %event.topic, event_id = %event.id, "Published event to Redis");

        Ok(())
    }

    /// Subscribe to events matching a topic pattern.
    ///
    /// Events are received from the local broadcast channel after being
    /// routed through Redis.
    async fn subscribe(&self, topic: &str) -> EventBusResult<Subscription> {
        let rx = self.local_bus.subscribe();
        let topic = topic.to_string();
        let id = uuid::Uuid::now_v7().to_string();

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.active_subscriptions += 1;
        }

        Ok(Subscription {
            id,
            topic,
            receiver: rx,
        })
    }

    /// Register an event handler.
    async fn register_handler(&self, handler: Arc<dyn EventHandler>) -> EventBusResult<()> {
        let mut handlers = self.handlers.write().await;

        for topic in handler.topics() {
            handlers
                .entry(topic.clone())
                .or_insert_with(Vec::new)
                .push(handler.clone());
        }

        Ok(())
    }

    /// Unsubscribe from a topic.
    async fn unsubscribe(&self, _subscription_id: &str) -> EventBusResult<()> {
        // Update stats
        {
            let mut stats = self.stats.write().await;
            if stats.active_subscriptions > 0 {
                stats.active_subscriptions -= 1;
            }
        }

        Ok(())
    }

    /// Get event bus statistics.
    async fn stats(&self) -> EventBusStats {
        self.stats.read().await.clone()
    }
}

impl Drop for RedisEventBus {
    fn drop(&mut self) {
        // Note: Can't use async in Drop, so we just log
        tracing::debug!("RedisEventBus dropped");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redis_url_parsing() {
        // Test that valid URLs don't panic
        let _ = Client::open("redis://localhost:6379");
        let _ = Client::open("redis://user:pass@localhost:6379/0");
        let _ = Client::open("redis+tls://localhost:6380");
    }

    #[test]
    fn test_channel_format() {
        let prefix = "relay";
        let topic = "verity.document.created";
        let channel = format!("{}:{}", prefix, topic);
        assert_eq!(channel, "relay:verity.document.created");
    }
}
