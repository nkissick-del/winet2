import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatusMap } from './types/DeviceStatus';
import * as winston from 'winston';
interface MqttPublishOptions {
    retain?: boolean;
    qos?: number;
    dup?: boolean;
}
interface MqttClient {
    publish(topic: string, payload: string, options: MqttPublishOptions, callback: (error?: Error) => void): void;
}
export declare class MqttPublisher {
    private logger;
    private mqttClient;
    private haPrefix;
    private devicePrefix;
    private nodeId;
    private publishedDiscovery;
    private lastStatusPublish;
    constructor(logger: winston.Logger, mqttClient: MqttClient, haPrefix: string, devicePrefix: string, nodeId: string);
    publishDiscovery(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    publishStatus(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    clearDiscoveryCache(): void;
    forceDiscoveryPublish(): void;
}
export {};
