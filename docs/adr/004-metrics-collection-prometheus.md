# ADR-004: Metrics Collection with Prometheus

## Status
Accepted

## Context
As an IoT integration service running continuously in production environments (often Home Assistant), the application needs robust monitoring and observability to:
- Track connection health and reliability
- Monitor data flow and publishing success rates
- Identify performance bottlenecks
- Debug issues in production without verbose logging
- Provide visibility into multi-inverter deployments
- Alert on failures and degradation

Initial implementation only had PostHog analytics (disabled by default for privacy), which:
- Required external service dependency
- Provided limited real-time visibility
- Was not suitable for operational monitoring
- Didn't integrate with existing monitoring stacks

## Decision
Implement a built-in Prometheus-compatible metrics collector that:

1. **Exposes HTTP endpoint** (`/metrics` on port 9090 by default)
2. **Tracks key operational metrics**:
   - Connection attempts, successes, failures
   - Message counts (sent, received)
   - MQTT publishing statistics
   - Modbus read operations
   - Error counters (timeouts, validation failures, watchdog triggers)
   - Active devices and sensors (gauges)

3. **Disabled by default** to minimize resource usage
4. **Optional enablement** via environment variables:
   ```bash
   METRICS_ENABLED=true
   METRICS_PORT=9090
   ```

5. **Implementation in `src/metrics.ts`**:
   - Singleton pattern with `getMetrics()`
   - Counter and gauge metrics
   - Prometheus exposition format
   - Health check endpoint (`/health`)

## Consequences

### Positive
- **Zero External Dependencies**: Self-contained HTTP server
- **Industry Standard**: Prometheus format works with many tools
- **Real-Time Visibility**: Instant metrics without log parsing
- **Integration Ready**: Works with Prometheus, Grafana, Home Assistant
- **Low Overhead**: Minimal memory (~1MB) and CPU (<0.1%) when enabled
- **Production-Ready**: Health checks for liveness probes
- **Debugging Aid**: Metrics reveal issues quickly
- **Opt-In**: No impact when disabled

### Negative
- **Additional HTTP Port**: Requires port 9090 (configurable)
- **Code Complexity**: ~200 lines of metrics collection code
- **Memory Usage**: Small overhead for metric storage
- **Manual Instrumentation**: Metrics must be added to code

## Alternatives Considered

### 1. Continue with PostHog Only
- **Pros**: Already implemented
- **Cons**: Not suitable for operational monitoring, external dependency
- **Rejected**: Insufficient for production observability

### 2. StatsD
- **Pros**: Push-based, lightweight protocol
- **Cons**: Requires external StatsD server, not standard in homelab setups
- **Rejected**: Additional infrastructure requirement

### 3. OpenTelemetry
- **Pros**: Modern, comprehensive observability framework
- **Cons**: Heavy dependency, overkill for this use case, complex setup
- **Rejected**: Too complex for the benefit

### 4. JSON Log Parsing
- **Pros**: No code changes needed
- **Cons**: Inefficient, requires external log aggregation, delayed insights
- **Rejected**: Not real-time, requires extra infrastructure

### 5. Built-in Dashboard
- **Pros**: Self-contained UI
- **Cons**: Significant development effort, limited integration
- **Rejected**: Prometheus/Grafana ecosystem more powerful

## Implementation Details

### Metric Naming Convention
Following Prometheus best practices:
- `winet2_` prefix for all metrics
- `_total` suffix for counters
- Snake_case naming

### Example Metrics
```
winet2_ws_connection_attempts_total
winet2_ws_messages_received_total
winet2_mqtt_publish_count_total
winet2_active_devices (gauge)
winet2_uptime_seconds (gauge)
```

### Integration Points
Metrics are incremented at:
- WebSocket connection attempts (`src/winetHandler.ts`)
- Message reception/transmission
- MQTT publishes (`src/homeassistant.ts`)
- Modbus reads (`src/modbusReader.ts`)
- Error conditions (timeouts, validation failures)

### Grafana Dashboard Example
Users can import a sample dashboard showing:
- Connection uptime and reconnection rate
- Message throughput
- Publishing success rate
- Active devices per inverter
- Error rates over time

## Migration Path
1. Metrics disabled by default (no breaking changes)
2. Users opt-in via environment variables
3. Documentation includes Prometheus/Grafana setup guide
4. Future: Pre-built Grafana dashboard in repo

## Security Considerations
- Metrics endpoint only binds to 0.0.0.0 (accessible on local network)
- No authentication (assume trusted network)
- No sensitive data in metrics (only counts and aggregates)
- Users can firewall port 9090 if needed

## References
- Prometheus exposition format: https://prometheus.io/docs/instrumenting/exposition_formats/
- Prometheus best practices: https://prometheus.io/docs/practices/naming/
- Home Assistant Prometheus integration: https://www.home-assistant.io/integrations/prometheus/
