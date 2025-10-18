"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextSensors = exports.DeviceClasses = exports.StateClasses = void 0;
exports.StateClasses = {
    W: 'measurement',
    V: 'measurement',
    A: 'measurement',
    '℃': 'measurement',
};
exports.DeviceClasses = {
    W: 'power',
    V: 'voltage',
    A: 'current',
    kW: 'power',
    kWh: 'energy',
    '℃': 'temperature',
    kvar: 'reactive_power',
    var: 'reactive_power',
    Hz: 'frequency',
    '%': 'battery',
    kΩ: undefined,
};
exports.TextSensors = [
    'battery_operation_status',
    'running_status',
];
//# sourceMappingURL=HaTypes.js.map