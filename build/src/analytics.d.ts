import { DeviceSchema } from './types/MessageTypes';
import { z } from 'zod';
export declare class Analytics {
    private enabled;
    private posthog;
    private id;
    private winetVersion;
    private devices;
    private devicePingInterval?;
    constructor(enabled: boolean);
    registerDevices(devices: z.infer<typeof DeviceSchema>[]): void;
    pingDevices(): void;
    registerVersion(version: number): void;
    registerError(type: string, error: string): void;
    registerReconnect(type: string): void;
    private ping;
}
