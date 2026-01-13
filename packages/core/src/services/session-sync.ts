/**
 * @fileoverview Cross-app session synchronization service
 * @module @relay/platform/services/session-sync
 *
 * Uses Redis pub/sub to synchronize authentication events across
 * all Relay Platform applications.
 */

import type { Redis } from 'ioredis';
import type { RelayApp } from '../types/rbac';
import {
  AuthEventType,
  LogoutType,
  type AuthEvent,
  type PermissionChanges,
  createAuthEvent,
} from '../types/events';

/**
 * Redis channel for auth events
 */
export const AUTH_EVENTS_CHANNEL = 'relay:auth:events';

/**
 * Session sync event handler
 */
export type SessionSyncHandler = (event: AuthEvent) => Promise<void>;

/**
 * Session sync service configuration
 */
export interface SessionSyncConfig {
  /** Redis client for publishing */
  redis: Redis;
  /** Redis client for subscribing (must be separate connection) */
  redisSubscriber?: Redis;
  /** Current app identifier */
  currentApp: RelayApp;
  /** Event handlers */
  handlers?: Partial<Record<AuthEventType, SessionSyncHandler>>;
  /** Whether to auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;
}

/**
 * Session sync service for cross-app authentication
 */
export class SessionSyncService {
  private redis: Redis;
  private subscriber: Redis | null = null;
  private currentApp: RelayApp;
  private handlers: Map<AuthEventType, SessionSyncHandler[]> = new Map();
  private isListening = false;
  private autoReconnect: boolean;
  private reconnectDelay: number;

  /**
   * Create a new session sync service
   */
  constructor(config: SessionSyncConfig) {
    this.redis = config.redis;
    this.currentApp = config.currentApp;
    this.autoReconnect = config.autoReconnect ?? true;
    this.reconnectDelay = config.reconnectDelay ?? 5000;

    // Set up subscriber if provided
    if (config.redisSubscriber) {
      this.subscriber = config.redisSubscriber;
    }

    // Register provided handlers
    if (config.handlers) {
      for (const [eventType, handler] of Object.entries(config.handlers)) {
        if (handler) {
          this.on(eventType as AuthEventType, handler);
        }
      }
    }
  }

  /**
   * Start listening for auth events
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      return;
    }

    if (!this.subscriber) {
      // Create a duplicate connection for subscribing
      // Note: Caller should provide their own duplicate connection in production
      throw new Error('Subscriber Redis connection required. Please provide redisSubscriber in config.');
    }

    this.isListening = true;

    // Set up message handler
    this.subscriber.on('message', async (channel, message) => {
      if (channel !== AUTH_EVENTS_CHANNEL) return;

      try {
        const event = JSON.parse(message) as AuthEvent;
        await this.handleEvent(event);
      } catch (error) {
        console.error('[SessionSync] Failed to process event:', error);
      }
    });

    // Handle reconnection
    if (this.autoReconnect) {
      this.subscriber.on('error', (error) => {
        console.error('[SessionSync] Redis error:', error);
      });

      this.subscriber.on('close', () => {
        console.warn('[SessionSync] Redis connection closed, attempting reconnect...');
        setTimeout(() => {
          if (this.isListening) {
            this.subscriber?.subscribe(AUTH_EVENTS_CHANNEL).catch(console.error);
          }
        }, this.reconnectDelay);
      });
    }

    // Subscribe to auth events channel
    await this.subscriber.subscribe(AUTH_EVENTS_CHANNEL);
    console.log(`[SessionSync] Listening for auth events on ${AUTH_EVENTS_CHANNEL}`);
  }

  /**
   * Stop listening for auth events
   */
  async stopListening(): Promise<void> {
    if (!this.isListening || !this.subscriber) {
      return;
    }

    this.isListening = false;
    await this.subscriber.unsubscribe(AUTH_EVENTS_CHANNEL);
    console.log('[SessionSync] Stopped listening for auth events');
  }

  /**
   * Register an event handler
   */
  on(eventType: AuthEventType, handler: SessionSyncHandler): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Remove an event handler
   */
  off(eventType: AuthEventType, handler: SessionSyncHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Publish a login event
   */
  async publishLogin(params: {
    sessionId: string;
    userId: string;
    email: string;
    organizationId?: string;
    apps: RelayApp[];
    loginMethod: 'password' | 'oauth' | 'sso' | 'magic_link';
    mfaUsed: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.PLATFORM_LOGIN, params);
    await this.publish(event);
  }

  /**
   * Publish a logout event
   */
  async publishLogout(params: {
    sessionId: string;
    userId: string;
    logoutType: LogoutType;
    reason?: string;
    affectedApps?: RelayApp[];
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.PLATFORM_LOGOUT, {
      ...params,
      affectedApps: params.affectedApps ?? [this.currentApp],
    });
    await this.publish(event);
  }

  /**
   * Publish a session refresh event
   */
  async publishSessionRefresh(params: {
    sessionId: string;
    userId: string;
    newExpiresAt: Date;
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.SESSION_REFRESH, {
      ...params,
      newExpiresAt: params.newExpiresAt.toISOString(),
    });
    await this.publish(event);
  }

  /**
   * Publish a permissions updated event
   */
  async publishPermissionsUpdated(params: {
    userId: string;
    organizationId: string;
    changes: PermissionChanges;
    updatedBy: string;
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.PERMISSIONS_UPDATED, params, {
      organizationId: params.organizationId,
    });
    await this.publish(event);
  }

  /**
   * Publish a security invalidation event (force logout)
   */
  async publishSecurityInvalidation(params: {
    userId: string;
    reason: 'password_change' | 'security_breach' | 'admin_action' | 'suspicious_activity';
    affectedSessions: string[];
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.SECURITY_INVALIDATION, params);
    await this.publish(event);
  }

  /**
   * Publish an MFA status changed event
   */
  async publishMfaStatusChanged(params: {
    userId: string;
    enabled: boolean;
    method?: string;
  }): Promise<void> {
    const event = createAuthEvent(AuthEventType.MFA_STATUS_CHANGED, params);
    await this.publish(event);
  }

  /**
   * Publish an event to the auth events channel
   */
  private async publish(event: AuthEvent): Promise<void> {
    const message = JSON.stringify(event);
    await this.redis.publish(AUTH_EVENTS_CHANNEL, message);
    console.log(`[SessionSync] Published event: ${event.type}`);
  }

  /**
   * Handle an incoming event
   */
  private async handleEvent(event: AuthEvent): Promise<void> {
    console.log(`[SessionSync] Received event: ${event.type}`);

    const handlers = this.handlers.get(event.type as AuthEventType);
    if (!handlers || handlers.length === 0) {
      return;
    }

    // Run all handlers
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[SessionSync] Handler error for ${event.type}:`, error);
        }
      }),
    );
  }
}

/**
 * Create default handlers for common session sync scenarios
 */
export function createDefaultHandlers(options: {
  /** Function to invalidate a session */
  invalidateSession: (sessionId: string) => Promise<void>;
  /** Function to invalidate all sessions for a user */
  invalidateUserSessions: (userId: string) => Promise<void>;
  /** Function to update user permissions cache */
  updatePermissionsCache?: (userId: string, changes: PermissionChanges) => Promise<void>;
}): Partial<Record<AuthEventType, SessionSyncHandler>> {
  return {
    [AuthEventType.PLATFORM_LOGOUT]: async (event) => {
      const payload = event.payload as { sessionId: string; logoutType: LogoutType };
      if (payload.logoutType === LogoutType.ALL_DEVICES) {
        await options.invalidateUserSessions(event.userId!);
      } else {
        await options.invalidateSession(payload.sessionId);
      }
    },

    [AuthEventType.SECURITY_INVALIDATION]: async (event) => {
      const payload = event.payload as { userId: string; affectedSessions: string[] };
      for (const sessionId of payload.affectedSessions) {
        await options.invalidateSession(sessionId);
      }
    },

    [AuthEventType.PERMISSIONS_UPDATED]: async (event) => {
      if (options.updatePermissionsCache) {
        const payload = event.payload as { userId: string; changes: PermissionChanges };
        await options.updatePermissionsCache(payload.userId, payload.changes);
      }
    },
  };
}

/**
 * Create a session sync service with Redis connections
 */
export function createSessionSyncService(
  redis: Redis,
  redisSubscriber: Redis,
  currentApp: RelayApp,
  handlers?: Partial<Record<AuthEventType, SessionSyncHandler>>,
): SessionSyncService {
  return new SessionSyncService({
    redis,
    redisSubscriber,
    currentApp,
    handlers,
  });
}
