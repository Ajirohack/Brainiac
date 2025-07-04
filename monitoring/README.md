# CAI Platform Monitoring Stack

This directory contains the configuration for the CAI Platform monitoring stack, which includes:

- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **Jaeger** - Distributed tracing
- **Loki** - Log aggregation
- **Promtail** - Log collection
- **cAdvisor** - Container metrics
- **Node Exporter** - Host system metrics

## Prerequisites

- Docker and Docker Compose
- Access to the CAI Platform API

## Getting Started

1. **Update Configuration**
   - Edit `prometheus/prometheus.yml` and update the target host for `cai-platform` job if needed
   - The default configuration assumes the API is accessible at `host.docker.internal:3001`

2. **Start the Stack**
   ```bash
   docker-compose up -d
   ```

3. **Access the Services**
   - **Grafana**: [http://localhost:3000](http://localhost:3000) (admin/admin)
   - **Prometheus**: [http://localhost:9090](http://localhost:9090)
   - **Jaeger UI**: [http://localhost:16686](http://localhost:16686)
   - **Loki**: [http://localhost:3100](http://localhost:3100)
   - **cAdvisor**: [http://localhost:8080](http://localhost:8080)

## Dashboard and Visualization

### Grafana Dashboards

The following dashboards are available in Grafana:

1. **CAI Platform - System Dashboard**
   - Overview of system metrics, request rates, and response times
   - Includes panels for CPU, memory, and network usage

2. **CAI Platform - Logs Dashboard**
   - Centralized logs from all services
   - Filter logs by service, level, and time range

3. **CAI Platform - Tracing Dashboard**
   - Distributed traces across services
   - Latency analysis and dependency graphs

### Jaeger UI

- **Trace Search**: Find traces by service, operation, tags, and duration
- **Dependency Graph**: Visualize service dependencies
- **Performance Analysis**: Analyze latency and errors in your distributed system

### Logging with Loki

- **LogQL**: Powerful query language for logs
- **Log Context**: Jump from metrics to logs with one click
- **Labels**: Filter logs using key-value pairs

## Adding Custom Dashboards

1. Export your dashboard from Grafana as JSON
2. Save it in the `grafana/provisioning/dashboards/` directory
3. Restart the Grafana container:
   ```bash
   docker-compose restart grafana
   ```

## Alerting and Log Analysis

### Alerting

To configure alerts:

1. Set up alert rules in `prometheus/alert.rules`
2. Configure alert manager in Prometheus
3. Set up notification channels in Grafana

### Log Analysis

1. **Log Queries**: Use LogQL to query logs
   ```logql
   {job="cai_platform"} |= "error"
   ```

2. **Log Metrics**: Create metrics from logs
   ```logql
   rate({job="cai_platform"} |~ "error" [5m])
   ```

3. **Log Alerts**: Set up alerts based on log patterns

## Maintenance

### Data Persistence

- **Backup**: The following volumes contain data that should be backed up:
  - `grafana_data`
  - `prometheus_data`
  - `loki_data`

### Updates

1. Update the image versions in `docker-compose.yml`
2. Restart the stack:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

### Scaling

For production use, consider:
1. Running Loki in microservices mode
2. Configuring Prometheus for high availability
3. Setting up alert manager for better alert management

## Troubleshooting

### No Data in Grafana?

1. **Check Prometheus Targets**:
   - Open [Prometheus Targets](http://localhost:9090/targets)
   - Verify all targets are UP

2. **Check Container Logs**:
   ```bash
   docker-compose logs -f prometheus grafana loki promtail
   ```

3. **Verify Network**:
   ```bash
   docker network inspect monitoring_monitoring
   ```

### Log Collection Issues

1. **Check Promtail Status**:
   ```bash
   curl http://localhost:9080/ready
   ```

2. **Verify Log Files**:
   ```bash
   docker exec -it cai-promtail ls -la /var/log/
   ```

### Tracing Issues

1. **Check Jaeger UI**:
   - Open [Jaeger UI](http://localhost:16686)
   - Verify services appear in the dropdown

2. **Check Collector Logs**:
   ```bash
   docker-compose logs -f jaeger
   ```

### Permission Issues

- Ensure the Docker daemon has permission to access the host metrics
- Check volume permissions in `docker-compose.yml`
- Run with `--user` flag if needed

## Security Considerations

### Authentication

- Change the default Grafana admin credentials
- Set up authentication for all monitoring services
- Use OAuth or LDAP for team access

### Network Security

- Use HTTPS in production
- Set up a reverse proxy with authentication
- Restrict access to monitoring endpoints
- Use network policies to limit container communication

### Data Protection

- Encrypt sensitive metrics and logs
- Set up retention policies for metrics and logs
- Regularly backup configuration and dashboards

### Compliance

- Mask sensitive data in logs
- Set up audit logging for configuration changes
- Document access controls and procedures
