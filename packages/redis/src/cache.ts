import type Redis from 'ioredis';
import type { CacheOptions } from './types';

/**
 * Cache service providing get/set operations with TTL, JSON serialization, and tags.
 */
export class CacheService {
  private client: Redis;
  private defaultTtl: number;
  private keyPrefix: string;

  /**
   * Creates a new CacheService instance.
   * @param client - Redis client instance
   * @param options - Cache service options
   */
  constructor(
    client: Redis,
    options?: {
      defaultTtl?: number;
      keyPrefix?: string;
    }
  ) {
    this.client = client;
    this.defaultTtl = options?.defaultTtl ?? 3600; // 1 hour default
    this.keyPrefix = options?.keyPrefix ?? 'cache:';
  }

  /**
   * Builds a cache key with prefix.
   * @param key - The base key
   * @returns The prefixed key
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Gets a value from cache.
   * @param key - The cache key
   * @param options - Cache options
   * @returns The cached value or null if not found
   */
  public async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key);
    const value = await this.client.get(fullKey);

    if (value === null) {
      return null;
    }

    if (options?.json !== false) {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    }

    return value as unknown as T;
  }

  /**
   * Sets a value in cache.
   * @param key - The cache key
   * @param value - The value to cache
   * @param options - Cache options
   */
  public async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key);
    const ttl = options?.ttl ?? this.defaultTtl;

    const serialized = options?.json !== false ? JSON.stringify(value) : String(value);

    if (ttl > 0) {
      await this.client.setex(fullKey, ttl, serialized);
    } else {
      await this.client.set(fullKey, serialized);
    }

    // Handle tags
    if (options?.tags && options.tags.length > 0) {
      await this.addKeyToTags(fullKey, options.tags);
    }
  }

  /**
   * Gets a value from cache or computes it if not found.
   * @param key - The cache key
   * @param compute - Function to compute the value if not cached
   * @param options - Cache options
   * @returns The cached or computed value
   */
  public async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key, options);

    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Deletes a value from cache.
   * @param key - The cache key
   * @returns True if the key was deleted
   */
  public async delete(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.client.del(fullKey);
    return result > 0;
  }

  /**
   * Deletes multiple keys from cache.
   * @param keys - The cache keys
   * @returns Number of deleted keys
   */
  public async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    const fullKeys = keys.map(k => this.buildKey(k));
    return this.client.del(...fullKeys);
  }

  /**
   * Checks if a key exists in cache.
   * @param key - The cache key
   * @returns True if the key exists
   */
  public async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.client.exists(fullKey);
    return result > 0;
  }

  /**
   * Gets the TTL of a cached key.
   * @param key - The cache key
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  public async ttl(key: string): Promise<number> {
    const fullKey = this.buildKey(key);
    return this.client.ttl(fullKey);
  }

  /**
   * Updates the TTL of a cached key.
   * @param key - The cache key
   * @param ttl - New TTL in seconds
   * @returns True if TTL was set
   */
  public async expire(key: string, ttl: number): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const result = await this.client.expire(fullKey, ttl);
    return result === 1;
  }

  /**
   * Increments a numeric value in cache.
   * @param key - The cache key
   * @param amount - Amount to increment (default: 1)
   * @returns The new value
   */
  public async increment(key: string, amount = 1): Promise<number> {
    const fullKey = this.buildKey(key);
    if (amount === 1) {
      return this.client.incr(fullKey);
    }
    return this.client.incrby(fullKey, amount);
  }

  /**
   * Decrements a numeric value in cache.
   * @param key - The cache key
   * @param amount - Amount to decrement (default: 1)
   * @returns The new value
   */
  public async decrement(key: string, amount = 1): Promise<number> {
    const fullKey = this.buildKey(key);
    if (amount === 1) {
      return this.client.decr(fullKey);
    }
    return this.client.decrby(fullKey, amount);
  }

  /**
   * Gets multiple values from cache.
   * @param keys - The cache keys
   * @param options - Cache options
   * @returns Map of key to value
   */
  public async getMany<T>(keys: string[], options?: CacheOptions): Promise<Map<string, T>> {
    if (keys.length === 0) {
      return new Map();
    }

    const fullKeys = keys.map(k => this.buildKey(k));
    const values = await this.client.mget(...fullKeys);

    const result = new Map<string, T>();

    keys.forEach((key, index) => {
      const value = values[index];
      if (value !== null) {
        if (options?.json !== false) {
          try {
            result.set(key, JSON.parse(value) as T);
          } catch {
            result.set(key, value as unknown as T);
          }
        } else {
          result.set(key, value as unknown as T);
        }
      }
    });

    return result;
  }

  /**
   * Sets multiple values in cache.
   * @param entries - Map of key to value
   * @param options - Cache options
   */
  public async setMany<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void> {
    if (entries.size === 0) {
      return;
    }

    const pipeline = this.client.pipeline();
    const ttl = options?.ttl ?? this.defaultTtl;

    entries.forEach((value, key) => {
      const fullKey = this.buildKey(key);
      const serialized = options?.json !== false ? JSON.stringify(value) : String(value);

      if (ttl > 0) {
        pipeline.setex(fullKey, ttl, serialized);
      } else {
        pipeline.set(fullKey, serialized);
      }
    });

    await pipeline.exec();
  }

  /**
   * Clears all keys matching a pattern.
   * @param pattern - Glob pattern (e.g., "user:*")
   * @returns Number of deleted keys
   */
  public async clearPattern(pattern: string): Promise<number> {
    const fullPattern = this.buildKey(pattern);
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = newCursor;

      if (keys.length > 0) {
        deletedCount += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deletedCount;
  }

  /**
   * Adds a key to tag sets for invalidation.
   * @param key - The cache key
   * @param tags - Tags to associate with the key
   */
  private async addKeyToTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.client.pipeline();

    tags.forEach(tag => {
      const tagKey = `${this.keyPrefix}tag:${tag}`;
      pipeline.sadd(tagKey, key);
    });

    await pipeline.exec();
  }

  /**
   * Invalidates all cache entries with a specific tag.
   * @param tag - The tag to invalidate
   * @returns Number of deleted keys
   */
  public async invalidateTag(tag: string): Promise<number> {
    const tagKey = `${this.keyPrefix}tag:${tag}`;
    const keys = await this.client.smembers(tagKey);

    if (keys.length === 0) {
      return 0;
    }

    const pipeline = this.client.pipeline();
    keys.forEach(key => pipeline.del(key));
    pipeline.del(tagKey);

    await pipeline.exec();
    return keys.length;
  }

  /**
   * Invalidates all cache entries with any of the specified tags.
   * @param tags - Tags to invalidate
   * @returns Number of deleted keys
   */
  public async invalidateTags(tags: string[]): Promise<number> {
    let total = 0;
    for (const tag of tags) {
      total += await this.invalidateTag(tag);
    }
    return total;
  }
}

/**
 * Creates a new CacheService instance.
 * @param client - Redis client instance
 * @param options - Cache service options
 * @returns CacheService instance
 */
export function createCacheService(
  client: Redis,
  options?: {
    defaultTtl?: number;
    keyPrefix?: string;
  }
): CacheService {
  return new CacheService(client, options);
}
