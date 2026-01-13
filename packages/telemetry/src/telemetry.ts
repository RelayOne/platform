import type { TelemetryConfig, TelemetryHealthCheck } from './types';
import { TelemetryConfigSchema } from './types';
import { TracingService, createTracingService } from './tracing';
import { MetricsService, createMetricsService } from './metrics';
import { SentryService, createSentryService } from './sentry';
import { Logger, createLogger } from './logger';

/**
 * Unified telemetry service combining tracing, metrics, logging, and error tracking.
 * Provides a single entry point for all observability features.
 */
export class TelemetryService {
  private config: TelemetryConfig;
  private tracing: TracingService;
  private metrics: MetricsService;
  private sentry: SentryService;
  private logger: Logger;
  private isInitialized = false;

  /**
   * Creates a new TelemetryService instance.
   * @param config - Telemetry configuration
   */
  constructor(config: TelemetryConfig) {
    const validatedConfig = TelemetryConfigSchema.parse(config);
    this.config = validatedConfig;

    this.tracing = createTracingService(validatedConfig);
    this.metrics = createMetricsService(validatedConfig);
    this.sentry = createSentryService(validatedConfig);
    this.logger = createLogger({
      serviceName: validatedConfig.serviceName,
      level: validatedConfig.debug ? 'debug' : 'info',
      prettyPrint: validatedConfig.debug,
    });
  }

  /**
   * Initializes all telemetry services.
   * Call this once during application startup.
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing telemetry services', {
      config: {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        tracingEnabled: this.config.tracingEnabled,
        metricsEnabled: this.config.metricsEnabled,
        sentryEnabled: this.config.sentryEnabled,
      },
    });

    // Initialize services
    if (this.config.tracingEnabled) {
      this.tracing.initialize();
      this.logger.debug('Tracing service initialized');
    }

    if (this.config.metricsEnabled) {
      this.metrics.initialize();
      this.logger.debug('Metrics service initialized');
    }

    if (this.config.sentryEnabled) {
      this.sentry.initialize();
      this.logger.debug('Sentry service initialized');
    }

    this.isInitialized = true;
    this.logger.info('Telemetry services initialized');
  }

  /**
   * Shuts down all telemetry services and flushes pending data.
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down telemetry services');

    const shutdownPromises: Promise<void>[] = [];

    if (this.tracing.isEnabled()) {
      shutdownPromises.push(this.tracing.shutdown());
    }

    if (this.metrics.isEnabled()) {
      shutdownPromises.push(this.metrics.shutdown());
    }

    if (this.sentry.isEnabled()) {
      shutdownPromises.push(this.sentry.shutdown());
    }

    await Promise.all(shutdownPromises);

    this.logger.flush();
    this.isInitialized = false;
    this.logger.info('Telemetry services shut down');
  }

  /**
   * Gets the tracing service.
   * @returns The TracingService instance
   */
  public getTracing(): TracingService {
    return this.tracing;
  }

  /**
   * Gets the metrics service.
   * @returns The MetricsService instance
   */
  public getMetrics(): MetricsService {
    return this.metrics;
  }

  /**
   * Gets the Sentry service.
   * @returns The SentryService instance
   */
  public getSentry(): SentryService {
    return this.sentry;
  }

  /**
   * Gets the logger.
   * @returns The Logger instance
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Creates a child logger with additional context.
   * @param context - Context to add to logs
   * @returns A new Logger with the added context
   */
  public createChildLogger(context: Record<string, unknown>): Logger {
    return this.logger.child(context);
  }

  /**
   * Performs a health check on all telemetry services.
   * @returns Health check result
   */
  public async healthCheck(): Promise<TelemetryHealthCheck> {
    const result: TelemetryHealthCheck = {
      healthy: true,
      tracing: {
        enabled: !!this.config.tracingEnabled,
        healthy: true,
      },
      metrics: {
        enabled: !!this.config.metricsEnabled,
        healthy: true,
      },
      sentry: {
        enabled: !!this.config.sentryEnabled,
        healthy: true,
      },
    };

    // Check tracing
    if (this.config.tracingEnabled) {
      try {
        result.tracing.healthy = this.tracing.isEnabled();
        if (!result.tracing.healthy) {
          result.tracing.error = 'Tracing not initialized';
          result.healthy = false;
        }
      } catch (error) {
        result.tracing.healthy = false;
        result.tracing.error = (error as Error).message;
        result.healthy = false;
      }
    }

    // Check metrics
    if (this.config.metricsEnabled) {
      try {
        result.metrics.healthy = this.metrics.isEnabled();
        if (!result.metrics.healthy) {
          result.metrics.error = 'Metrics not initialized';
          result.healthy = false;
        }
      } catch (error) {
        result.metrics.healthy = false;
        result.metrics.error = (error as Error).message;
        result.healthy = false;
      }
    }

    // Check Sentry
    if (this.config.sentryEnabled) {
      try {
        result.sentry.healthy = this.sentry.isEnabled();
        if (!result.sentry.healthy) {
          result.sentry.error = 'Sentry not initialized';
          result.healthy = false;
        }
      } catch (error) {
        result.sentry.healthy = false;
        result.sentry.error = (error as Error).message;
        result.healthy = false;
      }
    }

    return result;
  }

  /**
   * Captures an error across all error tracking services.
   * @param error - Error to capture
   * @param context - Additional error context
   */
  public captureError(error: Error, context?: Record<string, unknown>): void {
    // Log the error
    this.logger.error('Error captured', error, context);

    // Record in tracing
    this.tracing.recordException(error);

    // Increment error counter
    this.metrics.getErrorCounter().add(1, {
      error_type: error.name,
    });

    // Send to Sentry
    if (this.sentry.isEnabled()) {
      this.sentry.captureError(error, {
        extra: context,
      });
    }
  }

  /**
   * Wraps an async operation with full observability.
   * Creates a span, logs operation, captures errors, and records duration.
   * @param name - Operation name
   * @param fn - Function to execute
   * @param attributes - Span attributes
   * @returns Result of the function
   */
  public async withObservedOperation<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const startTime = Date.now();

    return this.tracing.withSpan(
      name,
      async (_span) => {
        this.logger.startOperation(name, attributes);

        try {
          const result = await fn();
          const duration = Date.now() - startTime;

          this.logger.endOperation(name, duration, attributes);

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;

          this.logger.failOperation(name, error as Error, duration, attributes);
          this.captureError(error as Error, { operation: name, ...attributes });

          throw error;
        }
      },
      { attributes }
    );
  }

  /**
   * Records an HTTP request across all telemetry services.
   * @param method - HTTP method
   * @param path - Request path
   * @param statusCode - Response status code
   * @param durationMs - Request duration
   * @param attributes - Additional attributes
   */
  public recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    attributes?: Record<string, string>
  ): void {
    // Log request
    this.logger.httpRequest(method, path, statusCode, durationMs, attributes);

    // Record metrics
    const requestCounter = this.metrics.getHttpRequestCounter();
    const durationHistogram = this.metrics.getHttpRequestDuration();

    requestCounter.add(1, {
      method,
      path,
      status_code: statusCode.toString(),
      ...attributes,
    });

    durationHistogram.record(durationMs / 1000, {
      method,
      path,
      ...attributes,
    });

    // Record errors
    if (statusCode >= 500) {
      this.metrics.getErrorCounter().add(1, {
        error_type: 'http_5xx',
        method,
        path,
      });
    }
  }

  /**
   * Records a database query across all telemetry services.
   * @param operation - Query operation
   * @param collection - Collection/table name
   * @param durationMs - Query duration
   * @param success - Whether the query succeeded
   * @param attributes - Additional attributes
   */
  public recordDbQuery(
    operation: string,
    collection: string,
    durationMs: number,
    success: boolean,
    attributes?: Record<string, string>
  ): void {
    // Log query
    this.logger.dbQuery(operation, collection, durationMs, attributes);

    // Record metrics
    const queryCounter = this.metrics.getDbQueryCounter();
    const durationHistogram = this.metrics.getDbQueryDuration();

    queryCounter.add(1, {
      operation,
      collection,
      success: success.toString(),
      ...attributes,
    });

    durationHistogram.record(durationMs / 1000, {
      operation,
      collection,
      ...attributes,
    });

    // Record errors
    if (!success) {
      this.metrics.getErrorCounter().add(1, {
        error_type: 'db_query_error',
        operation,
        collection,
      });
    }
  }

  /**
   * Records a cache operation.
   * @param operation - Cache operation (get, set, delete)
   * @param hit - Whether it was a cache hit
   * @param durationMs - Operation duration
   * @param attributes - Additional attributes
   */
  public recordCacheOperation(
    operation: string,
    hit: boolean | null,
    _durationMs: number,
    attributes?: Record<string, string>
  ): void {
    const cacheCounter = this.metrics.getCacheCounter();

    cacheCounter.add(1, {
      operation,
      result: hit === null ? 'n/a' : hit ? 'hit' : 'miss',
      ...attributes,
    });
  }

  /**
   * Checks if the telemetry service is initialized.
   * @returns Whether telemetry is initialized
   */
  public isEnabled(): boolean {
    return this.isInitialized;
  }

  /**
   * Gets the current configuration.
   * @returns The telemetry configuration
   */
  public getConfig(): TelemetryConfig {
    return { ...this.config };
  }
}

/**
 * Creates a new telemetry service instance.
 * @param config - Telemetry configuration
 * @returns A configured TelemetryService
 */
export function createTelemetryService(config: TelemetryConfig): TelemetryService {
  return new TelemetryService(config);
}

/**
 * Creates a telemetry service from environment variables.
 * Expected environment variables:
 * - SERVICE_NAME: Service name
 * - SERVICE_VERSION: Service version
 * - ENVIRONMENT: Deployment environment (production, staging, development)
 * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: OTLP traces endpoint
 * - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: OTLP metrics endpoint
 * - SENTRY_DSN: Sentry DSN
 * - TRACING_ENABLED: Enable tracing (true/false)
 * - METRICS_ENABLED: Enable metrics (true/false)
 * - SENTRY_ENABLED: Enable Sentry (true/false)
 * - TRACE_SAMPLE_RATE: Trace sample rate (0.0-1.0)
 * - DEBUG: Enable debug mode (true/false)
 * @returns A configured TelemetryService
 */
export function createTelemetryServiceFromEnv(): TelemetryService {
  return createTelemetryService({
    serviceName: process.env.SERVICE_NAME ?? 'unknown',
    serviceVersion: process.env.SERVICE_VERSION,
    environment: process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracingEnabled: process.env.TRACING_ENABLED !== 'false',
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    sentryEnabled: process.env.SENTRY_ENABLED === 'true',
    otlpTracesEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    otlpMetricsEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    sentryDsn: process.env.SENTRY_DSN,
    traceSampleRate: process.env.TRACE_SAMPLE_RATE
      ? parseFloat(process.env.TRACE_SAMPLE_RATE)
      : undefined,
    debug: process.env.DEBUG === 'true',
  });
}
