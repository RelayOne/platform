/**
 * @fileoverview Tests for @relay/cache package
 * @module tests/cache
 *
 * Tests for the unified caching layer with memory cache fallback.
 * Redis tests are skipped unless REDIS_URL is available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UnifiedCache,
  createCache,
  dedupe,
  memoize,
  cacheKey,
  CacheTags,
  CacheTTL,
  type CacheConfig,
} from '../src/index.js';

describe('UnifiedCache', () => {
  let cache: UnifiedCache;

  beforeEach(() => {
    // Create cache with memory-only mode for testing
    cache = new UnifiedCache({
      keyPrefix: 'test:',
      defaultTTL: 60,
      maxMemoryEntries: 100,
      enableCleanup: false, // Disable automatic cleanup for tests
    });
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('constructor', () => {
    it('should create cache with default config', () => {
      const defaultCache = new UnifiedCache();
      expect(defaultCache).toBeInstanceOf(UnifiedCache);
      defaultCache.close();
    });

    it('should accept custom configuration', () => {
      const customCache = new UnifiedCache({
        keyPrefix: 'custom:',
        defaultTTL: 120,
        maxMemoryEntries: 500,
      });
      expect(customCache).toBeInstanceOf(UnifiedCache);
      customCache.close();
    });
  });

  describe('set and get', () => {
    it('should set and get a value', async () => {
      await cache.set('user:123', { name: 'John', age: 30 });
      const value = await cache.get('user:123');
      expect(value).toEqual({ name: 'John', age: 30 });
    });

    it('should return undefined for non-existent key', async () => {
      const value = await cache.get('non-existent');
      expect(value).toBeUndefined();
    });

    it('should respect custom TTL', async () => {
      await cache.set('short-lived', 'data', { ttl: 1 });
      const valueBefore = await cache.get('short-lived');
      expect(valueBefore).toBe('data');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const valueAfter = await cache.get('short-lived');
      expect(valueAfter).toBeUndefined();
    });

    it('should handle various data types', async () => {
      await cache.set('string', 'hello');
      await cache.set('number', 42);
      await cache.set('boolean', true);
      await cache.set('array', [1, 2, 3]);
      await cache.set('object', { nested: { deep: 'value' } });
      await cache.set('null', null);

      expect(await cache.get('string')).toBe('hello');
      expect(await cache.get('number')).toBe(42);
      expect(await cache.get('boolean')).toBe(true);
      expect(await cache.get('array')).toEqual([1, 2, 3]);
      expect(await cache.get('object')).toEqual({ nested: { deep: 'value' } });
      expect(await cache.get('null')).toBeNull();
    });

    it('should overwrite existing values', async () => {
      await cache.set('key', 'value1');
      await cache.set('key', 'value2');
      expect(await cache.get('key')).toBe('value2');
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      await cache.set('cached', 'existing');
      const factory = vi.fn(() => 'new');
      const value = await cache.getOrSet('cached', factory);
      expect(value).toBe('existing');
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result if not exists', async () => {
      const factory = vi.fn(() => 'computed');
      const value = await cache.getOrSet('new-key', factory);
      expect(value).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);

      // Second call should use cached value
      const secondCall = await cache.getOrSet('new-key', factory);
      expect(secondCall).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should handle async factory', async () => {
      const factory = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      const value = await cache.getOrSet('async-key', factory);
      expect(value).toBe('async-result');
    });

    it('should apply cache options', async () => {
      const factory = () => 'data';
      await cache.getOrSet('tagged-key', factory, {
        ttl: 120,
        tags: ['users', 'active'],
      });

      expect(await cache.get('tagged-key')).toBe('data');
    });
  });

  describe('invalidate', () => {
    it('should invalidate a specific key', async () => {
      await cache.set('to-delete', 'data');
      expect(await cache.get('to-delete')).toBe('data');

      const result = await cache.invalidate('to-delete');
      expect(result).toBe(true);
      expect(await cache.get('to-delete')).toBeUndefined();
    });

    it('should return false for non-existent key', async () => {
      const result = await cache.invalidate('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('invalidateByTag', () => {
    it('should invalidate all entries with a tag', async () => {
      await cache.set('user:1', { id: 1 }, { tags: ['users'] });
      await cache.set('user:2', { id: 2 }, { tags: ['users'] });
      await cache.set('org:1', { id: 1 }, { tags: ['orgs'] });

      const count = await cache.invalidateByTag('users');
      expect(count).toBe(2);

      expect(await cache.get('user:1')).toBeUndefined();
      expect(await cache.get('user:2')).toBeUndefined();
      expect(await cache.get('org:1')).toEqual({ id: 1 });
    });

    it('should return 0 for non-existent tag', async () => {
      const count = await cache.invalidateByTag('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate entries matching pattern', async () => {
      await cache.set('user:1', { id: 1 });
      await cache.set('user:2', { id: 2 });
      await cache.set('org:1', { id: 1 });

      const count = await cache.invalidateByPattern(/user:/);
      expect(count).toBe(2);

      expect(await cache.get('user:1')).toBeUndefined();
      expect(await cache.get('user:2')).toBeUndefined();
      expect(await cache.get('org:1')).toEqual({ id: 1 });
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      await cache.set('exists', 'data');
      expect(await cache.has('exists')).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      expect(await cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired key', async () => {
      await cache.set('expired', 'data', { ttl: 1 });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await cache.has('expired')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      await cache.clear();

      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
      expect(await cache.get('key3')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should track cache statistics', async () => {
      // Initial stats
      const initialStats = cache.getStats();
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);
      expect(initialStats.size).toBe(0);

      // Add some entries
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Get existing keys (hits)
      await cache.get('key1');
      await cache.get('key2');

      // Get non-existing keys (misses)
      await cache.get('non-existent1');
      await cache.get('non-existent2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should calculate hit rate correctly', async () => {
      await cache.set('key', 'value');

      // 3 hits
      await cache.get('key');
      await cache.get('key');
      await cache.get('key');

      // 1 miss
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(75); // 3 / 4 = 75%
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      await cache.set('short', 'data', { ttl: 1 });
      await cache.set('long', 'data', { ttl: 3600 });

      // Wait for short-lived entry to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const count = cache.cleanup();
      expect(count).toBe(1);

      expect(await cache.get('short')).toBeUndefined();
      expect(await cache.get('long')).toBe('data');
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', async () => {
      const smallCache = new UnifiedCache({
        maxMemoryEntries: 3,
        enableCleanup: false,
      });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');

      // This should evict key1
      await smallCache.set('key4', 'value4');

      expect(await smallCache.get('key1')).toBeUndefined();
      expect(await smallCache.get('key2')).toBe('value2');
      expect(await smallCache.get('key3')).toBe('value3');
      expect(await smallCache.get('key4')).toBe('value4');

      await smallCache.close();
    });

    it('should update access order on get', async () => {
      const smallCache = new UnifiedCache({
        maxMemoryEntries: 3,
        enableCleanup: false,
      });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');

      // Access key1 to make it recently used
      await smallCache.get('key1');

      // This should evict key2 (least recently used)
      await smallCache.set('key4', 'value4');

      expect(await smallCache.get('key1')).toBe('value1');
      expect(await smallCache.get('key2')).toBeUndefined();

      await smallCache.close();
    });
  });

  describe('close', () => {
    it('should clean up resources', async () => {
      const testCache = new UnifiedCache({
        enableCleanup: true,
        cleanupInterval: 1000,
      });

      await testCache.set('key', 'value');
      await testCache.close();

      // After close, cache should be empty
      const stats = testCache.getStats();
      expect(stats.size).toBe(0);
    });
  });
});

describe('createCache', () => {
  it('should create a UnifiedCache instance', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(UnifiedCache);
    cache.close();
  });

  it('should pass config to UnifiedCache', () => {
    const cache = createCache({ keyPrefix: 'app:', defaultTTL: 120 });
    expect(cache).toBeInstanceOf(UnifiedCache);
    cache.close();
  });
});

describe('dedupe', () => {
  it('should deduplicate concurrent requests', async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'result';
    };

    // Run multiple concurrent requests
    const [result1, result2, result3] = await Promise.all([
      dedupe('key', factory),
      dedupe('key', factory),
      dedupe('key', factory),
    ]);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(result3).toBe('result');
    expect(callCount).toBe(1);
  });

  it('should allow different keys to run independently', async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      return 'result';
    };

    await Promise.all([
      dedupe('key1', factory),
      dedupe('key2', factory),
    ]);

    expect(callCount).toBe(2);
  });

  it('should clear pending request after completion', async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      return 'result';
    };

    await dedupe('key', factory);
    await dedupe('key', factory); // Should make a new request

    expect(callCount).toBe(2);
  });
});

describe('memoize', () => {
  it('should memoize function results', async () => {
    const cache = createCache({ enableCleanup: false });
    let callCount = 0;

    const fn = async (id: string) => {
      callCount++;
      return { id, name: 'User' };
    };

    const memoizedFn = memoize(fn, cache);

    const result1 = await memoizedFn('123');
    const result2 = await memoizedFn('123');

    expect(result1).toEqual({ id: '123', name: 'User' });
    expect(result2).toEqual(result1);
    expect(callCount).toBe(1);

    await cache.close();
  });

  it('should use custom key function', async () => {
    const cache = createCache({ enableCleanup: false });
    let callCount = 0;

    const fn = async (a: number, b: number) => {
      callCount++;
      return a + b;
    };

    const memoizedFn = memoize(fn, cache, {
      keyFn: (a, b) => `sum:${a}:${b}`,
    });

    await memoizedFn(1, 2);
    await memoizedFn(1, 2);
    await memoizedFn(2, 3);

    expect(callCount).toBe(2);

    await cache.close();
  });
});

describe('cacheKey', () => {
  it('should create key from components', () => {
    expect(cacheKey('user', 123, 'profile')).toBe('user:123:profile');
  });

  it('should filter out null and undefined', () => {
    expect(cacheKey('user', undefined, 'profile', null)).toBe('user:profile');
  });

  it('should handle single component', () => {
    expect(cacheKey('users')).toBe('users');
  });

  it('should handle numbers', () => {
    expect(cacheKey(1, 2, 3)).toBe('1:2:3');
  });
});

describe('CacheTags', () => {
  it('should have predefined tags', () => {
    expect(CacheTags.USERS).toBe('users');
    expect(CacheTags.DOCUMENTS).toBe('documents');
    expect(CacheTags.ORGANIZATIONS).toBe('organizations');
    expect(CacheTags.PROJECTS).toBe('projects');
    expect(CacheTags.SESSIONS).toBe('sessions');
  });
});

describe('CacheTTL', () => {
  it('should have predefined TTL values', () => {
    expect(CacheTTL.SHORT).toBe(60);
    expect(CacheTTL.MEDIUM).toBe(300);
    expect(CacheTTL.LONG).toBe(1800);
    expect(CacheTTL.VERY_LONG).toBe(3600);
    expect(CacheTTL.STATIC).toBe(86400);
    expect(CacheTTL.PERSISTENT).toBe(604800);
  });
});
