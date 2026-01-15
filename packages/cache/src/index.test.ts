/**
 * @fileoverview Tests for @relay/cache package
 * @module @relay/cache/tests
 *
 * Comprehensive test suite for the unified cache implementation.
 * Tests memory cache functionality without requiring Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UnifiedCache,
  createCache,
  dedupe,
  memoize,
  cacheKey,
  CacheTags,
  CacheTTL,
  type CacheConfig,
  type CacheOptions,
} from './index';

// Mock ioredis to prevent actual Redis connections
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error('No Redis')),
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      sadd: vi.fn(),
      smembers: vi.fn(),
      keys: vi.fn(),
      exists: vi.fn(),
      quit: vi.fn(),
    })),
  };
});

describe('@relay/cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UnifiedCache', () => {
    describe('constructor', () => {
      it('should create cache with default options', async () => {
        const cache = new UnifiedCache();
        expect(cache).toBeInstanceOf(UnifiedCache);
        await cache.close();
      });

      it('should create cache with custom options', async () => {
        const cache = new UnifiedCache({
          keyPrefix: 'test:',
          defaultTTL: 600,
          maxMemoryEntries: 5000,
          enableCleanup: false,
        });
        expect(cache).toBeInstanceOf(UnifiedCache);
        await cache.close();
      });

      it('should start cleanup interval by default', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ cleanupInterval: 1000 });

        // Set some data that will expire
        await cache.set('test', 'value', { ttl: 1 });

        // Fast forward past expiration
        vi.advanceTimersByTime(2000);

        await cache.close();
        vi.useRealTimers();
      });

      it('should not start cleanup when disabled', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        expect(cache).toBeInstanceOf(UnifiedCache);
        await cache.close();
      });
    });

    describe('set and get', () => {
      it('should store and retrieve values', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key1', 'value1');
        const result = await cache.get<string>('key1');

        expect(result).toBe('value1');
        await cache.close();
      });

      it('should store objects', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        const obj = { name: 'test', count: 42 };

        await cache.set('object', obj);
        const result = await cache.get<typeof obj>('object');

        expect(result).toEqual(obj);
        await cache.close();
      });

      it('should store arrays', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        const arr = [1, 2, 3, 'test'];

        await cache.set('array', arr);
        const result = await cache.get<typeof arr>('array');

        expect(result).toEqual(arr);
        await cache.close();
      });

      it('should return undefined for non-existent keys', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        const result = await cache.get('nonexistent');

        expect(result).toBeUndefined();
        await cache.close();
      });

      it('should use key prefix', async () => {
        const cache = new UnifiedCache({
          keyPrefix: 'prefix:',
          enableCleanup: false,
        });

        await cache.set('key', 'value');
        const result = await cache.get('key');

        expect(result).toBe('value');
        await cache.close();
      });

      it('should respect TTL', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('expiring', 'value', { ttl: 1 });

        // Before expiration
        let result = await cache.get('expiring');
        expect(result).toBe('value');

        // After expiration
        vi.advanceTimersByTime(2000);
        result = await cache.get('expiring');
        expect(result).toBeUndefined();

        await cache.close();
        vi.useRealTimers();
      });

      it('should use default TTL when not specified', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({
          defaultTTL: 5,
          enableCleanup: false,
        });

        await cache.set('key', 'value');

        // Before default TTL
        let result = await cache.get('key');
        expect(result).toBe('value');

        // After default TTL
        vi.advanceTimersByTime(6000);
        result = await cache.get('key');
        expect(result).toBeUndefined();

        await cache.close();
        vi.useRealTimers();
      });

      it('should refresh TTL on access when option set', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key', 'value', { ttl: 5 });

        // Access at 3 seconds with refresh
        vi.advanceTimersByTime(3000);
        await cache.get('key', { refreshOnAccess: true });

        // Original TTL would have expired at 5s, but we refreshed at 3s
        vi.advanceTimersByTime(3000);
        const result = await cache.get('key');
        expect(result).toBe('value');

        await cache.close();
        vi.useRealTimers();
      });
    });

    describe('getOrSet', () => {
      it('should return cached value if exists', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        const factory = vi.fn().mockReturnValue('new value');

        await cache.set('key', 'cached value');
        const result = await cache.getOrSet('key', factory);

        expect(result).toBe('cached value');
        expect(factory).not.toHaveBeenCalled();
        await cache.close();
      });

      it('should compute and cache value if not exists', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        const factory = vi.fn().mockReturnValue('computed');

        const result = await cache.getOrSet('key', factory);

        expect(result).toBe('computed');
        expect(factory).toHaveBeenCalledTimes(1);

        // Verify it was cached
        const cached = await cache.get('key');
        expect(cached).toBe('computed');

        await cache.close();
      });

      it('should work with async factory', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });
        const factory = vi.fn().mockResolvedValue('async result');

        const result = await cache.getOrSet('key', factory);

        expect(result).toBe('async result');
        await cache.close();
      });

      it('should apply cache options', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.getOrSet('key', () => 'value', { ttl: 2 });

        // Before expiration
        let result = await cache.get('key');
        expect(result).toBe('value');

        // After expiration
        vi.advanceTimersByTime(3000);
        result = await cache.get('key');
        expect(result).toBeUndefined();

        await cache.close();
        vi.useRealTimers();
      });
    });

    describe('invalidate', () => {
      it('should invalidate specific key', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key1', 'value1');
        await cache.set('key2', 'value2');

        const invalidated = await cache.invalidate('key1');

        expect(invalidated).toBe(true);
        expect(await cache.get('key1')).toBeUndefined();
        expect(await cache.get('key2')).toBe('value2');

        await cache.close();
      });

      it('should return false for non-existent key', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        const invalidated = await cache.invalidate('nonexistent');

        expect(invalidated).toBe(false);
        await cache.close();
      });
    });

    describe('invalidateByTag', () => {
      it('should invalidate all entries with tag', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('user:1', 'Alice', { tags: ['users'] });
        await cache.set('user:2', 'Bob', { tags: ['users'] });
        await cache.set('product:1', 'Widget', { tags: ['products'] });

        const count = await cache.invalidateByTag('users');

        expect(count).toBe(2);
        expect(await cache.get('user:1')).toBeUndefined();
        expect(await cache.get('user:2')).toBeUndefined();
        expect(await cache.get('product:1')).toBe('Widget');

        await cache.close();
      });

      it('should return 0 for non-existent tag', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        const count = await cache.invalidateByTag('nonexistent');

        expect(count).toBe(0);
        await cache.close();
      });
    });

    describe('invalidateByPattern', () => {
      it('should invalidate entries matching pattern', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('user:1:profile', 'data1');
        await cache.set('user:2:profile', 'data2');
        await cache.set('product:1', 'product');

        const count = await cache.invalidateByPattern(/user:\d+:profile/);

        expect(count).toBe(2);
        expect(await cache.get('user:1:profile')).toBeUndefined();
        expect(await cache.get('product:1')).toBe('product');

        await cache.close();
      });
    });

    describe('has', () => {
      it('should return true for existing key', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key', 'value');

        expect(await cache.has('key')).toBe(true);
        await cache.close();
      });

      it('should return false for non-existent key', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        expect(await cache.has('nonexistent')).toBe(false);
        await cache.close();
      });

      it('should return false for expired key', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key', 'value', { ttl: 1 });

        vi.advanceTimersByTime(2000);

        expect(await cache.has('key')).toBe(false);
        await cache.close();
        vi.useRealTimers();
      });
    });

    describe('clear', () => {
      it('should clear all entries', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key1', 'value1');
        await cache.set('key2', 'value2');

        await cache.clear();

        expect(await cache.get('key1')).toBeUndefined();
        expect(await cache.get('key2')).toBeUndefined();
        await cache.close();
      });
    });

    describe('getStats', () => {
      it('should return cache statistics', async () => {
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('key', 'value');
        await cache.get('key'); // hit
        await cache.get('nonexistent'); // miss

        const stats = cache.getStats();

        expect(stats.hits).toBeGreaterThanOrEqual(1);
        expect(stats.misses).toBeGreaterThanOrEqual(1);
        expect(stats.size).toBe(1);
        expect(stats.hitRate).toBeGreaterThan(0);
        expect(stats.memoryUsage).toBeGreaterThan(0);
        expect(stats.redisConnected).toBe(false);

        await cache.close();
      });
    });

    describe('cleanup', () => {
      it('should remove expired entries', async () => {
        vi.useFakeTimers();
        const cache = new UnifiedCache({ enableCleanup: false });

        await cache.set('expired1', 'value1', { ttl: 1 });
        await cache.set('expired2', 'value2', { ttl: 1 });
        await cache.set('valid', 'value3', { ttl: 60 });

        vi.advanceTimersByTime(2000);

        const cleaned = cache.cleanup();

        expect(cleaned).toBe(2);
        expect(await cache.get('expired1')).toBeUndefined();
        expect(await cache.get('valid')).toBe('value3');

        await cache.close();
        vi.useRealTimers();
      });
    });

    describe('LRU eviction', () => {
      it('should evict least recently used entries when at capacity', async () => {
        const cache = new UnifiedCache({
          maxMemoryEntries: 3,
          enableCleanup: false,
        });

        await cache.set('key1', 'value1');
        await cache.set('key2', 'value2');
        await cache.set('key3', 'value3');

        // Access key1 to make it recently used
        await cache.get('key1');

        // This should evict key2 (oldest accessed)
        await cache.set('key4', 'value4');

        expect(await cache.get('key1')).toBe('value1');
        expect(await cache.get('key2')).toBeUndefined();
        expect(await cache.get('key3')).toBe('value3');
        expect(await cache.get('key4')).toBe('value4');

        await cache.close();
      });
    });

    describe('close', () => {
      it('should cleanup resources', async () => {
        const cache = new UnifiedCache();

        await cache.set('key', 'value');
        await cache.close();

        // After close, cache should be empty
        const stats = cache.getStats();
        expect(stats.size).toBe(0);
      });
    });
  });

  describe('createCache', () => {
    it('should create cache with default config', async () => {
      const cache = createCache();
      expect(cache).toBeInstanceOf(UnifiedCache);
      await cache.close();
    });

    it('should create cache with custom config', async () => {
      const cache = createCache({
        keyPrefix: 'test:',
        defaultTTL: 120,
      });
      expect(cache).toBeInstanceOf(UnifiedCache);
      await cache.close();
    });
  });

  describe('dedupe', () => {
    it('should deduplicate concurrent requests', async () => {
      const factory = vi.fn().mockResolvedValue('result');

      const [result1, result2, result3] = await Promise.all([
        dedupe('key', factory),
        dedupe('key', factory),
        dedupe('key', factory),
      ]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(result3).toBe('result');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should allow new requests after completion', async () => {
      const factory = vi.fn().mockResolvedValue('result');

      await dedupe('key', factory);
      await dedupe('key', factory);

      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('should not interfere between different keys', async () => {
      const factory1 = vi.fn().mockResolvedValue('result1');
      const factory2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        dedupe('key1', factory1),
        dedupe('key2', factory2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(factory1).toHaveBeenCalledTimes(1);
      expect(factory2).toHaveBeenCalledTimes(1);
    });

    it('should handle errors and allow retry', async () => {
      const factory = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await expect(dedupe('key', factory)).rejects.toThrow('fail');

      const result = await dedupe('key', factory);
      expect(result).toBe('success');
    });
  });

  describe('memoize', () => {
    it('should memoize function results', async () => {
      const cache = new UnifiedCache({ enableCleanup: false });
      const fn = vi.fn().mockResolvedValue('result');

      const memoized = memoize(fn, cache);

      const result1 = await memoized('arg1');
      const result2 = await memoized('arg1');

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);

      await cache.close();
    });

    it('should call function for different arguments', async () => {
      const cache = new UnifiedCache({ enableCleanup: false });
      const fn = vi.fn().mockImplementation((x) => Promise.resolve(x * 2));

      const memoized = memoize(fn, cache);

      await memoized(1);
      await memoized(2);

      expect(fn).toHaveBeenCalledTimes(2);
      await cache.close();
    });

    it('should use custom key function', async () => {
      const cache = new UnifiedCache({ enableCleanup: false });
      const fn = vi.fn().mockResolvedValue('result');

      const memoized = memoize(fn, cache, {
        keyFn: (id: string) => `custom:${id}`,
      });

      await memoized('test');
      await memoized('test');

      expect(fn).toHaveBeenCalledTimes(1);
      await cache.close();
    });
  });

  describe('cacheKey', () => {
    it('should create key from components', () => {
      expect(cacheKey('user', 123, 'profile')).toBe('user:123:profile');
    });

    it('should filter out null and undefined', () => {
      expect(cacheKey('user', null, 'profile', undefined)).toBe('user:profile');
    });

    it('should handle single component', () => {
      expect(cacheKey('single')).toBe('single');
    });

    it('should handle numbers', () => {
      expect(cacheKey(1, 2, 3)).toBe('1:2:3');
    });
  });

  describe('CacheTags', () => {
    it('should export all cache tags', () => {
      expect(CacheTags.USERS).toBe('users');
      expect(CacheTags.DOCUMENTS).toBe('documents');
      expect(CacheTags.ORGANIZATIONS).toBe('organizations');
      expect(CacheTags.PROJECTS).toBe('projects');
      expect(CacheTags.ASSERTIONS).toBe('assertions');
      expect(CacheTags.SCANS).toBe('scans');
      expect(CacheTags.ANALYTICS).toBe('analytics');
      expect(CacheTags.SETTINGS).toBe('settings');
      expect(CacheTags.INTEGRATIONS).toBe('integrations');
      expect(CacheTags.SESSIONS).toBe('sessions');
      expect(CacheTags.NOTIFICATIONS).toBe('notifications');
    });
  });

  describe('CacheTTL', () => {
    it('should export all TTL constants', () => {
      expect(CacheTTL.SHORT).toBe(60);
      expect(CacheTTL.MEDIUM).toBe(300);
      expect(CacheTTL.LONG).toBe(1800);
      expect(CacheTTL.VERY_LONG).toBe(3600);
      expect(CacheTTL.STATIC).toBe(86400);
      expect(CacheTTL.PERSISTENT).toBe(604800);
    });
  });
});
