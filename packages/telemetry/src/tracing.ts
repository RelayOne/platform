import {
  trace,
  context,
  SpanStatusCode,
  SpanKind as OtelSpanKind,
  type Span,
  type Tracer,
  type Context as OtelContext,
  type Attributes,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import type { TelemetryConfig, SpanOptions, SpanKind } from './types';

/**
 * Maps span kind string to OpenTelemetry SpanKind enum
 */
function mapSpanKind(kind?: SpanKind): OtelSpanKind {
  switch (kind) {
    case 'server':
      return OtelSpanKind.SERVER;
    case 'client':
      return OtelSpanKind.CLIENT;
    case 'producer':
      return OtelSpanKind.PRODUCER;
    case 'consumer':
      return OtelSpanKind.CONSUMER;
    case 'internal':
    default:
      return OtelSpanKind.INTERNAL;
  }
}

/**
 * Tracing service for distributed tracing with OpenTelemetry.
 * Provides span creation, context propagation, and trace correlation.
 */
export class TracingService {
  private provider: NodeTracerProvider | null = null;
  private tracer: Tracer;
  private config: TelemetryConfig;
  private isInitialized = false;

  /**
   * Creates a new TracingService instance.
   * @param config - Telemetry configuration
   */
  constructor(config: TelemetryConfig) {
    this.config = config;
    this.tracer = trace.getTracer(config.serviceName, config.serviceVersion);
  }

  /**
   * Initializes the tracing provider with exporters.
   * Call this once during application startup.
   */
  public initialize(): void {
    if (this.isInitialized || !this.config.tracingEnabled) {
      return;
    }

    const resourceAttributes: Record<string, string> = {
      [SEMRESATTRS_SERVICE_NAME]: this.config.serviceName,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      ...this.config.resourceAttributes,
    };

    if (this.config.serviceVersion) {
      resourceAttributes[SEMRESATTRS_SERVICE_VERSION] = this.config.serviceVersion;
    }

    const resource = new Resource(resourceAttributes);

    this.provider = new NodeTracerProvider({
      resource,
    });

    // Configure exporter
    if (this.config.otlpTracesEndpoint) {
      const exporter = new OTLPTraceExporter({
        url: this.config.otlpTracesEndpoint,
      });

      // Use batch processor for production, simple for debug
      const processor = this.config.debug
        ? new SimpleSpanProcessor(exporter)
        : new BatchSpanProcessor(exporter);

      this.provider.addSpanProcessor(processor);
    }

    // Register provider globally
    this.provider.register();

    // Get new tracer from registered provider
    this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
    this.isInitialized = true;
  }

  /**
   * Shuts down the tracing provider and flushes pending spans.
   */
  public async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      this.provider = null;
      this.isInitialized = false;
    }
  }

  /**
   * Creates and starts a new span.
   * @param name - Span name
   * @param options - Span options
   * @returns The created span
   */
  public startSpan(name: string, options?: SpanOptions): Span {
    const ctx = options?.parent
      ? (this.isSpan(options.parent) ? trace.setSpan(context.active(), options.parent) : options.parent)
      : context.active();

    const span = this.tracer.startSpan(
      name,
      {
        kind: mapSpanKind(options?.kind),
        attributes: options?.attributes,
        links: options?.links,
        startTime: options?.startTime,
      },
      ctx
    );

    return span;
  }

  /**
   * Executes a function within a span context.
   * @param name - Span name
   * @param fn - Function to execute
   * @param options - Span options
   * @returns Result of the function
   */
  public async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    const span = this.startSpan(name, options);
    const ctx = trace.setSpan(context.active(), span);

    try {
      const result = await context.with(ctx, async () => {
        return await fn(span);
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Executes a synchronous function within a span context.
   * @param name - Span name
   * @param fn - Function to execute
   * @param options - Span options
   * @returns Result of the function
   */
  public withSpanSync<T>(
    name: string,
    fn: (span: Span) => T,
    options?: SpanOptions
  ): T {
    const span = this.startSpan(name, options);
    const ctx = trace.setSpan(context.active(), span);

    try {
      const result = context.with(ctx, () => {
        return fn(span);
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Gets the current active span.
   * @returns The active span or undefined
   */
  public getActiveSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Gets the current context.
   * @returns The active context
   */
  public getActiveContext(): OtelContext {
    return context.active();
  }

  /**
   * Gets the trace ID from the current context.
   * @returns The trace ID or undefined
   */
  public getTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return spanContext.traceId;
    }
    return undefined;
  }

  /**
   * Gets the span ID from the current context.
   * @returns The span ID or undefined
   */
  public getSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return spanContext.spanId;
    }
    return undefined;
  }

  /**
   * Adds attributes to the current span.
   * @param attributes - Attributes to add
   */
  public setAttributes(attributes: Attributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Records an exception on the current span.
   * @param error - Error to record
   */
  public recordException(error: Error): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }

  /**
   * Adds an event to the current span.
   * @param name - Event name
   * @param attributes - Event attributes
   */
  public addEvent(name: string, attributes?: Attributes): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Gets the underlying tracer instance.
   * @returns The OpenTelemetry tracer
   */
  public getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Checks if the tracing service is initialized.
   * @returns Whether tracing is initialized
   */
  public isEnabled(): boolean {
    return this.isInitialized && !!this.config.tracingEnabled;
  }

  /**
   * Type guard to check if an object is a Span
   */
  private isSpan(obj: unknown): obj is Span {
    return typeof obj === 'object' && obj !== null && 'spanContext' in obj;
  }
}

/**
 * Creates a new tracing service instance.
 * @param config - Telemetry configuration
 * @returns A configured TracingService
 */
export function createTracingService(config: TelemetryConfig): TracingService {
  return new TracingService(config);
}
