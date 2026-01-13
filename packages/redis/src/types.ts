import { z } from 'zod';

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis server host */
  host?: string;
  /** Redis server port */
  port?: number;
  /** Redis password */
  password?: string;
  /** Database number (0-15) */
  db?: number;
  /** Connection URL (alternative to host/port) */
  url?: string;
  /** Key prefix for namespacing */
  keyPrefix?: string;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Enable TLS */
  tls?: boolean;
  /** Maximum number of retries */
  maxRetriesPerRequest?: number;
  /** Enable read replicas */
  enableReadyCheck?: boolean;
  /** Application name for monitoring */
  name?: string;
  /** Lazy connect (don't connect until first command) */
  lazyConnect?: boolean;
}

/**
 * Zod schema for Redis configuration validation
 */
export const RedisConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  password: z.string().optional(),
  db: z.number().int().min(0).max(15).optional(),
  url: z.string().optional(),
  keyPrefix: z.string().optional(),
  connectTimeout: z.number().int().min(1000).optional(),
  commandTimeout: z.number().int().min(100).optional(),
  tls: z.boolean().optional(),
  maxRetriesPerRequest: z.number().int().min(0).optional(),
  enableReadyCheck: z.boolean().optional(),
  name: z.string().optional(),
  lazyConnect: z.boolean().optional(),
});

/**
 * Health check result for Redis connection
 */
export interface RedisHealthCheck {
  /** Whether the connection is healthy */
  healthy: boolean;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Error message if unhealthy */
  error?: string;
  /** Server information */
  serverInfo?: {
    version: string;
    mode: string;
    connectedClients: number;
    usedMemoryHuman: string;
  };
}

/**
 * Cache options for get/set operations
 */
export interface CacheOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Whether to use JSON serialization */
  json?: boolean;
  /** Optional cache tags for invalidation */
  tags?: string[];
}

/**
 * Session data structure
 */
export interface SessionData {
  /** User ID */
  userId: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Session expiration timestamp */
  expiresAt: number;
  /** Device information */
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for session data validation
 */
export const SessionDataSchema = z.object({
  userId: z.string().min(1),
  createdAt: z.number(),
  lastActivity: z.number(),
  expiresAt: z.number(),
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    platform: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Pub/Sub message structure
 */
export interface PubSubMessage<T = unknown> {
  /** Message type/event name */
  type: string;
  /** Message payload */
  payload: T;
  /** Timestamp when message was published */
  timestamp: number;
  /** Source service/app */
  source?: string;
  /** Correlation ID for tracking */
  correlationId?: string;
}

/**
 * Pub/Sub subscription handler
 */
export type MessageHandler<T = unknown> = (
  message: PubSubMessage<T>,
  channel: string
) => void | Promise<void>;

/**
 * Rate limiter options
 */
export interface RateLimitOptions {
  /** Maximum number of requests */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix for rate limit entries */
  keyPrefix?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Time until reset in seconds */
  resetInSeconds: number;
  /** Number of retries after limit exceeded */
  retryAfterSeconds?: number;
}

/**
 * Lock options for distributed locking
 */
export interface LockOptions {
  /** Lock timeout in milliseconds */
  ttlMs: number;
  /** Retry attempts if lock is held */
  retryAttempts?: number;
  /** Delay between retries in milliseconds */
  retryDelayMs?: number;
}

/**
 * Lock result
 */
export interface LockResult {
  /** Whether lock was acquired */
  acquired: boolean;
  /** Lock token for release */
  token?: string;
  /** Error if lock failed */
  error?: string;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'end';

/**
 * Connection state change event
 */
export interface ConnectionStateEvent {
  /** Previous state */
  previousState: ConnectionState;
  /** New state */
  newState: ConnectionState;
  /** Timestamp of the change */
  timestamp: Date;
  /** Error if transitioning to error state */
  error?: Error;
}
