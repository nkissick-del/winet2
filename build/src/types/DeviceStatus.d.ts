export interface DeviceDataPoint {
    name: string;
    slug: string;
    value: string | number | undefined;
    unit: string;
    dirty: boolean;
    title?: string;
}
export type DeviceStatus = Record<string, DeviceDataPoint>;
export type DeviceStatusMap = Record<string, DeviceStatus>;
