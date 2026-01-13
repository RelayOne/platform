# @relay/telemetry

Shared telemetry utilities for the Relay Platform. Provides OpenTelemetry tracing, metrics collection, structured logging, and Sentry error tracking in a unified interface.

## Features

- **Tracing**: OpenTelemetry-based distributed tracing with automatic context propagation
- **Metrics**: Counter, gauge, and histogram metrics with OTLP export
- **Logging**: Structured logging with Pino, automatic trace correlation
- **Error Tracking**: Sentry integration with breadcrumbs and performance monitoring
- **Unified Service**: Single entry point for all observability features

## Installation

```bash
pnpm add @relay/telemetry @opentelemetry/api
# or
npm install @relay/telemetry @opentelemetry/api
```

## Quick Start

```typescript
import { createTelemetryService } from '@relay/telemetry';

// 1. Create telemetry service
const telemetry = createTelemetryService({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  environment: 'production',
  tracingEnabled: true,
  metricsEnabled: true,
  sentryEnabled: true,
  otlpTracesEndpoint: 'http://collector:4318/v1/traces',
  otlpMetricsEndpoint: 'http://collector:4318/v1/metrics',
  sentryDsn: process.env.SENTRY_DSN,
});

// 2. Initialize (call once at startup)
telemetry.initialize();

// 3. Get logger
const logger = telemetry.getLogger();
logger.info('Service started', { version: '1.0.0' });

// 4. Track operations with full observability
const result = await telemetry.withObservedOperation('processOrder', async () => {
  // Your operation code
  return { orderId: '123' };
});

// 5. Capture errors
try {
  // Some code
} catch (error) {
  telemetry.captureError(error, { orderId: '123' });
}

// 6. Shutdown gracefully
await telemetry.shutdown();
```

## Configuration

```typescript
import { createTelemetryService, type TelemetryConfig } from '@relay/telemetry';

const config: TelemetryConfig = {
  // Required
  serviceName: 'my-service',
  environment: 'production',

  // Optional
  serviceVersion: '1.0.0',

  // Tracing
  tracingEnabled: true,
  otlpTracesEndpoint: 'http://localhost:4318/v1/traces',
  traceSampleRate: 1.0, // 0.0 to 1.0

  // Metrics
  metricsEnabled: true,
  otlpMetricsEndpoint: 'http://localhost:4318/v1/metrics',

  // Sentry
  sentryEnabled: true,
  sentryDsn: 'https://key@sentry.io/project',
  sentrySampleRate: 1.0,
  sentryTracesSampleRate: 0.1,

  // Additional resource attributes
  resourceAttributes: {
    'deployment.region': 'us-east-1',
  },

  // Debug mode
  debug: false,
};

const telemetry = createTelemetryService(config);
```

## Environment Variables

```bash
SERVICE_NAME=my-service
SERVICE_VERSION=1.0.0
ENVIRONMENT=production
TRACING_ENABLED=true
METRICS_ENABLED=true
SENTRY_ENABLED=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
SENTRY_DSN=https://key@sentry.io/project
TRACE_SAMPLE_RATE=1.0
DEBUG=false
```

```typescript
import { createTelemetryServiceFromEnv } from '@relay/telemetry';

const telemetry = createTelemetryServiceFromEnv();
```

## Tracing

```typescript
import { createTracingService } from '@relay/telemetry';

const tracing = createTracingService({
  serviceName: 'my-service',
  environment: 'production',
  tracingEnabled: true,
  otlpTracesEndpoint: 'http://localhost:4318/v1/traces',
});

tracing.initialize();

// Create and manage spans
const span = tracing.startSpan('operation-name', {
  kind: 'server',
  attributes: { 'http.method': 'GET' },
});

try {
  // Do work
  span.setAttributes({ 'custom.attr': 'value' });
  span.addEvent('checkpoint', { step: 1 });
} finally {
  span.end();
}

// Use withSpan for automatic span management
const result = await tracing.withSpan('processRequest', async (span) => {
  span.setAttributes({ 'request.id': '123' });
  return await processRequest();
});

// Get current trace context
const traceId = tracing.getTraceId();
const spanId = tracing.getSpanId();

// Record exceptions
tracing.recordException(new Error('Something went wrong'));
```

## Metrics

```typescript
import { createMetricsService } from '@relay/telemetry';

const metrics = createMetricsService({
  serviceName: 'my-service',
  environment: 'production',
  metricsEnabled: true,
  otlpMetricsEndpoint: 'http://localhost:4318/v1/metrics',
});

metrics.initialize();

// Counters (monotonically increasing)
const requestCounter = metrics.getCounter({
  name: 'http_requests_total',
  description: 'Total HTTP requests',
  unit: '1',
});
requestCounter.add(1, { method: 'GET', path: '/api/users' });

// Gauges (current values)
const activeConnections = metrics.getGauge({
  name: 'active_connections',
  description: 'Current active connections',
  unit: '1',
});
activeConnections.record(42);

// Histograms (distributions)
const requestDuration = metrics.getHistogram({
  name: 'http_request_duration_seconds',
  description: 'HTTP request duration',
  unit: 's',
});
requestDuration.record(0.125, { method: 'GET' });

// Standard metrics (pre-configured)
const httpCounter = metrics.getHttpRequestCounter();
const httpDuration = metrics.getHttpRequestDuration();
const dbCounter = metrics.getDbQueryCounter();
const dbDuration = metrics.getDbQueryDuration();
const cacheCounter = metrics.getCacheCounter();
const errorCounter = metrics.getErrorCounter();
```

## Logging

```typescript
import { createLogger, createLoggerFromEnv } from '@relay/telemetry';

const logger = createLogger({
  serviceName: 'my-service',
  level: 'info',
  prettyPrint: process.env.NODE_ENV === 'development',
  redact: ['password', 'token', 'secret'],
  base: { version: '1.0.0' },
});

// Log levels
logger.trace('Detailed trace info', { data: 'value' });
logger.debug('Debug message');
logger.info('Info message', { userId: '123' });
logger.warn('Warning message');
logger.error('Error occurred', new Error('Something failed'));
logger.fatal('Fatal error', new Error('Critical failure'));

// Operation logging
logger.startOperation('processOrder', { orderId: '123' });
logger.endOperation('processOrder', 150, { orderId: '123' });
logger.failOperation('processOrder', new Error('Failed'), 150);

// Automatic operation tracking
const result = await logger.withOperation('fetchUser', async () => {
  return await fetchUser();
});

// HTTP request logging
logger.httpRequest('GET', '/api/users', 200, 50);
logger.httpRequest('POST', '/api/orders', 500, 200); // Logs as error

// Database query logging
logger.dbQuery('find', 'users', 25, { filter: { active: true } });

// Child loggers with additional context
const requestLogger = logger.child({ requestId: 'req-123' });
requestLogger.info('Processing request'); // Includes requestId

// From environment
const envLogger = createLoggerFromEnv('my-service');
```

## Error Tracking (Sentry)

```typescript
import { createSentryService } from '@relay/telemetry';

const sentry = createSentryService({
  serviceName: 'my-service',
  environment: 'production',
  sentryEnabled: true,
  sentryDsn: process.env.SENTRY_DSN,
  sentrySampleRate: 1.0,
  sentryTracesSampleRate: 0.1,
});

sentry.initialize();

// Capture errors
const eventId = sentry.captureError(error, {
  user: { id: 'user-123', email: 'user@example.com' },
  tags: { feature: 'checkout' },
  extra: { orderId: '456' },
  fingerprint: ['checkout-error'],
  level: 'error',
});

// Capture messages
sentry.captureMessage('Important event occurred', 'info', {
  tags: { category: 'business' },
});

// Breadcrumbs
sentry.addBreadcrumb({
  category: 'navigation',
  message: 'User clicked checkout',
  level: 'info',
});

// User context
sentry.setUser({ id: 'user-123', email: 'user@example.com' });

// Tags and context
sentry.setTag('feature', 'checkout');
sentry.setExtra('orderId', '456');
sentry.setContext('order', { total: 99.99, items: 3 });

// Performance monitoring
const result = await sentry.withTransaction(
  { name: 'processOrder', op: 'task' },
  async () => {
    return await processOrder();
  }
);

// Manual spans
const span = sentry.startSpan('validateOrder', 'validation');
// Do work
span?.end();
```

## Unified Observability

```typescript
import { createTelemetryService } from '@relay/telemetry';

const telemetry = createTelemetryService({
  serviceName: 'my-service',
  environment: 'production',
  tracingEnabled: true,
  metricsEnabled: true,
  sentryEnabled: true,
  sentryDsn: process.env.SENTRY_DSN,
});

telemetry.initialize();

// Full observability for any operation
// - Creates a tracing span
// - Logs start/end/error
// - Captures errors to Sentry
// - Records duration metrics
const result = await telemetry.withObservedOperation(
  'processPayment',
  async () => {
    return await processPayment();
  },
  { paymentId: '123' }
);

// Record HTTP requests (logs + metrics)
telemetry.recordHttpRequest('GET', '/api/users', 200, 50, {
  userId: '123',
});

// Record database queries (logs + metrics)
telemetry.recordDbQuery('find', 'users', 25, true, {
  query: 'active',
});

// Record cache operations (metrics)
telemetry.recordCacheOperation('get', true, 5); // hit
telemetry.recordCacheOperation('get', false, 2); // miss

// Capture errors across all services
telemetry.captureError(error, { context: 'value' });

// Health check
const health = await telemetry.healthCheck();
console.log(health);
// {
//   healthy: true,
//   tracing: { enabled: true, healthy: true },
//   metrics: { enabled: true, healthy: true },
//   sentry: { enabled: true, healthy: true },
// }

// Access individual services
const logger = telemetry.getLogger();
const tracing = telemetry.getTracing();
const metrics = telemetry.getMetrics();
const sentry = telemetry.getSentry();
```

## Express/Hono Middleware Example

```typescript
import { Hono } from 'hono';
import { createTelemetryService } from '@relay/telemetry';

const app = new Hono();
const telemetry = createTelemetryService({
  serviceName: 'api-service',
  environment: process.env.NODE_ENV ?? 'development',
  tracingEnabled: true,
  metricsEnabled: true,
});

telemetry.initialize();

// Middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    const status = c.res.status;

    telemetry.recordHttpRequest(method, path, status, duration);
  }
});

// Routes
app.get('/api/users', async (c) => {
  const logger = telemetry.getLogger();

  return telemetry.withObservedOperation('listUsers', async () => {
    logger.debug('Fetching users');
    const users = await getUsers();
    return c.json(users);
  });
});
```

## TypeScript Types

```typescript
import type {
  // Configuration
  TelemetryConfig,
  TelemetryHealthCheck,

  // Tracing
  SpanOptions,
  SpanKind,
  SpanLink,
  Span,
  SpanContext,
  OtelContext,
  Attributes,

  // Metrics
  MetricType,
  MetricConfig,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,

  // Logging
  LogLevel,
  LogEntry,
  LoggerConfig,

  // Sentry
  ErrorContext,
  Breadcrumb,
  TransactionContext,
} from '@relay/telemetry';

// Zod schemas for validation
import { TelemetryConfigSchema, LoggerConfigSchema } from '@relay/telemetry';
```

## Best Practices

1. **Initialize early**: Call `telemetry.initialize()` at application startup
2. **Shutdown gracefully**: Call `telemetry.shutdown()` before process exit
3. **Use withObservedOperation**: For automatic span/log/error handling
4. **Add context to logs**: Include relevant IDs (request, user, transaction)
5. **Set user context**: For better error grouping in Sentry
6. **Use child loggers**: Add request-scoped context
7. **Sample appropriately**: Use lower trace sample rates in production
8. **Add breadcrumbs**: Before critical operations for better error context
9. **Use standard metrics**: Leverage pre-configured HTTP/DB/cache metrics
10. **Health check regularly**: Monitor telemetry service health

## License

MIT
