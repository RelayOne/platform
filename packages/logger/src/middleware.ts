/**
 * @fileoverview HTTP middleware for request logging
 * @module @relay/logger/middleware
 */

import { Logger, createLogger } from './logger.js';
import type { HttpInfo, LogLevel } from './types.js';

// ============================================================================
// Hono Middleware (Optional)
// ============================================================================

/**
 * Request logging middleware configuration.
 */
export interface RequestLoggerConfig {
  /** Log level for successful requests */
  successLevel?: LogLevel;
  /** Log level for error requests (4xx/5xx) */
  errorLevel?: LogLevel;
  /** Paths to skip logging */
  skipPaths?: string[];
  /** Whether to log request body */
  logBody?: boolean;
  /** Whether to log response time */
  logDuration?: boolean;
  /** Custom message format function */
  formatMessage?: (info: HttpInfo) => string;
}

const DEFAULT_REQUEST_LOGGER_CONFIG: Required<RequestLoggerConfig> = {
  successLevel: 'info',
  errorLevel: 'warn',
  skipPaths: ['/health', '/healthz', '/ready', '/metrics'],
  logBody: false,
  logDuration: true,
  formatMessage: (info) =>
    `${info.method} ${info.path} ${info.statusCode ?? 0} ${info.durationMs ?? 0}ms`,
};

/**
 * Create a request logger middleware for Hono.
 * This is a factory function that returns a Hono-compatible middleware.
 *
 * @param config - Optional configuration
 * @returns Hono middleware function
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createRequestLogger } from '@relay/logger';
 *
 * const app = new Hono();
 * app.use('*', createRequestLogger());
 * ```
 */
export function createRequestLogger(config: RequestLoggerConfig = {}) {
  const finalConfig = { ...DEFAULT_REQUEST_LOGGER_CONFIG, ...config };

  return async (c: { req: { method: string; path: string; header: (name: string) => string | undefined; raw: Request }; res: { status: number }; set: (key: string, value: unknown) => void; get: (key: string) => unknown }, next: () => Promise<void>) => {
    const { req } = c;
    const path = req.path;

    // Skip logging for configured paths
    if (finalConfig.skipPaths.includes(path)) {
      return next();
    }

    // Generate or extract request ID
    const requestId = req.header('x-request-id') ?? crypto.randomUUID();

    // Create request logger
    const reqLogger = createLogger({ requestId });
    reqLogger.setRequestId(requestId);

    // Store logger in context for route handlers
    c.set('logger', reqLogger);
    c.set('requestId', requestId);

    const start = performance.now();

    try {
      await next();
    } finally {
      const durationMs = Math.round(performance.now() - start);
      const statusCode = c.res.status;

      const httpInfo: HttpInfo = {
        method: req.method,
        path,
        statusCode,
        userAgent: req.header('user-agent'),
        ip: req.header('x-forwarded-for') ?? req.header('x-real-ip'),
        durationMs,
      };

      const message = finalConfig.formatMessage(httpInfo);
      const level =
        statusCode >= 400 ? finalConfig.errorLevel : finalConfig.successLevel;

      reqLogger[level](message, {
        http: httpInfo,
        durationMs: finalConfig.logDuration ? durationMs : undefined,
      });
    }
  };
}

// ============================================================================
// Generic Middleware Helpers
// ============================================================================

/**
 * Get logger from a generic context object.
 * Works with Hono, Express, Koa, or any framework that stores context.
 *
 * @param context - Request context
 * @returns Logger instance
 */
export function getLogger(context: { get?: (key: string) => unknown }): Logger {
  if (context.get) {
    const logger = context.get('logger');
    if (logger instanceof Logger) {
      return logger;
    }
  }
  return createLogger();
}

/**
 * Generate a request ID.
 * @returns UUID v4 request ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Create a request ID middleware that generates and attaches request IDs.
 *
 * @param headerName - Header name to use for request ID
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * app.use('*', createRequestIdMiddleware());
 * ```
 */
export function createRequestIdMiddleware(headerName = 'x-request-id') {
  return async (c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void; header: (name: string, value: string) => void }, next: () => Promise<void>) => {
    const requestId = c.req.header(headerName) ?? generateRequestId();
    c.set('requestId', requestId);
    c.header(headerName, requestId);
    await next();
  };
}

// ============================================================================
// Express/Connect Adapter
// ============================================================================

/**
 * Express-compatible request logging middleware.
 * Use this if you're using Express instead of Hono.
 *
 * @param config - Optional configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createExpressLogger } from '@relay/logger';
 *
 * const app = express();
 * app.use(createExpressLogger());
 * ```
 */
export function createExpressLogger(config: RequestLoggerConfig = {}) {
  const finalConfig = { ...DEFAULT_REQUEST_LOGGER_CONFIG, ...config };

  return (
    req: { method: string; path: string; headers: Record<string, string | string[] | undefined> },
    res: { statusCode: number; on: (event: string, handler: () => void) => void },
    next: () => void
  ) => {
    const path = req.path;

    // Skip logging for configured paths
    if (finalConfig.skipPaths.includes(path)) {
      return next();
    }

    const requestId =
      (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
    const reqLogger = createLogger({ requestId });
    reqLogger.setRequestId(requestId);

    // Attach to request for route handlers
    (req as Record<string, unknown>)['logger'] = reqLogger;
    (req as Record<string, unknown>)['requestId'] = requestId;

    const start = performance.now();

    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - start);

      const httpInfo: HttpInfo = {
        method: req.method,
        path,
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'] as string,
        ip:
          (req.headers['x-forwarded-for'] as string) ??
          (req.headers['x-real-ip'] as string),
        durationMs,
      };

      const message = finalConfig.formatMessage(httpInfo);
      const level =
        res.statusCode >= 400 ? finalConfig.errorLevel : finalConfig.successLevel;

      reqLogger[level](message, {
        http: httpInfo,
        durationMs: finalConfig.logDuration ? durationMs : undefined,
      });
    });

    next();
  };
}
