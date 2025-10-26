import {z} from 'zod';
import {DeviceSchema} from './types/MessageTypes';
import {DeviceStatusMap, DeviceDataPoint} from './types/DeviceStatus';
import * as winston from 'winston';
import {MqttClient} from 'mqtt';
import {MqttQueue} from './mqttQueue';
import {DiagnosticsTracker} from './diagnostics';

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
  availability?: Array<{
    topic: string;
    payload_available: string;
    payload_not_available: string;
  }>;
  unit_of_measurement?: string;
  device_class?: string;
  state_class?: string;
  entity_category?: string;
  icon?: string;
}

export class MqttPublisher {
  private logger: winston.Logger;
  private mqttClient: MqttClient;
  private haPrefix: string;
  private devicePrefix: string;
  private nodeId: string; // Add nodeId to identify this inverter instance
  private publishedDiscovery = new Set<string>();
  private lastStatusPublish: {[key: string]: number} = {};
  private availabilityTopic: string;
  private queue: MqttQueue;
  private diagnostics: DiagnosticsTracker;

  constructor(
    logger: winston.Logger,
    mqttClient: MqttClient,
    haPrefix: string,
    devicePrefix: string,
    nodeId: string, // Add nodeId parameter
  ) {
    this.logger = logger;
    this.mqttClient = mqttClient;
    this.haPrefix = haPrefix;
    this.devicePrefix = devicePrefix;
    this.nodeId = nodeId;
    this.availabilityTopic = `${haPrefix}/${nodeId}/availability`;
    this.queue = new MqttQueue(logger, mqttClient);
    this.diagnostics = new DiagnosticsTracker(logger, nodeId);
  }

  /**
   * Publish availability status (online)
   * Call when connection is established
   */
  publishAvailable(): void {
    this.queue.publish(
      this.availabilityTopic,
      'online',
      {retain: true, qos: 1},
      error => {
        if (error) {
          this.logger.error(`Failed to publish availability: ${error.message}`);
        } else {
          this.logger.info('Published availability: online');
        }
      },
    );
  }

  /**
   * Publish availability status (offline)
   * Call before disconnecting
   */
  publishUnavailable(): void {
    this.queue.publish(
      this.availabilityTopic,
      'offline',
      {retain: true, qos: 1},
      error => {
        if (error) {
          this.logger.error(
            `Failed to publish unavailability: ${error.message}`,
          );
        }
      },
    );
  }

  /**
   * Publish diagnostic sensor discovery configs
   * Creates sensors for connection state, uptime, message count, etc.
   */
  publishDiagnosticDiscovery(serialNumber: string, model: string): void {
    const diagnosticSensors: Array<{
      slug: string;
      name: string;
      icon?: string;
      unit_of_measurement?: string;
      device_class?: string;
    }> = [
      {
        slug: 'connection_state',
        name: 'Connection State',
        icon: 'mdi:connection',
      },
      {
        slug: 'last_update',
        name: 'Last Update',
        device_class: 'timestamp',
      },
      {
        slug: 'message_count',
        name: 'Message Count',
        icon: 'mdi:counter',
      },
      {
        slug: 'error_count',
        name: 'Error Count',
        icon: 'mdi:alert-circle',
      },
      {
        slug: 'uptime',
        name: 'Uptime',
        unit_of_measurement: 's',
        device_class: 'duration',
        icon: 'mdi:timer',
      },
      {
        slug: 'mqtt_queue_size',
        name: 'MQTT Queue Size',
        icon: 'mdi:format-list-numbered',
      },
      {
        slug: 'websocket_state',
        name: 'WebSocket State',
        icon: 'mdi:web',
      },
    ];

    const deviceConfig = {
      identifiers: [serialNumber],
      name: `${this.nodeId} (${model}-${serialNumber})`,
      model: model,
      manufacturer: 'Sungrow',
      serial_number: serialNumber,
    };

    for (const sensor of diagnosticSensors) {
      const sensorId = `${this.nodeId}_diagnostic_${sensor.slug}`;
      const discoveryKey = `diagnostic_${sensor.slug}`;

      if (this.publishedDiscovery.has(discoveryKey)) continue;

      const sensorConfig: HaSensorConfig = {
        unique_id: sensorId,
        name: `${sensor.name} (${this.nodeId})`,
        state_topic: `${this.haPrefix}/${this.nodeId}/diagnostics/state`,
        value_template: `{{ value_json.${sensor.slug} }}`,
        device: deviceConfig,
        availability: [
          {
            topic: this.availabilityTopic,
            payload_available: 'online',
            payload_not_available: 'offline',
          },
        ],
        entity_category: 'diagnostic',
      };

      if (sensor.unit_of_measurement) {
        sensorConfig.unit_of_measurement = sensor.unit_of_measurement;
      }

      if (sensor.device_class) {
        sensorConfig.device_class = sensor.device_class;
      }

      if (sensor.icon) {
        sensorConfig.icon = sensor.icon;
      }

      const discoveryTopic = `${this.haPrefix}/${this.nodeId}_diagnostic/${sensor.slug}/config`;

      this.queue.publish(
        discoveryTopic,
        JSON.stringify(sensorConfig),
        {retain: true},
        (error?: Error) => {
          if (error) {
            this.logger.error(
              `Failed to publish diagnostic discovery for ${sensor.slug}:`,
              error,
            );
          } else {
            this.logger.debug(
              `Published diagnostic discovery for ${sensor.slug}`,
            );
            this.publishedDiscovery.add(discoveryKey);
          }
        },
      );
    }
  }

  /**
   * Publish current diagnostic metrics
   */
  publishDiagnostics(): void {
    const metrics = this.diagnostics.getMetrics();

    // Update queue size from the actual queue
    metrics.mqtt_queue_size = this.queue.getQueueSize();

    const diagnosticTopic = `${this.haPrefix}/${this.nodeId}/diagnostics/state`;

    this.queue.publish(
      diagnosticTopic,
      JSON.stringify(metrics),
      {retain: false, qos: 0},
      (error?: Error) => {
        if (error) {
          this.logger.error(`Failed to publish diagnostics: ${error.message}`);
          this.diagnostics.incrementErrorCount();
        } else {
          this.diagnostics.incrementMessageCount();
        }
      },
    );
  }

  /**
   * Get diagnostics tracker for external updates
   */
  getDiagnostics(): DiagnosticsTracker {
    return this.diagnostics;
  }

  publishDiscovery(
    devices: z.infer<typeof DeviceSchema>[],
    deviceStatus: DeviceStatusMap,
  ): void {
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
        if (this.publishedDiscovery.has(discoveryKey)) continue;

        const sensorConfig: HaSensorConfig = {
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
        this.logger.info(
          `Publishing discovery: nodeId="${this.nodeId}", deviceId="${deviceId}", sensorId="${sensorId}", topic="${discoveryTopic}"`,
        );

        this.queue.publish(
          discoveryTopic,
          JSON.stringify(sensorConfig),
          {retain: true},
          (error?: Error) => {
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
        const sensorPayload: {
          value: DeviceDataPoint['value'];
          unit_of_measurement?: string;
        } = {
          value: dp.value,
        };

        if (dp.unit && dp.unit !== '') {
          sensorPayload.unit_of_measurement = dp.unit;
        }

        this.logger.debug(
          `Publishing sensor: nodeId="${this.nodeId}", deviceId="${deviceId}", sensor="${slug}", topic="${sensorTopic}"`,
        );
        this.logger.info(`Publishing individual sensor state: ${sensorTopic}`);

        this.queue.publish(
          sensorTopic,
          JSON.stringify(sensorPayload),
          {retain: false},
          (error?: Error) => {
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
