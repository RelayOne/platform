# @relay/redis

Shared Redis utilities for the Relay Platform. Provides caching, pub/sub messaging, session management, rate limiting, and distributed locking.

## Features

- **Connection Management**: Singleton pattern with health checks and auto-reconnection
- **Caching**: TTL, JSON serialization, tag-based invalidation
- **Pub/Sub**: Cross-service messaging with typed handlers
- **Sessions**: Session management with sliding expiration
- **Rate Limiting**: Sliding window algorithm for API protection
- **Distributed Locks**: Redlock-style locking for resource coordination

## Installation

```bash
pnpm add @relay/redis ioredis
# or
npm install @relay/redis ioredis
```

## Quick Start

```typescript
import {
  createRedisConnection,
  createCacheService,
  createSessionService,
  createRateLimiter,
} from '@relay/redis';

// 1. Create connection
const connection = createRedisConnection({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
});

// 2. Connect
const client = await connection.connect();

// 3. Create services
const cache = createCacheService(client);
const sessions = createSessionService(client);
const rateLimiter = createRateLimiter(client);

// 4. Use services
await cache.set('key', { data: 'value' }, { ttl: 3600 });
const { sessionId } = await sessions.createSession('user-123');
const { allowed } = await rateLimiter.consume('user-123', 'api', { max: 100, windowSeconds: 60 });
```

## Connection Configuration

```typescript
import { createRedisConnection, type RedisConfig } from '@relay/redis';

const config: RedisConfig = {
  // Connection
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  // Or use URL
  url: 'redis://:password@localhost:6379/0',

  // Key prefix for namespacing
  keyPrefix: 'myapp:',

  // Timeouts
  connectTimeout: 10000,
  commandTimeout: 5000,

  // TLS
  tls: true,

  // Retries
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,

  // Application name
  name: 'my-service',

  // Lazy connect
  lazyConnect: false,
};

const connection = createRedisConnection(config);
```

## Environment Variables

```bash
REDIS_URL=redis://:password@localhost:6379/0
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_DB=0
REDIS_KEY_PREFIX=myapp:
REDIS_TLS=true
```

```typescript
import { createRedisConnectionFromEnv } from '@relay/redis';

const connection = createRedisConnectionFromEnv();
```

## Caching

```typescript
import { createCacheService } from '@relay/redis';

const cache = createCacheService(client, {
  defaultTtl: 3600,  // 1 hour
  keyPrefix: 'cache:',
});

// Basic operations
await cache.set('user:123', { name: 'John', email: 'john@example.com' });
const user = await cache.get<User>('user:123');
await cache.delete('user:123');

// With TTL
await cache.set('session', data, { ttl: 300 }); // 5 minutes

// Get or compute
const result = await cache.getOrSet('expensive:query', async () => {
  return await expensiveOperation();
}, { ttl: 600 });

// Batch operations
const users = await cache.getMany<User>(['user:1', 'user:2', 'user:3']);
await cache.setMany(new Map([
  ['user:1', user1],
  ['user:2', user2],
]));

// Numeric operations
await cache.increment('counter');
await cache.decrement('counter', 5);

// Pattern clearing
await cache.clearPattern('user:*');

// Tag-based invalidation
await cache.set('post:1', post, { tags: ['posts', 'user:123'] });
await cache.invalidateTag('user:123'); // Clears all entries with this tag
```

## Pub/Sub

```typescript
import { createPubSubService, type PubSubMessage } from '@relay/redis';

const pubsub = createPubSubService(client, undefined, 'my-service');

// Subscribe to channel
await pubsub.subscribe<UserEvent>('user.events', (message, channel) => {
  console.log(`Received ${message.type} on ${channel}:`, message.payload);
});

// Subscribe to pattern
await pubsub.psubscribe<Event>('events:*', (message, channel) => {
  console.log(`Pattern match on ${channel}:`, message);
});

// Publish
await pubsub.publish('user.events', 'user.created', {
  userId: '123',
  email: 'john@example.com',
});

// With correlation ID for tracking
await pubsub.publish('user.events', 'user.updated', payload, 'req-123');

// Unsubscribe
await pubsub.unsubscribe('user.events');
await pubsub.punsubscribe('events:*');

// Cleanup
await pubsub.close();
```

## Session Management

```typescript
import { createSessionService, type SessionData } from '@relay/redis';

const sessions = createSessionService(client, {
  keyPrefix: 'session:',
  defaultTtl: 86400 * 7, // 7 days
});

// Create session
const { sessionId, session } = await sessions.createSession('user-123', {
  ttl: 3600,
  deviceInfo: {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  },
  metadata: {
    role: 'admin',
  },
});

// Get session
const session = await sessions.getSession(sessionId);

// Sliding expiration (touch on activity)
await sessions.touchSession(sessionId);

// Get with automatic touch
const session = await sessions.getAndTouch(sessionId);

// Update metadata
await sessions.updateSessionMetadata(sessionId, { lastPage: '/dashboard' });

// Delete session (logout)
await sessions.deleteSession(sessionId);

// Get all user sessions
const userSessions = await sessions.getUserSessions('user-123');

// Delete all sessions (logout everywhere)
await sessions.deleteUserSessions('user-123');

// Delete other sessions (logout from other devices)
await sessions.deleteOtherSessions('user-123', currentSessionId);

// Validate session
const isValid = await sessions.isValidSession(sessionId);
```

## Rate Limiting

```typescript
import { createRateLimiter, type RateLimitOptions } from '@relay/redis';

const rateLimiter = createRateLimiter(client, {
  keyPrefix: 'ratelimit:',
});

// Check without consuming
const check = await rateLimiter.check('user-123', 'api', {
  max: 100,
  windowSeconds: 60,
});

// Check and consume
const result = await rateLimiter.consume('user-123', 'api', {
  max: 100,      // 100 requests
  windowSeconds: 60,  // per minute
});

if (!result.allowed) {
  res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: result.retryAfterSeconds,
  });
  return;
}

console.log(`${result.remaining} requests remaining`);

// Different limits for different actions
await rateLimiter.consume('user-123', 'login', { max: 5, windowSeconds: 300 });
await rateLimiter.consume('user-123', 'search', { max: 30, windowSeconds: 60 });

// Reset rate limit
await rateLimiter.reset('user-123', 'api');

// Get current count
const count = await rateLimiter.getCount('user-123', 'api', 60);
```

## Distributed Locking

```typescript
import { createLockService, type LockOptions } from '@relay/redis';

const locks = createLockService(client, {
  keyPrefix: 'lock:',
});

// Acquire lock
const lock = await locks.acquire('resource:123', {
  ttlMs: 5000,  // Lock expires after 5 seconds
  retryAttempts: 3,  // Retry 3 times if lock is held
  retryDelayMs: 100,  // Wait 100ms between retries
});

if (lock.acquired) {
  try {
    // Do work while holding the lock
    await doExclusiveWork();
  } finally {
    // Always release the lock
    await locks.release('resource:123', lock.token!);
  }
}

// Using withLock for automatic release
const result = await locks.withLock(
  'resource:123',
  async () => {
    return await doExclusiveWork();
  },
  { ttlMs: 5000 }
);

if (result.success) {
  console.log('Result:', result.result);
} else {
  console.log('Failed to acquire lock:', result.error);
}

// Extend lock TTL
await locks.extend('resource:123', lock.token!, 10000);

// Check if locked
const isLocked = await locks.isLocked('resource:123');

// Get remaining TTL
const ttl = await locks.getTtl('resource:123');

// Force release (admin only)
await locks.forceRelease('resource:123');
```

## Health Checks

```typescript
const connection = createRedisConnection(config);
await connection.connect();

// Manual health check
const health = await connection.healthCheck();
console.log(health);
// {
//   healthy: true,
//   responseTimeMs: 2,
//   serverInfo: {
//     version: '7.2.0',
//     mode: 'standalone',
//     connectedClients: 5,
//     usedMemoryHuman: '2.5M',
//   }
// }

// Periodic health checks
connection.startHealthCheck(30000, (result) => {
  if (!result.healthy) {
    console.error('Redis unhealthy:', result.error);
  }
});

// Stop health checks
connection.stopHealthCheck();
```

## Connection State Monitoring

```typescript
const connection = createRedisConnection(config);

connection.onStateChange((event) => {
  console.log(`Redis: ${event.previousState} -> ${event.newState}`);
  if (event.error) {
    console.error('Connection error:', event.error);
  }
});

// States: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'end'
```

## TypeScript Types

```typescript
import type {
  // Configuration
  RedisConfig,
  RedisHealthCheck,

  // Cache
  CacheOptions,

  // Pub/Sub
  PubSubMessage,
  MessageHandler,

  // Sessions
  SessionData,

  // Rate Limiting
  RateLimitOptions,
  RateLimitResult,

  // Locking
  LockOptions,
  LockResult,

  // Connection
  ConnectionState,
  ConnectionStateEvent,
} from '@relay/redis';

// Zod schemas for validation
import { RedisConfigSchema, SessionDataSchema } from '@relay/redis';
```

## Best Practices

1. **Use singleton pattern**: `RedisConnection.getInstance()` returns the same instance
2. **Use key prefixes**: Namespace your keys to avoid collisions
3. **Set appropriate TTLs**: Don't cache indefinitely
4. **Handle connection errors**: Use `onStateChange` for monitoring
5. **Use tags for cache invalidation**: Group related cache entries
6. **Release locks in finally blocks**: Ensure locks are always released
7. **Set lock TTLs appropriately**: Not too short, not too long
8. **Use rate limiting on public endpoints**: Protect against abuse
9. **Close pub/sub on shutdown**: Clean up subscriptions

## License

MIT
