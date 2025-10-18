import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatusMap } from './types/DeviceStatus';
import * as winston from 'winston';
export declare class MqttPublisher {
    private logger;
    private mqttClient;
    private haPrefix;
    private devicePrefix;
    private publishedDiscovery;
    private lastStatusPublish;
    constructor(logger: winston.Logger, mqttClient: any, haPrefix: string, devicePrefix: string);
    publishDiscovery(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    publishStatus(devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap): void;
    clearDiscoveryCache(): void;
    forceDiscoveryPublish(): void;
}
