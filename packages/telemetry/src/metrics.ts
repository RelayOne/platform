import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
  type Attributes,
} from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import type { TelemetryConfig, MetricConfig, CounterMetric, GaugeMetric, HistogramMetric } from './types';

/**
 * Wrapper for OpenTelemetry Counter
 */
class CounterWrapper implements CounterMetric {
  constructor(private counter: Counter) {}

  add(value: number, attributes?: Attributes): void {
    this.counter.add(value, attributes);
  }
}

/**
 * Wrapper for OpenTelemetry Histogram
 */
class HistogramWrapper implements HistogramMetric {
  constructor(private histogram: Histogram) {}

  record(value: number, attributes?: Attributes): void {
    this.histogram.record(value, attributes);
  }
}

/**
 * Wrapper for gauge-like behavior using observable gauge
 */
class GaugeWrapper implements GaugeMetric {
  private currentValue = 0;
  private currentAttributes: Attributes = {};

  constructor(meter: Meter, name: string, options: { description?: string; unit?: string }) {
    meter.createObservableGauge(name, {
      description: options.description,
      unit: options.unit,
    }).addCallback((observableResult) => {
      observableResult.observe(this.currentValue, this.currentAttributes);
    });
  }

  record(value: number, attributes?: Attributes): void {
    this.currentValue = value;
    this.currentAttributes = attributes ?? {};
  }
}

/**
 * Metrics service for application metrics with OpenTelemetry.
 * Provides counters, gauges, and histograms with OTLP export.
 */
export class MetricsService {
  private provider: MeterProvider | null = null;
  private meter: Meter;
  private config: TelemetryConfig;
  private isInitialized = false;
  private counters: Map<string, CounterWrapper> = new Map();
  private histograms: Map<string, HistogramWrapper> = new Map();
  private gauges: Map<string, GaugeWrapper> = new Map();

  /**
   * Creates a new MetricsService instance.
   * @param config - Telemetry configuration
   */
  constructor(config: TelemetryConfig) {
    this.config = config;
    this.meter = metrics.getMeter(config.serviceName, config.serviceVersion);
  }

  /**
   * Initializes the metrics provider with exporters.
   * Call this once during application startup.
   */
  public initialize(): void {
    if (this.isInitialized || !this.config.metricsEnabled) {
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

    // Configure exporter if endpoint is provided
    const readers = [];
    if (this.config.otlpMetricsEndpoint) {
      const exporter = new OTLPMetricExporter({
        url: this.config.otlpMetricsEndpoint,
      });

      readers.push(
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: this.config.debug ? 5000 : 60000,
        })
      );
    }

    this.provider = new MeterProvider({
      resource,
      readers,
    });

    // Register provider globally
    metrics.setGlobalMeterProvider(this.provider);

    // Get new meter from registered provider
    this.meter = metrics.getMeter(this.config.serviceName, this.config.serviceVersion);
    this.isInitialized = true;
  }

  /**
   * Shuts down the metrics provider and flushes pending metrics.
   */
  public async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      this.provider = null;
      this.isInitialized = false;
    }
  }

  /**
   * Gets or creates a counter metric.
   * @param config - Metric configuration
   * @returns Counter metric interface
   */
  public getCounter(config: Omit<MetricConfig, 'type'>): CounterMetric {
    const key = config.name;

    if (!this.counters.has(key)) {
      const counter = this.meter.createCounter(config.name, {
        description: config.description,
        unit: config.unit,
      });
      this.counters.set(key, new CounterWrapper(counter));
    }

    return this.counters.get(key)!;
  }

  /**
   * Gets or creates a gauge metric.
   * @param config - Metric configuration
   * @returns Gauge metric interface
   */
  public getGauge(config: Omit<MetricConfig, 'type'>): GaugeMetric {
    const key = config.name;

    if (!this.gauges.has(key)) {
      const gauge = new GaugeWrapper(this.meter, config.name, {
        description: config.description,
        unit: config.unit,
      });
      this.gauges.set(key, gauge);
    }

    return this.gauges.get(key)!;
  }

  /**
   * Gets or creates a histogram metric.
   * @param config - Metric configuration
   * @returns Histogram metric interface
   */
  public getHistogram(config: Omit<MetricConfig, 'type'>): HistogramMetric {
    const key = config.name;

    if (!this.histograms.has(key)) {
      const histogram = this.meter.createHistogram(config.name, {
        description: config.description,
        unit: config.unit,
      });
      this.histograms.set(key, new HistogramWrapper(histogram));
    }

    return this.histograms.get(key)!;
  }

  /**
   * Creates a standard HTTP request counter.
   * @returns Counter for HTTP requests
   */
  public getHttpRequestCounter(): CounterMetric {
    return this.getCounter({
      name: 'http_requests_total',
      description: 'Total number of HTTP requests',
      unit: '1',
    });
  }

  /**
   * Creates a standard HTTP request duration histogram.
   * @returns Histogram for HTTP request duration
   */
  public getHttpRequestDuration(): HistogramMetric {
    return this.getHistogram({
      name: 'http_request_duration_seconds',
      description: 'HTTP request duration in seconds',
      unit: 's',
    });
  }

  /**
   * Creates a standard active connections gauge.
   * @returns Gauge for active connections
   */
  public getActiveConnectionsGauge(): GaugeMetric {
    return this.getGauge({
      name: 'active_connections',
      description: 'Number of active connections',
      unit: '1',
    });
  }

  /**
   * Creates a standard database query counter.
   * @returns Counter for database queries
   */
  public getDbQueryCounter(): CounterMetric {
    return this.getCounter({
      name: 'db_queries_total',
      description: 'Total number of database queries',
      unit: '1',
    });
  }

  /**
   * Creates a standard database query duration histogram.
   * @returns Histogram for database query duration
   */
  public getDbQueryDuration(): HistogramMetric {
    return this.getHistogram({
      name: 'db_query_duration_seconds',
      description: 'Database query duration in seconds',
      unit: 's',
    });
  }

  /**
   * Creates a standard cache hit/miss counter.
   * @returns Counter for cache operations
   */
  public getCacheCounter(): CounterMetric {
    return this.getCounter({
      name: 'cache_operations_total',
      description: 'Total number of cache operations',
      unit: '1',
    });
  }

  /**
   * Creates a standard error counter.
   * @returns Counter for errors
   */
  public getErrorCounter(): CounterMetric {
    return this.getCounter({
      name: 'errors_total',
      description: 'Total number of errors',
      unit: '1',
    });
  }

  /**
   * Creates a standard queue size gauge.
   * @returns Gauge for queue size
   */
  public getQueueSizeGauge(): GaugeMetric {
    return this.getGauge({
      name: 'queue_size',
      description: 'Current queue size',
      unit: '1',
    });
  }

  /**
   * Creates a standard memory usage gauge.
   * @returns Gauge for memory usage
   */
  public getMemoryUsageGauge(): GaugeMetric {
    return this.getGauge({
      name: 'memory_usage_bytes',
      description: 'Memory usage in bytes',
      unit: 'By',
    });
  }

  /**
   * Gets the underlying meter instance.
   * @returns The OpenTelemetry meter
   */
  public getMeter(): Meter {
    return this.meter;
  }

  /**
   * Checks if the metrics service is initialized.
   * @returns Whether metrics is initialized
   */
  public isEnabled(): boolean {
    return this.isInitialized && !!this.config.metricsEnabled;
  }
}

/**
 * Creates a new metrics service instance.
 * @param config - Telemetry configuration
 * @returns A configured MetricsService
 */
export function createMetricsService(config: TelemetryConfig): MetricsService {
  return new MetricsService(config);
}
