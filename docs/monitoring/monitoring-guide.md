# Monitoring and Observability Guide

## Overview
This guide covers the monitoring and observability features built into the Brainiac platform, including metrics collection, logging, alerting, and visualization.

## Table of Contents
- [Metrics Collection](#metrics-collection)
- [Health Checks](#health-checks)
- [Logging](#logging)
- [Alerting](#alerting)
- [Dashboards](#dashboards)
- [Troubleshooting](#troubleshooting)

## Metrics Collection

### Available Metrics

#### System Metrics
- CPU, memory, and disk usage
- Node.js process metrics
- Event loop and garbage collection statistics

#### Application Metrics
- HTTP request rates and latencies
- Database query performance
- Cache hit/miss ratios
- Queue lengths and processing times

#### Business Metrics
- User signups and activity
- API usage by endpoint
- Error rates and types

### Accessing Metrics

#### Prometheus Endpoint
```
GET /metrics
```

Example response:
```
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1",method="GET",path="/api/data",status="200"} 42
http_request_duration_seconds_sum{method="GET",path="/api/data",status="200"} 3.15
http_request_duration_seconds_count{method="GET",path="/api/data",status="200"} 84
```

## Health Checks

### Built-in Health Checks
```
GET /health
```

Example response:
```json
{
  "status": "healthy",
  "timestamp": "2023-04-01T12:00:00Z",
  "services": {
    "database": {
      "status": "healthy",
      "latency": 12
    },
    "cache": {
      "status": "healthy",
      "latency": 2
    },
    "storage": {
      "status": "degraded",
      "latency": 350,
      "message": "High latency on storage service"
    }
  }
}
```

### Custom Health Checks
Add custom health checks in `src/core/health/checks/`:

```javascript
// src/core/health/checks/database.js
const { HealthCheck } = require('@core/health');

class DatabaseHealthCheck extends HealthCheck {
  async check() {
    const start = Date.now();
    const isHealthy = await this.checkDatabaseConnection();
    const latency = Date.now() - start;
    
    return {
      name: 'database',
      status: isHealthy ? 'healthy' : 'unhealthy',
      latency,
      threshold: 100 // ms
    };
  }
}

module.exports = DatabaseHealthCheck;
```

## Logging

### Log Levels
- `error`: Critical failures that require immediate attention
- `warn`: Potentially harmful situations
- `info`: General operational messages
- `debug`: Detailed debugging information
- `trace`: Very detailed debugging information

### Structured Logging
```javascript
const logger = require('@core/logger');

logger.info('User logged in', {
  userId: user.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
});
```

### Log Querying
Search logs using Loki:
```
# Find errors in the last hour
{level="error"} |~ "error message"

# Find slow requests
{app="api"} | json | duration > 1000

# Group by endpoint and status
sum by (endpoint, status) (
  rate({app="api"} | json | __error__=`` [1m])
)
```

## Alerting

### Alert Rules
Alert rules are defined in `config/alert-rules.yml`:

```yaml
groups:
- name: api
  rules:
  - alert: HighErrorRate
    expr: |
      sum(rate(http_requests_total{status=~"5.."}[5m])) by (service, path)
      /
      sum(rate(http_requests_total[5m])) by (service, path)
      > 0.01
    for: 10m
    labels:
      severity: critical
    annotations:
      summary: "High error rate on {{ $labels.path }}"
      description: "{{ $value }} of requests are failing (5xx errors)"
```

### Notification Channels
- Email
- Slack
- PagerDuty
- Webhooks

## Dashboards

### Pre-built Dashboards
1. **System Overview**
   - CPU/Memory/Disk usage
   - Node.js process metrics
   - Garbage collection statistics

2. **API Performance**
   - Request rates by endpoint
   - Latency percentiles
   - Error rates

3. **Business Metrics**
   - User activity
   - Feature usage
   - Conversion funnels

### Creating Custom Dashboards
1. Access Grafana at `http://localhost:3000`
2. Click "+" → "Dashboard"
3. Add panels with PromQL queries
4. Organize with rows and variables

## Troubleshooting

### Common Issues

#### High Latency
1. Check the "API Performance" dashboard
2. Look for slow database queries
3. Check for resource saturation (CPU, memory, I/O)

#### Errors in Logs
1. Search for errors in Loki
2. Check for patterns (specific users, endpoints, times)
3. Review recent deployments

#### Missing Metrics
1. Verify Prometheus is scraping the `/metrics` endpoint
2. Check that the metric names match in your code and queries
3. Verify the time range in your dashboard

### Getting Help
1. Check the [Troubleshooting Guide](troubleshooting.md)
2. Search the [GitHub Issues](https://github.com/your-repo/issues)
3. Open a new issue if needed

## Best Practices

### Monitoring
- Set up alerts for critical metrics
- Monitor both application and infrastructure
- Track business metrics alongside technical metrics

### Alerting
- Use meaningful alert thresholds
- Include runbooks with alerts
- Regularly review and tune alert rules

### Logging
- Use structured logging
- Include relevant context
- Be mindful of log volume

### Performance
- Monitor key performance indicators
- Set up baseline performance metrics
- Alert on significant deviations

## Next Steps
- [Set up monitoring for a new service](new-service.md)
- [Create custom dashboards](dashboards.md)
- [Advanced alerting scenarios](alerting.md)
