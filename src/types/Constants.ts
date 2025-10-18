// Optimized: Use Set for O(1) lookups instead of Array.includes() O(n)
export const NumericUnits = new Set([
  'A',
  '%',
  'kW',
  'kWh',
  '℃',
  'V',
  'kvar',
  'var',
  'Hz',
  'kVA',
  'kΩ',
]);

export enum QueryStages {
  REAL = 0,
  DIRECT = 1,
  REAL_BATTERY = 2,
}

// Optimized: Use Map for better performance and cleaner initialization
export const DeviceTypeStages = new Map([
  [0, [QueryStages.REAL, QueryStages.DIRECT]],
  [8, [QueryStages.REAL]],
  [11, [QueryStages.REAL]],
  [13, [QueryStages.REAL]],
  [14, [QueryStages.REAL]],
  [15, [QueryStages.REAL]],
  [18, [QueryStages.REAL]],
  [20, [QueryStages.REAL]],
  [21, [QueryStages.REAL, QueryStages.DIRECT]],
  [23, [QueryStages.REAL]],
  [24, [QueryStages.REAL]],
  [25, [QueryStages.REAL]],
  [34, [QueryStages.REAL]],
  [35, [QueryStages.REAL, QueryStages.REAL_BATTERY, QueryStages.DIRECT]],
  [36, [QueryStages.REAL]],
  [37, [QueryStages.REAL]],
  [44, [QueryStages.REAL]],
  [46, [QueryStages.REAL]],
  [47, [QueryStages.REAL]],
  [48, [QueryStages.REAL]],
]);
