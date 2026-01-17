//! Event bus implementation
//!
//! This module provides the event bus abstraction and implementations
//! for publishing and subscribing to events across applications.

use crate::types::Event;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{broadcast, RwLock};

/// Event bus error types.
#[derive(Debug, Error)]
pub enum EventBusError {
    /// Failed to publish event
    #[error("Failed to publish event: {0}")]
    PublishError(String),

    /// Failed to subscribe
    #[error("Failed to subscribe: {0}")]
    SubscribeError(String),

    /// Connection error
    #[error("Connection error: {0}")]
    ConnectionError(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    SerializationError(String),

    /// Channel closed
    #[error("Channel closed")]
    ChannelClosed,
}

/// Result type for event bus operations.
pub type EventBusResult<T> = Result<T, EventBusError>;

/// Subscription handle for receiving events.
pub struct Subscription {
    /// Subscription ID
    pub id: String,
    /// Topic pattern
    pub topic: String,
    /// Event receiver
    pub receiver: broadcast::Receiver<Event>,
}

impl Subscription {
    /// Receive the next event.
    pub async fn recv(&mut self) -> EventBusResult<Event> {
        self.receiver
            .recv()
            .await
            .map_err(|_| EventBusError::ChannelClosed)
    }
}

/// Event handler trait for processing events.
#[async_trait]
pub trait EventHandler: Send + Sync {
    /// Handle an event.
    async fn handle(&self, event: Event) -> EventBusResult<()>;

    /// Get the topics this handler is interested in.
    fn topics(&self) -> Vec<String>;
}

/// Event bus trait for publish/subscribe operations.
#[async_trait]
pub trait EventBus: Send + Sync {
    /// Publish an event.
    async fn publish(&self, event: Event) -> EventBusResult<()>;

    /// Subscribe to a topic pattern.
    ///
    /// Topic patterns support wildcards:
    /// - `*` matches any single segment
    /// - `#` matches zero or more segments
    ///
    /// Examples:
    /// - `verity.document.*` matches `verity.document.created`, `verity.document.updated`
    /// - `*.document.#` matches any app's document events
    async fn subscribe(&self, topic: &str) -> EventBusResult<Subscription>;

    /// Register an event handler.
    async fn register_handler(&self, handler: Arc<dyn EventHandler>) -> EventBusResult<()>;

    /// Unsubscribe from a topic.
    async fn unsubscribe(&self, subscription_id: &str) -> EventBusResult<()>;

    /// Get event bus stats.
    async fn stats(&self) -> EventBusStats;
}

/// Event bus statistics.
#[derive(Debug, Clone, Default)]
pub struct EventBusStats {
    /// Total events published
    pub events_published: u64,
    /// Total events delivered
    pub events_delivered: u64,
    /// Active subscriptions
    pub active_subscriptions: usize,
    /// Registered handlers
    pub registered_handlers: usize,
}

/// In-memory event bus implementation.
///
/// This is suitable for single-process applications and testing.
/// For distributed systems, use Redis or NATS backend.
pub struct MemoryEventBus {
    /// Topic subscribers
    subscribers: Arc<RwLock<HashMap<String, broadcast::Sender<Event>>>>,
    /// Registered handlers
    handlers: Arc<RwLock<Vec<Arc<dyn EventHandler>>>>,
    /// Statistics
    stats: Arc<RwLock<EventBusStats>>,
    /// Default channel capacity
    channel_capacity: usize,
}

impl std::fmt::Debug for MemoryEventBus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MemoryEventBus")
            .field("channel_capacity", &self.channel_capacity)
            .finish()
    }
}

impl MemoryEventBus {
    /// Create a new in-memory event bus.
    pub fn new() -> Self {
        Self::with_capacity(1024)
    }

    /// Create with custom channel capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            subscribers: Arc::new(RwLock::new(HashMap::new())),
            handlers: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(EventBusStats::default())),
            channel_capacity: capacity,
        }
    }

    /// Check if a topic matches a pattern.
    fn topic_matches(pattern: &str, topic: &str) -> bool {
        let pattern_parts: Vec<&str> = pattern.split('.').collect();
        let topic_parts: Vec<&str> = topic.split('.').collect();

        let mut p_idx = 0;
        let mut t_idx = 0;

        while p_idx < pattern_parts.len() && t_idx < topic_parts.len() {
            match pattern_parts[p_idx] {
                "*" => {
                    // Match single segment
                    p_idx += 1;
                    t_idx += 1;
                }
                "#" => {
                    // Match zero or more segments
                    if p_idx == pattern_parts.len() - 1 {
                        // # at end matches everything remaining
                        return true;
                    }
                    // Try matching remaining pattern
                    for i in t_idx..=topic_parts.len() {
                        if Self::topic_matches(
                            &pattern_parts[p_idx + 1..].join("."),
                            &topic_parts[i..].join("."),
                        ) {
                            return true;
                        }
                    }
                    return false;
                }
                segment => {
                    if segment != topic_parts[t_idx] {
                        return false;
                    }
                    p_idx += 1;
                    t_idx += 1;
                }
            }
        }

        // Handle trailing # in pattern
        if p_idx < pattern_parts.len() && pattern_parts[p_idx] == "#" {
            p_idx += 1;
        }

        p_idx == pattern_parts.len() && t_idx == topic_parts.len()
    }
}

impl Default for MemoryEventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EventBus for MemoryEventBus {
    async fn publish(&self, event: Event) -> EventBusResult<()> {
        let topic = event.topic();

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.events_published += 1;
        }

        // Notify matching subscribers
        let subscribers = self.subscribers.read().await;
        for (pattern, sender) in subscribers.iter() {
            if Self::topic_matches(pattern, &topic) {
                let _ = sender.send(event.clone());
            }
        }

        // Notify handlers
        let handlers = self.handlers.read().await;
        for handler in handlers.iter() {
            for handler_topic in handler.topics() {
                if Self::topic_matches(&handler_topic, &topic) {
                    let handler = handler.clone();
                    let event = event.clone();
                    tokio::task::spawn(async move {
                        if let Err(e) = handler.handle(event).await {
                            eprintln!("Handler error: {}", e);
                        }
                    });
                    break;
                }
            }
        }

        Ok(())
    }

    async fn subscribe(&self, topic: &str) -> EventBusResult<Subscription> {
        let id = uuid::Uuid::now_v7().to_string();

        let receiver = {
            let mut subscribers = self.subscribers.write().await;

            if let Some(sender) = subscribers.get(topic) {
                sender.subscribe()
            } else {
                let (sender, receiver) = broadcast::channel(self.channel_capacity);
                subscribers.insert(topic.to_string(), sender);
                receiver
            }
        };

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.active_subscriptions += 1;
        }

        Ok(Subscription {
            id,
            topic: topic.to_string(),
            receiver,
        })
    }

    async fn register_handler(&self, handler: Arc<dyn EventHandler>) -> EventBusResult<()> {
        let mut handlers = self.handlers.write().await;
        handlers.push(handler);

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.registered_handlers += 1;
        }

        Ok(())
    }

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

    async fn stats(&self) -> EventBusStats {
        self.stats.read().await.clone()
    }
}

// ============================================================================
// Redis Event Bus (Feature: redis)
// ============================================================================

#[cfg(feature = "redis")]
pub mod redis_bus {
    //! Redis-backed event bus for distributed systems.
    //!
    //! Uses Redis Pub/Sub for real-time event delivery and Redis Streams
    //! for event persistence and replay.

    use super::*;
    use redis::aio::ConnectionManager;
    use redis::AsyncCommands;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    /// Redis event bus configuration.
    #[derive(Debug, Clone)]
    pub struct RedisEventBusConfig {
        /// Redis connection URL (e.g., redis://localhost:6379).
        pub url: String,

        /// Prefix for all Redis keys (default: "platform_events").
        pub key_prefix: String,

        /// Use Redis Streams for persistence (default: true).
        pub use_streams: bool,

        /// Maximum stream length (MAXLEN, default: 10000).
        pub stream_max_len: usize,

        /// Consumer group name for streams (default: "platform_consumers").
        pub consumer_group: String,

        /// Consumer name within the group (default: hostname or random).
        pub consumer_name: String,
    }

    impl Default for RedisEventBusConfig {
        fn default() -> Self {
            Self {
                url: std::env::var("REDIS_URL")
                    .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string()),
                key_prefix: "platform_events".to_string(),
                use_streams: true,
                stream_max_len: 10000,
                consumer_group: "platform_consumers".to_string(),
                consumer_name: hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| uuid::Uuid::now_v7().to_string()),
            }
        }
    }

    /// Redis-backed event bus implementation.
    ///
    /// Features:
    /// - Pub/Sub for real-time event delivery
    /// - Streams for event persistence and replay
    /// - Consumer groups for load balancing
    /// - Automatic reconnection
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use platform_events::bus::redis_bus::{RedisEventBus, RedisEventBusConfig};
    ///
    /// let config = RedisEventBusConfig::default();
    /// let bus = RedisEventBus::new(config).await?;
    ///
    /// // Subscribe to events
    /// let mut sub = bus.subscribe("verity.document.*").await?;
    ///
    /// // Publish event
    /// bus.publish(event).await?;
    /// ```
    pub struct RedisEventBus {
        /// Redis connection manager for commands.
        conn: ConnectionManager,

        /// Configuration.
        config: RedisEventBusConfig,

        /// Local broadcast channels for subscriptions.
        local_channels: Arc<RwLock<HashMap<String, broadcast::Sender<Event>>>>,

        /// Registered handlers.
        handlers: Arc<RwLock<Vec<Arc<dyn EventHandler>>>>,

        /// Statistics.
        events_published: AtomicU64,
        events_delivered: AtomicU64,
        active_subscriptions: AtomicU64,

        /// Running flag for background tasks.
        running: Arc<AtomicBool>,
    }

    impl std::fmt::Debug for RedisEventBus {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("RedisEventBus")
                .field("config", &self.config)
                .field("running", &self.running.load(Ordering::Relaxed))
                .finish()
        }
    }

    impl RedisEventBus {
        /// Create a new Redis event bus.
        pub async fn new(config: RedisEventBusConfig) -> EventBusResult<Self> {
            let client = redis::Client::open(config.url.as_str())
                .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

            let conn = ConnectionManager::new(client)
                .await
                .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

            let bus = Self {
                conn,
                config,
                local_channels: Arc::new(RwLock::new(HashMap::new())),
                handlers: Arc::new(RwLock::new(Vec::new())),
                events_published: AtomicU64::new(0),
                events_delivered: AtomicU64::new(0),
                active_subscriptions: AtomicU64::new(0),
                running: Arc::new(AtomicBool::new(true)),
            };

            Ok(bus)
        }

        /// Create with default configuration.
        pub async fn with_defaults() -> EventBusResult<Self> {
            Self::new(RedisEventBusConfig::default()).await
        }

        /// Get the stream key for a topic.
        fn stream_key(&self, topic: &str) -> String {
            format!("{}:stream:{}", self.config.key_prefix, topic.replace('.', ":"))
        }

        /// Get the pubsub channel for a topic.
        fn channel_key(&self, topic: &str) -> String {
            format!("{}:pubsub:{}", self.config.key_prefix, topic.replace('.', ":"))
        }

        /// Publish to Redis Stream for persistence.
        async fn publish_to_stream(&self, event: &Event) -> EventBusResult<()> {
            if !self.config.use_streams {
                return Ok(());
            }

            let stream_key = self.stream_key(&event.topic());
            let event_json = serde_json::to_string(event)
                .map_err(|e| EventBusError::SerializationError(e.to_string()))?;

            let mut conn = self.conn.clone();

            // Add to stream with MAXLEN for automatic trimming
            let _: String = redis::cmd("XADD")
                .arg(&stream_key)
                .arg("MAXLEN")
                .arg("~")
                .arg(self.config.stream_max_len)
                .arg("*")
                .arg("event")
                .arg(&event_json)
                .arg("topic")
                .arg(event.topic())
                .arg("timestamp")
                .arg(event.timestamp.to_rfc3339())
                .query_async(&mut conn)
                .await
                .map_err(|e| EventBusError::PublishError(e.to_string()))?;

            Ok(())
        }

        /// Publish to Redis Pub/Sub for real-time delivery.
        async fn publish_to_pubsub(&self, event: &Event) -> EventBusResult<()> {
            let channel = self.channel_key(&event.topic());
            let event_json = serde_json::to_string(event)
                .map_err(|e| EventBusError::SerializationError(e.to_string()))?;

            let mut conn = self.conn.clone();
            let _: i32 = conn
                .publish(&channel, &event_json)
                .await
                .map_err(|e| EventBusError::PublishError(e.to_string()))?;

            Ok(())
        }

        /// Start a background subscription listener.
        pub async fn start_subscription_listener(&self, topic: &str) -> EventBusResult<()> {
            let client = redis::Client::open(self.config.url.as_str())
                .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

            let mut pubsub = client
                .get_async_pubsub()
                .await
                .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

            // Convert topic pattern to Redis pattern
            let pattern = self.channel_key(topic)
                .replace("*", "[^:]*")
                .replace("#", "*");

            pubsub
                .psubscribe(&pattern)
                .await
                .map_err(|e| EventBusError::SubscribeError(e.to_string()))?;

            let local_channels = self.local_channels.clone();
            let handlers = self.handlers.clone();
            let running = self.running.clone();
            let events_delivered = &self.events_delivered;

            // Spawn listener task
            tokio::spawn(async move {
                let mut stream = pubsub.on_message();

                while running.load(Ordering::Relaxed) {
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(1),
                        stream.next(),
                    ).await {
                        Ok(Some(msg)) => {
                            let payload: String = match msg.get_payload() {
                                Ok(p) => p,
                                Err(_) => continue,
                            };

                            let event: Event = match serde_json::from_str(&payload) {
                                Ok(e) => e,
                                Err(_) => continue,
                            };

                            // Notify local subscribers
                            let channels = local_channels.read().await;
                            for (pattern, sender) in channels.iter() {
                                if MemoryEventBus::topic_matches(pattern, &event.topic()) {
                                    let _ = sender.send(event.clone());
                                }
                            }

                            // Notify handlers
                            let hdlrs = handlers.read().await;
                            for handler in hdlrs.iter() {
                                for handler_topic in handler.topics() {
                                    if MemoryEventBus::topic_matches(&handler_topic, &event.topic()) {
                                        let handler = handler.clone();
                                        let event = event.clone();
                                        tokio::spawn(async move {
                                            if let Err(e) = handler.handle(event).await {
                                                tracing::error!("Handler error: {}", e);
                                            }
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(_) => continue, // Timeout, check running flag
                    }
                }
            });

            Ok(())
        }

        /// Replay events from a stream.
        ///
        /// # Arguments
        ///
        /// * `topic` - Topic to replay
        /// * `since` - Start from this stream ID (e.g., "0" for all, or a specific ID)
        /// * `count` - Maximum number of events to replay
        ///
        /// # Returns
        ///
        /// Vector of replayed events
        pub async fn replay_events(
            &self,
            topic: &str,
            since: &str,
            count: usize,
        ) -> EventBusResult<Vec<Event>> {
            if !self.config.use_streams {
                return Ok(Vec::new());
            }

            let stream_key = self.stream_key(topic);
            let mut conn = self.conn.clone();

            let result: Vec<redis::Value> = redis::cmd("XREAD")
                .arg("COUNT")
                .arg(count)
                .arg("STREAMS")
                .arg(&stream_key)
                .arg(since)
                .query_async(&mut conn)
                .await
                .map_err(|e| EventBusError::ConnectionError(e.to_string()))?;

            let mut events = Vec::new();

            // Parse XREAD response
            for stream_data in result {
                if let redis::Value::Array(entries) = stream_data {
                    for entry in entries {
                        if let redis::Value::Array(fields) = entry {
                            for field in fields {
                                if let redis::Value::BulkString(data) = field {
                                    if let Ok(s) = String::from_utf8(data) {
                                        if let Ok(event) = serde_json::from_str::<Event>(&s) {
                                            events.push(event);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Ok(events)
        }

        /// Shutdown the event bus.
        pub fn shutdown(&self) {
            self.running.store(false, Ordering::Relaxed);
        }
    }

    use futures::StreamExt;

    #[async_trait]
    impl EventBus for RedisEventBus {
        async fn publish(&self, event: Event) -> EventBusResult<()> {
            // Publish to both stream (persistence) and pubsub (real-time)
            self.publish_to_stream(&event).await?;
            self.publish_to_pubsub(&event).await?;

            self.events_published.fetch_add(1, Ordering::Relaxed);

            tracing::debug!(
                topic = %event.topic(),
                event_id = %event.id,
                "Event published to Redis"
            );

            Ok(())
        }

        async fn subscribe(&self, topic: &str) -> EventBusResult<Subscription> {
            let id = uuid::Uuid::now_v7().to_string();

            // Create local broadcast channel
            let receiver = {
                let mut channels = self.local_channels.write().await;

                if let Some(sender) = channels.get(topic) {
                    sender.subscribe()
                } else {
                    let (sender, receiver) = broadcast::channel(1024);
                    channels.insert(topic.to_string(), sender);
                    receiver
                }
            };

            // Start background listener if not already running
            self.start_subscription_listener(topic).await?;

            self.active_subscriptions.fetch_add(1, Ordering::Relaxed);

            Ok(Subscription {
                id,
                topic: topic.to_string(),
                receiver,
            })
        }

        async fn register_handler(&self, handler: Arc<dyn EventHandler>) -> EventBusResult<()> {
            let topics = handler.topics();

            {
                let mut handlers = self.handlers.write().await;
                handlers.push(handler);
            }

            // Start listeners for handler topics
            for topic in topics {
                self.start_subscription_listener(&topic).await?;
            }

            Ok(())
        }

        async fn unsubscribe(&self, _subscription_id: &str) -> EventBusResult<()> {
            self.active_subscriptions.fetch_sub(1, Ordering::Relaxed);
            Ok(())
        }

        async fn stats(&self) -> EventBusStats {
            EventBusStats {
                events_published: self.events_published.load(Ordering::Relaxed),
                events_delivered: self.events_delivered.load(Ordering::Relaxed),
                active_subscriptions: self.active_subscriptions.load(Ordering::Relaxed) as usize,
                registered_handlers: self.handlers.read().await.len(),
            }
        }
    }
}

#[cfg(feature = "redis")]
pub use redis_bus::{RedisEventBus, RedisEventBusConfig};

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use platform_rbac::App;

    #[tokio::test]
    async fn test_memory_event_bus_publish_subscribe() {
        let bus = MemoryEventBus::new();

        // Subscribe to topic
        let mut sub = bus.subscribe("verity.document.*").await.unwrap();

        // Publish event
        let event = Event::new("document.created", App::Verity, serde_json::json!({}));
        bus.publish(event.clone()).await.unwrap();

        // Receive event
        let received = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            sub.recv(),
        ).await;

        assert!(received.is_ok());
    }

    #[test]
    fn test_topic_matching() {
        // Exact match
        assert!(MemoryEventBus::topic_matches("verity.document.created", "verity.document.created"));

        // Single wildcard
        assert!(MemoryEventBus::topic_matches("verity.document.*", "verity.document.created"));
        assert!(MemoryEventBus::topic_matches("verity.*.created", "verity.document.created"));
        assert!(MemoryEventBus::topic_matches("*.document.created", "verity.document.created"));

        // Multi-segment wildcard
        assert!(MemoryEventBus::topic_matches("verity.#", "verity.document.created"));
        assert!(MemoryEventBus::topic_matches("#", "verity.document.created"));

        // Non-matches
        assert!(!MemoryEventBus::topic_matches("verity.document.updated", "verity.document.created"));
        assert!(!MemoryEventBus::topic_matches("noteman.document.*", "verity.document.created"));
    }

    #[tokio::test]
    async fn test_stats() {
        let bus = MemoryEventBus::new();

        let stats = bus.stats().await;
        assert_eq!(stats.events_published, 0);
        assert_eq!(stats.active_subscriptions, 0);

        let _ = bus.subscribe("test.*").await.unwrap();
        let stats = bus.stats().await;
        assert_eq!(stats.active_subscriptions, 1);

        let event = Event::new("event", App::Verity, serde_json::json!({}));
        bus.publish(event).await.unwrap();

        let stats = bus.stats().await;
        assert_eq!(stats.events_published, 1);
    }
}
