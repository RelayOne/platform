/**
 * @fileoverview Shared logging utilities for the Relay Platform
 * @module @relay/logger
 *
 * Provides unified logging across all Relay Platform applications:
 * - Structured logging with levels (debug, info, warn, error, fatal)
 * - Request correlation via request IDs
 * - HTTP request logging middleware
 * - Audit logging for security events
 * - JSON and pretty-print output formats
 *
 * @example
 * ```typescript
 * import {
 *   logger,
 *   createLogger,
 *   configureLogger,
 *   createRequestLogger,
 *   auditLogger,
 * } from '@relay/logger';
 *
 * // Configure logger
 * configureLogger({
 *   level: 'debug',
 *   service: 'my-service',
 *   format: 'pretty',
 * });
 *
 * // Basic logging
 * logger.info('Application started');
 * logger.error('Something went wrong', { error: new Error('oops') });
 *
 * // Create logger with context
 * const reqLogger = createLogger({ component: 'auth' });
 * reqLogger.info('User authenticated', { userId: '123' });
 *
 * // Timed operations
 * const timer = logger.time('database-query');
 * await db.query();
 * timer.end(); // Logs with duration
 *
 * // Audit logging
 * auditLogger.userLogin({
 *   success: true,
 *   actorEmail: 'user@example.com',
 *   actorIp: '192.168.1.1',
 * });
 *
 * // HTTP middleware (Hono)
 * app.use('*', createRequestLogger());
 * ```
 */

// Core logger
export {
  Logger,
  logger,
  createLogger,
  configureLogger,
  getLoggerConfig,
} from './logger.js';

// Audit logging
export {
  AuditLogger,
  auditLogger,
  createAuditLogger,
  configureAuditLogger,
  type AuditLoggerConfig,
} from './audit.js';

// Middleware
export {
  createRequestLogger,
  createRequestIdMiddleware,
  createExpressLogger,
  getLogger,
  generateRequestId,
  type RequestLoggerConfig,
} from './middleware.js';

// Types
export {
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  type LogOutput,
  type ErrorInfo,
  type HttpInfo,
  type TraceInfo,
  type ILogger,
  type AuditEventType,
  type AuditEntry,
  LOG_LEVELS,
} from './types.js';
