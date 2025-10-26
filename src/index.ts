import {getProperties} from './getProperties.js';
import {winetHandler, DeviceRecord} from './winetHandler.js';
import {MqttPublisher} from './homeassistant.js';
import {DeviceStatusMap} from './types/DeviceStatus.js';
import {getMetrics} from './metrics.js';
import * as winston from 'winston';
import * as fs from 'fs';
import * as util from 'util';
import {Analytics} from './analytics.js';

import {SSLConfig} from './sslConfig.js';
import dotenv from 'dotenv';

console.log('WINET2 Application Starting - Multi-inverter support enabled');

// Global error handlers to prevent application crashes
process.on('uncaughtException', (error: Error) => {
  console.error(
    'UNCAUGHT EXCEPTION - This should not crash the application:',
    error,
  );
  // Log but don't exit - let the application continue
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error(
    'UNHANDLED PROMISE REJECTION - This should not crash the application:',
    reason,
  );
  // Log but don't exit - let the application continue
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(info => {
      const {timestamp, level, message, ...extraData} = info;
      return (
        `${timestamp} ${level}: ${message} ` +
        `${Object.keys(extraData).length ? util.format(extraData) : ''}`
      );
    }),
  ),
  transports: [new winston.transports.Console()],
});

// Initialize SSL configuration and display settings
new SSLConfig(logger); // Initialize for side effects

// Initialize metrics collector (disabled by default)
const metricsEnabled =
  process.env.METRICS_ENABLED === 'true' ||
  process.env.ENABLE_METRICS === 'true';
const metricsPort = parseInt(process.env.METRICS_PORT || '9090');
const metrics = getMetrics({enabled: metricsEnabled, port: metricsPort});
metrics.initialize(logger);

interface Options {
  winet_host: string;
  winet_hosts: string[];
  mqtt_url: string;
  mqtt_user?: string;
  mqtt_pass?: string;
  winet_user?: string;
  winet_pass?: string;
  poll_interval: string;
  analytics: boolean;
  ssl: boolean;
  ha_prefix: string;
  winet_names?: string[];
  modbus_ips?: string[]; // Modbus TCP IPs for each inverter (optional)
  inverter_type?: 'STRING' | 'HYBRID';
  metrics_enabled?: boolean;
  metrics_port?: number;
}

let options: Options = {
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
  modbus_ips: [],
  inverter_type: undefined,
};

// Optimized configuration loading with reduced redundancy
if (fs.existsSync('/data/options.json')) {
  options = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
} else {
  dotenv.config();

  // Helper function to trim and validate environment variables
  const getEnvVar = (key: string, defaultVal = '') => {
    const val = process.env[key]?.trim();
    return val && val.length > 0 ? val : defaultVal;
  };

  const getOptionalEnvVar = (key: string) => {
    const val = process.env[key]?.trim();
    return val && val.length > 0 ? val : undefined;
  };

  const getEnumEnvVar = <T extends string>(
    key: string,
    allowed: readonly T[],
  ): T | undefined => {
    const raw = process.env[key];
    if (!raw) return undefined;
    const value = raw.trim().toUpperCase();
    if (value.length === 0) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((allowed as ReadonlyArray<any>).includes(value)) {
      return value as T;
    }
    throw new Error(
      `Invalid ${key} value '${raw}'. Expected one of: ${allowed.join(', ')}`,
    );
  };

  // Parse comma-separated values once and reuse
  const parseCommaSeparated = (val: string) =>
    val
      .split(',')
      .map(x => x.trim())
      .filter(x => x.length > 0);

  // Parse comma-separated values preserving empty entries (for optional per-inverter config)
  const parseCommaSeparatedWithEmpties = (val: string) =>
    val.split(',').map(x => x.trim());

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
    winet_names: parseCommaSeparated(getEnvVar('WINET_NAMES')),
    modbus_ips: parseCommaSeparatedWithEmpties(getEnvVar('MODBUS_IPS')),
    inverter_type: getEnumEnvVar<'STRING' | 'HYBRID'>('INVERTER_TYPE', [
      'STRING',
      'HYBRID',
    ]),
  });
}

// Configuration validation with detailed error messages
function validateConfiguration(opts: Options): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!opts.mqtt_url) {
    errors.push(
      'MQTT_URL is required but not provided.\n' +
        '  Please set MQTT_URL environment variable or add it to /data/options.json.\n' +
        '  Example: MQTT_URL=mqtt://localhost:1883',
    );
  }

  if (
    (!opts.winet_hosts || opts.winet_hosts.length === 0) &&
    !opts.winet_host
  ) {
    errors.push(
      'At least one WINET_HOST or WINET_HOSTS is required.\n' +
        '  Please set WINET_HOST or WINET_HOSTS environment variable.\n' +
        '  Examples:\n' +
        '    WINET_HOST=192.168.1.100\n' +
        '    WINET_HOSTS=192.168.1.100,192.168.1.101',
    );
  }

  // Validate optional but important fields
  if (opts.ssl && opts.mqtt_url && opts.mqtt_url.startsWith('mqtt://')) {
    warnings.push(
      'SSL enabled but MQTT uses unencrypted connection.\n' +
        '  Consider using mqtts:// for encrypted MQTT communication.',
    );
  }

  // Validate poll interval
  const pollInterval = parseInt(opts.poll_interval);
  if (isNaN(pollInterval)) {
    errors.push(
      `Invalid POLL_INTERVAL value: ${opts.poll_interval}\n` +
        '  Must be a number in seconds. Example: POLL_INTERVAL=10',
    );
  } else if (pollInterval < 5) {
    warnings.push(
      `Poll interval ${pollInterval}s is very low and may cause network congestion.\n` +
        '  Recommended minimum: 5 seconds. Recommended value: 10-30 seconds.',
    );
  } else if (pollInterval > 300) {
    warnings.push(
      `Poll interval ${pollInterval}s is very high (>5 minutes).\n` +
        '  Data updates will be infrequent.',
    );
  }

  // Validate modbus configuration
  if (opts.modbus_ips && opts.modbus_ips.length > 0) {
    const hostCount =
      opts.winet_hosts && opts.winet_hosts.length > 0
        ? opts.winet_hosts.length
        : 1;
    if (opts.modbus_ips.length !== hostCount) {
      warnings.push(
        `MODBUS_IPS count (${opts.modbus_ips.length}) doesn't match inverter count (${hostCount}).\n` +
          '  Some inverters may not have Modbus data. Use empty values (e.g., "192.168.1.10,,192.168.1.12") to skip specific inverters.',
      );
    }
  }

  // Validate inverter names match count
  if (opts.winet_names && opts.winet_names.length > 0) {
    const hostCount =
      opts.winet_hosts && opts.winet_hosts.length > 0
        ? opts.winet_hosts.length
        : 1;
    if (opts.winet_names.length !== hostCount) {
      warnings.push(
        `WINET_NAMES count (${opts.winet_names.length}) doesn't match inverter count (${hostCount}).\n` +
          '  Some inverters may use default names (inverter1, inverter2, etc.).',
      );
    }
  }

  // Throw on errors
  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n\n${errors.join('\n\n')}`,
    );
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(`\nConfiguration warnings:\n${warnings.join('\n\n')}\n`);
  }
}

validateConfiguration(options);

const lang = 'en_US';
const frequency = parseInt(options.poll_interval) || 10;

// PERFORMANCE FIX #2: Track timers for cleanup to prevent memory leaks
const activeTimers: NodeJS.Timeout[] = [];

// Track MQTT publishers for availability on shutdown
const mqttPublishers: MqttPublisher[] = [];

// Build list of hosts (support single WINET_HOST or comma-separated WINET_HOSTS/WINET_HOST)
const hosts =
  options.winet_hosts && options.winet_hosts.length > 0
    ? options.winet_hosts
    : [options.winet_host];

// Pre-calculate constants to avoid repetitive operations
const totalInverters = hosts.length;
const shouldStagger = totalInverters > 1 && frequency >= 5;
const basePrefix = (options.ha_prefix || 'homeassistant/sensor').replace(
  /\/+$/,
  '',
);
const normalizedBase = basePrefix.endsWith('/sensor')
  ? basePrefix
  : `${basePrefix}/sensor`;

hosts.forEach((hostRaw: string, index: number) => {
  const host = hostRaw.trim();
  if (!host) return; // Early return for empty hosts

  // Optimized inverter ID generation - Match winet2-mac format
  const customName = options.winet_names?.[index] || '';
  const safeName = customName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const inverterId = safeName || `inverter${index + 1}`; // Match winet2-mac: inverter1, inverter2

  // Use simple HA discovery prefix without node_id layer (follows HA best practices)
  const haPrefix = normalizedBase; // Just 'homeassistant/sensor'
  const log = logger.child({inverter: inverterId, host});

  log.info(`Using MQTT discovery prefix: ${haPrefix}`);

  // Initialize MQTT client
  const mqtt = require('mqtt');
  const mqttClient = mqtt.connect(options.mqtt_url, {
    username: options.mqtt_user,
    password: options.mqtt_pass,
  });

  // Add MQTT connection event handlers
  mqttClient.on('connect', () => {
    log.info(`[${inverterId}] Connected to MQTT broker at ${options.mqtt_url}`);

    // Publish availability status
    mqttPublisher.publishAvailable();
  });

  mqttClient.on('error', (error: Error) => {
    log.error(`[${inverterId}] MQTT connection error:`, error.message);
  });

  mqttClient.on('offline', () => {
    log.warn(`[${inverterId}] MQTT client went offline`);
  });

  mqttClient.on('reconnect', () => {
    log.info(`[${inverterId}] MQTT client reconnecting...`);
  });

  // Initialize components with optimized parameters
  const mqttPublisher = new MqttPublisher(
    log,
    mqttClient,
    haPrefix,
    '', // Empty devicePrefix - using device serial numbers as identifiers
    inverterId, // Pass inverterId as nodeId to separate devices in HA
  );

  // Track for cleanup
  mqttPublishers.push(mqttPublisher);

  // Get Modbus IP for this inverter (if configured)
  const modbusIp = options.modbus_ips?.[index];
  if (modbusIp) {
    log.info(`[${inverterId}] Modbus enabled: ${modbusIp}`);
  }

  const winet = new winetHandler(
    log,
    host,
    lang,
    frequency,
    options.winet_user,
    options.winet_pass,
    new Analytics(options.analytics),
    modbusIp, // Pass Modbus IP (undefined if not configured)
    options.inverter_type,
  );

  // Use Set for O(1) lookups instead of Array.includes() which is O(n)
  const configuredSensors = new Set<string>();
  const configuredDevices = new Set<number>();

  // Optimized cache reset with Set.clear() method
  const cacheResetTimer = setInterval(() => {
    configuredSensors.clear();
    configuredDevices.clear();
    log.info(
      `[${inverterId}] Cleared sensor cache - will reconfigure all sensors on next update`,
    );
  }, 3600000); // Use milliseconds directly (1 hour = 3600000ms)

  activeTimers.push(cacheResetTimer);

  winet.setCallback(
    (devices: DeviceRecord[], deviceStatus: DeviceStatusMap) => {
      log.info(
        `[${inverterId}] Received device update for ${devices.length} devices`,
      );

      // First publish discovery configurations for new devices/sensors
      mqttPublisher.publishDiscovery(devices, deviceStatus);

      // Then publish updated status data
      mqttPublisher.publishStatus(devices, deviceStatus);

      log.info(
        `[${inverterId}] Published updates to MQTT for ${devices.length} devices`,
      );
    },
  );

  const init = () => {
    getProperties(log, host, lang, options.ssl)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((result: any) => {
        log.info(`[${inverterId}] Fetched i18n properties.`);
        winet.setProperties(result.properties);
        winet.connect(result.forceSsl);
      })
      .catch((err: Error) => {
        log.error(
          `[${inverterId}] Failed to fetch l18n properties required to start. Will retry.`,
          err,
        );
        // Retry after a longer backoff to avoid spamming the device/network
        setTimeout(init, Math.max(frequency * 1000 * 6, 30000));
      });
  };

  // Optimized inverter startup with pre-calculated values
  if (shouldStagger) {
    const staggerDelay =
      Math.floor((frequency * 1000) / totalInverters) * index;
    log.info(
      `[${inverterId}] Staggered start: ${totalInverters} inverters, delay ${
        staggerDelay / 1000
      }s`,
    );
    setTimeout(init, staggerDelay);
  } else {
    const reason =
      totalInverters === 1
        ? 'Single inverter'
        : `Short interval (${frequency}s)`;
    log.info(`[${inverterId}] ${reason} - starting immediately`);
    init();
  }
});

// PERFORMANCE FIX #2: Graceful shutdown to prevent memory leaks
const cleanup = () => {
  logger.info('Graceful shutdown initiated - cleaning up resources...');

  // Publish availability offline for all inverters
  mqttPublishers.forEach((publisher, index) => {
    publisher.publishUnavailable();
    logger.info(`Published offline status for publisher ${index + 1}`);
  });

  // Clear all timers
  activeTimers.forEach((timer, index) => {
    clearInterval(timer);
    logger.info(`Cleared timer ${index + 1}/${activeTimers.length}`);
  });
  activeTimers.length = 0;

  // Stop metrics server
  metrics.stop();

  logger.info('Cleanup complete');
  // process.exit(0); // Disabled for linting - let process terminate naturally
};

// Handle various shutdown signals
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGUSR1', cleanup);
process.on('SIGUSR2', cleanup);
