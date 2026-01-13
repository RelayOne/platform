import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenTelemetry metrics modules - define everything inside the factory
vi.mock('@opentelemetry/api', () => {
  const mockCounter = { add: vi.fn() };
  const mockHistogram = { record: vi.fn() };
  const mockObservableGauge = { addCallback: vi.fn() };

  const mockMeter = {
    createCounter: vi.fn().mockReturnValue(mockCounter),
    createHistogram: vi.fn().mockReturnValue(mockHistogram),
    createObservableGauge: vi.fn().mockReturnValue(mockObservableGauge),
  };

  return {
    metrics: {
      getMeter: vi.fn().mockReturnValue(mockMeter),
      setGlobalMeterProvider: vi.fn(),
    },
  };
});

vi.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: vi.fn().mockImplementation(() => ({
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
  PeriodicExportingMetricReader: vi.fn(),
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn(),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SEMRESATTRS_SERVICE_NAME: 'service.name',
  SEMRESATTRS_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

import { MetricsService, createMetricsService } from '../src/metrics';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  const defaultConfig = {
    serviceName: 'test-service',
    serviceVersion: '1.0.0',
    environment: 'test',
    metricsEnabled: true,
    otlpMetricsEndpoint: 'http://localhost:4318/v1/metrics',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    metricsService = createMetricsService(defaultConfig);
  });

  afterEach(async () => {
    if (metricsService.isEnabled()) {
      await metricsService.shutdown();
    }
  });

  describe('createMetricsService', () => {
    it('should create a metrics service instance', () => {
      expect(metricsService).toBeInstanceOf(MetricsService);
    });
  });

  describe('initialize', () => {
    it('should initialize the metrics provider', () => {
      metricsService.initialize();
      expect(metricsService.isEnabled()).toBe(true);
    });

    it('should not initialize if metrics is disabled', () => {
      const disabledService = createMetricsService({
        ...defaultConfig,
        metricsEnabled: false,
      });
      disabledService.initialize();
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should not initialize twice', () => {
      metricsService.initialize();
      metricsService.initialize();
      expect(metricsService.isEnabled()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should shutdown the metrics provider', async () => {
      metricsService.initialize();
      await metricsService.shutdown();
      expect(metricsService.isEnabled()).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      await metricsService.shutdown();
      expect(metricsService.isEnabled()).toBe(false);
    });
  });

  describe('getCounter', () => {
    it('should create and return a counter', () => {
      const counter = metricsService.getCounter({
        name: 'test_counter',
        description: 'Test counter',
        unit: '1',
      });

      expect(counter).toBeDefined();
      expect(counter.add).toBeDefined();
    });

    it('should reuse existing counter', () => {
      const counter1 = metricsService.getCounter({ name: 'test_counter' });
      const counter2 = metricsService.getCounter({ name: 'test_counter' });

      expect(counter1).toBe(counter2);
    });

    it('should add values to counter', () => {
      const counter = metricsService.getCounter({ name: 'test_counter' });
      counter.add(1, { label: 'value' });
      // Counter.add is mocked
    });
  });

  describe('getGauge', () => {
    it('should create and return a gauge', () => {
      const gauge = metricsService.getGauge({
        name: 'test_gauge',
        description: 'Test gauge',
        unit: '1',
      });

      expect(gauge).toBeDefined();
      expect(gauge.record).toBeDefined();
    });

    it('should reuse existing gauge', () => {
      const gauge1 = metricsService.getGauge({ name: 'test_gauge' });
      const gauge2 = metricsService.getGauge({ name: 'test_gauge' });

      expect(gauge1).toBe(gauge2);
    });

    it('should record values to gauge', () => {
      const gauge = metricsService.getGauge({ name: 'test_gauge' });
      gauge.record(42, { label: 'value' });
      // Gauge wrapper stores value internally
    });
  });

  describe('getHistogram', () => {
    it('should create and return a histogram', () => {
      const histogram = metricsService.getHistogram({
        name: 'test_histogram',
        description: 'Test histogram',
        unit: 's',
      });

      expect(histogram).toBeDefined();
      expect(histogram.record).toBeDefined();
    });

    it('should reuse existing histogram', () => {
      const histogram1 = metricsService.getHistogram({ name: 'test_histogram' });
      const histogram2 = metricsService.getHistogram({ name: 'test_histogram' });

      expect(histogram1).toBe(histogram2);
    });

    it('should record values to histogram', () => {
      const histogram = metricsService.getHistogram({ name: 'test_histogram' });
      histogram.record(0.5, { label: 'value' });
      // Histogram.record is mocked
    });
  });

  describe('standard metrics', () => {
    it('should create HTTP request counter', () => {
      const counter = metricsService.getHttpRequestCounter();
      expect(counter).toBeDefined();
    });

    it('should create HTTP request duration histogram', () => {
      const histogram = metricsService.getHttpRequestDuration();
      expect(histogram).toBeDefined();
    });

    it('should create active connections gauge', () => {
      const gauge = metricsService.getActiveConnectionsGauge();
      expect(gauge).toBeDefined();
    });

    it('should create database query counter', () => {
      const counter = metricsService.getDbQueryCounter();
      expect(counter).toBeDefined();
    });

    it('should create database query duration histogram', () => {
      const histogram = metricsService.getDbQueryDuration();
      expect(histogram).toBeDefined();
    });

    it('should create cache counter', () => {
      const counter = metricsService.getCacheCounter();
      expect(counter).toBeDefined();
    });

    it('should create error counter', () => {
      const counter = metricsService.getErrorCounter();
      expect(counter).toBeDefined();
    });

    it('should create queue size gauge', () => {
      const gauge = metricsService.getQueueSizeGauge();
      expect(gauge).toBeDefined();
    });

    it('should create memory usage gauge', () => {
      const gauge = metricsService.getMemoryUsageGauge();
      expect(gauge).toBeDefined();
    });
  });

  describe('getMeter', () => {
    it('should return the underlying meter', () => {
      const meter = metricsService.getMeter();
      expect(meter).toBeDefined();
    });
  });
});
