"use strict";
/**
 * Metrics collector for monitoring and observability
 * Provides Prometheus-compatible metrics endpoint
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
exports.getMetrics = getMetrics;
exports.resetGlobalMetrics = resetGlobalMetrics;
const http = __importStar(require("http"));
class MetricsCollector {
    metrics = {
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
    gauges = {
        activeDevices: 0,
        activeSensors: 0,
    };
    startTime = Date.now();
    enabled;
    port;
    path;
    server;
    logger;
    constructor(options = {}) {
        this.enabled = options.enabled ?? false;
        this.port = options.port ?? 9090;
        this.path = options.path ?? '/metrics';
    }
    initialize(logger) {
        this.logger = logger;
        if (this.enabled) {
            this.startServer();
        }
    }
    increment(metric, value = 1) {
        if (metric in this.metrics) {
            this.metrics[metric] += value;
        }
    }
    setGauge(metric, value) {
        this.gauges[metric] = value;
    }
    get(metric) {
        return this.metrics[metric] || 0;
    }
    getGauge(metric) {
        return this.gauges[metric] || 0;
    }
    startServer() {
        this.server = http.createServer((req, res) => {
            if (req.url === this.path) {
                res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
                res.end(this.formatPrometheus());
            }
            else if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const health = { status: 'healthy', uptime: this.getUptime() };
                res.end(JSON.stringify(health));
            }
            else {
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
    stop() {
        if (this.server) {
            this.server.close(() => {
                if (this.logger) {
                    this.logger.info('Metrics server stopped');
                }
            });
        }
    }
    formatPrometheus() {
        const lines = [];
        lines.push('# HELP winet2_uptime_seconds Application uptime in seconds');
        lines.push('# TYPE winet2_uptime_seconds gauge');
        lines.push('winet2_uptime_seconds ' + Math.floor(this.getUptime()));
        lines.push('');
        for (const key of Object.keys(this.metrics)) {
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
    getUptime() {
        return (Date.now() - this.startTime) / 1000;
    }
    camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
    }
    getSummary() {
        return {
            counters: { ...this.metrics },
            gauges: { ...this.gauges },
            uptime: this.getUptime(),
        };
    }
    reset() {
        for (const key in this.metrics) {
            this.metrics[key] = 0;
        }
        for (const key in this.gauges) {
            this.gauges[key] = 0;
        }
    }
}
exports.MetricsCollector = MetricsCollector;
let globalMetrics;
function getMetrics(options) {
    if (!globalMetrics) {
        globalMetrics = new MetricsCollector(options);
    }
    return globalMetrics;
}
function resetGlobalMetrics() {
    globalMetrics = undefined;
}
//# sourceMappingURL=metrics.js.map