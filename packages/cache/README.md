# @relay/cache

Unified caching layer with Redis and in-memory fallback for Relay Platform applications.

## Features

- **Redis support** - Production-ready Redis integration with automatic reconnection
- **In-memory LRU fallback** - Automatic fallback when Redis is unavailable
- **Tag-based invalidation** - Invalidate groups of related cache entries
- **TTL support** - Automatic expiration with configurable time-to-live
- **Request deduplication** - Prevent duplicate concurrent requests
- **Memoization** - Easy function result caching
- **Cache statistics** - Monitor cache performance

## Installation

```bash
pnpm add @relay/cache
```

## Quick Start

```typescript
import { createCache, CacheTags, CacheTTL } from '@relay/cache';

// Create cache instance
const cache = createCache({
  redis: { url: process.env.REDIS_URL },
  keyPrefix: 'myapp:',
  defaultTTL: 300, // 5 minutes
});

// Get or set cached value
const user = await cache.getOrSet(
  'user:123',
  () => fetchUserFromDatabase(123),
  {
    ttl: CacheTTL.MEDIUM,
    tags: [CacheTags.USERS],
  }
);

// Invalidate by tag
await cache.invalidateByTag(CacheTags.USERS);
```

## Configuration

```typescript
import { createCache, CacheConfig } from '@relay/cache';

const config: CacheConfig = {
  // Redis configuration (optional)
  redis: {
    url: 'redis://localhost:6379',
    // Or specify individual options:
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0,
    keyPrefix: 'cache:',
    connectTimeout: 5000,
    maxRetriesPerRequest: 3,
  },

  // Cache options
  keyPrefix: 'myapp:',     // Prefix for all keys
  defaultTTL: 300,         // Default TTL in seconds
  maxMemoryEntries: 10000, // Max entries in memory cache
  enableCleanup: true,     // Enable automatic cleanup
  cleanupInterval: 300000, // Cleanup interval in ms
};

const cache = createCache(config);
```

## API Reference

### UnifiedCache

Main cache class with Redis and memory cache support.

```typescript
import { UnifiedCache, CacheOptions } from '@relay/cache';

const cache = new UnifiedCache(config);

// Set value
await cache.set('key', 'value', {
  ttl: 60,
  tags: ['users'],
});

// Get value
const value = await cache.get<string>('key');

// Get or compute value
const user = await cache.getOrSet('user:123', async () => {
  return await fetchUser(123);
}, { ttl: 300 });

// Check if key exists
const exists = await cache.has('key');

// Invalidate single key
await cache.invalidate('key');

// Invalidate by tag
await cache.invalidateByTag('users');

// Invalidate by pattern
await cache.invalidateByPattern(/user:\d+/);

// Clear all cache
await cache.clear();

// Get statistics
const stats = cache.getStats();

// Manual cleanup
const cleaned = cache.cleanup();

// Close cache (cleanup resources)
await cache.close();
```

### Request Deduplication

Prevents duplicate concurrent requests for the same resource.

```typescript
import { dedupe } from '@relay/cache';

// Multiple concurrent calls will share one request
const [user1, user2, user3] = await Promise.all([
  dedupe('user:123', () => fetchUser(123)),
  dedupe('user:123', () => fetchUser(123)),
  dedupe('user:123', () => fetchUser(123)),
]);
// Only one fetchUser call is made
```

### Memoization

Creates a memoized version of an async function.

```typescript
import { memoize, createCache } from '@relay/cache';

const cache = createCache();

const memoizedFetch = memoize(
  async (userId: string) => fetchUser(userId),
  cache,
  {
    ttl: 60,
    keyFn: (userId) => `user:${userId}`,
  }
);

// Results are cached automatically
const user = await memoizedFetch('123');
```

### Cache Key Builder

Helper for creating consistent cache keys.

```typescript
import { cacheKey } from '@relay/cache';

const key = cacheKey('user', userId, 'profile');
// Result: "user:123:profile"

// Null/undefined values are filtered out
const key2 = cacheKey('user', userId, null, 'settings');
// Result: "user:123:settings"
```

## Common Cache Tags

Pre-defined tags for common entity types:

```typescript
import { CacheTags } from '@relay/cache';

CacheTags.USERS         // 'users'
CacheTags.DOCUMENTS     // 'documents'
CacheTags.ORGANIZATIONS // 'organizations'
CacheTags.PROJECTS      // 'projects'
CacheTags.ASSERTIONS    // 'assertions'
CacheTags.SCANS         // 'scans'
CacheTags.ANALYTICS     // 'analytics'
CacheTags.SETTINGS      // 'settings'
CacheTags.INTEGRATIONS  // 'integrations'
CacheTags.SESSIONS      // 'sessions'
CacheTags.NOTIFICATIONS // 'notifications'
```

## Common TTL Values

Pre-defined TTL constants in seconds:

```typescript
import { CacheTTL } from '@relay/cache';

CacheTTL.SHORT      // 60 (1 minute)
CacheTTL.MEDIUM     // 300 (5 minutes)
CacheTTL.LONG       // 1800 (30 minutes)
CacheTTL.VERY_LONG  // 3600 (1 hour)
CacheTTL.STATIC     // 86400 (24 hours)
CacheTTL.PERSISTENT // 604800 (1 week)
```

## Cache Statistics

Monitor cache performance:

```typescript
const stats = cache.getStats();

console.log({
  hits: stats.hits,           // Total cache hits
  misses: stats.misses,       // Total cache misses
  size: stats.size,           // Current entry count
  hitRate: stats.hitRate,     // Hit rate percentage
  memoryUsage: stats.memoryUsage,   // Estimated memory usage
  redisConnected: stats.redisConnected, // Redis status
});
```

## Best Practices

1. **Use tags for related data** - Makes invalidation easier
2. **Choose appropriate TTLs** - Balance freshness vs. performance
3. **Always close the cache** - Clean up resources on shutdown
4. **Handle undefined returns** - Cache misses return `undefined`
5. **Use getOrSet for atomic operations** - Prevents race conditions
6. **Monitor cache statistics** - Track hit rate and memory usage

## Testing

```bash
pnpm test
```

## License

MIT
