import { z } from 'zod';
import { DeviceSchema } from './types/MessageTypes';
import { DeviceStatusMap } from './types/DeviceStatus';
import { Properties } from './types/Properties';
import * as winston from 'winston';
import { Analytics } from './analytics';
export declare class winetHandler {
    private winetUser;
    private winetPass;
    private token;
    private currentDevice?;
    private inFlightDevice?;
    private currentStages;
    private devices;
    private deviceStatus;
    private lastDeviceUpdate;
    private watchdogCount;
    private watchdogLastData?;
    private winetVersion?;
    private scanInterval?;
    private watchdogInterval?;
    private logger;
    private host;
    private ssl;
    private sslConfig;
    private lang;
    private frequency;
    private analytics?;
    private properties?;
    private callbackUpdatedStatus?;
    private ws?;
    private modbusReader?;
    private modbusEnabled;
    constructor(logger: winston.Logger, host: string, lang: string, frequency: number, winetUser?: string, winetPass?: string, analytics?: Analytics, modbusIp?: string);
    setProperties(properties: Properties): void;
    setCallback(callback: (devices: z.infer<typeof DeviceSchema>[], deviceStatus: DeviceStatusMap) => void): void;
    private setWatchdog;
    private clearWatchdog;
    connect(ssl?: boolean): void;
    private reconnect;
    private sendPacket;
    private onOpen;
    private onError;
    private onMessage;
    private updateDeviceStatus;
    /**
     * Augment device status with Modbus meter data
     * Adds meter_power, grid_import_energy, and grid_export_energy
     */
    private addModbusMeterData;
    private scanDevices;
}
