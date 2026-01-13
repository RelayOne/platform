/**
 * @relay/telemetry
 *
 * Shared telemetry utilities for the Relay Platform.
 * Provides OpenTelemetry tracing, metrics, structured logging, and Sentry error tracking.
 *
 * @example
 * ```typescript
 * import { createTelemetryService, createLogger } from '@relay/telemetry';
 *
 * // Full telemetry setup
 * const telemetry = createTelemetryService({
 *   serviceName: 'my-service',
 *   environment: 'production',
 *   tracingEnabled: true,
 *   metricsEnabled: true,
 *   sentryEnabled: true,
 *   sentryDsn: process.env.SENTRY_DSN,
 * });
 * telemetry.initialize();
 *
 * // Use logger
 * const logger = telemetry.getLogger();
 * logger.info('Service started', { version: '1.0.0' });
 *
 * // Track operations
 * await telemetry.withObservedOperation('processOrder', async () => {
 *   // Operation code
 * });
 *
 * // Capture errors
 * telemetry.captureError(error, { orderId: '123' });
 *
 * // Standalone logger
 * const log = createLogger({ serviceName: 'my-service' });
 * log.info('Hello world');
 * ```
 */

// Types
export type {
  TelemetryConfig,
  SpanOptions,
  SpanKind,
  SpanLink,
  MetricType,
  MetricConfig,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  LogLevel,
  LogEntry,
  LoggerConfig,
  TelemetryHealthCheck,
  ErrorContext,
  Breadcrumb,
  TransactionContext,
  Span,
  SpanContext,
  OtelContext,
  Attributes,
} from './types';

// Schemas
export { TelemetryConfigSchema, LoggerConfigSchema } from './types';

// Tracing
export { TracingService, createTracingService } from './tracing';

// Metrics
export { MetricsService, createMetricsService } from './metrics';

// Sentry
export { SentryService, createSentryService } from './sentry';

// Logger
export { Logger, createLogger, createLoggerFromEnv } from './logger';

// Unified Telemetry
export {
  TelemetryService,
  createTelemetryService,
  createTelemetryServiceFromEnv,
} from './telemetry';
