/**
 * @fileoverview Type definitions for the Relay Platform logger
 * @module @relay/logger/types
 */

// ============================================================================
// Log Levels
// ============================================================================

/**
 * Log levels in order of severity.
 * - debug: Detailed debugging information
 * - info: General operational information
 * - warn: Warning conditions
 * - error: Error conditions
 * - fatal: Critical errors requiring immediate attention
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Numeric values for log level comparison.
 */
export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// ============================================================================
// Log Entry
// ============================================================================

/**
 * Structured log entry.
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Service name */
  service: string;
  /** Request ID for correlation */
  requestId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Organization ID if applicable */
  organizationId?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Error details if applicable */
  error?: ErrorInfo;
  /** Duration in milliseconds for timed operations */
  durationMs?: number;
  /** HTTP request details */
  http?: HttpInfo;
  /** Trace information for distributed tracing */
  trace?: TraceInfo;
}

/**
 * Error information in log entries.
 */
export interface ErrorInfo {
  /** Error name/type */
  name: string;
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Error code if available */
  code?: string;
}

/**
 * HTTP request information in log entries.
 */
export interface HttpInfo {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Response status code */
  statusCode?: number;
  /** User agent */
  userAgent?: string;
  /** Client IP address */
  ip?: string;
  /** Request duration in ms */
  durationMs?: number;
  /** Query parameters */
  query?: Record<string, string>;
}

/**
 * Trace information for distributed tracing.
 */
export interface TraceInfo {
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
}

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Service name for identification */
  service: string;
  /** Output format */
  format: 'json' | 'pretty';
  /** Whether to include timestamps in pretty format */
  timestamps: boolean;
  /** Environment (e.g., 'development', 'production') */
  environment?: string;
  /** Default context to include in all log entries */
  defaultContext?: Record<string, unknown>;
  /** Custom output function (for testing or custom transports) */
  output?: LogOutput;
}

/**
 * Custom log output function.
 */
export type LogOutput = (entry: LogEntry) => void;

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Logger interface for dependency injection.
 */
export interface ILogger {
  /**
   * Log a debug message.
   * @param message - Log message
   * @param data - Additional context data
   */
  debug(message: string, data?: Record<string, unknown>): void;

  /**
   * Log an info message.
   * @param message - Log message
   * @param data - Additional context data
   */
  info(message: string, data?: Record<string, unknown>): void;

  /**
   * Log a warning message.
   * @param message - Log message
   * @param data - Additional context data
   */
  warn(message: string, data?: Record<string, unknown>): void;

  /**
   * Log an error message.
   * @param message - Log message
   * @param data - Additional context data
   */
  error(message: string, data?: Record<string, unknown>): void;

  /**
   * Log a fatal message.
   * @param message - Log message
   * @param data - Additional context data
   */
  fatal(message: string, data?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional context.
   * @param context - Context to add
   */
  child(context: Record<string, unknown>): ILogger;
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Audit log event types.
 */
export type AuditEventType =
  // User events
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.password_change'
  | 'user.mfa_enable'
  | 'user.mfa_disable'
  | 'user.profile_update'
  // Organization events
  | 'org.create'
  | 'org.update'
  | 'org.delete'
  | 'org.member_add'
  | 'org.member_remove'
  | 'org.member_role_change'
  // Resource events
  | 'resource.create'
  | 'resource.read'
  | 'resource.update'
  | 'resource.delete'
  | 'resource.share'
  // API events
  | 'api.key_create'
  | 'api.key_revoke'
  | 'api.rate_limit'
  // Admin events
  | 'admin.user_suspend'
  | 'admin.user_restore'
  | 'admin.config_change';

/**
 * Audit log entry.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type */
  event: AuditEventType;
  /** Actor (user) ID */
  actorId?: string;
  /** Actor email */
  actorEmail?: string;
  /** Actor IP address */
  actorIp?: string;
  /** Target resource type */
  resourceType?: string;
  /** Target resource ID */
  resourceId?: string;
  /** Organization ID */
  organizationId?: string;
  /** Whether the action was successful */
  success: boolean;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Request ID for correlation */
  requestId?: string;
}
