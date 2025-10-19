import {z} from 'zod';
import {DeviceSchema} from './types/MessageTypes';
import {DeviceStatusMap} from './types/DeviceStatus';
import * as winston from 'winston';

interface HaSensorConfig {
  unique_id: string;
  name: string;
  state_topic: string;
  value_template: string;
  device: {
    identifiers: string[];
    name: string;
    model: string;
    manufacturer: string;
    serial_number: string;
  };
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
}

export class MqttPublisher {
  private logger: winston.Logger;
  private mqttClient: any;
  private haPrefix: string;
  private devicePrefix: string;
  private nodeId: string; // Add nodeId to identify this inverter instance
  private publishedDiscovery = new Set<string>();
  private lastStatusPublish: {[key: string]: number} = {};

  constructor(
    logger: winston.Logger,
    mqttClient: any,
    haPrefix: string,
    devicePrefix: string,
    nodeId: string, // Add nodeId parameter
  ) {
    this.logger = logger;
    this.mqttClient = mqttClient;
    this.haPrefix = haPrefix;
    this.devicePrefix = devicePrefix;
    this.nodeId = nodeId;
  }

  publishDiscovery(
    devices: z.infer<typeof DeviceSchema>[],
    deviceStatus: DeviceStatusMap,
  ): void {
    for (const device of devices) {
      const deviceStats = deviceStatus[device.dev_id] as any;
      if (!deviceStats) continue;

      const deviceId = `${device.dev_model}_${device.dev_sn}`; // Match winet2-mac format: SG50RS_A22C1208343

      // Create device discovery config
      const deviceConfig = {
        identifiers: [device.dev_sn], // Use just the serial number as identifier
        name: `${this.nodeId} (${device.dev_model}-${device.dev_sn})`, // Use friendly name from env + (Model-Serial)
        model: device.dev_model,
        manufacturer: 'Sungrow',
        serial_number: device.dev_sn,
      };

      for (const [slug, dataPoint] of Object.entries(deviceStats)) {
        if (!dataPoint || typeof dataPoint !== 'object') continue;

        const dp = dataPoint as any;
        const sensorId = `${deviceId}_${slug}`;
        const discoveryKey = `${deviceId}_${slug}`;

        // Skip if already published
        if (this.publishedDiscovery.has(discoveryKey)) continue;

        const sensorConfig: HaSensorConfig = {
          unique_id: sensorId,
          name: `${dp.name} (${this.nodeId})`,
          state_topic: `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/state`,
          value_template: '{{ value_json.value | default(value) | float(0) }}',
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

        // HA best practice: discovery topic should match winet2-mac structure
        const discoveryTopic = `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/config`;

        // Debug logging to diagnose the issue
        this.logger.info(
          `Publishing discovery: nodeId="${this.nodeId}", deviceId="${deviceId}", sensorId="${sensorId}", topic="${discoveryTopic}"`,
        );

        this.mqttClient.publish(
          discoveryTopic,
          JSON.stringify(sensorConfig),
          {retain: true},
          (error: Error) => {
            if (error) {
              this.logger.error(
                `Failed to publish discovery for ${sensorId}:`,
                error,
              );
            } else {
              this.logger.debug(`Published discovery for ${sensorId}`);
              this.publishedDiscovery.add(discoveryKey);
            }
          },
        );
      }
    }
  }

  publishStatus(
    devices: z.infer<typeof DeviceSchema>[],
    deviceStatus: DeviceStatusMap,
  ): void {
    for (const device of devices) {
      const deviceStats = deviceStatus[device.dev_id] as any;
      if (!deviceStats) continue;

      const deviceId = `${device.dev_model}_${device.dev_sn}`; // Match winet2-mac format: SG50RS_A22C1208343

      // Publish individual sensor data to separate topics (like winet2-mac)
      let publishedSensors = 0;
      for (const [slug, dataPoint] of Object.entries(deviceStats)) {
        if (!dataPoint || typeof dataPoint !== 'object') continue;

        const dp = dataPoint as any;

        // Only publish if data has changed (dirty flag)
        if (!dp.dirty) continue;

        const sensorTopic = `${this.haPrefix}/${this.nodeId}_${deviceId}/${slug}/state`;

        // Simple payload like winet2-mac (not complex nested JSON)
        const sensorPayload: any = {
          value: dp.value,
        };

        // Add unit if available (like winet2-mac)
        if (dp.unit && dp.unit !== '') {
          sensorPayload.unit_of_measurement = dp.unit;
        }

        this.logger.debug(
          `Publishing sensor: nodeId="${this.nodeId}", deviceId="${deviceId}", sensor="${slug}", topic="${sensorTopic}"`,
        );
        this.logger.info(`Publishing individual sensor state: ${sensorTopic}`);

        this.mqttClient.publish(
          sensorTopic,
          JSON.stringify(sensorPayload),
          {retain: false},
          (error: Error) => {
            if (error) {
              this.logger.error(
                `Failed to publish sensor ${slug} for ${deviceId}:`,
                error,
              );
            } else {
              // Clear dirty flag after successful publish
              dp.dirty = false;
            }
          },
        );
        publishedSensors++;
      }

      if (publishedSensors > 0) {
        this.logger.info(
          `Published ${publishedSensors} sensors for nodeId="${this.nodeId}", deviceId="${deviceId}"`,
        );
      }
    }
  }

  // Helper method to clear discovery cache (useful for testing)
  clearDiscoveryCache(): void {
    this.publishedDiscovery.clear();
    this.lastStatusPublish = {};
  }

  // Helper method to force republish discovery
  forceDiscoveryPublish(): void {
    this.publishedDiscovery.clear();
  }
}
