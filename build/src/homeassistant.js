"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttPublisher = void 0;
const mqttQueue_1 = require("./mqttQueue");
class MqttPublisher {
    logger;
    mqttClient;
    haPrefix;
    devicePrefix;
    nodeId; // Add nodeId to identify this inverter instance
    publishedDiscovery = new Set();
    lastStatusPublish = {};
    availabilityTopic;
    queue;
    constructor(logger, mqttClient, haPrefix, devicePrefix, nodeId) {
        this.logger = logger;
        this.mqttClient = mqttClient;
        this.haPrefix = haPrefix;
        this.devicePrefix = devicePrefix;
        this.nodeId = nodeId;
        this.availabilityTopic = `${haPrefix}/${nodeId}/availability`;
        this.queue = new mqttQueue_1.MqttQueue(logger, mqttClient);
    }
    /**
     * Publish availability status (online)
     * Call when connection is established
     */
    publishAvailable() {
        this.queue.publish(this.availabilityTopic, 'online', { retain: true, qos: 1 }, error => {
            if (error) {
                this.logger.error(`Failed to publish availability: ${error.message}`);
            }
            else {
                this.logger.info('Published availability: online');
            }
        });
    }
    /**
     * Publish availability status (offline)
     * Call before disconnecting
     */
    publishUnavailable() {
        this.queue.publish(this.availabilityTopic, 'offline', { retain: true, qos: 1 }, error => {
            if (error) {
                this.logger.error(`Failed to publish unavailability: ${error.message}`);
            }
        });
    }
    publishDiscovery(devices, deviceStatus) {
        for (const device of devices) {
            const deviceStats = deviceStatus[String(device.dev_id)];
            if (!deviceStats) {
                continue;
            }
            const deviceId = `${device.dev_model}_${device.dev_sn}`; // Match winet2-mac format: SG50RS_SG50RS_SERIAL_2
            // Create device discovery config
            const deviceConfig = {
                identifiers: [device.dev_sn], // Use just the serial number as identifier
                name: `${this.nodeId} (${device.dev_model}-${device.dev_sn})`, // Use friendly name from env + (Model-Serial)
                model: device.dev_model,
                manufacturer: 'Sungrow',
                serial_number: device.dev_sn,
            };
            for (const [slug, dp] of Object.entries(deviceStats)) {
                const sensorId = `${deviceId}_${slug}`;
                const discoveryKey = `${deviceId}_${slug}`;
                // Skip if already published
                if (this.publishedDiscovery.has(discoveryKey))
                    continue;
                const sensorConfig = {
                    unique_id: sensorId,
                    name: `${dp.name} (${this.nodeId})`,
                    state_topic: `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/state`,
                    value_template: '{{ value_json.value | default(value) | float(0) }}',
                    device: deviceConfig,
                    availability: [
                        {
                            topic: this.availabilityTopic,
                            payload_available: 'online',
                            payload_not_available: 'offline',
                        },
                    ],
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
                // HA best practice: discovery topic should match winet2-mac structure
                const discoveryTopic = `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/config`;
                // Debug logging to diagnose the issue
                this.logger.info(`Publishing discovery: nodeId="${this.nodeId}", deviceId="${deviceId}", sensorId="${sensorId}", topic="${discoveryTopic}"`);
                this.queue.publish(discoveryTopic, JSON.stringify(sensorConfig), { retain: true }, (error) => {
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
            const deviceStats = deviceStatus[String(device.dev_id)];
            if (!deviceStats) {
                continue;
            }
            const deviceId = `${device.dev_model}_${device.dev_sn}`; // Match winet2-mac format: SG50RS_SG50RS_SERIAL_2
            // Publish individual sensor data to separate topics (like winet2-mac)
            let publishedSensors = 0;
            for (const [slug, dp] of Object.entries(deviceStats)) {
                if (!dp.dirty) {
                    continue;
                }
                const sensorTopic = `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/state`;
                // Simple payload like winet2-mac (not complex nested JSON)
                const sensorPayload = {
                    value: dp.value,
                };
                if (dp.unit && dp.unit !== '') {
                    sensorPayload.unit_of_measurement = dp.unit;
                }
                this.logger.debug(`Publishing sensor: nodeId="${this.nodeId}", deviceId="${deviceId}", sensor="${slug}", topic="${sensorTopic}"`);
                this.logger.info(`Publishing individual sensor state: ${sensorTopic}`);
                this.queue.publish(sensorTopic, JSON.stringify(sensorPayload), { retain: false }, (error) => {
                    if (error) {
                        this.logger.error(`Failed to publish sensor ${slug} for ${deviceId}:`, error);
                    }
                    else {
                        // Clear dirty flag after successful publish
                        dp.dirty = false;
                    }
                });
                publishedSensors++;
            }
            if (publishedSensors > 0) {
                this.logger.info(`Published ${publishedSensors} sensors for nodeId="${this.nodeId}", deviceId="${deviceId}"`);
            }
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