/**
 * Metrics collector for monitoring and observability
 * Provides Prometheus-compatible metrics endpoint
 */

import * as http from 'http';
import * as winston from 'winston';

export interface MetricsOptions {
  enabled?: boolean;
  port?: number;
  path?: string;
}

interface MetricsCounters {
  wsConnectionAttempts: number;
  wsConnectionSuccesses: number;
  wsConnectionFailures: number;
  wsReconnections: number;
  wsMessagesReceived: number;
  wsMessagesSent: number;
  mqttPublishCount: number;
  mqttPublishErrors: number;
  mqttDiscoveryPublished: number;
  modbusReadCount: number;
  modbusReadSuccesses: number;
  modbusReadFailures: number;
  watchdogTriggers: number;
  requestTimeouts: number;
  schemaValidationErrors: number;
  devicesDiscovered: number;
  sensorsPublished: number;
}

export class MetricsCollector {
  private metrics: MetricsCounters = {
    wsConnectionAttempts: 0,
    wsConnectionSuccesses: 0,
    wsConnectionFailures: 0,
    wsReconnections: 0,
    wsMessagesReceived: 0,
    wsMessagesSent: 0,
    mqttPublishCount: 0,
    mqttPublishErrors: 0,
    mqttDiscoveryPublished: 0,
    modbusReadCount: 0,
    modbusReadSuccesses: 0,
    modbusReadFailures: 0,
    watchdogTriggers: 0,
    requestTimeouts: 0,
    schemaValidationErrors: 0,
    devicesDiscovered: 0,
    sensorsPublished: 0,
  };

  private gauges: Record<string, number> = {
    activeDevices: 0,
    activeSensors: 0,
  };

  private startTime = Date.now();
  private enabled: boolean;
  private port: number;
  private path: string;
  private server?: http.Server;
  private logger?: winston.Logger;

  constructor(options: MetricsOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.port = options.port ?? 9090;
    this.path = options.path ?? '/metrics';
  }

  initialize(logger: winston.Logger): void {
    this.logger = logger;
    if (this.enabled) {
      this.startServer();
    }
  }

  increment(metric: keyof MetricsCounters, value = 1): void {
    if (metric in this.metrics) {
      this.metrics[metric] += value;
    }
  }

  setGauge(metric: string, value: number): void {
    this.gauges[metric] = value;
  }

  get(metric: keyof MetricsCounters): number {
    return this.metrics[metric] || 0;
  }

  getGauge(metric: string): number {
    return this.gauges[metric] || 0;
  }

  private startServer(): void {
    this.server = http.createServer((req, res) => {
      if (req.url === this.path) {
        res.writeHead(200, {'Content-Type': 'text/plain; version=0.0.4'});
        res.end(this.formatPrometheus());
      } else if (req.url === '/health') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        const health = {status: 'healthy', uptime: this.getUptime()};
        res.end(JSON.stringify(health));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      if (this.logger) {
        this.logger.info('Metrics server listening on port ' + this.port);
      }
    });

    this.server.on('error', error => {
      if (this.logger) {
        this.logger.error('Metrics server error: ' + error.message);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        if (this.logger) {
          this.logger.info('Metrics server stopped');
        }
      });
    }
  }

  private formatPrometheus(): string {
    const lines: string[] = [];

    lines.push('# HELP winet2_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE winet2_uptime_seconds gauge');
    lines.push('winet2_uptime_seconds ' + Math.floor(this.getUptime()));
    lines.push('');

    for (const key of Object.keys(this.metrics) as Array<
      keyof MetricsCounters
    >) {
      const value = this.metrics[key];
      const metricName = 'winet2_' + this.camelToSnake(key) + '_total';
      lines.push('# HELP ' + metricName + ' Total count of ' + key);
      lines.push('# TYPE ' + metricName + ' counter');
      lines.push(metricName + ' ' + value);
      lines.push('');
    }

    for (const key of Object.keys(this.gauges)) {
      const value = this.gauges[key];
      const metricName = 'winet2_' + this.camelToSnake(key);
      lines.push('# HELP ' + metricName + ' Current value of ' + key);
      lines.push('# TYPE ' + metricName + ' gauge');
      lines.push(metricName + ' ' + value);
      lines.push('');
    }

    return lines.join('\n');
  }

  private getUptime(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
  }

  getSummary(): {
    counters: MetricsCounters;
    gauges: Record<string, number>;
    uptime: number;
  } {
    return {
      counters: {...this.metrics},
      gauges: {...this.gauges},
      uptime: this.getUptime(),
    };
  }

  reset(): void {
    for (const key in this.metrics) {
      this.metrics[key as keyof MetricsCounters] = 0;
    }
    for (const key in this.gauges) {
      this.gauges[key] = 0;
    }
  }
}

let globalMetrics: MetricsCollector | undefined;

export function getMetrics(options?: MetricsOptions): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector(options);
  }
  return globalMetrics;
}

export function resetGlobalMetrics(): void {
  globalMetrics = undefined;
}
