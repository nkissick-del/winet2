import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatusMap } from './types/DeviceStatus';
import * as winston from 'winston';
import { MqttClient } from 'mqtt';
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
    publishDiscovery(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    publishStatus(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    clearDiscoveryCache(): void;
    forceDiscoveryPublish(): void;
}
