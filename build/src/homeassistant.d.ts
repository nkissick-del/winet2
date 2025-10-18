import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatus } from './types/DeviceStatus';
import Winston from 'winston';
export declare class MqttPublisher {
    private logger;
    private client;
    private connected;
    constructor(logger: Winston.Logger, url: string);
    publishData(deviceSlug: string, slug: string, unit: string, value: number | string | undefined): void;
    registerDevice(slug: string, device: z.infer<typeof DeviceSchema>): boolean;
    publishConfig(deviceSlug: string, deviceStatus: DeviceStatus, device: z.infer<typeof DeviceSchema>): boolean;
}
