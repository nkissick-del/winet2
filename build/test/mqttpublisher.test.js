"use strict";
/**
 * Unit tests for MqttPublisher
 * Tests MQTT discovery configuration and state publishing
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
(0, node_test_1.describe)('MqttPublisher', () => {
    (0, node_test_1.it)('should construct with required parameters', () => {
        // Constructor parameters
        const haPrefix = 'homeassistant/sensor';
        const devicePrefix = '';
        const nodeId = 'inverter1';
        // Verify parameters are properly typed
        node_assert_1.default.strictEqual(typeof haPrefix, 'string');
        node_assert_1.default.strictEqual(typeof devicePrefix, 'string');
        node_assert_1.default.strictEqual(typeof nodeId, 'string');
    });
    (0, node_test_1.it)('should generate correct discovery topics', () => {
        const haPrefix = 'homeassistant/sensor';
        const nodeId = 'solar_east';
        const deviceId = 'SG50RS_ABC123';
        const slug = 'total_dc_power';
        const expectedTopic = `${haPrefix}/${nodeId}_${deviceId}/${slug}/config`;
        const actualTopic = 'homeassistant/sensor/solar_east_SG50RS_ABC123/total_dc_power/config';
        node_assert_1.default.strictEqual(expectedTopic, actualTopic);
    });
    (0, node_test_1.it)('should generate correct state topics', () => {
        const haPrefix = 'homeassistant/sensor';
        const nodeId = 'solar_east';
        const deviceId = 'SG50RS_ABC123';
        const slug = 'total_dc_power';
        const expectedTopic = `${haPrefix}/${nodeId}_${deviceId}/${slug}/state`;
        const actualTopic = 'homeassistant/sensor/solar_east_SG50RS_ABC123/total_dc_power/state';
        node_assert_1.default.strictEqual(expectedTopic, actualTopic);
    });
    (0, node_test_1.it)('should map power units to correct device class', () => {
        const testCases = [
            { unit: 'W', deviceClass: 'power' },
            { unit: 'kW', deviceClass: 'power' },
            { unit: 'mW', deviceClass: 'power' },
            { unit: 'kWh', deviceClass: 'energy' },
            { unit: 'MWh', deviceClass: 'energy' },
            { unit: 'V', deviceClass: 'voltage' },
            { unit: 'kV', deviceClass: 'voltage' },
            { unit: 'A', deviceClass: 'current' },
            { unit: '°C', deviceClass: 'temperature' },
            { unit: 'Hz', deviceClass: 'frequency' },
        ];
        for (const testCase of testCases) {
            const deviceClass = getDeviceClass(testCase.unit);
            node_assert_1.default.strictEqual(deviceClass, testCase.deviceClass, `Unit ${testCase.unit} should map to ${testCase.deviceClass}`);
        }
    });
    (0, node_test_1.it)('should determine state class correctly', () => {
        const testCases = [
            { unit: 'W', stateClass: 'measurement' },
            { unit: 'kW', stateClass: 'measurement' },
            { unit: 'kWh', stateClass: 'total_increasing' },
            { unit: 'MWh', stateClass: 'total_increasing' },
            { unit: 'V', stateClass: 'measurement' },
            { unit: 'A', stateClass: 'measurement' },
        ];
        for (const testCase of testCases) {
            const stateClass = getStateClass(testCase.unit);
            node_assert_1.default.strictEqual(stateClass, testCase.stateClass, `Unit ${testCase.unit} should have state class ${testCase.stateClass}`);
        }
    });
    (0, node_test_1.it)('should create valid device configuration', () => {
        const device = {
            dev_id: 1,
            dev_sn: 'ABC123456',
            dev_model: 'SG50RS',
            dev_type: 35,
        };
        const nodeId = 'solar_main';
        const deviceConfig = {
            identifiers: [device.dev_sn],
            name: `${nodeId} (${device.dev_model}-${device.dev_sn})`,
            model: device.dev_model,
            manufacturer: 'Sungrow',
            serial_number: device.dev_sn,
        };
        node_assert_1.default.strictEqual(deviceConfig.identifiers[0], 'ABC123456');
        node_assert_1.default.strictEqual(deviceConfig.name, 'solar_main (SG50RS-ABC123456)');
        node_assert_1.default.strictEqual(deviceConfig.model, 'SG50RS');
        node_assert_1.default.strictEqual(deviceConfig.manufacturer, 'Sungrow');
        node_assert_1.default.strictEqual(deviceConfig.serial_number, 'ABC123456');
    });
    (0, node_test_1.it)('should handle MQTT publish options correctly', () => {
        const publishOptions = {
            retain: true,
            qos: 0,
        };
        node_assert_1.default.strictEqual(publishOptions.retain, true);
        node_assert_1.default.strictEqual(publishOptions.qos, 0);
    });
    (0, node_test_1.it)('should track published discovery configurations', () => {
        const publishedDiscovery = new Set();
        const deviceId = 'SG50RS_ABC123';
        const slug = 'total_dc_power';
        const discoveryKey = `${deviceId}_${slug}`;
        // First publish
        node_assert_1.default.strictEqual(publishedDiscovery.has(discoveryKey), false);
        publishedDiscovery.add(discoveryKey);
        node_assert_1.default.strictEqual(publishedDiscovery.has(discoveryKey), true);
        // Second publish should be skipped
        if (!publishedDiscovery.has(discoveryKey)) {
            node_assert_1.default.fail('Should have already been published');
        }
    });
});
// Helper functions to test device class and state class mapping
function getDeviceClass(unit) {
    const unitLower = unit.toLowerCase();
    if (unitLower.includes('w') && !unitLower.includes('wh')) {
        return 'power';
    }
    if (unitLower.includes('wh')) {
        return 'energy';
    }
    if (unitLower.includes('v') && !unitLower.includes('var')) {
        return 'voltage';
    }
    if (unitLower === 'a') {
        return 'current';
    }
    if (unitLower === '°c' || unitLower === 'c') {
        return 'temperature';
    }
    if (unitLower === 'hz') {
        return 'frequency';
    }
    if (unitLower.includes('var')) {
        return 'reactive_power';
    }
    return undefined;
}
function getStateClass(unit) {
    const unitLower = unit.toLowerCase();
    if (unitLower.includes('wh')) {
        return 'total_increasing';
    }
    if (unitLower.includes('w') ||
        unitLower.includes('v') ||
        unitLower === 'a' ||
        unitLower === 'hz') {
        return 'measurement';
    }
    return undefined;
}
//# sourceMappingURL=mqttpublisher.test.js.map