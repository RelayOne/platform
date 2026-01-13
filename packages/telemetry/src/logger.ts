import pino, { type Logger as PinoLogger, type LoggerOptions as PinoOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import type { LoggerConfig, LogLevel } from './types';
import { LoggerConfigSchema } from './types';

/**
 * Structured logger with trace correlation and Pino backend.
 * Provides consistent logging across all services with automatic trace ID injection.
 */
export class Logger {
  private logger: PinoLogger;
  private config: LoggerConfig;

  /**
   * Creates a new Logger instance.
   * @param config - Logger configuration
   */
  constructor(config: LoggerConfig) {
    const validatedConfig = LoggerConfigSchema.parse(config);
    this.config = validatedConfig;

    const pinoOptions: PinoOptions = {
      level: this.config.level ?? 'info',
      base: {
        service: this.config.serviceName,
        ...this.config.base,
      },
      redact: this.config.redact,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    };

    // Pretty printing for development
    if (this.config.prettyPrint) {
      this.logger = pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } else {
      this.logger = pino(pinoOptions);
    }
  }

  /**
   * Gets trace context from the current OpenTelemetry span.
   * @returns Trace context or empty object
   */
  private getTraceContext(): Record<string, string> {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    }
    return {};
  }

  /**
   * Logs a trace-level message.
   * @param message - Log message
   * @param data - Additional structured data
   */
  public trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  /**
   * Logs a debug-level message.
   * @param message - Log message
   * @param data - Additional structured data
   */
  public debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info-level message.
   * @param message - Log message
   * @param data - Additional structured data
   */
  public info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warn-level message.
   * @param message - Log message
   * @param data - Additional structured data
   */
  public warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error-level message.
   * @param message - Log message
   * @param error - Error object
   * @param data - Additional structured data
   */
  public error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };

    if (error instanceof Error) {
      errorData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      errorData.error = error;
    }

    this.log('error', message, errorData);
  }

  /**
   * Logs a fatal-level message.
   * @param message - Log message
   * @param error - Error object
   * @param data - Additional structured data
   */
  public fatal(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };

    if (error instanceof Error) {
      errorData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      errorData.error = error;
    }

    this.log('fatal', message, errorData);
  }

  /**
   * Core logging method with trace correlation.
   * @param level - Log level
   * @param message - Log message
   * @param data - Additional structured data
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const traceContext = this.getTraceContext();
    const logData = {
      ...traceContext,
      ...data,
    };

    switch (level) {
      case 'trace':
        this.logger.trace(logData, message);
        break;
      case 'debug':
        this.logger.debug(logData, message);
        break;
      case 'info':
        this.logger.info(logData, message);
        break;
      case 'warn':
        this.logger.warn(logData, message);
        break;
      case 'error':
        this.logger.error(logData, message);
        break;
      case 'fatal':
        this.logger.fatal(logData, message);
        break;
    }
  }

  /**
   * Creates a child logger with additional base context.
   * @param context - Additional context to include in all logs
   * @returns A new Logger instance with the added context
   */
  public child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      ...this.config,
      base: {
        ...this.config.base,
        ...context,
      },
    });
    return childLogger;
  }

  /**
   * Logs the start of an operation.
   * @param operation - Operation name
   * @param data - Additional data
   */
  public startOperation(operation: string, data?: Record<string, unknown>): void {
    this.info(`Starting ${operation}`, { operation, phase: 'start', ...data });
  }

  /**
   * Logs the successful completion of an operation.
   * @param operation - Operation name
   * @param durationMs - Duration in milliseconds
   * @param data - Additional data
   */
  public endOperation(operation: string, durationMs: number, data?: Record<string, unknown>): void {
    this.info(`Completed ${operation}`, {
      operation,
      phase: 'end',
      durationMs,
      ...data,
    });
  }

  /**
   * Logs the failure of an operation.
   * @param operation - Operation name
   * @param error - Error that occurred
   * @param durationMs - Duration in milliseconds
   * @param data - Additional data
   */
  public failOperation(
    operation: string,
    error: Error,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    this.error(`Failed ${operation}`, error, {
      operation,
      phase: 'error',
      durationMs,
      ...data,
    });
  }

  /**
   * Wraps an async function with automatic operation logging.
   * @param operation - Operation name
   * @param fn - Function to execute
   * @param data - Additional context data
   * @returns Result of the function
   */
  public async withOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    data?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    this.startOperation(operation, data);

    try {
      const result = await fn();
      this.endOperation(operation, Date.now() - startTime, data);
      return result;
    } catch (error) {
      this.failOperation(operation, error as Error, Date.now() - startTime, data);
      throw error;
    }
  }

  /**
   * Logs an HTTP request.
   * @param method - HTTP method
   * @param path - Request path
   * @param statusCode - Response status code
   * @param durationMs - Request duration in milliseconds
   * @param data - Additional request data
   */
  public httpRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `${method} ${path} ${statusCode}`, {
      http: {
        method,
        path,
        statusCode,
        durationMs,
      },
      ...data,
    });
  }

  /**
   * Logs a database query.
   * @param operation - Query operation (find, insert, etc.)
   * @param collection - Collection/table name
   * @param durationMs - Query duration in milliseconds
   * @param data - Additional query data
   */
  public dbQuery(
    operation: string,
    collection: string,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    this.debug(`DB ${operation} ${collection}`, {
      db: {
        operation,
        collection,
        durationMs,
      },
      ...data,
    });
  }

  /**
   * Gets the underlying Pino logger instance.
   * @returns The Pino logger
   */
  public getPinoLogger(): PinoLogger {
    return this.logger;
  }

  /**
   * Sets the log level dynamically.
   * @param level - New log level
   */
  public setLevel(level: LogLevel): void {
    this.logger.level = level;
    this.config.level = level;
  }

  /**
   * Gets the current log level.
   * @returns The current log level
   */
  public getLevel(): LogLevel {
    return this.logger.level as LogLevel;
  }

  /**
   * Flushes any buffered logs.
   */
  public flush(): void {
    this.logger.flush();
  }
}

/**
 * Creates a new logger instance.
 * @param config - Logger configuration
 * @returns A configured Logger
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Creates a logger from environment variables.
 * Expected environment variables:
 * - LOG_LEVEL: Log level (trace, debug, info, warn, error, fatal)
 * - SERVICE_NAME: Service name for identification
 * - LOG_PRETTY: Enable pretty printing (true/false)
 * @param serviceName - Service name (overrides env var)
 * @returns A configured Logger
 */
export function createLoggerFromEnv(serviceName?: string): Logger {
  return createLogger({
    level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
    serviceName: serviceName ?? process.env.SERVICE_NAME ?? 'unknown',
    prettyPrint: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV === 'development',
  });
}
