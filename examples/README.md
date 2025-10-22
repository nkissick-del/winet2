# Winet2 Examples

This directory contains example configurations and deployment scenarios for Winet2.

## Contents

- `docker-compose-with-monitoring.yml` - Full stack with Prometheus and Grafana monitoring
- `prometheus.yml` - Prometheus configuration for scraping Winet2 metrics
- `grafana/` - Grafana dashboard configurations

## Quick Start with Monitoring

### 1. Prerequisites

- Docker and Docker Compose installed
- `.env` file configured (copy from `../.env.example`)

### 2. Start the Full Stack

```bash
cd examples/
docker-compose -f docker-compose-with-monitoring.yml up -d
```

This starts:
- **Winet2** - Main application with metrics enabled
- **Prometheus** - Metrics collection (http://localhost:9091)
- **Grafana** - Visualization dashboard (http://localhost:3000)

### 3. Access the Dashboard

1. Open Grafana: http://localhost:3000
2. Login with `admin` / `admin` (change on first login)
3. Navigate to Dashboards → Winet2 Monitoring Dashboard

### 4. View Metrics

**Prometheus Metrics**: http://localhost:9090/metrics
**Prometheus UI**: http://localhost:9091
**Grafana**: http://localhost:3000

## Configuration

### Environment Variables

Create `.env` file in the examples directory:

```bash
# Required
WINET_HOST=192.168.1.100
MQTT_URL=mqtt://192.168.1.10:1883

# Optional
MQTT_USER=homeassistant
MQTT_PASS=your_password
POLL_INTERVAL=10

# Grafana
GRAFANA_PASSWORD=secure_password
```

### Custom Prometheus Configuration

Edit `prometheus.yml` to adjust:
- Scrape intervals
- Retention periods
- Alerting rules

### Custom Grafana Dashboards

Import the dashboard:
1. Go to Dashboards → Import
2. Upload `grafana/winet2-dashboard.json`
3. Select Prometheus as data source

## Monitoring Metrics

### Available Metrics

| Metric | Description |
|--------|-------------|
| `winet2_uptime_seconds` | Application uptime |
| `winet2_ws_connection_attempts_total` | WebSocket connection attempts |
| `winet2_ws_connection_successes_total` | Successful connections |
| `winet2_ws_connection_failures_total` | Failed connections |
| `winet2_ws_reconnections_total` | Reconnection count |
| `winet2_ws_messages_received_total` | Messages received from WiNet |
| `winet2_ws_messages_sent_total` | Messages sent to WiNet |
| `winet2_mqtt_publish_count_total` | MQTT messages published |
| `winet2_mqtt_publish_errors_total` | MQTT publish errors |
| `winet2_modbus_read_count_total` | Modbus read attempts |
| `winet2_modbus_read_successes_total` | Successful Modbus reads |
| `winet2_modbus_read_failures_total` | Failed Modbus reads |
| `winet2_watchdog_triggers_total` | Watchdog-triggered reconnections |
| `winet2_request_timeouts_total` | Request timeouts |
| `winet2_schema_validation_errors_total` | Schema validation errors |
| `winet2_active_devices` | Currently active devices |
| `winet2_active_sensors` | Currently active sensors |

### Example Prometheus Queries

**Connection Success Rate**:
```promql
rate(winet2_ws_connection_successes_total[5m]) / 
rate(winet2_ws_connection_attempts_total[5m]) * 100
```

**Message Throughput**:
```promql
rate(winet2_ws_messages_received_total[1m])
```

**Error Rate**:
```promql
sum(rate(winet2_watchdog_triggers_total[5m])) + 
sum(rate(winet2_request_timeouts_total[5m]))
```

## Alerting

### Example Prometheus Alerts

Create `alerts.yml`:

```yaml
groups:
  - name: winet2
    interval: 30s
    rules:
      - alert: Winet2Down
        expr: up{job="winet2"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Winet2 is down"
          description: "Winet2 has been down for more than 2 minutes"
      
      - alert: HighConnectionFailureRate
        expr: |
          rate(winet2_ws_connection_failures_total[5m]) / 
          rate(winet2_ws_connection_attempts_total[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High connection failure rate"
          description: "More than 50% of connection attempts are failing"
      
      - alert: NoActiveDevices
        expr: winet2_active_devices == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "No active devices"
          description: "No devices have been discovered"
```

## Troubleshooting

### Metrics Not Showing

1. Check Winet2 is running with metrics enabled:
   ```bash
   curl http://localhost:9090/metrics
   ```

2. Check Prometheus is scraping:
   ```bash
   curl http://localhost:9091/api/v1/targets
   ```

3. Check Grafana data source:
   - Configuration → Data Sources → Prometheus
   - Click "Test" button

### Dashboard Not Loading

1. Verify dashboard JSON is valid
2. Check Prometheus data source is configured
3. Ensure metrics are being collected

### High Memory Usage

Adjust Prometheus retention:
```yaml
command:
  - '--storage.tsdb.retention.time=7d'
  - '--storage.tsdb.retention.size=1GB'
```

## Production Deployment

### Recommendations

1. **Persistent Volumes**: Use named volumes for data persistence
2. **Resource Limits**: Set memory and CPU limits
3. **Backup**: Regular backups of Prometheus and Grafana data
4. **Security**: Change default passwords, use HTTPS
5. **Monitoring**: Set up alerting for critical metrics

### Security Hardening

1. Enable authentication for Prometheus
2. Use HTTPS for Grafana
3. Restrict network access
4. Regular security updates

## Further Reading

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
