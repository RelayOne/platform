import type Redis from 'ioredis';
import type { SessionData } from './types';
import { SessionDataSchema } from './types';
import { randomBytes } from 'crypto';

/**
 * Session management service using Redis.
 */
export class SessionService {
  private client: Redis;
  private keyPrefix: string;
  private defaultTtl: number;

  /**
   * Creates a new SessionService instance.
   * @param client - Redis client instance
   * @param options - Session service options
   */
  constructor(
    client: Redis,
    options?: {
      keyPrefix?: string;
      defaultTtl?: number;
    }
  ) {
    this.client = client;
    this.keyPrefix = options?.keyPrefix ?? 'session:';
    this.defaultTtl = options?.defaultTtl ?? 86400 * 7; // 7 days default
  }

  /**
   * Builds a session key.
   * @param sessionId - The session ID
   * @returns The prefixed key
   */
  private buildKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  /**
   * Builds a user sessions index key.
   * @param userId - The user ID
   * @returns The prefixed key
   */
  private buildUserKey(userId: string): string {
    return `${this.keyPrefix}user:${userId}`;
  }

  /**
   * Generates a secure session ID.
   * @returns A random session ID
   */
  public generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Creates a new session.
   * @param userId - The user ID
   * @param options - Session options
   * @returns The created session with its ID
   */
  public async createSession(
    userId: string,
    options?: {
      ttl?: number;
      deviceInfo?: SessionData['deviceInfo'];
      metadata?: SessionData['metadata'];
    }
  ): Promise<{ sessionId: string; session: SessionData }> {
    const sessionId = this.generateSessionId();
    const ttl = options?.ttl ?? this.defaultTtl;
    const now = Date.now();

    const session: SessionData = {
      userId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + ttl * 1000,
      deviceInfo: options?.deviceInfo,
      metadata: options?.metadata,
    };

    const key = this.buildKey(sessionId);
    const userKey = this.buildUserKey(userId);

    const pipeline = this.client.pipeline();
    pipeline.setex(key, ttl, JSON.stringify(session));
    pipeline.sadd(userKey, sessionId);
    await pipeline.exec();

    return { sessionId, session };
  }

  /**
   * Gets a session by ID.
   * @param sessionId - The session ID
   * @returns The session data or null if not found/expired
   */
  public async getSession(sessionId: string): Promise<SessionData | null> {
    const key = this.buildKey(sessionId);
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    try {
      const session = JSON.parse(data);
      const validatedSession = SessionDataSchema.parse(session);

      // Check if expired
      if (validatedSession.expiresAt < Date.now()) {
        await this.deleteSession(sessionId);
        return null;
      }

      return validatedSession;
    } catch {
      return null;
    }
  }

  /**
   * Updates the last activity timestamp and extends TTL.
   * @param sessionId - The session ID
   * @param ttl - Optional new TTL in seconds
   * @returns True if session was updated
   */
  public async touchSession(sessionId: string, ttl?: number): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const effectiveTtl = ttl ?? this.defaultTtl;
    const now = Date.now();

    session.lastActivity = now;
    session.expiresAt = now + effectiveTtl * 1000;

    const key = this.buildKey(sessionId);
    await this.client.setex(key, effectiveTtl, JSON.stringify(session));

    return true;
  }

  /**
   * Updates session metadata.
   * @param sessionId - The session ID
   * @param metadata - Metadata to merge
   * @returns True if session was updated
   */
  public async updateSessionMetadata(
    sessionId: string,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.metadata = { ...session.metadata, ...metadata };
    session.lastActivity = Date.now();

    const key = this.buildKey(sessionId);
    const ttl = await this.client.ttl(key);

    if (ttl > 0) {
      await this.client.setex(key, ttl, JSON.stringify(session));
    } else {
      await this.client.set(key, JSON.stringify(session));
    }

    return true;
  }

  /**
   * Deletes a session.
   * @param sessionId - The session ID
   * @returns True if session was deleted
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    const key = this.buildKey(sessionId);

    const result = await this.client.del(key);

    // Remove from user index
    if (session) {
      const userKey = this.buildUserKey(session.userId);
      await this.client.srem(userKey, sessionId);
    }

    return result > 0;
  }

  /**
   * Gets all sessions for a user.
   * @param userId - The user ID
   * @returns Array of session IDs and data
   */
  public async getUserSessions(userId: string): Promise<Array<{ sessionId: string; session: SessionData }>> {
    const userKey = this.buildUserKey(userId);
    const sessionIds = await this.client.smembers(userKey);

    const sessions: Array<{ sessionId: string; session: SessionData }> = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push({ sessionId, session });
      } else {
        // Clean up stale reference
        await this.client.srem(userKey, sessionId);
      }
    }

    return sessions;
  }

  /**
   * Gets the count of active sessions for a user.
   * @param userId - The user ID
   * @returns Number of active sessions
   */
  public async getUserSessionCount(userId: string): Promise<number> {
    const userKey = this.buildUserKey(userId);
    return this.client.scard(userKey);
  }

  /**
   * Deletes all sessions for a user.
   * @param userId - The user ID
   * @returns Number of deleted sessions
   */
  public async deleteUserSessions(userId: string): Promise<number> {
    const userKey = this.buildUserKey(userId);
    const sessionIds = await this.client.smembers(userKey);

    if (sessionIds.length === 0) {
      return 0;
    }

    const pipeline = this.client.pipeline();
    sessionIds.forEach(sessionId => {
      pipeline.del(this.buildKey(sessionId));
    });
    pipeline.del(userKey);

    await pipeline.exec();
    return sessionIds.length;
  }

  /**
   * Deletes all sessions for a user except the specified one.
   * @param userId - The user ID
   * @param exceptSessionId - Session ID to keep
   * @returns Number of deleted sessions
   */
  public async deleteOtherSessions(userId: string, exceptSessionId: string): Promise<number> {
    const userKey = this.buildUserKey(userId);
    const sessionIds = await this.client.smembers(userKey);

    const toDelete = sessionIds.filter(id => id !== exceptSessionId);

    if (toDelete.length === 0) {
      return 0;
    }

    const pipeline = this.client.pipeline();
    toDelete.forEach(sessionId => {
      pipeline.del(this.buildKey(sessionId));
      pipeline.srem(userKey, sessionId);
    });

    await pipeline.exec();
    return toDelete.length;
  }

  /**
   * Validates a session exists and is not expired.
   * @param sessionId - The session ID
   * @returns True if session is valid
   */
  public async isValidSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null;
  }

  /**
   * Gets session with automatic touch (sliding expiration).
   * @param sessionId - The session ID
   * @param touchTtl - TTL to use when touching (optional)
   * @returns The session data or null
   */
  public async getAndTouch(sessionId: string, touchTtl?: number): Promise<SessionData | null> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.touchSession(sessionId, touchTtl);
    }
    return session;
  }
}

/**
 * Creates a new SessionService instance.
 * @param client - Redis client instance
 * @param options - Session service options
 * @returns SessionService instance
 */
export function createSessionService(
  client: Redis,
  options?: {
    keyPrefix?: string;
    defaultTtl?: number;
  }
): SessionService {
  return new SessionService(client, options);
}
