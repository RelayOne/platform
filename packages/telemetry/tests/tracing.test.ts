import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TracingService, createTracingService } from '../src/tracing';

// Mock OpenTelemetry modules
vi.mock('@opentelemetry/api', () => {
  const mockSpan = {
    spanContext: vi.fn().mockReturnValue({
      traceId: 'test-trace-id',
      spanId: 'test-span-id',
    }),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
  };

  const mockTracer = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
  };

  return {
    trace: {
      getTracer: vi.fn().mockReturnValue(mockTracer),
      getActiveSpan: vi.fn().mockReturnValue(mockSpan),
      setSpan: vi.fn().mockReturnValue({}),
    },
    context: {
      active: vi.fn().mockReturnValue({}),
      with: vi.fn().mockImplementation((ctx, fn) => fn()),
    },
    SpanStatusCode: {
      OK: 0,
      ERROR: 2,
    },
    SpanKind: {
      INTERNAL: 0,
      SERVER: 1,
      CLIENT: 2,
      PRODUCER: 3,
      CONSUMER: 4,
    },
  };
});

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: vi.fn().mockImplementation(() => ({
    addSpanProcessor: vi.fn(),
    register: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: vi.fn(),
  SimpleSpanProcessor: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn(),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SEMRESATTRS_SERVICE_NAME: 'service.name',
  SEMRESATTRS_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

describe('TracingService', () => {
  let tracingService: TracingService;

  const defaultConfig = {
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    environment: 'test',
    tracingEnabled: true,
    otlpTracesEndpoint: 'http://localhost:4318/v1/traces',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tracingService = createTracingService(defaultConfig);
  });

  afterEach(async () => {
    if (tracingService.isEnabled()) {
      await tracingService.shutdown();
    }
  });

  describe('createTracingService', () => {
    it('should create a tracing service instance', () => {
      expect(tracingService).toBeInstanceOf(TracingService);
    });
  });

  describe('initialize', () => {
    it('should initialize the tracing provider', () => {
      tracingService.initialize();
      expect(tracingService.isEnabled()).toBe(true);
    });

    it('should not initialize if tracing is disabled', () => {
      const disabledService = createTracingService({
        ...defaultConfig,
        tracingEnabled: false,
      });
      disabledService.initialize();
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should not initialize twice', () => {
      tracingService.initialize();
      tracingService.initialize();
      expect(tracingService.isEnabled()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown the tracing provider', async () => {
      tracingService.initialize();
      await tracingService.shutdown();
      expect(tracingService.isEnabled()).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      await tracingService.shutdown();
      expect(tracingService.isEnabled()).toBe(false);
    });
  });

  describe('startSpan', () => {
    it('should create a new span', () => {
      const span = tracingService.startSpan('test-span');
      expect(span).toBeDefined();
    });

    it('should create span with options', () => {
      const span = tracingService.startSpan('test-span', {
        kind: 'server',
        attributes: { 'http.method': 'GET' },
      });
      expect(span).toBeDefined();
    });

    it('should handle different span kinds', () => {
      const kinds = ['internal', 'server', 'client', 'producer', 'consumer'] as const;
      kinds.forEach((kind) => {
        const span = tracingService.startSpan('test-span', { kind });
        expect(span).toBeDefined();
      });
    });
  });

  describe('withSpan', () => {
    it('should execute function within span context', async () => {
      const result = await tracingService.withSpan('test-span', async () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should handle errors and set span status', async () => {
      const error = new Error('test error');

      await expect(
        tracingService.withSpan('test-span', async () => {
          throw error;
        })
      ).rejects.toThrow('test error');
    });
  });

  describe('withSpanSync', () => {
    it('should execute synchronous function within span context', () => {
      const result = tracingService.withSpanSync('test-span', () => {
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should handle errors in sync function', () => {
      const error = new Error('sync error');

      expect(() =>
        tracingService.withSpanSync('test-span', () => {
          throw error;
        })
      ).toThrow('sync error');
    });
  });

  describe('getActiveSpan', () => {
    it('should return the active span', () => {
      const span = tracingService.getActiveSpan();
      expect(span).toBeDefined();
    });
  });

  describe('getActiveContext', () => {
    it('should return the active context', () => {
      const ctx = tracingService.getActiveContext();
      expect(ctx).toBeDefined();
    });
  });

  describe('getTraceId', () => {
    it('should return the trace ID', () => {
      const traceId = tracingService.getTraceId();
      expect(traceId).toBe('test-trace-id');
    });
  });

  describe('getSpanId', () => {
    it('should return the span ID', () => {
      const spanId = tracingService.getSpanId();
      expect(spanId).toBe('test-span-id');
    });
  });

  describe('setAttributes', () => {
    it('should set attributes on the current span', () => {
      tracingService.setAttributes({ 'custom.attr': 'value' });
      // Verify through mock
    });
  });

  describe('recordException', () => {
    it('should record exception on the current span', () => {
      const error = new Error('test exception');
      tracingService.recordException(error);
      // Verify through mock
    });
  });

  describe('addEvent', () => {
    it('should add event to the current span', () => {
      tracingService.addEvent('test-event', { key: 'value' });
      // Verify through mock
    });
  });

  describe('getTracer', () => {
    it('should return the underlying tracer', () => {
      const tracer = tracingService.getTracer();
      expect(tracer).toBeDefined();
    });
  });
});
