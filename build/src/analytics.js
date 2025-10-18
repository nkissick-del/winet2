"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analytics = void 0;
const posthog_node_1 = require("posthog-node");
const crypto_1 = __importDefault(require("crypto"));
class Analytics {
    constructor(enabled) {
        this.id = '';
        this.winetVersion = 0;
        this.devices = [];
        this.devicePingInterval = undefined;
        this.enabled = enabled;
        this.posthog = new posthog_node_1.PostHog('phc_Xl9GlMHjhpVc9pGwR2U1Qga4e1pUaRPD2IrLGMy11eY', { host: 'https://posthog.nickstallman.net' });
        
        // Use constant for ping interval (1 hour = 3600000ms)
        if (this.enabled) {
            setInterval(this.ping.bind(this), 3600000);
        }
    }
    registerDevices(devices) {
        this.devices = devices;
        this.pingDevices();
        if (this.devicePingInterval) {
            clearInterval(this.devicePingInterval);
        }
        this.devicePingInterval = setInterval(this.pingDevices.bind(this), 3600 * 1000 * 6);
    }
    pingDevices() {
        // Optimized device string generation using array join
        const deviceStrings = this.devices.map(device => `${device.dev_model}:${device.dev_sn}`);
        const deviceString = deviceStrings.join(';');
        
        if (deviceString.length > 0) {
            const hash = crypto_1.default.createHash('sha256');
            hash.update(deviceString);
            this.id = hash.digest('base64');
        }
        
        if (this.enabled && this.id.length > 0) {
            this.ping();
            
            // Batch device registration events
            const baseProperties = { winetVersion: this.winetVersion };
            for (const device of this.devices) {
                this.posthog.capture({
                    distinctId: this.id,
                    event: 'device_registered',
                    properties: { ...baseProperties, device: device.dev_model },
                });
            }
        }
    }
    registerVersion(version) {
        this.winetVersion = version;
    }
    registerError(type, error) {
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
    registerReconnect(type) {
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
    ping() {
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
exports.Analytics = Analytics;
//# sourceMappingURL=analytics.js.map