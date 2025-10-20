"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusReader = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("node:timers/promises");
const modbus_serial_1 = __importDefault(require("modbus-serial"));
const MODBUS_PORT = 502;
const SLAVE_ID = 1;
const READ_TIMEOUT = 10000; // 10 seconds
const MAX_READ_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 2000;
const METRIC_DEFINITION_PATH = path_1.default.resolve(process.cwd(), 'modbus-metric-definitions.json');
const REGISTER_FILE_PATH = path_1.default.resolve(process.cwd(), 'modbus-registers.json');
const REGISTER_DEFAULTS_PATH = path_1.default.resolve(process.cwd(), 'tools', 'modbus-discovery', 'modbus-register-defaults.json');
function formatUnknownError(error) {
    if (error instanceof Error) {
        const base = error.message || error.name;
        const details = error.code;
        return details ? `${base} (code: ${details})` : base;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function sanitizeKey(input) {
    return input
        .toLowerCase()
        .replace(/[\u2013\u2014]/g, ' ')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
let registerDefaultsCache = null;
function loadRegisterDefaults() {
    if (registerDefaultsCache) {
        return registerDefaultsCache;
    }
    try {
        if (fs_1.default.existsSync(REGISTER_DEFAULTS_PATH)) {
            const raw = fs_1.default.readFileSync(REGISTER_DEFAULTS_PATH, 'utf8');
            registerDefaultsCache = JSON.parse(raw);
            return registerDefaultsCache;
        }
    }
    catch (error) {
        console.warn(`Could not parse register defaults from ${REGISTER_DEFAULTS_PATH}: ${error.message}`);
    }
    registerDefaultsCache = {};
    return registerDefaultsCache;
}
function getRegisterDefaultsForType(inverterType) {
    if (!inverterType) {
        return [];
    }
    const defaults = loadRegisterDefaults();
    const perType = defaults.inverter_types?.[inverterType];
    return Array.isArray(perType?.registers) ? perType.registers : [];
}
const FALLBACK_REGISTER_MAP = {
    meter_power: 5600,
    grid_import_energy: 5098,
    grid_export_energy: 5094,
};
const METRIC_REGISTER_ALIASES = {
    STRING: {
        grid_import_energy: 'total_import_energy',
        grid_export_energy: 'total_export_energy',
    },
    HYBRID: {
        grid_import_energy: 'total_import_energy',
        grid_export_energy: 'total_export_energy',
    },
};
const HEALTH_CHECK_METRICS = [
    'meter_power',
    'grid_import_energy',
    'grid_export_energy',
];
const HEALTH_CATEGORY_LIMITS = {
    power: { min: -200000, max: 200000 },
    energy: { min: 0, max: 5e9 },
    temperature: { min: -50, max: 150 },
    percentage: { min: 0, max: 150 },
};
function loadMetricDefinitions() {
    try {
        if (fs_1.default.existsSync(METRIC_DEFINITION_PATH)) {
            const content = fs_1.default.readFileSync(METRIC_DEFINITION_PATH, 'utf8');
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed.metrics)) {
                return parsed.metrics;
            }
        }
    }
    catch (error) {
        console.warn(`Could not parse metric definitions from ${METRIC_DEFINITION_PATH}: ${error.message}`);
    }
    return [];
}
const metricDefinitions = loadMetricDefinitions();
const metricDefinitionMap = new Map(metricDefinitions.map(definition => [definition.id, definition]));
function deriveDefaultRegisterMap(modelId, inverterType) {
    const map = {};
    for (const definition of metricDefinitions) {
        const modelOverride = modelId
            ? definition.models?.[modelId]?.register
            : undefined;
        if (modelId && modelOverride === undefined) {
            continue;
        }
        const registerValue = modelOverride ??
            definition.default?.register ??
            FALLBACK_REGISTER_MAP[definition.id];
        if (typeof registerValue === 'number') {
            map[definition.id] = registerValue;
        }
    }
    for (const [metricId, registerValue] of Object.entries(FALLBACK_REGISTER_MAP)) {
        if (map[metricId] === undefined) {
            map[metricId] = registerValue;
        }
    }
    if (inverterType) {
        const metricsByAlias = METRIC_REGISTER_ALIASES[inverterType] ?? {};
        const registerDefaults = getRegisterDefaultsForType(inverterType);
        const registerLookup = new Map();
        for (const entry of registerDefaults) {
            const keys = new Set();
            keys.add(sanitizeKey(entry.id));
            keys.add(sanitizeKey(entry.name));
            for (const key of keys) {
                if (key) {
                    registerLookup.set(key, entry);
                }
            }
        }
        for (const definition of metricDefinitions) {
            const alias = (metricsByAlias && metricsByAlias[definition.id]) || undefined;
            const candidates = [
                alias,
                sanitizeKey(definition.name ?? ''),
                sanitizeKey(definition.id ?? ''),
            ].filter(Boolean);
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
function loadRegisterOverrides() {
    if (!fs_1.default.existsSync(REGISTER_FILE_PATH)) {
        return { map: {}, legacy: false, exists: false };
    }
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(REGISTER_FILE_PATH, 'utf8'));
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            if (raw.metrics && typeof raw.metrics === 'object') {
                const map = {};
                for (const [metricId, details] of Object.entries(raw.metrics)) {
                    if (details &&
                        typeof details === 'object' &&
                        typeof details.register === 'number') {
                        map[metricId] = details.register;
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
            const map = {};
            for (const [metricId, registerValue] of Object.entries(raw)) {
                if (typeof registerValue === 'number') {
                    map[metricId] = registerValue;
                }
            }
            return { map, legacy: true, exists: true };
        }
    }
    catch (error) {
        console.warn(`Could not parse modbus-registers.json, using defaults: ${error.message}`);
    }
    return { map: {}, legacy: false, exists: false };
}
function persistRegisterMap(map, modelId) {
    const payload = {
        version: 1,
        model: modelId,
        metrics: Object.fromEntries(Object.entries(map).map(([metricId, register]) => [metricId, { register }])),
    };
    try {
        fs_1.default.writeFileSync(REGISTER_FILE_PATH, JSON.stringify(payload, null, 2));
    }
    catch (error) {
        console.warn(`Failed to persist register map to ${REGISTER_FILE_PATH}: ${error.message}`);
    }
}
function initializeRegisterMap(modelId, inverterType) {
    const overrides = loadRegisterOverrides();
    const effectiveModel = modelId ?? overrides.model;
    const defaults = deriveDefaultRegisterMap(effectiveModel, inverterType);
    const merged = { ...defaults, ...overrides.map };
    const addedMetric = Object.keys(defaults).some(metricId => overrides.map[metricId] === undefined);
    const shouldPersist = !overrides.exists ||
        overrides.legacy ||
        addedMetric ||
        (effectiveModel !== overrides.model && effectiveModel !== undefined);
    if (shouldPersist) {
        persistRegisterMap(merged, effectiveModel);
    }
    return { map: merged, model: effectiveModel };
}
class ModbusReader {
    client;
    host;
    connected = false;
    registerMap;
    modelId;
    inverterType;
    healthLogger;
    healthInterval;
    constructor(host, options) {
        this.host = host;
        this.client = new modbus_serial_1.default();
        this.client.setTimeout(READ_TIMEOUT);
        this.inverterType = options?.inverterType;
        const state = initializeRegisterMap(options?.modelId, this.inverterType);
        this.registerMap = state.map;
        this.modelId = state.model;
    }
    /**
     * Connect to the inverter via Modbus TCP
     */
    async connect() {
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
        }
        catch (error) {
            console.error(`❌ Modbus connection failed: ${error}`);
            throw error;
        }
    }
    /**
     * Disconnect from the inverter
     */
    async disconnect() {
        if (this.connected) {
            await new Promise(resolve => {
                this.client.close(() => resolve());
            });
            this.connected = false;
            console.log(`🔌 Modbus disconnected from ${this.host}`);
        }
    }
    enableHealthCheck(logger, intervalMs = 15 * 60 * 1000) {
        this.healthLogger = logger;
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
        }
        const runCheck = async () => {
            try {
                await this.runHealthCheck();
            }
            catch (error) {
                this.healthLogger?.warn?.('Modbus health check failed', {
                    error: formatUnknownError(error),
                });
            }
        };
        // Trigger immediately on enable
        void runCheck();
        this.healthInterval = setInterval(runCheck, Math.max(intervalMs, 60_000));
    }
    disableHealthCheck() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = undefined;
        }
        this.healthLogger = undefined;
    }
    setModel(modelId) {
        const normalized = modelId?.trim();
        if (normalized &&
            this.modelId &&
            normalized.toUpperCase() === this.modelId.toUpperCase()) {
            return;
        }
        const state = initializeRegisterMap(normalized ? normalized.toUpperCase() : undefined, this.inverterType);
        this.registerMap = state.map;
        this.modelId =
            state.model ?? (normalized ? normalized.toUpperCase() : undefined);
    }
    setInverterType(inverterType) {
        const normalized = inverterType
            ? inverterType.toUpperCase()
            : undefined;
        if (normalized === this.inverterType) {
            return;
        }
        this.inverterType = normalized;
        const state = initializeRegisterMap(this.modelId, this.inverterType);
        this.registerMap = state.map;
    }
    getMetricCategory(metricId) {
        const definition = metricDefinitionMap.get(metricId);
        if (!definition) {
            return null;
        }
        return definition.category ?? null;
    }
    isValueWithinLimits(metricId, value) {
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
    async runHealthCheck() {
        if (!this.connected) {
            return;
        }
        for (const metricId of HEALTH_CHECK_METRICS) {
            try {
                const value = await this.readMetricValue(metricId);
                const category = this.getMetricCategory(metricId);
                const limits = category ? HEALTH_CATEGORY_LIMITS[category] : undefined;
                if (!this.isValueWithinLimits(metricId, value)) {
                    this.healthLogger?.warn?.(`Metric ${metricId} outside expected bounds`, { value, limits, category });
                }
                else {
                    this.healthLogger?.debug?.(`Metric ${metricId} health check OK`, {
                        value,
                        category,
                    });
                }
            }
            catch (error) {
                this.healthLogger?.warn?.(`Health check read failed for metric ${metricId}`, { error: formatUnknownError(error) });
            }
        }
    }
    /**
     * Read meter power from register 5600
     * @returns Power in Watts (INT16; negative = export)
     */
    async readMeterPower() {
        return this.readMetricValue('meter_power');
    }
    /**
     * Read forward active energy (grid import) from register 5098
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    async readImportEnergy() {
        return this.readMetricValue('grid_import_energy');
    }
    /**
     * Read reverse active energy (grid export) from register 5094
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    async readExportEnergy() {
        return this.readMetricValue('grid_export_energy');
    }
    async readMetricValue(metricId) {
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
        let result;
        try {
            if (readConfig.function === 'holding') {
                result = await this.client.readHoldingRegisters(register, words);
            }
            else {
                result = await this.client.readInputRegisters(register, words);
            }
        }
        catch (error) {
            throw new Error(`Modbus read failed for metric '${metricId}' at register ${register} (fn=${readConfig.function}, words=${words}): ${formatUnknownError(error)}`);
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
                throw new Error(`Unsupported read type '${readConfig.type}' for metric '${metricId}'`);
        }
    }
    /**
     * Read all meter data in one call
     */
    async readMeterData() {
        let lastError;
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
            }
            catch (error) {
                lastError = error;
                const errorMsg = formatUnknownError(error);
                console.error(`Error reading meter data (attempt ${attempt}/${MAX_READ_ATTEMPTS}): ${errorMsg}`);
                if (error instanceof Error && error.stack) {
                    console.debug(error.stack);
                }
                await this.disconnect();
                if (attempt < MAX_READ_ATTEMPTS) {
                    await (0, promises_1.setTimeout)(RETRY_BACKOFF_MS);
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
    isConnected() {
        return this.connected;
    }
}
exports.ModbusReader = ModbusReader;
//# sourceMappingURL=modbusReader.js.map