/**
 * @relay/redis - Shared Redis utilities for the Relay Platform
 *
 * This package provides:
 * - Connection management with health checks
 * - Caching with TTL, tags, and JSON serialization
 * - Pub/Sub for cross-service messaging
 * - Session management with sliding expiration
 * - Rate limiting with sliding window algorithm
 * - Distributed locking
 *
 * @example
 * ```typescript
 * import {
 *   createRedisConnection,
 *   createCacheService,
 *   createPubSubService,
 *   createSessionService,
 *   createRateLimiter,
 *   createLockService,
 * } from '@relay/redis';
 *
 * // Create connection
 * const connection = createRedisConnection({
 *   host: 'localhost',
 *   port: 6379,
 * });
 *
 * const client = await connection.connect();
 *
 * // Use services
 * const cache = createCacheService(client);
 * const pubsub = createPubSubService(client);
 * const sessions = createSessionService(client);
 * const rateLimiter = createRateLimiter(client);
 * const locks = createLockService(client);
 *
 * // Cache operations
 * await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 * const user = await cache.get('user:123');
 *
 * // Pub/Sub
 * await pubsub.subscribe('events', (msg) => console.log(msg));
 * await pubsub.publish('events', 'user.created', { userId: '123' });
 *
 * // Sessions
 * const { sessionId, session } = await sessions.createSession('user-123');
 * const validSession = await sessions.getSession(sessionId);
 *
 * // Rate limiting
 * const result = await rateLimiter.consume('user-123', 'api', { max: 100, windowSeconds: 60 });
 * if (!result.allowed) {
 *   console.log(`Rate limited. Retry in ${result.retryAfterSeconds}s`);
 * }
 *
 * // Distributed locks
 * const lock = await locks.acquire('resource-123', { ttlMs: 5000 });
 * if (lock.acquired) {
 *   try {
 *     // Do work...
 *   } finally {
 *     await locks.release('resource-123', lock.token!);
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Connection management
export { RedisConnection, createRedisConnection, createRedisConnectionFromEnv } from './connection';

// Caching
export { CacheService, createCacheService } from './cache';

// Pub/Sub
export { PubSubService, createPubSubService } from './pubsub';

// Session management
export { SessionService, createSessionService } from './session';

// Rate limiting
export { RateLimiter, createRateLimiter } from './ratelimit';

// Distributed locking
export { LockService, createLockService } from './lock';

// Types
export type {
  RedisConfig,
  RedisHealthCheck,
  CacheOptions,
  SessionData,
  PubSubMessage,
  MessageHandler,
  RateLimitOptions,
  RateLimitResult,
  LockOptions,
  LockResult,
  ConnectionState,
  ConnectionStateEvent,
} from './types';

// Zod schemas for validation
export { RedisConfigSchema, SessionDataSchema } from './types';
