import type Redis from 'ioredis';
import type { LockOptions, LockResult } from './types';
import { randomBytes } from 'crypto';

/**
 * Distributed lock service using Redis.
 * Implements the Redlock algorithm for single-node Redis.
 */
export class LockService {
  private client: Redis;
  private keyPrefix: string;

  /**
   * Creates a new LockService instance.
   * @param client - Redis client instance
   * @param options - Lock service options
   */
  constructor(
    client: Redis,
    options?: {
      keyPrefix?: string;
    }
  ) {
    this.client = client;
    this.keyPrefix = options?.keyPrefix ?? 'lock:';
  }

  /**
   * Builds a lock key.
   * @param resource - The resource to lock
   * @returns The prefixed key
   */
  private buildKey(resource: string): string {
    return `${this.keyPrefix}${resource}`;
  }

  /**
   * Generates a unique lock token.
   * @returns A random token
   */
  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Acquires a lock on a resource.
   * @param resource - The resource to lock
   * @param options - Lock options
   * @returns Lock result with token if successful
   */
  public async acquire(resource: string, options: LockOptions): Promise<LockResult> {
    const key = this.buildKey(resource);
    const token = this.generateToken();
    const ttlMs = options.ttlMs;
    const retryAttempts = options.retryAttempts ?? 0;
    const retryDelayMs = options.retryDelayMs ?? 100;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      // Try to set the lock with NX (only if not exists)
      const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        return {
          acquired: true,
          token,
        };
      }

      // If this isn't our last attempt, wait and retry
      if (attempt < retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }

    return {
      acquired: false,
      error: 'Lock is held by another process',
    };
  }

  /**
   * Releases a lock.
   * @param resource - The resource to unlock
   * @param token - The lock token from acquire()
   * @returns True if lock was released
   */
  public async release(resource: string, token: string): Promise<boolean> {
    const key = this.buildKey(resource);

    // Lua script to atomically check and delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.client.eval(script, 1, key, token);
    return result === 1;
  }

  /**
   * Extends the TTL of an existing lock.
   * @param resource - The resource
   * @param token - The lock token
   * @param ttlMs - New TTL in milliseconds
   * @returns True if lock was extended
   */
  public async extend(resource: string, token: string, ttlMs: number): Promise<boolean> {
    const key = this.buildKey(resource);

    // Lua script to atomically check and extend
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.client.eval(script, 1, key, token, ttlMs);
    return result === 1;
  }

  /**
   * Checks if a resource is locked.
   * @param resource - The resource
   * @returns True if locked
   */
  public async isLocked(resource: string): Promise<boolean> {
    const key = this.buildKey(resource);
    const result = await this.client.exists(key);
    return result > 0;
  }

  /**
   * Gets the remaining TTL of a lock.
   * @param resource - The resource
   * @returns TTL in milliseconds, -1 if no TTL, -2 if not locked
   */
  public async getTtl(resource: string): Promise<number> {
    const key = this.buildKey(resource);
    return this.client.pttl(key);
  }

  /**
   * Executes a function with an acquired lock.
   * Automatically releases the lock after execution.
   * @param resource - The resource to lock
   * @param fn - Function to execute while holding the lock
   * @param options - Lock options
   * @returns Result of the function or error
   */
  public async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions
  ): Promise<{ success: true; result: T } | { success: false; error: string }> {
    const lockResult = await this.acquire(resource, options);

    if (!lockResult.acquired) {
      return {
        success: false,
        error: lockResult.error ?? 'Failed to acquire lock',
      };
    }

    try {
      const result = await fn();
      return { success: true, result };
    } finally {
      await this.release(resource, lockResult.token!);
    }
  }

  /**
   * Force releases a lock regardless of token.
   * Use with caution - only for administrative purposes.
   * @param resource - The resource
   * @returns True if lock was deleted
   */
  public async forceRelease(resource: string): Promise<boolean> {
    const key = this.buildKey(resource);
    const result = await this.client.del(key);
    return result > 0;
  }
}

/**
 * Creates a new LockService instance.
 * @param client - Redis client instance
 * @param options - Lock service options
 * @returns LockService instance
 */
export function createLockService(
  client: Redis,
  options?: {
    keyPrefix?: string;
  }
): LockService {
  return new LockService(client, options);
}
