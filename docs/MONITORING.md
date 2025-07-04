# Monitoring and Observability

This document provides an overview of the monitoring and observability features in the CAI Platform, including how to use them and extend them for your needs.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Logging](#logging)
- [Metrics](#metrics)
- [Tracing](#tracing)
- [Health Checks](#health-checks)
- [Alerting](#alerting)
- [Extending Monitoring](#extending-monitoring)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Architecture Overview

The monitoring stack consists of several components:

1. **Logging**:
   - **Winston** for structured logging
   - **Loki** for log aggregation
   - **Promtail** for log collection

2. **Metrics**:
   - **Prometheus** for metrics collection and storage
   - **Node.js Client** for application metrics
   - **cAdvisor** for container metrics
   - **Node Exporter** for host metrics

3. **Tracing**:
   - **OpenTelemetry** for distributed tracing
   - **Jaeger** for trace visualization and analysis

4. **Visualization**:
   - **Grafana** for dashboards and visualization
   - **Jaeger UI** for trace exploration

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 16+
- Access to the monitoring stack (Loki, Prometheus, Jaeger, Grafana)

### Environment Variables

Configure the following environment variables in your `.env` file:

```env
# Monitoring & Observability
## OpenTelemetry Configuration
OTEL_SERVICE_NAME=cai-platform
OTEL_SERVICE_VERSION=1.0.0
OTEL_TRACES_SAMPLER=parentbased_always_on
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

## Loki Configuration
LOKI_ENABLED=true
LOKI_HOST=http://localhost:3100

## Metrics
METRICS_ENABLED=true
METRICS_PORT=9464
```

## Logging

### Basic Usage

```javascript
const { createAppLogger } = require('./utils/logger');
const logger = createAppLogger('my-service');

// Log messages at different levels
logger.debug('Debug message');
logger.info('Informational message');
logger.warn('Warning message');
logger.error('Error message');

// Log with metadata
logger.info('User logged in', {
  userId: '123',
  ip: '192.168.1.1',
  userAgent: req.headers['user-agent']
});

// Log errors
try {
  // Some code that might throw
} catch (error) {
  logger.error('Failed to process request', {
    error: error.message,
    stack: error.stack,
    requestId: req.id
  });
}
```

### Log Querying with LogQL

Use LogQL to query logs in Grafana/Loki:

```logql
# Basic log query
{job="cai-platform"} |= "error"

# Filter by level
{job="cai-platform"} |~ "level=error"

# Parse JSON logs
{job="cai-platform"} | json | level="error"

# Calculate error rate
rate({job="cai-platform"} |~ "level=error" [1m])
```

## Metrics

### Available Metrics

The following metrics are available out of the box:

- `http_request_duration_ms`: HTTP request duration histogram
- `http_requests_total`: Total HTTP requests counter
- `http_request_errors_total`: HTTP error counter
- `db_query_duration_ms`: Database query duration histogram
- `db_queries_total`: Total database queries counter
- `db_errors_total`: Database error counter
- `cache_hits_total`: Cache hits counter
- `cache_misses_total`: Cache misses counter
- `cache_duration_ms`: Cache operation duration histogram
- `active_requests`: Current active requests gauge
- `process_memory_usage_bytes`: Process memory usage
- `process_cpu_usage_percent`: Process CPU usage
- `nodejs_eventloop_lag_ms`: Event loop lag

### Creating Custom Metrics

```javascript
const metrics = require('./utils/metrics');

// Create a custom counter
const userRegistrations = metrics.createCustomMetric(
  'user_registrations_total',
  'counter',
  { description: 'Total number of user registrations' }
);

// Increment the counter
userRegistrations.add(1, { plan: 'free' });

// Create a custom gauge
const activeUsers = metrics.createCustomMetric(
  'active_users',
  'gauge',
  { description: 'Number of active users' }
);

// Set the gauge value
activeUsers.set(42, { region: 'us-east-1' });
```

### Querying Metrics

PromQL examples for querying metrics:

```promql
# HTTP request rate by status code
rate(http_requests_total[5m])

# 95th percentile of request duration
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le))

# Error rate
sum(rate(http_request_errors_total[5m])) by (status_code)

# Memory usage
process_memory_usage_bytes{type="heap_used"}
```

## Tracing

### Basic Usage

```javascript
const { trace } = require('@opentelemetry/api');

// Get a tracer
const tracer = trace.getTracer('my-service');

// Create a span
tracer.startActiveSpan('operation-name', (span) => {
  try {
    // Add attributes
    span.setAttribute('user.id', userId);
    
    // Add events
    span.addEvent('Processing started', {
      'item.count': items.length
    });
    
    // Your code here
    
    // Set status
    span.setStatus({ code: trace.SpanStatusCode.OK });
  } catch (error) {
    // Record exception
    span.recordException(error);
    span.setStatus({
      code: trace.SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    // End the span
    span.end();
  }
});
```

### Nested Spans

```javascript
tracer.startActiveSpan('parent-operation', async (parentSpan) => {
  try {
    // First child operation
    await tracer.startActiveSpan('child-1', async (child1Span) => {
      // ...
      child1Span.end();
    });
    
    // Second child operation
    await tracer.startActiveSpan('child-2', async (child2Span) => {
      // ...
      child2Span.end();
    });
    
    parentSpan.setStatus({ code: trace.SpanStatusCode.OK });
  } catch (error) {
    parentSpan.recordException(error);
    parentSpan.setStatus({
      code: trace.SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    parentSpan.end();
  }
});
```

## Health Checks

### Built-in Health Endpoints

- `GET /health`: Basic health check
- `GET /metrics`: Prometheus metrics endpoint
- `GET /api/status`: API status endpoint

### Implementing Custom Health Checks

```javascript
const { HealthChecker, HealthEndpoint } = require('@godaddy/terminus');

const healthChecker = new HealthChecker({
  timeout: 5000,
  signals: ['SIGTERM', 'SIGINT'],
  logger: console.error,
  healthChecks: {
    '/health/ready': async () => {
      // Check database connection
      await checkDatabase();
      
      // Check external services
      await checkExternalServices();
      
      return { status: 'ok' };
    },
    '/health/live': () => {
      // Simple liveness check
      return { status: 'ok' };
    }
  }
});

// Add to your Express app
app.use('/health', HealthEndpoint(healthChecker));
```

## Alerting

### Prometheus Alert Rules

Example alert rules for Prometheus:

```yaml
groups:
- name: cai-platform
  rules:
    # Alert for high error rate
    - alert: HighErrorRate
      expr: rate(http_request_errors_total[5m]) > 0.1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate on {{ $labels.instance }}"
        description: "Error rate is {{ $value }} for service {{ $labels.service }}"
    
    # Alert for high latency
    - alert: HighLatency
      expr: histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le)) > 1000
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High latency on {{ $labels.instance }}"
        description: "95th percentile latency is {{ $value }}ms for service {{ $labels.service }}"
    
    # Alert for high memory usage
    - alert: HighMemoryUsage
      expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 90
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage on {{ $labels.instance }}"
        description: "Memory usage is {{ $value }}%"
```

### Grafana Alerts

1. Navigate to the dashboard panel you want to create an alert for
2. Click on the panel title and select "Edit"
3. Go to the "Alert" tab
4. Click "Create Alert"
5. Configure the alert condition, evaluation group, and notification channels
6. Save the dashboard

## Extending Monitoring

### Adding Custom Instrumentation

```javascript
const { trace } = require('@opentelemetry/api');
const api = require('@opentelemetry/api');

// Create a custom instrumentation
class MyCustomInstrumentation {
  constructor() {
    this.tracer = trace.getTracer('my-custom-instrumentation');
  }
  
  // Instrument a function
  instrumentFunction(originalFunction) {
    const tracer = this.tracer;
    
    return function(...args) {
      return tracer.startActiveSpan(
        `${originalFunction.name}`, 
        async (span) => {
          try {
            const result = await originalFunction.apply(this, args);
            span.setStatus({ code: api.SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.recordException(error);
            span.setStatus({ 
              code: api.SpanStatusCode.ERROR, 
              message: error.message 
            });
            throw error;
          } finally {
            span.end();
          }
        }
      );
    };
  }
}

// Usage
const myInstrumentation = new MyCustomInstrumentation();
const originalFunction = async () => { /* ... */ };
const instrumentedFunction = myInstrumentation.instrumentFunction(originalFunction);
```

## Troubleshooting

### Common Issues

1. **No logs in Loki**
   - Verify Promtail is running and configured correctly
   - Check Promtail logs: `docker-compose logs promtail`
   - Verify log files exist and are readable

2. **No metrics in Prometheus**
   - Check if the metrics endpoint is accessible: `curl http://localhost:9464/metrics`
   - Verify Prometheus is scraping the target
   - Check Prometheus targets page: `http://localhost:9090/targets`

3. **No traces in Jaeger**
   - Verify the OpenTelemetry collector is running
   - Check if the OTLP endpoint is correct
   - Verify the service name matches in Jaeger UI

4. **High memory usage**
   - Check for memory leaks in your application
   - Adjust Prometheus retention settings if needed
   - Consider increasing resources for the monitoring stack

## Best Practices

### Logging
- Use structured logging with consistent field names
- Include request IDs for tracing requests across services
- Log at appropriate levels (DEBUG, INFO, WARN, ERROR)
- Don't log sensitive information
- Use contextual logging to add relevant metadata

### Metrics
- Use meaningful metric names and labels
- Follow naming conventions (e.g., `_total` for counters)
- Be mindful of cardinality in labels
- Document your metrics

### Tracing
- Create spans for all significant operations
- Keep span names clear and consistent
- Add relevant attributes to spans
- Handle errors and set appropriate status codes
- Keep spans short-lived

### Performance
- Sample traces in production (don't trace everything)
- Use batch exporters where possible
- Monitor the monitoring system itself
- Set appropriate retention periods for metrics and traces

### Security
- Secure access to monitoring endpoints
- Use TLS for all monitoring traffic
- Implement authentication and authorization
- Regularly update monitoring components
