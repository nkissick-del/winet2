"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const getProperties_1 = require("./getProperties");
const winetHandler_1 = require("./winetHandler");
const homeassistant_1 = require("./homeassistant");
const winston_1 = __importDefault(require("winston"));
const fs_1 = __importDefault(require("fs"));
const util_1 = __importDefault(require("util"));
const analytics_1 = require("./analytics");
const { SSLConfig } = require("./sslConfig");
const dotenv = require('dotenv');
console.log('🚀 WINET2 Application Starting - Multi-inverter support enabled');

// Global error handlers to prevent application crashes
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION - This should not crash the application:', error);
    // Log but don't exit - let the application continue
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED PROMISE REJECTION - This should not crash the application:', reason);
    // Log but don't exit - let the application continue
});

const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
    }), winston_1.default.format.printf(info => {
        const { timestamp, level, message, ...extraData } = info;
        return (`${timestamp} ${level}: ${message} ` +
            `${Object.keys(extraData).length ? util_1.default.format(extraData) : ''}`);
    })),
    transports: [new winston_1.default.transports.Console()],
});

// Initialize SSL configuration and display settings
const sslConfig = new SSLConfig(logger);

let options = {
    winet_host: '',
    winet_hosts: [],
    mqtt_url: '',
    mqtt_user: '',
    mqtt_pass: '',
    winet_user: '',
    winet_pass: '',
    poll_interval: '10',
    analytics: true,
    ssl: false,
    ha_prefix: 'homeassistant/sensor',
};
// Optimized configuration loading with reduced redundancy
if (fs_1.default.existsSync('/data/options.json')) {
    options = JSON.parse(fs_1.default.readFileSync('/data/options.json', 'utf8'));
} else {
    dotenv.config();
    // Helper function to trim and validate environment variables
    const getEnvVar = (key, defaultVal = '') => {
        const val = process.env[key]?.trim();
        return val && val.length > 0 ? val : defaultVal;
    };
    
    const getOptionalEnvVar = (key) => {
        const val = process.env[key]?.trim();
        return val && val.length > 0 ? val : undefined;
    };
    
    // Parse comma-separated values once and reuse
    const parseCommaSeparated = (val) => val.split(',').map(x => x.trim()).filter(x => x.length > 0);
    
    const hostsEnv = getEnvVar('WINET_HOSTS') || getEnvVar('WINET_HOST');
    
    // Batch assign environment variables with optimized processing
    Object.assign(options, {
        winet_host: getEnvVar('WINET_HOST'),
        winet_hosts: parseCommaSeparated(hostsEnv),
        mqtt_url: getEnvVar('MQTT_URL'),
        mqtt_user: getOptionalEnvVar('MQTT_USER'),
        mqtt_pass: getOptionalEnvVar('MQTT_PASS'),
        winet_user: getOptionalEnvVar('WINET_USER'),
        winet_pass: getOptionalEnvVar('WINET_PASS'),
        poll_interval: getEnvVar('POLL_INTERVAL', '10'),
        analytics: process.env.ANALYTICS === 'true',
        ssl: process.env.SSL === 'true',
        ha_prefix: getEnvVar('HA_PREFIX', 'homeassistant/sensor'),
        winet_names: parseCommaSeparated(getEnvVar('WINET_NAMES'))
    });
}
if ((!options.winet_hosts || options.winet_hosts.length === 0) && !options.winet_host) {
    throw new Error('No host provided');
}
if (!options.mqtt_url) {
    throw new Error('No mqtt provided');
}
const lang = 'en_US';
const frequency = parseInt(options.poll_interval) || 10;

// PERFORMANCE FIX #2: Track timers for cleanup to prevent memory leaks
const activeTimers = [];

// Build list of hosts (support single WINET_HOST or comma-separated WINET_HOSTS/WINET_HOST)
const hosts = (options.winet_hosts && options.winet_hosts.length > 0)
    ? options.winet_hosts
    : [options.winet_host];

// Pre-calculate constants to avoid repetitive operations
const totalInverters = hosts.length;
const shouldStagger = totalInverters > 1 && frequency >= 5;
const basePrefix = (options.ha_prefix || 'homeassistant/sensor').replace(/\/+$/, '');
const normalizedBase = basePrefix.endsWith('/sensor') ? basePrefix : `${basePrefix}/sensor`;

hosts.forEach((hostRaw, index) => {
    const host = hostRaw.trim();
    if (!host) return; // Early return for empty hosts
    
    // Optimized inverter ID generation
    const customName = options.winet_names?.[index] || '';
    const safeName = customName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const inverterId = safeName || `inverter_${index + 1}`;
    
    // Pre-calculated prefix to avoid string operations in loop
    const haPrefix = `${normalizedBase}/${inverterId}`;
    const log = logger.child({ inverter: inverterId, host });
    
    log.info(`Using MQTT discovery prefix for ${inverterId}: ${haPrefix}`);
    
    // Initialize components with optimized parameters
    const mqtt = new homeassistant_1.MqttPublisher(log, options.mqtt_url, haPrefix, inverterId, customName || inverterId, options.mqtt_user, options.mqtt_pass);
    const winet = new winetHandler_1.winetHandler(log, host, lang, frequency, options.winet_user, options.winet_pass, new analytics_1.Analytics(options.analytics));
    
    // Use Set for O(1) lookups instead of Array.includes() which is O(n)
    const configuredSensors = new Set();
    const configuredDevices = new Set();
    
    // Optimized cache reset with Set.clear() method
    const cacheResetTimer = setInterval(() => {
        configuredSensors.clear();
        configuredDevices.clear();
        log.info(`[${inverterId}] Cleared sensor cache - will reconfigure all sensors on next update`);
    }, 3600000); // Use milliseconds directly (1 hour = 3600000ms)
    
    activeTimers.push(cacheResetTimer);
    winet.setCallback((devices, deviceStatus) => {
        let updatedSensorsConfig = 0;
        let updatedSensors = 0;
        
        for (const device of devices) {
            const deviceSlug = `${device.dev_model}_${device.dev_sn}`;
            const currentStatus = deviceStatus[device.dev_id];
            
            // Optimized Set-based lookup (O(1) vs O(n) for Array.includes)
            if (!configuredDevices.has(device.dev_id)) {
                log.info(`[${inverterId}] Skipping device registration for: ${deviceSlug}`);
                configuredDevices.add(device.dev_id);
            }
            
            // Optimized sensor processing with batch logging
            const sensorCount = Object.keys(currentStatus).length;
            log.info(`[${inverterId}] Device ${deviceSlug}: ${sensorCount} sensors`);
            
            for (const statusKey in currentStatus) {
                const status = currentStatus[statusKey];
                const combinedSlug = `${deviceSlug}_${status.slug}`;
                
                // Use Set.has() for O(1) lookup instead of Array.includes() O(n)
                if (!configuredSensors.has(combinedSlug)) {
                    if (mqtt.publishConfig(deviceSlug, status, device)) {
                        log.info(`[${inverterId}] Configured sensor: ${deviceSlug} ${status.slug}`);
                        configuredSensors.add(combinedSlug);
                        updatedSensorsConfig++;
                    }
                }
                
                if (status.dirty) {
                    mqtt.publishData(deviceSlug, status.slug, status.unit, status.value);
                    log.info(`[${inverterId}] Updated sensor: ${status.slug} = ${status.value} ${status.unit}`);
                    status.dirty = false;
                    updatedSensors++;
                }
            }
        }
        
        // Batch log summary to reduce logging overhead
        if (updatedSensorsConfig > 0 || updatedSensors > 0) {
            log.info(`[${inverterId}] Summary: ${updatedSensorsConfig} sensors configured, ${updatedSensors} sensors updated`);
        }
    });
    const init = () => {
        (0, getProperties_1.getProperties)(log, host, lang, options.ssl)
            .then(result => {
            log.info(`[${inverterId}] Fetched i18n properties.`);
            winet.setProperties(result.properties);
            winet.connect(result.forceSsl);
        })
            .catch(err => {
            log.error(`[${inverterId}] Failed to fetch l18n properties required to start. Will retry.`, err);
            // Retry after a longer backoff to avoid spamming the device/network
            setTimeout(init, Math.max(frequency * 1000 * 6, 30000));
        });
    };
    
    // Optimized inverter startup with pre-calculated values
    if (shouldStagger) {
        const staggerDelay = Math.floor((frequency * 1000) / totalInverters) * index;
        log.info(`[${inverterId}] Staggered start: ${totalInverters} inverters, delay ${staggerDelay/1000}s`);
        setTimeout(init, staggerDelay);
    } else {
        const reason = totalInverters === 1 ? 'Single inverter' : `Short interval (${frequency}s)`;
        log.info(`[${inverterId}] ${reason} - starting immediately`);
        init();
    }
});

// PERFORMANCE FIX #2: Graceful shutdown to prevent memory leaks
const cleanup = () => {
    logger.info('🛑 Graceful shutdown initiated - cleaning up timers...');
    activeTimers.forEach((timer, index) => {
        clearInterval(timer);
        logger.info(`Cleared timer ${index + 1}/${activeTimers.length}`);
    });
    activeTimers.length = 0; // Clear the array
    logger.info('✅ Cleanup complete');
    process.exit(0);
};

// Handle various shutdown signals
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);

//# sourceMappingURL=index.js.map