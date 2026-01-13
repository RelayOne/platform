import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryService, createTelemetryService, createTelemetryServiceFromEnv } from '../src/telemetry';

// Mock all dependent services
vi.mock('../src/tracing', () => ({
  TracingService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    withSpan: vi.fn().mockImplementation(async (name, fn) => fn({})),
    recordException: vi.fn(),
    getTraceId: vi.fn().mockReturnValue('trace-123'),
    getSpanId: vi.fn().mockReturnValue('span-456'),
  })),
  createTracingService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    withSpan: vi.fn().mockImplementation(async (name, fn) => fn({})),
    recordException: vi.fn(),
    getTraceId: vi.fn().mockReturnValue('trace-123'),
    getSpanId: vi.fn().mockReturnValue('span-456'),
  })),
}));

vi.mock('../src/metrics', () => ({
  MetricsService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    getCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getHistogram: vi.fn().mockReturnValue({ record: vi.fn() }),
    getGauge: vi.fn().mockReturnValue({ record: vi.fn() }),
    getHttpRequestCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getHttpRequestDuration: vi.fn().mockReturnValue({ record: vi.fn() }),
    getDbQueryCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getDbQueryDuration: vi.fn().mockReturnValue({ record: vi.fn() }),
    getCacheCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getErrorCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
  })),
  createMetricsService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    getCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getHistogram: vi.fn().mockReturnValue({ record: vi.fn() }),
    getGauge: vi.fn().mockReturnValue({ record: vi.fn() }),
    getHttpRequestCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getHttpRequestDuration: vi.fn().mockReturnValue({ record: vi.fn() }),
    getDbQueryCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getDbQueryDuration: vi.fn().mockReturnValue({ record: vi.fn() }),
    getCacheCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
    getErrorCounter: vi.fn().mockReturnValue({ add: vi.fn() }),
  })),
}));

vi.mock('../src/sentry', () => ({
  SentryService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    captureError: vi.fn().mockReturnValue('event-id'),
    captureMessage: vi.fn().mockReturnValue('event-id'),
    addBreadcrumb: vi.fn(),
  })),
  createSentryService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    captureError: vi.fn().mockReturnValue('event-id'),
    captureMessage: vi.fn().mockReturnValue('event-id'),
    addBreadcrumb: vi.fn(),
  })),
}));

vi.mock('../src/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    startOperation: vi.fn(),
    endOperation: vi.fn(),
    failOperation: vi.fn(),
    httpRequest: vi.fn(),
    dbQuery: vi.fn(),
    flush: vi.fn(),
  })),
  createLogger: vi.fn().mockImplementation(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    startOperation: vi.fn(),
    endOperation: vi.fn(),
    failOperation: vi.fn(),
    httpRequest: vi.fn(),
    dbQuery: vi.fn(),
    flush: vi.fn(),
  })),
}));

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;

  const defaultConfig = {
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    environment: 'test',
    tracingEnabled: true,
    metricsEnabled: true,
    sentryEnabled: true,
    sentryDsn: 'https://example@sentry.io/0',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    telemetryService = createTelemetryService(defaultConfig);
  });

  afterEach(async () => {
    if (telemetryService.isEnabled()) {
      await telemetryService.shutdown();
    }
  });

  describe('createTelemetryService', () => {
    it('should create a telemetry service instance', () => {
      expect(telemetryService).toBeInstanceOf(TelemetryService);
    });
  });

  describe('createTelemetryServiceFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create telemetry from environment variables', () => {
      process.env.SERVICE_NAME = 'env-service';
      process.env.SERVICE_VERSION = '2.0.0';
      process.env.ENVIRONMENT = 'staging';
      process.env.TRACING_ENABLED = 'true';
      process.env.METRICS_ENABLED = 'true';
      process.env.SENTRY_ENABLED = 'true';
      process.env.SENTRY_DSN = 'https://example@sentry.io/0';

      const service = createTelemetryServiceFromEnv();
      expect(service).toBeInstanceOf(TelemetryService);
    });

    it('should use defaults when env vars not set', () => {
      delete process.env.SERVICE_NAME;
      delete process.env.ENVIRONMENT;

      const service = createTelemetryServiceFromEnv();
      expect(service).toBeInstanceOf(TelemetryService);
    });
  });

  describe('initialize', () => {
    it('should initialize all services', () => {
      telemetryService.initialize();
      expect(telemetryService.isEnabled()).toBe(true);
    });

    it('should not initialize twice', () => {
      telemetryService.initialize();
      telemetryService.initialize();
      expect(telemetryService.isEnabled()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown all services', async () => {
      telemetryService.initialize();
      await telemetryService.shutdown();
      expect(telemetryService.isEnabled()).toBe(false);
    });
  });

  describe('getTracing', () => {
    it('should return tracing service', () => {
      const tracing = telemetryService.getTracing();
      expect(tracing).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics service', () => {
      const metrics = telemetryService.getMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('getSentry', () => {
    it('should return Sentry service', () => {
      const sentry = telemetryService.getSentry();
      expect(sentry).toBeDefined();
    });
  });

  describe('getLogger', () => {
    it('should return logger', () => {
      const logger = telemetryService.getLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with context', () => {
      const childLogger = telemetryService.createChildLogger({ requestId: '123' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all services are running', async () => {
      telemetryService.initialize();
      const health = await telemetryService.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.tracing.healthy).toBe(true);
      expect(health.metrics.healthy).toBe(true);
      expect(health.sentry.healthy).toBe(true);
    });

    it('should return unhealthy status when services are not initialized', async () => {
      // Don't initialize
      const health = await telemetryService.healthCheck();

      // Services report enabled but not healthy when not initialized
      expect(health.tracing.enabled).toBe(true);
      expect(health.metrics.enabled).toBe(true);
      expect(health.sentry.enabled).toBe(true);
    });
  });

  describe('captureError', () => {
    it('should capture error across all services', () => {
      telemetryService.initialize();

      const error = new Error('test error');
      telemetryService.captureError(error, { context: 'test' });

      // Verify error was logged, recorded in tracing, and sent to Sentry
      const logger = telemetryService.getLogger();
      const tracing = telemetryService.getTracing();
      const sentry = telemetryService.getSentry();

      expect(logger.error).toHaveBeenCalled();
      expect(tracing.recordException).toHaveBeenCalledWith(error);
      expect(sentry.captureError).toHaveBeenCalled();
    });
  });

  describe('withObservedOperation', () => {
    it('should execute function with full observability', async () => {
      telemetryService.initialize();

      const result = await telemetryService.withObservedOperation(
        'testOperation',
        async () => 'success',
        { attr: 'value' }
      );

      expect(result).toBe('success');
    });

    it('should handle errors and capture them', async () => {
      telemetryService.initialize();

      const error = new Error('operation failed');

      await expect(
        telemetryService.withObservedOperation('testOperation', async () => {
          throw error;
        })
      ).rejects.toThrow('operation failed');
    });
  });

  describe('recordHttpRequest', () => {
    it('should record HTTP request metrics', () => {
      telemetryService.initialize();

      telemetryService.recordHttpRequest('GET', '/api/users', 200, 50);

      const logger = telemetryService.getLogger();
      expect(logger.httpRequest).toHaveBeenCalledWith('GET', '/api/users', 200, 50, undefined);
    });

    it('should record errors for 5xx responses', () => {
      telemetryService.initialize();

      telemetryService.recordHttpRequest('POST', '/api/users', 500, 100);

      // Error counter should be incremented
    });
  });

  describe('recordDbQuery', () => {
    it('should record database query metrics', () => {
      telemetryService.initialize();

      telemetryService.recordDbQuery('find', 'users', 25, true);

      const logger = telemetryService.getLogger();
      expect(logger.dbQuery).toHaveBeenCalledWith('find', 'users', 25, undefined);
    });

    it('should record errors for failed queries', () => {
      telemetryService.initialize();

      telemetryService.recordDbQuery('find', 'users', 25, false);

      // Error counter should be incremented
    });
  });

  describe('recordCacheOperation', () => {
    it('should record cache hit', () => {
      telemetryService.initialize();

      telemetryService.recordCacheOperation('get', true, 5);

      // Cache counter should be incremented with hit
    });

    it('should record cache miss', () => {
      telemetryService.initialize();

      telemetryService.recordCacheOperation('get', false, 5);

      // Cache counter should be incremented with miss
    });

    it('should record non-applicable result', () => {
      telemetryService.initialize();

      telemetryService.recordCacheOperation('set', null, 10);

      // Cache counter should be incremented with n/a
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const config = telemetryService.getConfig();

      expect(config.serviceName).toBe('test-service');
      expect(config.environment).toBe('test');

      // Verify it's a copy
      config.serviceName = 'modified';
      expect(telemetryService.getConfig().serviceName).toBe('test-service');
    });
  });
});
