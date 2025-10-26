import * as winston from 'winston';
import { MqttClient } from 'mqtt';
export declare class MqttQueue {
    private queue;
    private maxSize;
    private isConnected;
    private logger;
    private mqttClient;
    constructor(logger: winston.Logger, mqttClient: MqttClient, maxSize?: number);
    /**
     * Publish message with automatic queueing on disconnection
     */
    publish(topic: string, payload: string | Buffer, options?: {
        qos?: 0 | 1 | 2;
        retain?: boolean;
    }, callback?: (error?: Error) => void): void;
    /**
     * Add message to queue
     */
    private enqueue;
    /**
     * Flush all queued messages
     */
    private flush;
    /**
     * Get current queue size
     */
    getQueueSize(): number;
    /**
     * Clear queue
     */
    clear(): void;
}
