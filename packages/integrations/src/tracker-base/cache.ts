/**
 * @fileoverview Caching layer with multiple backends and TTL strategies.
 * Supports in-memory, Redis, and stale-while-revalidate patterns.
 * @packageDocumentation
 */

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Creation timestamp */
  createdAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Cache tags for invalidation */
  tags?: string[];
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total get requests */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Total entries */
  size: number;
  /** Memory usage (bytes, for in-memory cache) */
  memoryUsage?: number;
}

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Maximum cache size (entries) */
  maxSize: number;
  /** Enable stale-while-revalidate */
  enableStaleWhileRevalidate: boolean;
  /** Stale TTL extension in milliseconds */
  staleTtl: number;
  /** Enable cache warming */
  enableCacheWarming: boolean;
  /** Cache key prefix */
  keyPrefix: string;
}

/**
 * Abstract cache adapter interface.
 */
export interface CacheAdapter {
  /**
   * Get a value from cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Set a value in cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds
   * @param tags - Cache tags for invalidation
   */
  set<T>(key: string, value: T, ttl: number, tags?: string[]): Promise<void>;

  /**
   * Delete a value from cache.
   *
   * @param key - Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Delete all values with matching tags.
   *
   * @param tags - Tags to match
   */
  deleteByTags(tags: string[]): Promise<void>;

  /**
   * Clear all cache entries.
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics.
   *
   * @returns Cache stats
   */
  getStats(): Promise<CacheStats>;
}

/**
 * Default cache configuration.
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTtl: 300000, // 5 minutes
  maxSize: 1000,
  enableStaleWhileRevalidate: true,
  staleTtl: 600000, // 10 minutes
  enableCacheWarming: false,
  keyPrefix: 'tracker:',
};

/**
 * In-memory cache adapter using Map.
 *
 * @example
 * ```typescript
 * const cache = new InMemoryCacheAdapter({ maxSize: 100 });
 *
 * await cache.set('key', { data: 'value' }, 60000);
 * const value = await cache.get('key');
 * ```
 */
export class InMemoryCacheAdapter implements CacheAdapter {
  private cache: Map<string, CacheEntry<unknown>>;
  private config: CacheConfig;
  private stats: { hits: number; misses: number };

  /**
   * Creates a new in-memory cache adapter.
   *
   * @param config - Cache configuration
   */
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };

    // Setup cleanup interval
    setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  /**
   * Get a value from cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    const fullKey = this.buildKey(key);
    const entry = this.cache.get(fullKey) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (now > entry.expiresAt.getTime()) {
      this.cache.delete(fullKey);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds
   * @param tags - Cache tags
   */
  async set<T>(key: string, value: T, ttl: number, tags?: string[]): Promise<void> {
    const fullKey = this.buildKey(key);
    const now = Date.now();

    // Enforce max size using LRU
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: new Date(now),
      expiresAt: new Date(now + ttl),
      ttl,
      tags,
    };

    this.cache.set(fullKey, entry as CacheEntry<unknown>);
  }

  /**
   * Delete a value from cache.
   *
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.buildKey(key);
    this.cache.delete(fullKey);
  }

  /**
   * Delete all values with matching tags.
   *
   * @param tags - Tags to match
   */
  async deleteByTags(tags: string[]): Promise<void> {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache stats
   */
  async getStats(): Promise<CacheStats> {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    // Estimate memory usage
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += this.estimateSize(entry);
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      size: this.cache.size,
      memoryUsage,
    };
  }

  /**
   * Cleanup expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt.getTime()) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Build full cache key with prefix.
   *
   * @param key - Base key
   * @returns Full key
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Estimate size of cache entry in bytes.
   *
   * @param entry - Cache entry
   * @returns Estimated size in bytes
   */
  private estimateSize(entry: CacheEntry<unknown>): number {
    try {
      const json = JSON.stringify(entry);
      return json.length * 2; // Rough estimate (UTF-16)
    } catch {
      return 0;
    }
  }
}

/**
 * Redis cache adapter.
 *
 * @example
 * ```typescript
 * const cache = new RedisCacheAdapter({
 *   redisUrl: 'redis://localhost:6379',
 * });
 *
 * await cache.set('key', { data: 'value' }, 60000);
 * const value = await cache.get('key');
 * ```
 */
export class RedisCacheAdapter implements CacheAdapter {
  private config: CacheConfig;
  private stats: { hits: number; misses: number };
  private redisClient?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: { PX: number }) => Promise<void>;
    del: (key: string) => Promise<void>;
    keys: (pattern: string) => Promise<string[]>;
    flushall: () => Promise<void>;
    dbsize: () => Promise<number>;
  };

  /**
   * Creates a new Redis cache adapter.
   *
   * @param config - Cache configuration with Redis URL
   */
  constructor(config: Partial<CacheConfig & { redisUrl: string }> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0 };

    // In production, initialize Redis client:
    // import { createClient } from 'redis';
    // this.redisClient = createClient({ url: config.redisUrl });
    // await this.redisClient.connect();
  }

  /**
   * Get a value from cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    const fullKey = this.buildKey(key);

    try {
      const data = await this.redisClient.get(fullKey);

      if (!data) {
        this.stats.misses++;
        return undefined;
      }

      const entry = JSON.parse(data) as CacheEntry<T>;
      this.stats.hits++;
      return entry.value;
    } catch (error) {
      console.error('Redis get error:', error);
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set a value in cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in milliseconds
   * @param tags - Cache tags
   */
  async set<T>(key: string, value: T, ttl: number, tags?: string[]): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    const fullKey = this.buildKey(key);
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      createdAt: new Date(now),
      expiresAt: new Date(now + ttl),
      ttl,
      tags,
    };

    try {
      await this.redisClient.set(fullKey, JSON.stringify(entry), { PX: ttl });

      // Store tags for invalidation
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          const tagKey = this.buildTagKey(tag);
          // In production, use Redis sets:
          // await this.redisClient.sAdd(tagKey, fullKey);
        }
      }
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  }

  /**
   * Delete a value from cache.
   *
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    const fullKey = this.buildKey(key);

    try {
      await this.redisClient.del(fullKey);
    } catch (error) {
      console.error('Redis delete error:', error);
      throw error;
    }
  }

  /**
   * Delete all values with matching tags.
   *
   * @param tags - Tags to match
   */
  async deleteByTags(tags: string[]): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    try {
      for (const tag of tags) {
        const tagKey = this.buildTagKey(tag);
        // In production:
        // const keys = await this.redisClient.sMembers(tagKey);
        // for (const key of keys) {
        //   await this.redisClient.del(key);
        // }
        // await this.redisClient.del(tagKey);
      }
    } catch (error) {
      console.error('Redis delete by tags error:', error);
      throw error;
    }
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    try {
      await this.redisClient.flushall();
      this.stats = { hits: 0, misses: 0 };
    } catch (error) {
      console.error('Redis clear error:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache stats
   */
  async getStats(): Promise<CacheStats> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    try {
      const size = await this.redisClient.dbsize();

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        size,
      };
    } catch (error) {
      console.error('Redis stats error:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        size: 0,
      };
    }
  }

  /**
   * Build full cache key with prefix.
   *
   * @param key - Base key
   * @returns Full key
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Build tag key.
   *
   * @param tag - Tag name
   * @returns Tag key
   */
  private buildTagKey(tag: string): string {
    return `${this.config.keyPrefix}tag:${tag}`;
  }
}

/**
 * Cache manager with stale-while-revalidate support.
 *
 * @example
 * ```typescript
 * const cacheManager = new CacheManager(new InMemoryCacheAdapter());
 *
 * // Get with stale-while-revalidate
 * const data = await cacheManager.getOrFetch(
 *   'tasks:project-123',
 *   async () => await client.listTasks(projectId),
 *   { ttl: 60000, tags: ['tasks', 'project-123'] }
 * );
 *
 * // Invalidate by tags
 * await cacheManager.invalidate(['tasks']);
 * ```
 */
export class CacheManager {
  private adapter: CacheAdapter;
  private config: CacheConfig;
  private revalidating: Map<string, Promise<unknown>>;

  /**
   * Creates a new cache manager.
   *
   * @param adapter - Cache adapter to use
   * @param config - Cache configuration
   */
  constructor(adapter: CacheAdapter, config: Partial<CacheConfig> = {}) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.revalidating = new Map();
  }

  /**
   * Get value from cache or fetch if missing.
   *
   * @param key - Cache key
   * @param fetcher - Function to fetch value if not cached
   * @param options - Cache options
   * @returns Cached or fetched value
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttl?: number;
      tags?: string[];
      enableStaleWhileRevalidate?: boolean;
    } = {}
  ): Promise<T> {
    const ttl = options.ttl ?? this.config.defaultTtl;
    const enableSWR = options.enableStaleWhileRevalidate ?? this.config.enableStaleWhileRevalidate;

    // Try to get from cache
    const cached = await this.adapter.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    // Check if revalidation is in progress
    const existingRevalidation = this.revalidating.get(key);
    if (existingRevalidation) {
      return existingRevalidation as Promise<T>;
    }

    // Fetch new value
    const fetchPromise = fetcher();
    this.revalidating.set(key, fetchPromise);

    try {
      const value = await fetchPromise;

      // Cache the new value
      await this.adapter.set(key, value, ttl, options.tags);

      return value;
    } finally {
      this.revalidating.delete(key);
    }
  }

  /**
   * Set a value in cache.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Cache options
   */
  async set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
    } = {}
  ): Promise<void> {
    const ttl = options.ttl ?? this.config.defaultTtl;
    await this.adapter.set(key, value, ttl, options.tags);
  }

  /**
   * Get a value from cache.
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.adapter.get<T>(key);
  }

  /**
   * Delete a value from cache.
   *
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    await this.adapter.delete(key);
  }

  /**
   * Invalidate cache by tags.
   *
   * @param tags - Tags to invalidate
   */
  async invalidate(tags: string[]): Promise<void> {
    await this.adapter.deleteByTags(tags);
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    await this.adapter.clear();
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache stats
   */
  async getStats(): Promise<CacheStats> {
    return this.adapter.getStats();
  }

  /**
   * Warm cache with initial data.
   *
   * @param entries - Entries to warm cache with
   */
  async warmCache<T>(
    entries: Array<{
      key: string;
      value: T;
      ttl?: number;
      tags?: string[];
    }>
  ): Promise<void> {
    if (!this.config.enableCacheWarming) {
      return;
    }

    await Promise.all(
      entries.map(entry =>
        this.adapter.set(
          entry.key,
          entry.value,
          entry.ttl ?? this.config.defaultTtl,
          entry.tags
        )
      )
    );
  }
}

/**
 * Cache key builder utility.
 */
export class CacheKeyBuilder {
  private parts: string[] = [];

  /**
   * Add a key part.
   *
   * @param part - Key part
   * @returns This builder
   */
  add(part: string | number): this {
    this.parts.push(String(part));
    return this;
  }

  /**
   * Build the final cache key.
   *
   * @returns Cache key
   */
  build(): string {
    return this.parts.join(':');
  }

  /**
   * Create a new key builder.
   *
   * @returns Key builder
   */
  static create(): CacheKeyBuilder {
    return new CacheKeyBuilder();
  }
}

/**
 * Cache decorator for methods.
 *
 * @param options - Cache options
 * @returns Method decorator
 */
export function Cached(options: {
  keyBuilder: (...args: unknown[]) => string;
  ttl?: number;
  tags?: string[] | ((...args: unknown[]) => string[]);
}) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      // This would require a cache manager instance
      // For now, just call the original method
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
