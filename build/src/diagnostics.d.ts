import * as winston from 'winston';
export interface DiagnosticMetrics {
    connection_state: 'online' | 'offline' | 'connecting' | 'error';
    last_update: string;
    message_count: number;
    error_count: number;
    uptime_seconds: number;
    mqtt_queue_size: number;
    websocket_state: 'connected' | 'disconnected' | 'connecting';
}
export declare class DiagnosticsTracker {
    private logger;
    private startTime;
    private metrics;
    private nodeId;
    constructor(logger: winston.Logger, nodeId: string);
    /**
     * Update connection state
     */
    setConnectionState(state: 'online' | 'offline' | 'connecting' | 'error'): void;
    /**
     * Update WebSocket state
     */
    setWebSocketState(state: 'connected' | 'disconnected' | 'connecting'): void;
    /**
     * Record successful message publish
     */
    incrementMessageCount(): void;
    /**
     * Record error
     */
    incrementErrorCount(): void;
    /**
     * Update MQTT queue size
     */
    setQueueSize(size: number): void;
    /**
     * Update last update timestamp
     */
    updateLastUpdate(): void;
    /**
     * Calculate and update uptime
     */
    updateUptime(): void;
    /**
     * Get current metrics snapshot
     */
    getMetrics(): DiagnosticMetrics;
    /**
     * Reset counters (useful for testing)
     */
    reset(): void;
}
