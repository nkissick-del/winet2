import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatusMap } from './types/DeviceStatus';
import * as winston from 'winston';
import { MqttClient } from 'mqtt';
import { DiagnosticsTracker } from './diagnostics';
export declare class MqttPublisher {
    private logger;
    private mqttClient;
    private haPrefix;
    private devicePrefix;
    private nodeId;
    private publishedDiscovery;
    private lastStatusPublish;
    private availabilityTopic;
    private queue;
    private diagnostics;
    constructor(logger: winston.Logger, mqttClient: MqttClient, haPrefix: string, devicePrefix: string, nodeId: string);
    /**
     * Publish availability status (online)
     * Call when connection is established
     */
    publishAvailable(): void;
    /**
     * Publish availability status (offline)
     * Call before disconnecting
     */
    publishUnavailable(): void;
    /**
     * Publish diagnostic sensor discovery configs
     * Creates sensors for connection state, uptime, message count, etc.
     */
    publishDiagnosticDiscovery(serialNumber: string, model: string): void;
    /**
     * Publish current diagnostic metrics
     */
    publishDiagnostics(): void;
    /**
     * Get diagnostics tracker for external updates
     */
    getDiagnostics(): DiagnosticsTracker;
    publishDiscovery(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    publishStatus(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    clearDiscoveryCache(): void;
    forceDiscoveryPublish(): void;
}
