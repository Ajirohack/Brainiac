require('dotenv').config();

const isEnabled = (value) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
};

module.exports = {
  // General monitoring settings
  monitoring: {
    enabled: isEnabled(process.env.MONITORING_ENABLED ?? 'true'),
    environment: process.env.NODE_ENV || 'development',
    serviceName: process.env.SERVICE_NAME || 'cai-platform',
    serviceVersion: process.env.npm_package_version || '0.1.0',
    instanceId: process.env.HOSTNAME || require('os').hostname(),
  },
  
  // Tracing configuration
  tracing: {
    enabled: isEnabled(process.env.TRACING_ENABLED ?? 'true'),
    sampler: process.env.OTEL_TRACES_SAMPLER || 'parentbased_always_on',
    sampleRate: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
    exporter: process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf',
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? 
      Object.fromEntries(
        process.env.OTEL_EXPORTER_OTLP_HEADERS
          .split(',')
          .map(h => h.split('='))
      ) : {},
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    json: isEnabled(process.env.LOG_JSON ?? 'true'),
    colorize: isEnabled(process.env.LOG_COLORIZE ?? 'true'),
    timestamp: isEnabled(process.env.LOG_TIMESTAMP ?? 'true'),
    handleExceptions: isEnabled(process.env.LOG_HANDLE_EXCEPTIONS ?? 'true'),
    loki: {
      enabled: isEnabled(process.env.LOKI_ENABLED ?? 'true'),
      host: process.env.LOKI_HOST || 'http://loki:3100',
      basicAuth: process.env.LOKI_BASIC_AUTH || null,
      batch: isEnabled(process.env.LOKI_BATCH ?? 'true'),
      interval: parseInt(process.env.LOKI_INTERVAL || '5000', 10),
      replaceTimestamp: isEnabled(process.env.LOKI_REPLACE_TIMESTAMP ?? 'true'),
      batching: isEnabled(process.env.LOKI_BATCHING ?? 'true'),
      clearOnError: isEnabled(process.env.LOKI_CLEAR_ON_ERROR ?? 'true'),
      queueOptions: {
        size: parseInt(process.env.LOKI_QUEUE_SIZE || '1000', 10),
        retries: parseInt(process.env.LOKI_RETRIES || '3', 10),
        timeout: parseInt(process.env.LOKI_TIMEOUT || '5000', 10),
        backoff: parseInt(process.env.LOKI_BACKOFF || '1000', 10),
      },
    },
  },
  
  // Metrics configuration
  metrics: {
    enabled: isEnabled(process.env.METRICS_ENABLED ?? 'true'),
    port: parseInt(process.env.METRICS_PORT || '9464', 10),
    path: process.env.METRICS_PATH || '/metrics',
    prefix: process.env.METRICS_PREFIX || 'cai_',
    collectDefaultMetrics: isEnabled(process.env.COLLECT_DEFAULT_METRICS ?? 'true'),
    defaultMetricsInterval: parseInt(process.env.DEFAULT_METRICS_INTERVAL || '10000', 10),
  },
  
  // Health check configuration
  health: {
    enabled: isEnabled(process.env.HEALTH_CHECK_ENABLED ?? 'true'),
    path: process.env.HEALTH_CHECK_PATH || '/health',
    port: process.env.HEALTH_CHECK_PORT || '3001',
    host: process.env.HEALTH_CHECK_HOST || '0.0.0.0',
    details: isEnabled(process.env.HEALTH_CHECK_DETAILS ?? 'true'),
  },
};

// Validate required configurations
if (module.exports.monitoring.enabled) {
  if (!process.env.SERVICE_NAME) {
    console.warn('SERVICE_NAME environment variable is not set. Using default service name.');
  }
  
  if (module.exports.tracing.enabled && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.warn('OTEL_EXPORTER_OTLP_ENDPOINT is not set. Using default local endpoint.');
  }
  
  if (module.exports.logging.loki.enabled && !process.env.LOKI_HOST) {
    console.warn('LOKI_HOST is not set. Loki logging will be disabled.');
    module.exports.logging.loki.enabled = false;
  }
}
