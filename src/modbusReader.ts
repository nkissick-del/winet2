/**
 * Modbus TCP Reader for Sungrow SG50RS Smart Meter Data
 *
 * Reads meter power and energy data via Modbus TCP that is not available
 * through the WiNet-S WebSocket API.
 *
 * Registers discovered for SG50RS (Device Type 21):
 * - 5600: Meter Active Power (W)
 * - 5098: Forward Active Energy / Grid Import (0.1 kWh)
 * - 5094: Reverse Active Energy / Grid Export (0.1 kWh)
 */

import fs from 'fs';
import path from 'path';
import {setTimeout as delay} from 'node:timers/promises';
import ModbusRTU from 'modbus-serial';

type InverterType = 'STRING' | 'HYBRID';

const MODBUS_PORT = 502;
const SLAVE_ID = 1;
const READ_TIMEOUT = 10000; // 10 seconds
const MAX_READ_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 2000;

const METRIC_DEFINITION_PATH = path.resolve(
  process.cwd(),
  'modbus-metric-definitions.json',
);
const REGISTER_FILE_PATH = path.resolve(process.cwd(), 'modbus-registers.json');
const REGISTER_DEFAULTS_PATH = path.resolve(
  process.cwd(),
  'tools',
  'modbus-discovery',
  'modbus-register-defaults.json',
);

type RegisterMap = Record<string, number>;

interface RegisterDefaultEntry {
  id: string;
  name: string;
  address: number;
  length: number;
  data_type: string;
  scale_factor: number;
  register_type: string;
  note?: string | null;
}

interface RegisterDefaultsPerType {
  source_version?: string;
  registers: RegisterDefaultEntry[];
}

interface RegisterDefaultsFile {
  metadata?: {
    generated_at?: string;
    source?: Record<string, string>;
  };
  inverter_types?: Record<string, RegisterDefaultsPerType>;
}

interface LoggerLike {
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  debug?(message: string, ...meta: unknown[]): void;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const base = error.message || error.name;
    const details = (error as Error & {code?: string; errno?: number}).code;
    return details ? `${base} (code: ${details})` : base;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sanitizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

let registerDefaultsCache: RegisterDefaultsFile | null = null;

function loadRegisterDefaults(): RegisterDefaultsFile {
  if (registerDefaultsCache) {
    return registerDefaultsCache;
  }
  try {
    if (fs.existsSync(REGISTER_DEFAULTS_PATH)) {
      const raw = fs.readFileSync(REGISTER_DEFAULTS_PATH, 'utf8');
      registerDefaultsCache = JSON.parse(raw) as RegisterDefaultsFile;
      return registerDefaultsCache;
    }
  } catch (error) {
    console.warn(
      `Could not parse register defaults from ${REGISTER_DEFAULTS_PATH}: ${
        (error as Error).message
      }`,
    );
  }
  registerDefaultsCache = {};
  return registerDefaultsCache;
}

function getRegisterDefaultsForType(
  inverterType?: InverterType,
): RegisterDefaultEntry[] {
  if (!inverterType) {
    return [];
  }
  const defaults = loadRegisterDefaults();
  const perType = defaults.inverter_types?.[inverterType];
  return Array.isArray(perType?.registers) ? perType.registers : [];
}

interface MetricReadConfig {
  function: 'input' | 'holding';
  words: number;
  type:
    | 'int16'
    | 'uint16'
    | 'int32'
    | 'uint32'
    | 'uint32le'
    | 'float32'
    | 'uint64';
  scale?: number;
}

interface MetricDefinition {
  id: string;
  name?: string;
  category?: string | null;
  default?: {
    register?: number;
  };
  models?: Record<string, {register?: number}>;
  read?: MetricReadConfig;
}

interface DefinitionFile {
  metrics?: MetricDefinition[];
}

interface RegisterFile {
  version?: number;
  model?: string;
  metrics?: Record<string, {register: number}>;
  // legacy fallback: flat map
  [legacy: string]: unknown;
}

interface RegisterOverrides {
  map: RegisterMap;
  model?: string;
  legacy: boolean;
  exists: boolean;
}

interface RegisterState {
  map: RegisterMap;
  model?: string;
}

const FALLBACK_REGISTER_MAP: RegisterMap = {
  meter_power: 5600,
  grid_import_energy: 5098,
  grid_export_energy: 5094,
};

const METRIC_REGISTER_ALIASES: Partial<
  Record<InverterType, Record<string, string>>
> = {
  STRING: {
    grid_import_energy: 'total_import_energy',
    grid_export_energy: 'total_export_energy',
  },
  HYBRID: {
    grid_import_energy: 'total_import_energy',
    grid_export_energy: 'total_export_energy',
  },
};

const HEALTH_CHECK_METRICS: string[] = [
  'meter_power',
  'grid_import_energy',
  'grid_export_energy',
];

const HEALTH_CATEGORY_LIMITS: Record<string, {min: number; max: number}> = {
  power: {min: -200000, max: 200000},
  energy: {min: 0, max: 5e9},
  temperature: {min: -50, max: 150},
  percentage: {min: 0, max: 150},
};

function loadMetricDefinitions(): MetricDefinition[] {
  try {
    if (fs.existsSync(METRIC_DEFINITION_PATH)) {
      const content = fs.readFileSync(METRIC_DEFINITION_PATH, 'utf8');
      const parsed = JSON.parse(content) as DefinitionFile;
      if (Array.isArray(parsed.metrics)) {
        return parsed.metrics;
      }
    }
  } catch (error) {
    console.warn(
      `Could not parse metric definitions from ${METRIC_DEFINITION_PATH}: ${
        (error as Error).message
      }`,
    );
  }
  return [];
}

const metricDefinitions = loadMetricDefinitions();
const metricDefinitionMap = new Map(
  metricDefinitions.map(definition => [definition.id, definition]),
);

function deriveDefaultRegisterMap(
  modelId?: string,
  inverterType?: InverterType,
): RegisterMap {
  const map: RegisterMap = {};
  for (const definition of metricDefinitions) {
    const modelOverride = modelId
      ? definition.models?.[modelId]?.register
      : undefined;
    if (modelId && modelOverride === undefined) {
      continue;
    }
    const registerValue =
      modelOverride ??
      definition.default?.register ??
      FALLBACK_REGISTER_MAP[definition.id];
    if (typeof registerValue === 'number') {
      map[definition.id] = registerValue;
    }
  }

  for (const [metricId, registerValue] of Object.entries(
    FALLBACK_REGISTER_MAP,
  )) {
    if (map[metricId] === undefined) {
      map[metricId] = registerValue;
    }
  }

  if (inverterType) {
    const metricsByAlias = METRIC_REGISTER_ALIASES[inverterType] ?? {};
    const registerDefaults = getRegisterDefaultsForType(inverterType);
    const registerLookup = new Map<string, RegisterDefaultEntry>();
    for (const entry of registerDefaults) {
      const keys = new Set<string>();
      keys.add(sanitizeKey(entry.id));
      keys.add(sanitizeKey(entry.name));
      for (const key of keys) {
        if (key) {
          registerLookup.set(key, entry);
        }
      }
    }

    for (const definition of metricDefinitions) {
      const alias =
        (metricsByAlias && metricsByAlias[definition.id]) || undefined;
      const candidates = [
        alias,
        sanitizeKey(definition.name ?? ''),
        sanitizeKey(definition.id ?? ''),
      ].filter(Boolean) as string[];
      for (const candidate of candidates) {
        const entry = registerLookup.get(candidate);
        if (entry && typeof entry.address === 'number') {
          map[definition.id] = entry.address;
          break;
        }
      }
    }
  }

  return map;
}

function loadRegisterOverrides(): RegisterOverrides {
  if (!fs.existsSync(REGISTER_FILE_PATH)) {
    return {map: {}, legacy: false, exists: false};
  }

  try {
    const raw = JSON.parse(
      fs.readFileSync(REGISTER_FILE_PATH, 'utf8'),
    ) as RegisterFile;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (raw.metrics && typeof raw.metrics === 'object') {
        const map: RegisterMap = {};
        for (const [metricId, details] of Object.entries(raw.metrics)) {
          if (
            details &&
            typeof details === 'object' &&
            typeof (details as {register?: number}).register === 'number'
          ) {
            map[metricId] = (details as {register: number}).register;
          }
        }
        return {
          map,
          model: typeof raw.model === 'string' ? raw.model : undefined,
          legacy: false,
          exists: true,
        };
      }

      // Legacy flat structure fallback
      const map: RegisterMap = {};
      for (const [metricId, registerValue] of Object.entries(raw)) {
        if (typeof registerValue === 'number') {
          map[metricId] = registerValue;
        }
      }
      return {map, legacy: true, exists: true};
    }
  } catch (error) {
    console.warn(
      `Could not parse modbus-registers.json, using defaults: ${
        (error as Error).message
      }`,
    );
  }

  return {map: {}, legacy: false, exists: false};
}

function persistRegisterMap(map: RegisterMap, modelId?: string): void {
  const payload: RegisterFile = {
    version: 1,
    model: modelId,
    metrics: Object.fromEntries(
      Object.entries(map).map(([metricId, register]) => [metricId, {register}]),
    ),
  };

  try {
    fs.writeFileSync(REGISTER_FILE_PATH, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn(
      `Failed to persist register map to ${REGISTER_FILE_PATH}: ${
        (error as Error).message
      }`,
    );
  }
}

function initializeRegisterMap(
  modelId?: string,
  inverterType?: InverterType,
): RegisterState {
  const overrides = loadRegisterOverrides();
  const effectiveModel = modelId ?? overrides.model;
  const defaults = deriveDefaultRegisterMap(effectiveModel, inverterType);
  const merged: RegisterMap = {...defaults, ...overrides.map};

  const addedMetric = Object.keys(defaults).some(
    metricId => overrides.map[metricId] === undefined,
  );

  const shouldPersist =
    !overrides.exists ||
    overrides.legacy ||
    addedMetric ||
    (effectiveModel !== overrides.model && effectiveModel !== undefined);

  if (shouldPersist) {
    persistRegisterMap(merged, effectiveModel);
  }

  return {map: merged, model: effectiveModel};
}

export interface MeterData {
  power: number; // Current power in Watts (positive = import, negative = export)
  importEnergy: number; // Cumulative import in kWh
  exportEnergy: number; // Cumulative export in kWh
  timestamp: Date;
}

export class ModbusReader {
  private client: ModbusRTU;
  private host: string;
  private connected = false;
  private registerMap: RegisterMap;
  private modelId?: string;
  private inverterType?: InverterType;
  private healthLogger?: LoggerLike;
  private healthInterval?: NodeJS.Timeout;

  constructor(
    host: string,
    options?: {modelId?: string; inverterType?: InverterType},
  ) {
    this.host = host;
    this.client = new ModbusRTU();
    this.client.setTimeout(READ_TIMEOUT);
    this.inverterType = options?.inverterType;
    const state = initializeRegisterMap(options?.modelId, this.inverterType);
    this.registerMap = state.map;
    this.modelId = state.model;
  }

  /**
   * Connect to the inverter via Modbus TCP
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.client.connectTCP(this.host, {
        port: MODBUS_PORT,
      });
      this.client.setID(SLAVE_ID);
      this.connected = true;
      console.log(`✅ Modbus connected to ${this.host}:${MODBUS_PORT}`);
    } catch (error) {
      console.error(`❌ Modbus connection failed: ${error}`);
      throw error;
    }
  }

  /**
   * Disconnect from the inverter
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await new Promise<void>(resolve => {
        this.client.close(() => resolve());
      });
      this.connected = false;
      console.log(`🔌 Modbus disconnected from ${this.host}`);
    }
  }

  enableHealthCheck(logger: LoggerLike, intervalMs = 15 * 60 * 1000): void {
    this.healthLogger = logger;
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }
    const runCheck = async () => {
      try {
        await this.runHealthCheck();
      } catch (error) {
        this.healthLogger?.warn?.('Modbus health check failed', {
          error: formatUnknownError(error),
        });
      }
    };
    // Trigger immediately on enable
    void runCheck();
    this.healthInterval = setInterval(runCheck, Math.max(intervalMs, 60_000));
  }

  disableHealthCheck(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
    this.healthLogger = undefined;
  }

  setModel(modelId?: string): void {
    const normalized = modelId?.trim();
    if (
      normalized &&
      this.modelId &&
      normalized.toUpperCase() === this.modelId.toUpperCase()
    ) {
      return;
    }

    const state = initializeRegisterMap(
      normalized ? normalized.toUpperCase() : undefined,
      this.inverterType,
    );
    this.registerMap = state.map;
    this.modelId =
      state.model ?? (normalized ? normalized.toUpperCase() : undefined);
  }

  setInverterType(inverterType?: InverterType): void {
    const normalized = inverterType
      ? (inverterType.toUpperCase() as InverterType)
      : undefined;
    if (normalized === this.inverterType) {
      return;
    }
    this.inverterType = normalized;
    const state = initializeRegisterMap(this.modelId, this.inverterType);
    this.registerMap = state.map;
  }

  private getMetricCategory(metricId: string): string | null {
    const definition = metricDefinitionMap.get(metricId);
    if (!definition) {
      return null;
    }
    return definition.category ?? null;
  }

  private isValueWithinLimits(metricId: string, value: number): boolean {
    if (!Number.isFinite(value)) {
      return false;
    }
    const category = this.getMetricCategory(metricId);
    if (!category) {
      return true;
    }
    const limits = HEALTH_CATEGORY_LIMITS[category];
    if (!limits) {
      return true;
    }
    return value >= limits.min && value <= limits.max;
  }

  private async runHealthCheck(): Promise<void> {
    if (!this.connected) {
      return;
    }
    for (const metricId of HEALTH_CHECK_METRICS) {
      try {
        const value = await this.readMetricValue(metricId);
        const category = this.getMetricCategory(metricId);
        const limits = category ? HEALTH_CATEGORY_LIMITS[category] : undefined;
        if (!this.isValueWithinLimits(metricId, value)) {
          this.healthLogger?.warn?.(
            `Metric ${metricId} outside expected bounds`,
            {value, limits, category},
          );
        } else {
          this.healthLogger?.debug?.(`Metric ${metricId} health check OK`, {
            value,
            category,
          });
        }
      } catch (error) {
        this.healthLogger?.warn?.(
          `Health check read failed for metric ${metricId}`,
          {error: formatUnknownError(error)},
        );
      }
    }
  }

  /**
   * Read meter power from register 5600
   * @returns Power in Watts (INT16; negative = export)
   */
  private async readMeterPower(): Promise<number> {
    return this.readMetricValue('meter_power');
  }

  /**
   * Read forward active energy (grid import) from register 5098
   * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
   */
  private async readImportEnergy(): Promise<number> {
    return this.readMetricValue('grid_import_energy');
  }

  /**
   * Read reverse active energy (grid export) from register 5094
   * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
   */
  private async readExportEnergy(): Promise<number> {
    return this.readMetricValue('grid_export_energy');
  }

  private async readMetricValue(metricId: string): Promise<number> {
    const definition = metricDefinitionMap.get(metricId);
    if (!definition || !definition.read) {
      throw new Error(`No read definition available for metric '${metricId}'`);
    }

    const register = this.registerMap[metricId];
    if (register === undefined) {
      throw new Error(`Register not configured for metric '${metricId}'`);
    }

    const readConfig = definition.read;
    const words = Math.max(1, readConfig.words ?? 1);
    const scale = readConfig.scale ?? 1;

    let result: {data: number[]};
    try {
      if (readConfig.function === 'holding') {
        result = await this.client.readHoldingRegisters(register, words);
      } else {
        result = await this.client.readInputRegisters(register, words);
      }
    } catch (error) {
      throw new Error(
        `Modbus read failed for metric '${metricId}' at register ${register} (fn=${readConfig.function}, words=${words}): ${formatUnknownError(error)}`,
      );
    }

    const data = result.data;
    if (!Array.isArray(data) || data.length < words) {
      throw new Error(`Invalid response while reading metric '${metricId}'`);
    }

    // Prepare big-endian and little-endian byte buffers for flexible parsing.
    const byteLength = words * 2;
    const bufferBE = Buffer.alloc(byteLength);
    const bufferLE = Buffer.alloc(byteLength);
    for (let i = 0; i < words; i++) {
      bufferBE.writeUInt16BE(data[i], i * 2);
      bufferLE.writeUInt16LE(data[i], i * 2);
    }

    switch (readConfig.type) {
      case 'int16': {
        let raw = bufferBE.readInt16BE(0);
        if (raw > 0x7fff) {
          raw -= 0x10000;
        }
        return raw * scale;
      }
      case 'uint16':
        return bufferBE.readUInt16BE(0) * scale;
      case 'uint32le': {
        const raw = bufferLE.readUInt32LE(0);
        return raw * scale;
      }
      case 'uint32': {
        const raw = bufferBE.readUInt32BE(0);
        return raw * scale;
      }
      case 'int32': {
        const raw = bufferBE.readInt32BE(0);
        return raw * scale;
      }
      case 'float32': {
        const raw = bufferBE.readFloatBE(0);
        return raw * scale;
      }
      case 'uint64': {
        const raw = Number(bufferBE.readBigUInt64BE(0));
        return raw * scale;
      }
      default:
        throw new Error(
          `Unsupported read type '${readConfig.type}' for metric '${metricId}'`,
        );
    }
  }

  /**
   * Read all meter data in one call
   */
  async readMeterData(): Promise<MeterData> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
      try {
        if (!this.connected) {
          await this.connect();
        }

        const power = await this.readMeterPower();
        const importEnergy = await this.readImportEnergy();
        const exportEnergy = await this.readExportEnergy();

        return {
          power,
          importEnergy,
          exportEnergy,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error;
        const errorMsg = formatUnknownError(error);
        console.error(
          `Error reading meter data (attempt ${attempt}/${MAX_READ_ATTEMPTS}): ${errorMsg}`,
        );
        if (error instanceof Error && error.stack) {
          console.debug(error.stack);
        }
        await this.disconnect();
        if (attempt < MAX_READ_ATTEMPTS) {
          await delay(RETRY_BACKOFF_MS);
        }
      }
    }

    this.connected = false;
    throw lastError instanceof Error
      ? lastError
      : new Error('Unknown Modbus read failure');
  }

  /**
   * Check if connection is alive
   */
  isConnected(): boolean {
    return this.connected;
  }
}
