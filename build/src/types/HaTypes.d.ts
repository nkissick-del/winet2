export interface SensorData {
    name: string;
    value: number | string | undefined;
    unit_of_measurement: string;
}
export declare const StateClasses: Record<string, string>;
export declare const DeviceClasses: Record<string, string | undefined>;
export declare const TextSensors: string[];
export interface ConfigPayload {
    name: string;
    state_topic: string;
    unique_id: string;
    value_template: string;
    device: {
        name: string;
        identifiers: string[];
        model: string;
    };
    encoding?: string;
    unit_of_measurement?: string;
    state_class?: string;
    device_class?: string;
}
