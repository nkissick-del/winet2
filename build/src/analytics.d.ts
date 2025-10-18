import { DeviceSchema } from './types/MessageTypes';
import z from 'zod';
export declare class Analytics {
    private id;
    private enabled;
    private posthog;
    private winetVersion;
    private devices;
    private devicePingInterval;
    constructor(enabled: boolean);
    registerDevices(devices: z.infer<typeof DeviceSchema>[]): void;
    private pingDevices;
    registerVersion(version: number): void;
    registerError(type: string, error: string): void;
    registerReconnect(type: string): void;
    ping(): void;
}
