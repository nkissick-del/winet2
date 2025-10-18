"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttPublisher = void 0;
const slugify_1 = __importDefault(require("slugify"));
class MqttPublisher {
    constructor(logger, mqttClient, haPrefix, devicePrefix) {
        this.publishedDiscovery = new Set();
        this.lastStatusPublish = {};
        this.logger = logger;
        this.mqttClient = mqttClient;
        this.haPrefix = haPrefix;
        this.devicePrefix = devicePrefix;
    }
    publishDiscovery(devices, deviceStatus) {
        for (const device of devices) {
            const deviceStats = deviceStatus[device.dev_id];
            if (!deviceStats)
                continue;
            const deviceId = (0, slugify_1.default)(`${this.devicePrefix} ${device.dev_model} ${device.dev_sn}`, {
                lower: true,
                strict: true,
                replacement: '_',
            });
            // Create device discovery config
            const deviceConfig = {
                identifiers: [`${this.devicePrefix}_${device.dev_sn}`],
                name: `${device.dev_model} (${device.dev_sn})`,
                model: device.dev_model,
                manufacturer: 'Sungrow',
                serial_number: device.dev_sn,
            };
            for (const [slug, dataPoint] of Object.entries(deviceStats)) {
                if (!dataPoint || typeof dataPoint !== 'object')
                    continue;
                const dp = dataPoint;
                const sensorId = `${deviceId}_${slug}`;
                const discoveryKey = `${device.dev_id}_${slug}`;
                // Skip if already published
                if (this.publishedDiscovery.has(discoveryKey))
                    continue;
                const sensorConfig = {
                    unique_id: sensorId,
                    name: `${device.dev_model} ${dp.name}`,
                    state_topic: `${this.haPrefix}/${deviceId}/state`,
                    value_template: `{{ value_json.${slug}.value }}`,
                    device: deviceConfig,
                };
                // Add unit of measurement if available
                if (dp.unit && dp.unit !== '') {
                    sensorConfig.unit_of_measurement = dp.unit;
                }
                // Set device class based on unit
                if (dp.unit) {
                    switch (dp.unit.toLowerCase()) {
                        case 'w':
                        case 'kw':
                        case 'mw':
                            sensorConfig.device_class = 'power';
                            sensorConfig.state_class = 'measurement';
                            break;
                        case 'kwh':
                        case 'mwh':
                            sensorConfig.device_class = 'energy';
                            sensorConfig.state_class = 'total_increasing';
                            break;
                        case 'v':
                        case 'kv':
                            sensorConfig.device_class = 'voltage';
                            sensorConfig.state_class = 'measurement';
                            break;
                        case 'a':
                            sensorConfig.device_class = 'current';
                            sensorConfig.state_class = 'measurement';
                            break;
                        case '°c':
                        case 'c':
                            sensorConfig.device_class = 'temperature';
                            sensorConfig.state_class = 'measurement';
                            break;
                        case 'hz':
                            sensorConfig.device_class = 'frequency';
                            sensorConfig.state_class = 'measurement';
                            break;
                        case '%':
                            if (dp.name.toLowerCase().includes('efficiency')) {
                                sensorConfig.device_class = 'power_factor';
                            }
                            sensorConfig.state_class = 'measurement';
                            break;
                    }
                }
                const discoveryTopic = `${this.haPrefix}/sensor/${deviceId}/${slug}/config`;
                this.mqttClient.publish(discoveryTopic, JSON.stringify(sensorConfig), { retain: true }, (error) => {
                    if (error) {
                        this.logger.error(`Failed to publish discovery for ${sensorId}:`, error);
                    }
                    else {
                        this.logger.debug(`Published discovery for ${sensorId}`);
                        this.publishedDiscovery.add(discoveryKey);
                    }
                });
            }
        }
    }
    publishStatus(devices, deviceStatus) {
        for (const device of devices) {
            const deviceStats = deviceStatus[device.dev_id];
            if (!deviceStats)
                continue;
            const deviceId = (0, slugify_1.default)(`${this.devicePrefix} ${device.dev_model} ${device.dev_sn}`, {
                lower: true,
                strict: true,
                replacement: '_',
            });
            // Check if any data points are dirty or enough time has passed
            let shouldPublish = false;
            const now = Date.now();
            const lastPublish = this.lastStatusPublish[deviceId] || 0;
            const minInterval = 30000; // 30 seconds minimum interval
            // Check for dirty data points or time-based publish
            for (const dataPoint of Object.values(deviceStats)) {
                if (dataPoint &&
                    typeof dataPoint === 'object' &&
                    dataPoint.dirty) {
                    shouldPublish = true;
                    break;
                }
            }
            // Force publish every 5 minutes regardless of dirty state
            if (!shouldPublish && now - lastPublish > 300000) {
                shouldPublish = true;
            }
            // Don't publish too frequently
            if (shouldPublish && now - lastPublish < minInterval) {
                shouldPublish = false;
            }
            if (!shouldPublish)
                continue;
            // Prepare status payload
            const statusPayload = {};
            for (const [slug, dataPoint] of Object.entries(deviceStats)) {
                if (dataPoint && typeof dataPoint === 'object') {
                    const dp = dataPoint;
                    statusPayload[slug] = {
                        value: dp.value,
                        unit: dp.unit,
                        name: dp.name,
                    };
                    // Clear dirty flag
                    dp.dirty = false;
                }
            }
            const statusTopic = `${this.haPrefix}/${deviceId}/state`;
            this.mqttClient.publish(statusTopic, JSON.stringify(statusPayload), { retain: false }, (error) => {
                if (error) {
                    this.logger.error(`Failed to publish status for ${deviceId}:`, error);
                }
                else {
                    this.logger.debug(`Published status for ${deviceId}`);
                    this.lastStatusPublish[deviceId] = now;
                }
            });
        }
    }
    // Helper method to clear discovery cache (useful for testing)
    clearDiscoveryCache() {
        this.publishedDiscovery.clear();
        this.lastStatusPublish = {};
    }
    // Helper method to force republish discovery
    forceDiscoveryPublish() {
        this.publishedDiscovery.clear();
    }
}
exports.MqttPublisher = MqttPublisher;
//# sourceMappingURL=homeassistant.js.map