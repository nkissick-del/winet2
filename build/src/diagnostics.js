"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsTracker = void 0;
class DiagnosticsTracker {
    logger;
    startTime;
    metrics;
    nodeId;
    constructor(logger, nodeId) {
        this.logger = logger;
        this.nodeId = nodeId;
        this.startTime = Date.now();
        this.metrics = {
            connection_state: 'offline',
            last_update: new Date().toISOString(),
            message_count: 0,
            error_count: 0,
            uptime_seconds: 0,
            mqtt_queue_size: 0,
            websocket_state: 'disconnected',
        };
    }
    /**
     * Update connection state
     */
    setConnectionState(state) {
        this.metrics.connection_state = state;
        this.logger.debug(`[${this.nodeId}] Connection state changed to: ${state}`);
    }
    /**
     * Update WebSocket state
     */
    setWebSocketState(state) {
        this.metrics.websocket_state = state;
        this.logger.debug(`[${this.nodeId}] WebSocket state changed to: ${state}`);
    }
    /**
     * Record successful message publish
     */
    incrementMessageCount() {
        this.metrics.message_count++;
        this.metrics.last_update = new Date().toISOString();
    }
    /**
     * Record error
     */
    incrementErrorCount() {
        this.metrics.error_count++;
        this.logger.debug(`[${this.nodeId}] Error count incremented to: ${this.metrics.error_count}`);
    }
    /**
     * Update MQTT queue size
     */
    setQueueSize(size) {
        this.metrics.mqtt_queue_size = size;
    }
    /**
     * Update last update timestamp
     */
    updateLastUpdate() {
        this.metrics.last_update = new Date().toISOString();
    }
    /**
     * Calculate and update uptime
     */
    updateUptime() {
        this.metrics.uptime_seconds = Math.floor((Date.now() - this.startTime) / 1000);
    }
    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        this.updateUptime();
        return { ...this.metrics };
    }
    /**
     * Reset counters (useful for testing)
     */
    reset() {
        this.startTime = Date.now();
        this.metrics = {
            connection_state: 'offline',
            last_update: new Date().toISOString(),
            message_count: 0,
            error_count: 0,
            uptime_seconds: 0,
            mqtt_queue_size: 0,
            websocket_state: 'disconnected',
        };
        this.logger.info(`[${this.nodeId}] Diagnostics reset`);
    }
}
exports.DiagnosticsTracker = DiagnosticsTracker;
//# sourceMappingURL=diagnostics.js.map