const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const config = require('../config/monitoring');

// Enable OpenTelemetry debug logging if needed
if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

class MetricsCollector {
  constructor() {
    if (!config.metrics.enabled) {
      this.metrics = {};
      return;
    }

    // Create resource with service name
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: config.monitoring.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.monitoring.serviceVersion,
      'deployment.environment': config.monitoring.environment,
      'service.instance.id': config.monitoring.instanceId,
    });

    // Create meter provider
    this.meterProvider = new MeterProvider({
      resource,
    });

    // Create Prometheus exporter
    this.exporter = new PrometheusExporter(
      {
        port: config.metrics.port,
        endpoint: config.metrics.path,
        prefix: config.metrics.prefix,
      },
      () => {
        console.log(`Prometheus scrape endpoint: http://0.0.0.0:${config.metrics.port}${config.metrics.path}`);
      }
    );

    // Add the exporter to the meter provider
    this.meterProvider.addMetricReader(this.exporter);

    // Get a meter instance
    this.meter = this.meterProvider.getMeter(config.monitoring.serviceName);

    // Initialize metrics
    this.initializeMetrics();

    // Register default metrics if enabled
    if (config.metrics.collectDefaultMetrics) {
      this.registerDefaultMetrics();
    }
  }

  initializeMetrics() {
    // HTTP Metrics
    this.metrics = {
      // HTTP request duration in milliseconds
      httpRequestDuration: this.meter.createHistogram('http_request_duration_ms', {
        description: 'Duration of HTTP requests in milliseconds',
        unit: 'ms',
        valueType: 1, // DOUBLE
      }),

      // Total HTTP requests
      httpRequestsTotal: this.meter.createCounter('http_requests_total', {
        description: 'Total number of HTTP requests',
        valueType: 1, // INT
      }),

      // HTTP request errors
      httpRequestErrors: this.meter.createCounter('http_request_errors_total', {
        description: 'Total number of HTTP request errors',
        valueType: 1, // INT
      }),

      // Database query duration
      dbQueryDuration: this.meter.createHistogram('db_query_duration_ms', {
        description: 'Duration of database queries in milliseconds',
        unit: 'ms',
        valueType: 1, // DOUBLE
      }),

      // Database query count
      dbQueriesTotal: this.meter.createCounter('db_queries_total', {
        description: 'Total number of database queries',
        valueType: 1, // INT
      }),

      // Database errors
      dbErrors: this.meter.createCounter('db_errors_total', {
        description: 'Total number of database errors',
        valueType: 1, // INT
      }),

      // Cache hits
      cacheHits: this.meter.createCounter('cache_hits_total', {
        description: 'Total number of cache hits',
        valueType: 1, // INT
      }),

      // Cache misses
      cacheMisses: this.meter.createCounter('cache_misses_total', {
        description: 'Total number of cache misses',
        valueType: 1, // INT
      }),

      // Cache duration
      cacheDuration: this.meter.createHistogram('cache_duration_ms', {
        description: 'Duration of cache operations in milliseconds',
        unit: 'ms',
        valueType: 1, // DOUBLE
      }),

      // Active requests
      activeRequests: this.meter.createObservableGauge('active_requests', {
        description: 'Number of active requests',
        valueType: 1, // INT
      }),

      // Memory usage
      memoryUsage: this.meter.createObservableGauge('process_memory_usage_bytes', {
        description: 'Process memory usage in bytes',
        unit: 'bytes',
        valueType: 1, // INT
      }),

      // CPU usage
      cpuUsage: this.meter.createObservableGauge('process_cpu_usage_percent', {
        description: 'Process CPU usage percentage',
        unit: '%',
        valueType: 1, // DOUBLE
      }),

      // Event loop lag
      eventLoopLag: this.meter.createObservableGauge('nodejs_eventloop_lag_ms', {
        description: 'Event loop lag in milliseconds',
        unit: 'ms',
        valueType: 1, // DOUBLE
      }),

      // Garbage collection
      gcCalls: this.meter.createCounter('nodejs_gc_calls_total', {
        description: 'Total number of garbage collection calls',
        valueType: 1, // INT
      }),

      // Custom business metrics
      customMetrics: {},
    };
  }

  registerDefaultMetrics() {
    // Track memory usage
    this.metrics.memoryUsage.addCallback((observableResult) => {
      const memoryUsage = process.memoryUsage();
      observableResult.observe(memoryUsage.heapUsed, { type: 'heap_used' });
      observableResult.observe(memoryUsage.heapTotal, { type: 'heap_total' });
      observableResult.observe(memoryUsage.rss, { type: 'rss' });
      observableResult.observe(memoryUsage.external, { type: 'external' });
    });

    // Track CPU usage
    let lastCPUUsage = process.cpuUsage();
    let lastHrTime = process.hrtime();

    this.metrics.cpuUsage.addCallback((observableResult) => {
      const currentCPUUsage = process.cpuUsage();
      const currentHrTime = process.hrtime();
      
      // Calculate CPU usage percentage
      const elapsedHRTime = process.hrtime(lastHrTime);
      const elapsedTimeInMs = elapsedHRTime[0] * 1000 + elapsedHRTime[1] / 1e6;
      
      const userUsageMicros = currentCPUUsage.user - lastCPUUsage.user;
      const systemUsageMicros = currentCPUUsage.system - lastCPUUsage.system;
      const totalUsageMicros = userUsageMicros + systemUsageMicros;
      
      const cpuUsagePercent = (totalUsageMicros / 1000 / elapsedTimeInMs) * 100;
      
      observableResult.observe(cpuUsagePercent);
      
      // Update last values
      lastCPUUsage = currentCPUUsage;
      lastHrTime = currentHrTime;
    });

    // Track event loop lag
    this.metrics.eventLoopLag.addCallback((observableResult) => {
      const start = process.hrtime();
      setImmediate(() => {
        const delta = process.hrtime(start);
        const lag = (delta[0] * 1e9 + delta[1]) / 1e6; // Convert to ms
        observableResult.observe(lag);
      });
    });
  }

  // Method to create a custom metric
  createCustomMetric(name, type, options = {}) {
    if (!this.metrics.customMetrics[name]) {
      switch (type.toLowerCase()) {
        case 'counter':
          this.metrics.customMetrics[name] = this.meter.createCounter(name, options);
          break;
        case 'gauge':
          this.metrics.customMetrics[name] = this.meter.createObservableGauge(name, options);
          break;
        case 'histogram':
          this.metrics.customMetrics[name] = this.meter.createHistogram(name, options);
          break;
        default:
          throw new Error(`Unsupported metric type: ${type}`);
      }
    }
    return this.metrics.customMetrics[name];
  }

  // Method to get a custom metric
  getCustomMetric(name) {
    return this.metrics.customMetrics[name];
  }

  // Shutdown the meter provider
  async shutdown() {
    if (this.meterProvider) {
      await this.meterProvider.shutdown();
    }
  }
}

// Create a singleton instance
const metrics = new MetricsCollector();

module.exports = metrics;
