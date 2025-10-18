"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttPublisher = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const HaTypes_1 = require("./types/HaTypes");
class MqttPublisher {
    constructor(logger, url, rootPrefix, inverterId, deviceDisplayName, mqttUser, mqttPass) {
        this.connected = false;
        this.logger = logger;
        
        // Prepare MQTT connection options
        const mqttOptions = {};
        
        // Add authentication if credentials are provided
        if (mqttUser && mqttPass) {
            mqttOptions.username = mqttUser;
            mqttOptions.password = mqttPass;
            this.logger.info('🔐 MQTT: Using authentication');
        } else {
            this.logger.info('🔓 MQTT: No authentication (unencrypted mode)');
        }
        
        this.client = mqtt_1.default.connect(url, mqttOptions);
        this.rootPrefix = (rootPrefix === null || rootPrefix === void 0 ? void 0 : rootPrefix.trim()) || 'homeassistant/sensor';
        this.inverterId = (inverterId === null || inverterId === void 0 ? void 0 : inverterId.trim()) || '';
        this.deviceDisplayName = (deviceDisplayName === null || deviceDisplayName === void 0 ? void 0 : deviceDisplayName.trim()) || '';
        
        // PERFORMANCE FIX #3: Pre-calculate static parts to avoid repetitive string operations
        this.cachedBasePrefix = this.rootPrefix.replace(/\/[^\/]*$/, ''); // Remove trailing /inverterX
        this.haDevicePrefix = this.inverterId ? `${this.inverterId}_` : '';
        
        this.client.on('connect', () => {
            this.logger.info('Connected to MQTT broker');
            this.connected = true;
        });
        this.client.on('error', err => {
            this.logger.error(`MQTT error: ${err}`);
        });
    }
    publishData(deviceSlug, slug, unit, value) {
        if (!this.connected) {
            this.logger.warn(`MQTT not connected, skipping data publish for ${deviceSlug}/${slug}`);
            return;
        }
        
        // Optimized unit normalization using lookup table
        const unitMap = {
            'kWp': 'kW',
            '℃': '°C'
        };
        unit = unitMap[unit] || unit;
        
        // Optimized value conversion for power units
        if (typeof value === 'number') {
            if (unit === 'kvar') {
                unit = 'var';
                value *= 1000;
            } else if (unit === 'kVA') {
                unit = 'VA';
                value *= 1000;
            }
        }
        
        // Pre-calculated topic path
        const topic = `${this.cachedBasePrefix}/${this.haDevicePrefix}${deviceSlug}/${slug}/state`;
        const isTextSensor = HaTypes_1.TextSensors.includes(slug);
        
        // Optimized payload generation
        const payload = JSON.stringify(isTextSensor ? 
            { value: value?.toString() || '' } : 
            { value, unit_of_measurement: unit }
        );
        
        this.client.publish(topic, payload, { retain: false }, err => {
            if (err) {
                this.logger.error(`Failed to publish sensor data to ${topic}: ${err}`);
            }
        });
    }
    registerDevice(slug, device) {
        // Disabled - individual sensors already register the device properly
        // This was creating duplicate "inverter1 inverter1" entities
        this.logger.info(`Skipping registerDevice for ${slug} - individual sensors handle device registration`);
        return true;
    }
    shouldSkipSensor(slug) {
        // Check if user specified single-phase system
        const isSinglePhase = process.env.SINGLE_PHASE_SYSTEM === 'true';
        
        if (!isSinglePhase) {
            return false; // Three-phase system, don't skip any sensors
        }
        
        // Single-phase system - skip these unused sensors
        const singlePhaseSkipSensors = [
            'meter_phaseb_voltage',
            'meter_phasec_voltage', 
            'meter_phasea_current',
            'meter_phaseb_current',
            'meter_phasec_current'
        ];
        
        return singlePhaseSkipSensors.includes(slug);
    }
    publishConfig(deviceSlug, deviceStatus, device) {
        if (!this.connected) {
            this.logger.warn(`MQTT not connected, skipping config publish for ${deviceSlug}/${deviceStatus.slug}`);
            return false;
        }
        
        const slug = deviceStatus.slug;
        if (this.shouldSkipSensor(slug)) {
            this.logger.info(`Skipping sensor ${slug} for single-phase system`);
            return false;
        }
        
        // Pre-calculated paths and values
        const haCompatibleDeviceSlug = `${this.haDevicePrefix}${deviceSlug}`;
        const configTopic = `${this.cachedBasePrefix}/${haCompatibleDeviceSlug}/${slug}/config`;
        const isTextSensor = HaTypes_1.TextSensors.includes(slug);
        const identifier = `${device.dev_model}_${device.dev_sn}`;
        
        // Optimized value template calculation
        const isNumeric = !isNaN(parseFloat(deviceStatus.value?.toString() || ''));
        const valueTemplate = isNumeric ? '{{ value_json.value | float }}' : '{{ value_json.value }}';
        
        // Base configuration object
        const configPayload = {
            name: deviceStatus.name.trim(),
            state_topic: `${this.cachedBasePrefix}/${haCompatibleDeviceSlug}/${slug}/state`,
            unique_id: `${this.inverterId ? this.inverterId + '_' : ''}${deviceSlug}_${slug}`.toLowerCase(),
            value_template: valueTemplate,
            device: {
                name: this.deviceDisplayName || `${device.dev_model} ${device.dev_sn}`,
                identifiers: [identifier],
                model: device.dev_model,
            },
        };
        
        // Optimized sensor type configuration
        if (isTextSensor) {
            configPayload.encoding = 'utf-8';
        } else {
            // Unit normalization with lookup table
            const unitMap = { 'kWp': 'kW', '℃': '°C', 'kvar': 'var', 'kVA': 'VA' };
            configPayload.unit_of_measurement = unitMap[deviceStatus.unit] || deviceStatus.unit;
            configPayload.state_class = 'measurement';
            
            // Apply specialized configurations
            const stateClass = HaTypes_1.StateClasses[deviceStatus.unit];
            if (stateClass) configPayload.state_class = stateClass;
            
            const deviceClass = HaTypes_1.DeviceClasses[deviceStatus.unit];
            if (deviceClass) configPayload.device_class = deviceClass;
            
            // Special cases
            if (configPayload.unit_of_measurement === 'kWh') {
                configPayload.state_class = 'total_increasing';
            } else if (slug === 'total_power_factor') {
                configPayload.device_class = 'power_factor';
                configPayload.unit_of_measurement = ' ';
            }
            
            // Clean up empty properties
            if (!configPayload.device_class) delete configPayload.device_class;
            if (configPayload.state_class === '') delete configPayload.state_class;
        }
        
        this.logger.info(`Publishing config to: ${configTopic}`);
        
        // Debug duplicate entity detection (optimized)
        if (configTopic.includes('/config') && !configTopic.includes('_SG50RS_')) {
            this.logger.error(`POTENTIAL DUPLICATE ENTITY CREATION: ${configTopic}`);
        }
        
        this.client.publish(configTopic, JSON.stringify(configPayload), { retain: true, qos: 1 }, err => {
            if (err) {
                this.logger.error(`Failed to publish sensor config to ${configTopic}: ${err}`);
            }
        });
        return true;
    }
}
exports.MqttPublisher = MqttPublisher;
//# sourceMappingURL=homeassistant.js.map