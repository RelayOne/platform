import { z } from 'zod';
import type { Span, SpanContext, Context as OtelContext, Attributes } from '@opentelemetry/api';

/**
 * Telemetry service configuration
 */
export interface TelemetryConfig {
  /** Service name for identification */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Deployment environment (production, staging, development) */
  environment: string;
  /** Enable tracing */
  tracingEnabled?: boolean;
  /** Enable metrics */
  metricsEnabled?: boolean;
  /** Enable Sentry error tracking */
  sentryEnabled?: boolean;
  /** OTLP endpoint for traces */
  otlpTracesEndpoint?: string;
  /** OTLP endpoint for metrics */
  otlpMetricsEndpoint?: string;
  /** Sentry DSN */
  sentryDsn?: string;
  /** Sample rate for traces (0.0 to 1.0) */
  traceSampleRate?: number;
  /** Sentry sample rate for errors (0.0 to 1.0) */
  sentrySampleRate?: number;
  /** Sentry traces sample rate (0.0 to 1.0) */
  sentryTracesSampleRate?: number;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
  /** Enable debug mode for verbose logging */
  debug?: boolean;
}

/**
 * Zod schema for telemetry configuration validation
 */
export const TelemetryConfigSchema = z.object({
  serviceName: z.string().min(1),
  serviceVersion: z.string().optional(),
  environment: z.string().min(1),
  tracingEnabled: z.boolean().optional().default(true),
  metricsEnabled: z.boolean().optional().default(true),
  sentryEnabled: z.boolean().optional().default(false),
  otlpTracesEndpoint: z.string().url().optional(),
  otlpMetricsEndpoint: z.string().url().optional(),
  sentryDsn: z.string().optional(),
  traceSampleRate: z.number().min(0).max(1).optional().default(1.0),
  sentrySampleRate: z.number().min(0).max(1).optional().default(1.0),
  sentryTracesSampleRate: z.number().min(0).max(1).optional().default(0.1),
  resourceAttributes: z.record(z.string()).optional(),
  debug: z.boolean().optional().default(false),
});

/**
 * Span options for creating new spans
 */
export interface SpanOptions {
  /** Parent context or span */
  parent?: OtelContext | Span;
  /** Span kind (internal, server, client, producer, consumer) */
  kind?: SpanKind;
  /** Initial attributes */
  attributes?: Attributes;
  /** Links to other spans */
  links?: SpanLink[];
  /** Start time (defaults to now) */
  startTime?: number;
}

/**
 * Span kind enumeration
 */
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

/**
 * Link to another span
 */
export interface SpanLink {
  /** Span context of the linked span */
  context: SpanContext;
  /** Attributes for the link */
  attributes?: Attributes;
}

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Metric configuration
 */
export interface MetricConfig {
  /** Metric name */
  name: string;
  /** Metric description */
  description?: string;
  /** Unit of measurement */
  unit?: string;
  /** Metric type */
  type: MetricType;
  /** Histogram bucket boundaries */
  boundaries?: number[];
}

/**
 * Counter metric interface
 */
export interface CounterMetric {
  /** Add value to counter */
  add(value: number, attributes?: Attributes): void;
}

/**
 * Gauge metric interface
 */
export interface GaugeMetric {
  /** Record current value */
  record(value: number, attributes?: Attributes): void;
}

/**
 * Histogram metric interface
 */
export interface HistogramMetric {
  /** Record a value */
  record(value: number, attributes?: Attributes): void;
}

/**
 * Logger levels
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log entry structure
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp */
  timestamp: Date;
  /** Structured data */
  data?: Record<string, unknown>;
  /** Error object */
  error?: Error;
  /** Trace ID for correlation */
  traceId?: string;
  /** Span ID for correlation */
  spanId?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level?: LogLevel;
  /** Service name */
  serviceName: string;
  /** Enable pretty printing (development) */
  prettyPrint?: boolean;
  /** Custom base properties */
  base?: Record<string, unknown>;
  /** Redact sensitive fields */
  redact?: string[];
}

/**
 * Zod schema for logger configuration validation
 */
export const LoggerConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional().default('info'),
  serviceName: z.string().min(1),
  prettyPrint: z.boolean().optional().default(false),
  base: z.record(z.unknown()).optional(),
  redact: z.array(z.string()).optional().default(['password', 'token', 'secret', 'apiKey', 'authorization']),
});

/**
 * Health check status
 */
export interface TelemetryHealthCheck {
  /** Whether telemetry is operational */
  healthy: boolean;
  /** Tracing status */
  tracing: {
    enabled: boolean;
    healthy: boolean;
    error?: string;
  };
  /** Metrics status */
  metrics: {
    enabled: boolean;
    healthy: boolean;
    error?: string;
  };
  /** Sentry status */
  sentry: {
    enabled: boolean;
    healthy: boolean;
    error?: string;
  };
}

/**
 * Error context for Sentry
 */
export interface ErrorContext {
  /** User information */
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  /** Custom tags */
  tags?: Record<string, string>;
  /** Extra context data */
  extra?: Record<string, unknown>;
  /** Error fingerprint for grouping */
  fingerprint?: string[];
  /** Error level override */
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
}

/**
 * Breadcrumb for error tracking
 */
export interface Breadcrumb {
  /** Breadcrumb category */
  category?: string;
  /** Breadcrumb message */
  message: string;
  /** Breadcrumb data */
  data?: Record<string, unknown>;
  /** Breadcrumb type */
  type?: 'default' | 'http' | 'navigation' | 'error' | 'debug' | 'query';
  /** Breadcrumb level */
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  /** Timestamp */
  timestamp?: number;
}

/**
 * Transaction context for performance monitoring
 */
export interface TransactionContext {
  /** Transaction name */
  name: string;
  /** Operation type */
  op: string;
  /** Transaction description */
  description?: string;
  /** Custom tags */
  tags?: Record<string, string>;
  /** Transaction data */
  data?: Record<string, unknown>;
}

/**
 * Re-export OpenTelemetry types for convenience
 */
export type {
  Span,
  SpanContext,
  OtelContext,
  Attributes,
};
