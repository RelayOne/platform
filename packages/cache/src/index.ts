/**
 * @fileoverview Unified caching layer with Redis and in-memory fallback
 * @module @relay/cache
 *
 * This package provides a unified caching layer that supports Redis for
 * distributed caching with an automatic in-memory LRU cache fallback.
 *
 * Features:
 * - Redis support with automatic reconnection
 * - In-memory LRU cache fallback when Redis is unavailable
 * - Tag-based cache invalidation
 * - TTL support with automatic expiration
 * - Request deduplication for concurrent requests
 * - Memoization utilities
 * - Cache statistics and monitoring
 *
 * @example
 * ```typescript
 * import { createCache, CacheTags, CacheTTL } from '@relay/cache';
 *
 * const cache = createCache({
 *   redis: { url: process.env.REDIS_URL },
 *   keyPrefix: 'myapp:',
 *   defaultTTL: 300,
 * });
 *
 * // Get or set cached value
 * const user = await cache.getOrSet('user:123', () => fetchUser(123), {
 *   ttl: CacheTTL.MEDIUM,
 *   tags: [CacheTags.USERS],
 * });
 *
 * // Invalidate by tag
 * await cache.invalidateByTag(CacheTags.USERS);
 * ```
 */

import Redis from 'ioredis';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Cache configuration options.
 */
export interface CacheConfig {
  /** Redis configuration (optional, uses memory cache if not provided) */
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    connectTimeout?: number;
    maxRetriesPerRequest?: number;
  };
  /** Key prefix for all cache keys */
  keyPrefix?: string;
  /** Default TTL in seconds (default: 300 = 5 minutes) */
  defaultTTL?: number;
  /** Maximum entries for memory cache (default: 10000) */
  maxMemoryEntries?: number;
  /** Enable automatic cleanup interval (default: true) */
  enableCleanup?: boolean;
  /** Cleanup interval in milliseconds (default: 300000 = 5 minutes) */
  cleanupInterval?: number;
}

/**
 * Options for individual cache operations.
 */
export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
  /** Cache tags for grouped invalidation */
  tags?: string[];
  /** Whether to refresh TTL on access */
  refreshOnAccess?: boolean;
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Current number of entries (memory cache) */
  size: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Estimated memory usage in bytes */
  memoryUsage: number;
  /** Whether Redis is connected */
  redisConnected: boolean;
}

/**
 * Internal cache entry structure.
 */
interface CacheEntry<T> {
  data: T;
  createdAt: number;
  ttl: number;
  tags: string[];
  hits: number;
}

// ============================================================================
// Unified Cache Implementation
// ============================================================================

/**
 * Unified cache implementation supporting Redis with memory fallback.
 */
export class UnifiedCache {
  private redis: Redis | null = null;
  private redisConnected = false;
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private accessOrder: string[] = [];
  private stats = { hits: 0, misses: 0 };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private readonly config: {
    keyPrefix: string;
    defaultTTL: number;
    maxMemoryEntries: number;
    enableCleanup: boolean;
    cleanupInterval: number;
    redis: CacheConfig['redis'] | undefined;
  };

  /**
   * Creates a new UnifiedCache instance.
   *
   * @param config - Cache configuration
   */
  constructor(config: CacheConfig = {}) {
    this.config = {
      keyPrefix: config.keyPrefix ?? '',
      defaultTTL: config.defaultTTL ?? 300,
      maxMemoryEntries: config.maxMemoryEntries ?? 10000,
      enableCleanup: config.enableCleanup ?? true,
      cleanupInterval: config.cleanupInterval ?? 300000,
      redis: config.redis ?? undefined,
    };

    // Initialize Redis if configured
    if (this.config.redis?.url || this.config.redis?.host) {
      this.initRedis();
    }

    // Start cleanup interval
    if (this.config.enableCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }
  }

  /**
   * Initializes Redis connection.
   */
  private initRedis(): void {
    try {
      const redisConfig = this.config.redis!;
      this.redis = new Redis({
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
        password: redisConfig.password,
        db: redisConfig.db ?? 0,
        keyPrefix: redisConfig.keyPrefix ?? this.config.keyPrefix,
        connectTimeout: redisConfig.connectTimeout ?? 5000,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest ?? 3,
        lazyConnect: true,
        ...(redisConfig.url ? { host: undefined, port: undefined } : {}),
      });

      if (redisConfig.url) {
        this.redis = new Redis(redisConfig.url, {
          keyPrefix: redisConfig.keyPrefix ?? this.config.keyPrefix,
          connectTimeout: redisConfig.connectTimeout ?? 5000,
          maxRetriesPerRequest: redisConfig.maxRetriesPerRequest ?? 3,
          lazyConnect: true,
        });
      }

      this.redis.on('connect', () => {
        this.redisConnected = true;
      });

      this.redis.on('error', () => {
        this.redisConnected = false;
      });

      this.redis.on('close', () => {
        this.redisConnected = false;
      });

      // Connect in background
      this.redis.connect().catch(() => {
        this.redisConnected = false;
      });
    } catch {
      this.redisConnected = false;
    }
  }

  /**
   * Gets a value from the cache.
   *
   * @param key - Cache key
   * @param options - Cache options
   * @returns Cached value or undefined
   */
  async get<T>(
    key: string,
    options?: Pick<CacheOptions, 'refreshOnAccess'>
  ): Promise<T | undefined> {
    const fullKey = this.getFullKey(key);

    // Try Redis first
    if (this.redisConnected && this.redis) {
      try {
        const value = await this.redis.get(fullKey);
        if (value !== null) {
          this.stats.hits++;
          return JSON.parse(value) as T;
        }
      } catch {
        // Redis error, fall through to memory cache
      }
    }

    // Memory cache fallback
    return this.memoryGet<T>(fullKey, options);
  }

  /**
   * Sets a value in the cache.
   *
   * @param key - Cache key
   * @param data - Data to cache
   * @param options - Cache options
   */
  async set<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.getFullKey(key);
    const ttl = options?.ttl ?? this.config.defaultTTL;
    const tags = options?.tags ?? [];

    // Set in Redis if available
    if (this.redisConnected && this.redis) {
      try {
        await this.redis.setex(fullKey, ttl, JSON.stringify(data));

        // Store tag associations
        for (const tag of tags) {
          await this.redis.sadd(`tag:${tag}`, fullKey);
        }
      } catch {
        // Redis error, continue to memory cache
      }
    }

    // Always set in memory cache as fallback
    this.memorySet(fullKey, data, { ttl, tags });
  }

  /**
   * Gets a value from cache or computes and caches it.
   *
   * @param key - Cache key
   * @param factory - Function to compute value if not cached
   * @param options - Cache options
   * @returns Cached or computed value
   */
  async getOrSet<T>(
    key: string,
    factory: () => T | Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== undefined) {
      return cached;
    }

    this.stats.misses++;
    const data = await factory();
    await this.set(key, data, options);
    return data;
  }

  /**
   * Invalidates a specific cache entry.
   *
   * @param key - Cache key to invalidate
   * @returns True if entry was invalidated
   */
  async invalidate(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    // Invalidate in Redis
    if (this.redisConnected && this.redis) {
      try {
        await this.redis.del(fullKey);
      } catch {
        // Redis error, continue
      }
    }

    // Invalidate in memory
    return this.memoryInvalidate(fullKey);
  }

  /**
   * Invalidates all cache entries with a specific tag.
   *
   * @param tag - Tag to invalidate
   * @returns Number of invalidated entries
   */
  async invalidateByTag(tag: string): Promise<number> {
    let count = 0;

    // Invalidate in Redis
    if (this.redisConnected && this.redis) {
      try {
        const keys = await this.redis.smembers(`tag:${tag}`);
        if (keys.length > 0) {
          count = await this.redis.del(...keys);
          await this.redis.del(`tag:${tag}`);
        }
      } catch {
        // Redis error, continue
      }
    }

    // Invalidate in memory
    count += this.memoryInvalidateByTag(tag);
    return count;
  }

  /**
   * Invalidates all cache entries matching a pattern.
   *
   * @param pattern - Regex pattern to match keys
   * @returns Number of invalidated entries
   */
  async invalidateByPattern(pattern: RegExp): Promise<number> {
    let count = 0;

    // For memory cache
    for (const key of this.memoryCache.keys()) {
      if (pattern.test(key)) {
        if (this.memoryInvalidate(key)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - Cache key
   * @returns True if key exists
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    if (this.redisConnected && this.redis) {
      try {
        return (await this.redis.exists(fullKey)) === 1;
      } catch {
        // Redis error, check memory
      }
    }

    return this.memoryHas(fullKey);
  }

  /**
   * Clears all cache entries.
   */
  async clear(): Promise<void> {
    // Clear Redis (only keys with our prefix)
    if (this.redisConnected && this.redis && this.config.keyPrefix) {
      try {
        const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch {
        // Redis error, continue
      }
    }

    // Clear memory cache
    this.memoryCache.clear();
    this.tagIndex.clear();
    this.accessOrder = [];
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.memoryCache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      memoryUsage: this.estimateMemoryUsage(),
      redisConnected: this.redisConnected,
    };
  }

  /**
   * Removes expired entries from the memory cache.
   *
   * @returns Number of cleaned up entries
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.createdAt > entry.ttl * 1000) {
        this.memoryInvalidate(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Closes the cache and cleans up resources.
   */
  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.redisConnected = false;
    }

    this.memoryCache.clear();
    this.tagIndex.clear();
    this.accessOrder = [];
  }

  // ============================================================================
  // Private Memory Cache Methods
  // ============================================================================

  private getFullKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
  }

  private memoryGet<T>(
    key: string,
    options?: Pick<CacheOptions, 'refreshOnAccess'>
  ): T | undefined {
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now - entry.createdAt > entry.ttl * 1000) {
      this.memoryInvalidate(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    entry.hits++;
    this.updateAccessOrder(key);

    if (options?.refreshOnAccess) {
      entry.createdAt = now;
    }

    return entry.data;
  }

  private memorySet<T>(
    key: string,
    data: T,
    options: { ttl: number; tags: string[] }
  ): void {
    // Evict if at capacity
    if (
      this.memoryCache.size >= this.config.maxMemoryEntries &&
      !this.memoryCache.has(key)
    ) {
      this.evictLRU();
    }

    // Remove from tag index if updating
    if (this.memoryCache.has(key)) {
      this.removeFromTagIndex(key);
    }

    const entry: CacheEntry<T> = {
      data,
      createdAt: Date.now(),
      ttl: options.ttl,
      tags: options.tags,
      hits: 0,
    };

    this.memoryCache.set(key, entry);
    this.updateAccessOrder(key);
    this.addToTagIndex(key, options.tags);
  }

  private memoryInvalidate(key: string): boolean {
    if (!this.memoryCache.has(key)) {
      return false;
    }

    this.removeFromTagIndex(key);
    this.memoryCache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return true;
  }

  private memoryInvalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) {
      return 0;
    }

    let count = 0;
    for (const key of keys) {
      if (this.memoryInvalidate(key)) {
        count++;
      }
    }

    this.tagIndex.delete(tag);
    return count;
  }

  private memoryHas(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now - entry.createdAt > entry.ttl * 1000) {
      this.memoryInvalidate(key);
      return false;
    }

    return true;
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }
    const oldestKey = this.accessOrder[0];
    if (oldestKey) {
      this.memoryInvalidate(oldestKey);
    }
  }

  private addToTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagIndex.set(tag, keys);
      }
      keys.add(key);
    }
  }

  private removeFromTagIndex(key: string): void {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return;
    }

    for (const tag of entry.tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  private estimateMemoryUsage(): number {
    let bytes = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      bytes += key.length * 2;
      bytes += JSON.stringify(entry.data).length * 2;
      bytes += 100; // Overhead for entry metadata
    }
    return bytes;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new cache instance.
 *
 * @param config - Cache configuration
 * @returns UnifiedCache instance
 *
 * @example
 * ```typescript
 * const cache = createCache({
 *   redis: { url: process.env.REDIS_URL },
 *   keyPrefix: 'myapp:',
 * });
 * ```
 */
export function createCache(config?: CacheConfig): UnifiedCache {
  return new UnifiedCache(config);
}

// ============================================================================
// Request Deduplication
// ============================================================================

const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * Deduplicates concurrent requests for the same key.
 *
 * @param key - Unique key for the request
 * @param factory - Function to execute
 * @returns Result of the factory function
 *
 * @example
 * ```typescript
 * // Multiple concurrent calls with same key will share one request
 * const [user1, user2] = await Promise.all([
 *   dedupe('user:123', () => fetchUser(123)),
 *   dedupe('user:123', () => fetchUser(123)),
 * ]);
 * // Only one fetchUser call is made
 * ```
 */
export async function dedupe<T>(
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = factory().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

// ============================================================================
// Memoization
// ============================================================================

/**
 * Creates a memoized version of an async function.
 *
 * @param fn - Function to memoize
 * @param cache - Cache instance to use
 * @param options - Cache options and key function
 * @returns Memoized function
 *
 * @example
 * ```typescript
 * const memoizedFetch = memoize(
 *   (id: string) => fetchUser(id),
 *   cache,
 *   { ttl: 60, keyFn: (id) => `user:${id}` }
 * );
 * ```
 */
export function memoize<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  cache: UnifiedCache,
  options?: CacheOptions & { keyFn?: (...args: TArgs) => string }
): (...args: TArgs) => Promise<TResult> {
  const keyFn = options?.keyFn || ((...args: TArgs) => JSON.stringify(args));

  return async (...args: TArgs): Promise<TResult> => {
    const key = `memoize:${fn.name || 'anonymous'}:${keyFn(...args)}`;
    return cache.getOrSet(key, () => fn(...args), options);
  };
}

// ============================================================================
// Cache Key Builder
// ============================================================================

/**
 * Creates a cache key from components.
 *
 * @param components - Key components
 * @returns Cache key string
 *
 * @example
 * ```typescript
 * cacheKey('user', userId, 'profile') // "user:123:profile"
 * ```
 */
export function cacheKey(
  ...components: (string | number | undefined | null)[]
): string {
  return components.filter((c) => c != null).join(':');
}

// ============================================================================
// Common Cache Tags
// ============================================================================

/**
 * Common cache tags for entity types.
 */
export const CacheTags = {
  USERS: 'users',
  DOCUMENTS: 'documents',
  ORGANIZATIONS: 'organizations',
  PROJECTS: 'projects',
  ASSERTIONS: 'assertions',
  SCANS: 'scans',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  INTEGRATIONS: 'integrations',
  SESSIONS: 'sessions',
  NOTIFICATIONS: 'notifications',
} as const;

/**
 * Cache tag type.
 */
export type CacheTag = (typeof CacheTags)[keyof typeof CacheTags];

// ============================================================================
// Common TTL Values
// ============================================================================

/**
 * Common TTL values in seconds.
 */
export const CacheTTL = {
  /** 1 minute */
  SHORT: 60,
  /** 5 minutes */
  MEDIUM: 300,
  /** 30 minutes */
  LONG: 1800,
  /** 1 hour */
  VERY_LONG: 3600,
  /** 24 hours */
  STATIC: 86400,
  /** 1 week */
  PERSISTENT: 604800,
} as const;

/**
 * Cache TTL type.
 */
export type CacheTTLValue = (typeof CacheTTL)[keyof typeof CacheTTL];

// ============================================================================
// Default Export
// ============================================================================

export default UnifiedCache;
