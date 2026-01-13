/**
 * @fileoverview Core Logger class for the Relay Platform
 * @module @relay/logger/logger
 */

import {
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  type ErrorInfo,
  type ILogger,
  LOG_LEVELS,
} from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env['LOG_LEVEL'] as LogLevel) ?? 'info',
  service: process.env['SERVICE_NAME'] ?? 'relay-service',
  format: process.env['NODE_ENV'] === 'production' ? 'json' : 'pretty',
  timestamps: true,
};

/** Global configuration */
let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the global logger settings.
 * @param config - Partial configuration to merge
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get the current logger configuration.
 * @returns Current configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

// ============================================================================
// Formatting
// ============================================================================

/** ANSI color codes for pretty printing */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
} as const;

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
  fatal: COLORS.magenta,
};

/**
 * Format a log entry for output.
 * @param entry - Log entry to format
 * @returns Formatted string
 */
function formatEntry(entry: LogEntry): string {
  if (globalConfig.format === 'json') {
    return JSON.stringify(entry);
  }

  // Pretty format for development
  const color = LEVEL_COLORS[entry.level];
  const levelPadded = entry.level.toUpperCase().padEnd(5);

  let output = '';

  // Timestamp
  if (globalConfig.timestamps) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    output += `${COLORS.gray}${time}${COLORS.reset} `;
  }

  // Level
  output += `${color}${COLORS.bold}${levelPadded}${COLORS.reset} `;

  // Request ID
  if (entry.requestId) {
    output += `${COLORS.cyan}[${entry.requestId.slice(0, 8)}]${COLORS.reset} `;
  }

  // Message
  output += entry.message;

  // Duration
  if (entry.durationMs !== undefined) {
    output += ` ${COLORS.gray}(${entry.durationMs}ms)${COLORS.reset}`;
  }

  // HTTP info
  if (entry.http) {
    output += ` ${COLORS.blue}${entry.http.method} ${entry.http.path}`;
    if (entry.http.statusCode) {
      const statusColor =
        entry.http.statusCode >= 500
          ? COLORS.red
          : entry.http.statusCode >= 400
            ? COLORS.yellow
            : COLORS.green;
      output += ` ${statusColor}${entry.http.statusCode}${COLORS.reset}`;
    }
    output += COLORS.reset;
  }

  // Context
  if (entry.context && Object.keys(entry.context).length > 0) {
    output += `\n  ${COLORS.gray}context: ${JSON.stringify(entry.context)}${COLORS.reset}`;
  }

  // Error
  if (entry.error) {
    output += `\n  ${COLORS.red}error: ${entry.error.name}: ${entry.error.message}${COLORS.reset}`;
    if (entry.error.stack) {
      const stackLines = entry.error.stack.split('\n').slice(1, 5);
      output += `\n  ${COLORS.gray}${stackLines.join('\n  ')}${COLORS.reset}`;
    }
  }

  return output;
}

/**
 * Default output function.
 * @param entry - Log entry to output
 */
function defaultOutput(entry: LogEntry): void {
  // Check if log level is high enough
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[globalConfig.level]) {
    return;
  }

  const formatted = formatEntry(entry);

  switch (entry.level) {
    case 'error':
    case 'fatal':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

// ============================================================================
// Logger Class
// ============================================================================

/**
 * Logger instance for creating structured log entries.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ component: 'auth' });
 * logger.info('User logged in', { userId: '123' });
 *
 * // Create child logger with additional context
 * const reqLogger = logger.child({ requestId: 'abc-123' });
 * reqLogger.debug('Processing request');
 * ```
 */
export class Logger implements ILogger {
  private context: Record<string, unknown> = {};
  private requestId?: string;
  private userId?: string;
  private organizationId?: string;

  /**
   * Create a new Logger instance.
   * @param context - Optional initial context
   */
  constructor(context?: Record<string, unknown>) {
    if (context) {
      this.context = { ...context };
    }
  }

  /**
   * Create a child logger with additional context.
   * @param context - Additional context to merge
   * @returns New logger instance
   */
  child(context: Record<string, unknown>): Logger {
    const child = new Logger({ ...this.context, ...context });
    child.requestId = this.requestId;
    child.userId = this.userId;
    child.organizationId = this.organizationId;
    return child;
  }

  /**
   * Set the request ID for correlation.
   * @param requestId - Request ID
   * @returns This logger for chaining
   */
  setRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  /**
   * Set the user ID.
   * @param userId - User ID
   * @returns This logger for chaining
   */
  setUserId(userId: string): this {
    this.userId = userId;
    return this;
  }

  /**
   * Set the organization ID.
   * @param organizationId - Organization ID
   * @returns This logger for chaining
   */
  setOrganizationId(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  /**
   * Create and output a log entry.
   * @param level - Log level
   * @param message - Log message
   * @param data - Additional data
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: globalConfig.service,
      requestId: this.requestId,
      userId: this.userId,
      organizationId: this.organizationId,
    };

    // Merge context
    const context = {
      ...globalConfig.defaultContext,
      ...this.context,
      ...data,
    };

    if (Object.keys(context).length > 0) {
      // Extract special fields
      const { error, durationMs, http, trace, ...rest } = context;

      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as Error & { code?: string }).code,
        };
      } else if (error && typeof error === 'object') {
        entry.error = error as ErrorInfo;
      }

      if (typeof durationMs === 'number') {
        entry.durationMs = durationMs;
      }

      if (http && typeof http === 'object') {
        entry.http = http as LogEntry['http'];
      }

      if (trace && typeof trace === 'object') {
        entry.trace = trace as LogEntry['trace'];
      }

      if (Object.keys(rest).length > 0) {
        entry.context = rest;
      }
    }

    // Output using custom output or default
    const outputFn = globalConfig.output ?? defaultOutput;
    outputFn(entry);
  }

  /**
   * Log a debug message.
   * @param message - Log message
   * @param data - Additional context data
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message.
   * @param message - Log message
   * @param data - Additional context data
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message.
   * @param message - Log message
   * @param data - Additional context data
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log an error message.
   * @param message - Log message
   * @param data - Additional context data
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Log a fatal message.
   * @param message - Log message
   * @param data - Additional context data
   */
  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data);
  }

  /**
   * Create a timed operation that logs duration on completion.
   * @param operation - Operation name
   * @param data - Additional context data
   * @returns Object with end() method to stop timing
   *
   * @example
   * ```typescript
   * const timer = logger.time('database-query');
   * // ... perform operation ...
   * timer.end(); // Logs: "database-query completed (150ms)"
   * ```
   */
  time(operation: string, data?: Record<string, unknown>): { end: () => void } {
    const start = performance.now();
    return {
      end: () => {
        const durationMs = Math.round(performance.now() - start);
        this.info(`${operation} completed`, { ...data, durationMs });
      },
    };
  }
}

// ============================================================================
// Default Logger Instance
// ============================================================================

/**
 * Default logger instance.
 * Use this for quick logging without creating a new instance.
 *
 * @example
 * ```typescript
 * import { logger } from '@relay/logger';
 * logger.info('Application started');
 * ```
 */
export const logger = new Logger();

/**
 * Create a new logger with context.
 * @param context - Initial context
 * @returns New logger instance
 */
export function createLogger(context?: Record<string, unknown>): Logger {
  return new Logger(context);
}
