import {PostHog} from 'posthog-node';
import * as crypto from 'crypto';
import {DeviceSchema} from './types/MessageTypes';
import {z} from 'zod';

export class Analytics {
  private enabled: boolean;
  private posthog: PostHog;
  private id = '';
  private winetVersion = 0;
  private devices: z.infer<typeof DeviceSchema>[] = [];
  private devicePingInterval?: NodeJS.Timeout;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.posthog = new PostHog(
      'phc_Xl9GlMHjhpVc9pGwR2U1Qga4e1pUaRPD2IrLGMy11eY',
      {
        host: 'https://posthog.nickstallman.net',
      }
    );

    // Use constant for ping interval (1 hour = 3600000ms)
    if (this.enabled) {
      setInterval(this.ping.bind(this), 3600000);
    }
  }

  registerDevices(devices: z.infer<typeof DeviceSchema>[]) {
    this.devices = devices;
    this.pingDevices();
    if (this.devicePingInterval) {
      clearInterval(this.devicePingInterval);
    }
    this.devicePingInterval = setInterval(
      this.pingDevices.bind(this),
      3600 * 1000 * 6
    );
  }

  pingDevices() {
    // Optimized device string generation using array join
    const deviceStrings = this.devices.map(
      device => `${device.dev_model}:${device.dev_sn}`
    );
    const deviceString = deviceStrings.join(';');

    if (deviceString.length > 0) {
      const hash = crypto.createHash('sha256');
      hash.update(deviceString);
      this.id = hash.digest('base64');
    }

    if (this.enabled && this.id.length > 0) {
      this.ping();

      // Batch device registration events
      const baseProperties = {winetVersion: this.winetVersion};
      for (const device of this.devices) {
        this.posthog.capture({
          distinctId: this.id,
          event: 'device_registered',
          properties: {...baseProperties, device: device.dev_model},
        });
      }
    }
  }

  registerVersion(version: number) {
    this.winetVersion = version;
  }

  registerError(type: string, error: string) {
    if (this.enabled && this.id.length > 0) {
      this.posthog.capture({
        distinctId: this.id,
        event: 'error',
        properties: {
          type: type,
          error: error,
          winetVersion: this.winetVersion,
        },
      });
    }
  }

  registerReconnect(type: string) {
    if (this.enabled && this.id.length > 0) {
      this.posthog.capture({
        distinctId: this.id,
        event: 'reconnect',
        properties: {
          type: type,
          winetVersion: this.winetVersion,
        },
      });
    }
  }

  private ping() {
    if (this.enabled && this.id.length > 0) {
      this.posthog.capture({
        distinctId: this.id || '',
        event: 'ping',
        properties: {
          winetVersion: this.winetVersion,
        },
      });
    }
  }
}
