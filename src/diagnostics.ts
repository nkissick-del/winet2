import * as winston from 'winston';

export interface DiagnosticMetrics {
  connection_state: 'online' | 'offline' | 'connecting' | 'error';
  last_update: string; // ISO timestamp
  message_count: number;
  error_count: number;
  uptime_seconds: number;
  mqtt_queue_size: number;
  websocket_state: 'connected' | 'disconnected' | 'connecting';
}

export class DiagnosticsTracker {
  private logger: winston.Logger;
  private startTime: number;
  private metrics: DiagnosticMetrics;
  private nodeId: string;

  constructor(logger: winston.Logger, nodeId: string) {
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
  setConnectionState(
    state: 'online' | 'offline' | 'connecting' | 'error',
  ): void {
    this.metrics.connection_state = state;
    this.logger.debug(`[${this.nodeId}] Connection state changed to: ${state}`);
  }

  /**
   * Update WebSocket state
   */
  setWebSocketState(state: 'connected' | 'disconnected' | 'connecting'): void {
    this.metrics.websocket_state = state;
    this.logger.debug(`[${this.nodeId}] WebSocket state changed to: ${state}`);
  }

  /**
   * Record successful message publish
   */
  incrementMessageCount(): void {
    this.metrics.message_count++;
    this.metrics.last_update = new Date().toISOString();
  }

  /**
   * Record error
   */
  incrementErrorCount(): void {
    this.metrics.error_count++;
    this.logger.debug(
      `[${this.nodeId}] Error count incremented to: ${this.metrics.error_count}`,
    );
  }

  /**
   * Update MQTT queue size
   */
  setQueueSize(size: number): void {
    this.metrics.mqtt_queue_size = size;
  }

  /**
   * Update last update timestamp
   */
  updateLastUpdate(): void {
    this.metrics.last_update = new Date().toISOString();
  }

  /**
   * Calculate and update uptime
   */
  updateUptime(): void {
    this.metrics.uptime_seconds = Math.floor(
      (Date.now() - this.startTime) / 1000,
    );
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): DiagnosticMetrics {
    this.updateUptime();
    return {...this.metrics};
  }

  /**
   * Reset counters (useful for testing)
   */
  reset(): void {
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
