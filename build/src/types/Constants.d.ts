declare const NumericUnits: string[];
declare enum QueryStages {
    REAL = 0,
    DIRECT = 1,
    REAL_BATTERY = 2
}
type DeviceTypeStagesType = {
    [key: number]: QueryStages[];
};
declare const DeviceTypeStages: DeviceTypeStagesType;
export { NumericUnits, DeviceTypeStages, QueryStages };
