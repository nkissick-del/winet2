/**
 * Metrics collector for monitoring and observability
 * Provides Prometheus-compatible metrics endpoint
 */
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
export declare class MetricsCollector {
    private metrics;
    private gauges;
    private startTime;
    private enabled;
    private port;
    private path;
    private server?;
    private logger?;
    constructor(options?: MetricsOptions);
    initialize(logger: winston.Logger): void;
    increment(metric: keyof MetricsCounters, value?: number): void;
    setGauge(metric: string, value: number): void;
    get(metric: keyof MetricsCounters): number;
    getGauge(metric: string): number;
    private startServer;
    stop(): void;
    private formatPrometheus;
    private getUptime;
    private camelToSnake;
    getSummary(): {
        counters: MetricsCounters;
        gauges: Record<string, number>;
        uptime: number;
    };
    reset(): void;
}
export declare function getMetrics(options?: MetricsOptions): MetricsCollector;
export declare function resetGlobalMetrics(): void;
export {};
