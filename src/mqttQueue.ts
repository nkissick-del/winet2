import * as winston from 'winston';
import {MqttClient} from 'mqtt';

interface QueuedMessage {
  topic: string;
  payload: string | Buffer;
  options: {
    qos?: 0 | 1 | 2;
    retain?: boolean;
  };
  timestamp: number;
}

export class MqttQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number;
  private isConnected = false;
  private logger: winston.Logger;
  private mqttClient: MqttClient;

  constructor(logger: winston.Logger, mqttClient: MqttClient, maxSize = 1000) {
    this.logger = logger;
    this.mqttClient = mqttClient;
    this.maxSize = maxSize;

    // Monitor MQTT connection state
    this.mqttClient.on('connect', () => {
      this.isConnected = true;
      this.logger.info('MQTT connected - flushing queue');
      this.flush();
    });

    this.mqttClient.on('offline', () => {
      this.isConnected = false;
      this.logger.warn('MQTT offline - messages will be queued');
    });

    this.mqttClient.on('disconnect', () => {
      this.isConnected = false;
      this.logger.warn('MQTT disconnected - messages will be queued');
    });
  }

  /**
   * Publish message with automatic queueing on disconnection
   */
  publish(
    topic: string,
    payload: string | Buffer,
    options: {qos?: 0 | 1 | 2; retain?: boolean} = {},
    callback?: (error?: Error) => void,
  ): void {
    if (this.isConnected) {
      // Publish directly if connected
      this.mqttClient.publish(topic, payload, options, error => {
        if (error) {
          this.logger.error(
            `Failed to publish to ${topic}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Queue on publish failure
          this.enqueue(topic, payload, options);
        }
        if (callback) callback(error);
      });
    } else {
      // Queue if disconnected
      this.enqueue(topic, payload, options);
      if (callback) callback();
    }
  }

  /**
   * Add message to queue
   */
  private enqueue(
    topic: string,
    payload: string | Buffer,
    options: {qos?: 0 | 1 | 2; retain?: boolean},
  ): void {
    // Drop oldest message if queue is full
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift();
      this.logger.warn(
        `Queue full (${this.maxSize}) - dropped oldest message to ${dropped?.topic}`,
      );
    }

    this.queue.push({
      topic,
      payload,
      options,
      timestamp: Date.now(),
    });

    this.logger.debug(
      `Queued message to ${topic} (queue size: ${this.queue.length})`,
    );
  }

  /**
   * Flush all queued messages
   */
  private flush(): void {
    if (this.queue.length === 0) {
      return;
    }

    const count = this.queue.length;
    this.logger.info(`Flushing ${count} queued messages`);

    let successCount = 0;
    let failCount = 0;

    // Process queue
    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      if (!msg) break;

      // Check message age (drop if older than 5 minutes)
      const age = Date.now() - msg.timestamp;
      if (age > 300000) {
        this.logger.warn(
          `Dropping stale message to ${msg.topic} (age: ${Math.floor(age / 1000)}s)`,
        );
        failCount++;
        continue;
      }

      // Publish queued message
      this.mqttClient.publish(msg.topic, msg.payload, msg.options, error => {
        if (error) {
          this.logger.error(
            `Failed to flush message to ${msg.topic}: ${error instanceof Error ? error.message : String(error)}`,
          );
          failCount++;
        } else {
          successCount++;
        }
      });
    }

    this.logger.info(
      `Queue flush complete: ${successCount} succeeded, ${failCount} failed`,
    );
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear(): void {
    const count = this.queue.length;
    this.queue = [];
    this.logger.info(`Cleared ${count} queued messages`);
  }
}
