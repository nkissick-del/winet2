/* eslint-disable */
// Modbus Register Discovery CLI Tool
// Usage: node tools/modbus-discovery/discover.js

const ModbusRTU = require('modbus-serial');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  scanRegisters,
  DEFAULT_METER_TOLERANCE,
  DEFAULT_ENERGY_TOLERANCE,
  DEFAULT_ENERGY_TOLERANCE_RATIO,
} = require('./discoveryLib');

const DEFAULT_IP = '192.168.1.12';
const DEFAULT_PORT = 502;
const DEFAULT_SLAVE_ID = 1;
const ENERGY_TOLERANCE_RATIO = DEFAULT_ENERGY_TOLERANCE_RATIO;
const METRIC_DEFINITION_PATH = path.resolve(
  __dirname,
  '../../modbus-metric-definitions.json',
);

let metricDefinitions = [];
try {
  const definitionContent = fs.readFileSync(METRIC_DEFINITION_PATH, 'utf8');
  const parsedDefinitions = JSON.parse(definitionContent);
  if (Array.isArray(parsedDefinitions.metrics)) {
    metricDefinitions = parsedDefinitions.metrics;
  }
} catch (error) {
  console.warn(
    `Could not load metric definitions from ${METRIC_DEFINITION_PATH}. Continuing with limited discovery features.`,
  );
}

const CATEGORY_RANGES = {
  power: {min: -200000, max: 200000},
  energy: {min: 0, max: 5e9},
  voltage: {min: 50, max: 1000},
  current: {min: 0, max: 500},
  frequency: {min: 40, max: 70},
  temperature: {min: -40, max: 120},
  percentage: {min: 0, max: 120},
  resistance: {min: 0, max: 1e6},
  reactive_power: {min: -200000, max: 200000},
  reactive_energy: {min: 0, max: 5e9},
  apparent_power: {min: 0, max: 200000},
};

function getEnvOrDefault(key, fallback) {
  const value = process.env[key];
  return value === undefined ? fallback : value;
}

const DEFAULT_SCAN_START = Number.parseInt(
  getEnvOrDefault('MODBUS_SCAN_START', '5000'),
  10,
);
const DEFAULT_SCAN_END = Number.parseInt(
  getEnvOrDefault('MODBUS_SCAN_END', '5700'),
  10,
);

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise(resolve =>
    rl.question(question, answer => resolve(answer.trim())),
  );
}

async function askWithDefault(rl, question, defaultValue) {
  const answer = await ask(rl, question);
  if (answer === '') {
    return defaultValue;
  }
  return answer;
}

function parseIntBase10(value) {
  return Number.parseInt(value, 10);
}

function parseFloatSafe(value) {
  return Number.parseFloat(value);
}

async function askNumber(rl, question, defaultValue, parser = parseIntBase10) {
  let valid = false;
  let parsedValue = defaultValue;
  while (!valid) {
    const answer = await ask(rl, question);
    if (answer === '') {
      parsedValue = defaultValue;
      valid = true;
      continue;
    }
    const value = parser(answer);
    if (Number.isNaN(value)) {
      console.log('Please enter a valid number.');
    } else {
      parsedValue = value;
      valid = true;
    }
  }
  return parsedValue;
}

async function askOptionalNumber(rl, question, parser = parseFloatSafe) {
  let valid = false;
  let parsedValue = null;
  while (!valid) {
    const answer = await ask(rl, question);
    if (answer === '') {
      parsedValue = null;
      valid = true;
      continue;
    }
    const value = parser(answer);
    if (Number.isNaN(value)) {
      console.log('Please enter a valid number or press Enter to skip.');
    } else {
      parsedValue = value;
      valid = true;
    }
  }
  return parsedValue;
}

async function askOptionalString(rl, question) {
  const answer = await ask(rl, question);
  const trimmed = answer.trim();
  return trimmed === '' ? null : trimmed;
}

async function askYesNo(rl, question, defaultValue = false) {
  while (true) {
    const answer = (await ask(rl, question)).toLowerCase();
    if (answer === '') {
      return defaultValue;
    }
    if (answer === 'y' || answer === 'yes') {
      return true;
    }
    if (answer === 'n' || answer === 'no') {
      return false;
    }
    console.log("Please answer 'y' or 'n'.");
  }
}

function buildOutputMap(matches) {
  const mapping = {};
  for (const [metricId, details] of Object.entries(matches)) {
    if (details && typeof details.register === 'number') {
      mapping[metricId] = details.register;
    }
  }
  return mapping;
}

function convertDiscoveryInput(value, definition) {
  if (value === null || value === undefined) {
    return null;
  }

  const discovery = definition && definition.discovery;
  const inputUnit = discovery && discovery.input_unit;
  if (!inputUnit) {
    return value;
  }

  switch (inputUnit.toLowerCase()) {
    case 'kw':
      return Math.round(value * 1000);
    case 'mwh':
      return value * 1000;
    default:
      return value;
  }
}

function formatInputSummary(rawValue, definition) {
  if (rawValue === null || rawValue === undefined) {
    return 'n/a';
  }
  const discovery = definition && definition.discovery;
  const unit = discovery && discovery.input_unit;
  return unit ? `${rawValue} ${unit}` : String(rawValue);
}

function getMetricDefinition(metricId) {
  return metricDefinitions.find(definition => definition.id === metricId);
}

const OPTIONAL_PROMPTS = [
  {
    metricId: 'daily_power_yields',
    prompt: 'Yield today (kWh) [press Enter to skip]: ',
    convert: value => value,
  },
  {
    metricId: 'total_power_yields',
    prompt: 'Total yield (MWh) [press Enter to skip]: ',
    convert: value => value * 1000,
  },
  {
    metricId: 'total_output_energy',
    prompt: 'Total output energy (MWh) [press Enter to skip]: ',
    convert: value => value * 1000,
  },
  {
    metricId: 'mppt_1_voltage',
    prompt: 'MPPT1 voltage (V) [press Enter to skip]: ',
    convert: value => value,
  },
  {
    metricId: 'mppt_1_current',
    prompt: 'MPPT1 current (A) [press Enter to skip]: ',
    convert: value => value,
  },
];

const DEVICE_TYPE_LOOKUP = {
  21: 'SG50RS',
};

function getRegisterForModel(definition, modelId) {
  if (modelId) {
    const models = definition.models;
    if (models) {
      const modelDefinition = models[modelId];
      if (modelDefinition && typeof modelDefinition.register === 'number') {
        return modelDefinition.register;
      }
    }
  }
  if (definition.default && typeof definition.default.register === 'number') {
    return definition.default.register;
  }
  return undefined;
}

function decodeRegisterValue(data, readConfig) {
  const words = Math.max(1, readConfig.words !== undefined ? readConfig.words : 1);
  const byteLength = words * 2;
  const bufferBE = Buffer.alloc(byteLength);
  const bufferLE = Buffer.alloc(byteLength);
  for (let i = 0; i < words; i++) {
    const value = data[i] !== undefined ? data[i] : 0;
    bufferBE.writeUInt16BE(value & 0xffff, i * 2);
    bufferLE.writeUInt16LE(value & 0xffff, i * 2);
  }

  const scale = readConfig.scale !== undefined ? readConfig.scale : 1;
  switch (readConfig.type) {
    case 'int16':
      return bufferBE.readInt16BE(0) * scale;
    case 'uint16':
      return bufferBE.readUInt16BE(0) * scale;
    case 'int32':
      return bufferBE.readInt32BE(0) * scale;
    case 'uint32':
      return bufferBE.readUInt32BE(0) * scale;
    case 'uint32le':
      return bufferLE.readUInt32LE(0) * scale;
    case 'float32':
      return bufferBE.readFloatBE(0) * scale;
    case 'uint64':
      return Number(bufferBE.readBigUInt64BE(0)) * scale;
    default:
      throw new Error(`Unsupported read type '${readConfig.type}'`);
  }
}

async function readMetricSample(client, register, readConfig) {
  const words = Math.max(1, readConfig.words !== undefined ? readConfig.words : 1);
  let result;
  if (readConfig.function === 'holding') {
    result = await client.readHoldingRegisters(register, words);
  } else {
    result = await client.readInputRegisters(register, words);
  }
  if (!result || !Array.isArray(result.data)) {
    throw new Error('Invalid Modbus response');
  }
  const data = result.data;
  return decodeRegisterValue(data, readConfig);
}

function valueWithinCategory(definition, value) {
  if (!Number.isFinite(value)) {
    return false;
  }
  const category = definition.category;
  if (!category) {
    return value !== 0;
  }
  const range = CATEGORY_RANGES[category];
  if (!range) {
    return value !== 0;
  }
  if (category === 'energy' || category === 'reactive_energy') {
    return value >= range.min && value <= range.max;
  }
  return value >= range.min && value <= range.max;
}

function computeExpectedTolerance(definition, expectedValue) {
  const category = definition.category;
  if (!Number.isFinite(expectedValue)) {
    return 0;
  }
  switch (category) {
    case 'power':
      return Math.max(200, Math.abs(expectedValue) * 0.1);
    case 'energy':
      return Math.max(0.5, Math.abs(expectedValue) * 0.02);
    case 'voltage':
      return 5;
    case 'current':
      return Math.max(0.5, Math.abs(expectedValue) * 0.1);
    case 'frequency':
      return 0.2;
    case 'temperature':
      return 2;
    case 'percentage':
      return 2;
    default:
      return Math.max(1, Math.abs(expectedValue) * 0.1);
  }
}

async function discoverMetricsFromDefinitions(
  client,
  matches,
  inverterModel,
  expectedValues = {},
) {
  const discovered = {};
  for (const definition of metricDefinitions) {
    const metricId = definition.id;
    if (!definition.read) {
      continue;
    }
    if (matches[metricId]) {
      continue;
    }
    const register = getRegisterForModel(definition, inverterModel);
    if (typeof register !== 'number') {
      continue;
    }
    try {
      const value = await readMetricSample(client, register, definition.read);
      if (!valueWithinCategory(definition, value)) {
        continue;
      }
      const expectedValue = expectedValues[metricId];
      if (expectedValue !== undefined) {
        const tolerance = computeExpectedTolerance(definition, expectedValue);
        if (Math.abs(value - expectedValue) > tolerance) {
          continue;
        }
      }
      matches[metricId] = {
        register,
        value,
        encoding: definition.read.type,
        category: definition.category,
        difference: 0,
        auto: true,
      };
      discovered[metricId] = value;
      console.log(
        `Auto-mapped ${metricId} -> register ${register} (value ${value}${definition.unit ? ' ' + definition.unit : ''})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug(`Skipping metric ${metricId}: ${message}`);
    }
  }
  const total = Object.keys(discovered).length;
  if (total > 0) {
    console.log(`✔ Auto-mapped ${total} additional metrics from definitions.`);
  }
  return discovered;
}

async function detectInverterModel(inverterIp, port, slaveId) {
  const tempClient = new ModbusRTU();
  tempClient.setTimeout(5000);
  try {
    await tempClient.connectTCP(inverterIp, {port});
    tempClient.setID(slaveId);
    const deviceTypeRes = await tempClient.readInputRegisters(5000, 1);
    const deviceTypeData = deviceTypeRes.data;
    const deviceTypeCode = Array.isArray(deviceTypeData) ? deviceTypeData[0] : undefined;
    let detectedModel =
      typeof deviceTypeCode === 'number'
        ? DEVICE_TYPE_LOOKUP[deviceTypeCode] || null
        : null;
    let serial = null;
    try {
      const serialRes = await tempClient.readInputRegisters(4990, 10);
      if (Array.isArray(serialRes.data)) {
        const bytes = [];
        for (const word of serialRes.data) {
          const hi = (word >> 8) & 0xff;
          const lo = word & 0xff;
          if (hi) bytes.push(hi);
          if (lo) bytes.push(lo);
        }
        serial = Buffer.from(bytes).toString('ascii').replace(/\u0000/g, '').trim();
      }
    } catch (serialError) {
      // Ignore serial read issues; not critical.
    }
    if (detectedModel) {
      console.log(
        `Detected inverter model ${detectedModel} (device type ${deviceTypeCode}${
          serial ? `, serial ${serial}` : ''
        }).`,
      );
    } else if (typeof deviceTypeCode === 'number') {
      console.log(
        `Detected Sungrow device type code ${deviceTypeCode}, model not in lookup table.`,
      );
    }
    return {model: detectedModel, code: deviceTypeCode, serial};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not auto-detect inverter model: ${message}`);
    return {model: null};
  } finally {
    try {
      tempClient.close();
    } catch {
      // ignore close errors
    }
  }
}

async function runCli() {
  console.log('--- Sungrow Modbus Register Discovery ---');
  const rl = createInterface();

  let client;
  try {
    const inverterIp = await askWithDefault(
      rl,
      `Inverter IP (default ${DEFAULT_IP}): `,
      DEFAULT_IP,
    );
    const port = await askNumber(
      rl,
      `Modbus TCP port (default ${DEFAULT_PORT}): `,
      DEFAULT_PORT,
      parseIntBase10,
    );
    const slaveId = await askNumber(
      rl,
      `Slave ID (default ${DEFAULT_SLAVE_ID}): `,
      DEFAULT_SLAVE_ID,
      parseIntBase10,
    );
    const scanStart = await askNumber(
      rl,
      `Scan start register (default ${DEFAULT_SCAN_START}): `,
      DEFAULT_SCAN_START,
      parseIntBase10,
    );
    const scanEnd = await askNumber(
      rl,
      `Scan end register (default ${DEFAULT_SCAN_END}): `,
      DEFAULT_SCAN_END,
      parseIntBase10,
    );

    const detection = await detectInverterModel(inverterIp, port, slaveId);

    const inferredType =
      detection.model && detection.model.toUpperCase().includes('HYBRID')
        ? 2
        : 1;

    const inverterFamily = await askNumber(
      rl,
      'Select inverter type (1=String, 2=Hybrid): ',
      inferredType,
      value => {
        const parsed = parseIntBase10(String(value));
        if (parsed !== 1 && parsed !== 2) {
          throw new Error('invalid');
        }
        return parsed;
      },
    );

    const inverterModel = detection.model;
    const inverterType = inverterFamily === 2 ? 'HYBRID' : 'STRING';

    const meterDefinition = getMetricDefinition('meter_power');
    const importDefinition = getMetricDefinition('grid_import_energy');
    const exportDefinition = getMetricDefinition('grid_export_energy');

    const autoMode = await askYesNo(
      rl,
      'Use automatic discovery without manual reference values? (y/N): ',
      false,
    );

    const expectedValues = {};

    let meterPowerInput = null;
    let importEnergyInput = null;
    let exportEnergyInput = null;

    if (!autoMode) {
      const meterPrompt =
        meterDefinition &&
        meterDefinition.discovery &&
        meterDefinition.discovery.prompt !== undefined
          ? meterDefinition.discovery.prompt
          : null;
      meterPowerInput = meterPrompt
        ? await askOptionalNumber(rl, meterPrompt, parseFloatSafe)
        : null;

      const importPrompt =
        importDefinition &&
        importDefinition.discovery &&
        importDefinition.discovery.prompt !== undefined
          ? importDefinition.discovery.prompt
          : null;
      importEnergyInput = importPrompt
        ? await askOptionalNumber(rl, importPrompt, parseFloatSafe)
        : null;

      const exportPrompt =
        exportDefinition &&
        exportDefinition.discovery &&
        exportDefinition.discovery.prompt !== undefined
          ? exportDefinition.discovery.prompt
          : null;
      exportEnergyInput = exportPrompt
        ? await askOptionalNumber(rl, exportPrompt, parseFloatSafe)
        : null;
    }

    const meterPower = convertDiscoveryInput(meterPowerInput, meterDefinition);
    const importEnergy = convertDiscoveryInput(importEnergyInput, importDefinition);
    const exportEnergy = convertDiscoveryInput(exportEnergyInput, exportDefinition);

    if (meterPower !== null) {
      expectedValues.meter_power = meterPower;
    }
    if (importEnergy !== null) {
      expectedValues.grid_import_energy = importEnergy;
    }
    if (exportEnergy !== null) {
      expectedValues.grid_export_energy = exportEnergy;
    }

    if (!autoMode) {
      for (const entry of OPTIONAL_PROMPTS) {
        const definition = getMetricDefinition(entry.metricId);
        if (!definition) {
          continue;
        }
        const rawValue = await askOptionalNumber(rl, entry.prompt, parseFloatSafe);
        if (rawValue === null) {
          continue;
        }
        expectedValues[entry.metricId] = entry.convert(rawValue);
      }
    }

    if (inverterModel) {
      console.log(`Using inverter model: ${inverterModel}`);
    }
    if (autoMode) {
      console.log('Automatic mode enabled: skipping manual reference prompts.');
    }
    if (meterPower !== null) {
      console.log(
        `Using Meter Active Power ≈ ${meterPower} W (${formatInputSummary(
          meterPowerInput,
          meterDefinition,
        )})`,
      );
    }
    if (importEnergy !== null) {
      console.log(
        `Using Forward Active Energy ≈ ${importEnergy} kWh (${formatInputSummary(
          importEnergyInput,
          importDefinition,
        )})`,
      );
    }
    if (exportEnergy !== null) {
      console.log(
        `Using Reverse Active Energy ≈ ${exportEnergy} kWh (${formatInputSummary(
          exportEnergyInput,
          exportDefinition,
        )})`,
      );
    }

    client = new ModbusRTU();
    client.setTimeout(5000);

    console.log(`Connecting to ${inverterIp}:${port} (slave ${slaveId})...`);
    await client.connectTCP(inverterIp, {port});
    client.setID(slaveId);

    console.log(
      `Scanning registers ${scanStart} to ${scanEnd}... (tolerances ${DEFAULT_METER_TOLERANCE}W / ${DEFAULT_ENERGY_TOLERANCE}kWh min, ${ENERGY_TOLERANCE_RATIO * 100}% relative)`,
    );

    const scanResult = await scanRegisters(client, {
      scanStart,
      scanEnd,
      expected: {
        meterPower,
        importEnergy,
        exportEnergy,
      },
      energyToleranceRatio: ENERGY_TOLERANCE_RATIO,
    });

    const {matches, meterCandidates = []} = scanResult;

    const usedRegisters = new Set(
      Object.values(matches)
        .filter(Boolean)
        .map(entry => entry.register),
    );
    const filteredMeterCandidates = meterCandidates.filter(
      candidate => !usedRegisters.has(candidate.register),
    );

    if (!matches.meter_power && filteredMeterCandidates.length > 0) {
      console.log('Potential Meter Active Power candidates:');
      const sortedCandidates = filteredMeterCandidates
        .slice()
        .sort((a, b) => {
          const diffA = Number.isFinite(a.diff) ? a.diff : Number.POSITIVE_INFINITY;
          const diffB = Number.isFinite(b.diff) ? b.diff : Number.POSITIVE_INFINITY;
          if (diffA === diffB) {
            return a.range - b.range;
          }
          return diffA - diffB;
        });
      const topCandidates = sortedCandidates.slice(0, 5);
      for (const candidate of topCandidates) {
        const diffText = Number.isFinite(candidate.diff)
          ? `${candidate.diff.toFixed(1)} W`
          : 'n/a';
        console.log(
          `- Register ${candidate.register}: avg ${candidate.average.toFixed(
            1,
          )} W (min ${candidate.min.toFixed(1)}, max ${candidate.max.toFixed(
            1,
          )}, samples ${candidate.samples}, sign changes ${candidate.signChanges}, diff ${diffText})`,
        );
      }
      const topCandidate = sortedCandidates[0];
      const suggestedRegister = topCandidate ? topCandidate.register : undefined;
      const suggestionText = suggestedRegister
        ? ` [suggested ${suggestedRegister}]`
        : '';
      const answer = await ask(
        rl,
        `Enter register to use as Meter Active Power${suggestionText} (press Enter to skip): `,
      );
      const trimmed = answer.trim();
      const chosenRegister =
        trimmed === '' && suggestedRegister !== undefined
          ? suggestedRegister
          : trimmed === ''
          ? undefined
          : Number.parseInt(trimmed, 10);
      if (
        chosenRegister !== undefined &&
        !Number.isNaN(chosenRegister)
      ) {
        const knownCandidate =
          sortedCandidates.find(candidate => candidate.register === chosenRegister) ||
          null;
        const chosenCandidate = knownCandidate
          ? {
              register: knownCandidate.register,
              value: knownCandidate.average,
              encoding: knownCandidate.encoding,
              difference: knownCandidate.diff,
            }
          : {
              register: chosenRegister,
              value:
                filteredMeterCandidates.length > 0
                  ? filteredMeterCandidates[0].average
                  : 0,
              encoding: 'int16',
              difference: topCandidate ? topCandidate.diff : 0,
            };
        matches.meter_power = {
          register: chosenCandidate.register,
          value: chosenCandidate.value,
          encoding: chosenCandidate.encoding,
          difference: chosenCandidate.difference,
        };
        console.log(
          `Meter Active Power mapped to register ${chosenCandidate.register}.`,
        );
      }
    }

    await discoverMetricsFromDefinitions(
      client,
      matches,
      inverterModel,
      expectedValues,
    );

    const mismatched = [];
    for (const [metricId, details] of Object.entries(matches)) {
      const definition = getMetricDefinition(metricId);
      if (!definition || !definition.read) {
        continue;
      }
      const catalogRegister = getRegisterForModel(definition, inverterModel);
      if (
        typeof catalogRegister === 'number' &&
        typeof details.register === 'number' &&
        catalogRegister !== details.register
      ) {
        mismatched.push({metricId, details, definition, catalogRegister});
      }
    }

    for (const mismatch of mismatched) {
      const keep = await askYesNo(
        rl,
        `Discovered ${mismatch.metricId} at register ${mismatch.details.register}, but catalog suggests ${mismatch.catalogRegister}. Keep discovered value? (y/N): `,
        false,
      );
      if (!keep) {
        try {
          const value = await readMetricSample(
            client,
            mismatch.catalogRegister,
            mismatch.definition.read,
          );
          matches[mismatch.metricId] = {
            register: mismatch.catalogRegister,
            value,
            encoding: mismatch.definition.read.type,
            category: mismatch.definition.category,
            difference: 0,
            auto: true,
          };
          console.log(
            `Reverted ${mismatch.metricId} to catalog register ${mismatch.catalogRegister} (value ${value}${mismatch.definition.unit ? ' ' + mismatch.definition.unit : ''}).`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `Could not read catalog register ${mismatch.catalogRegister} for ${mismatch.metricId}: ${message}. Keeping discovered value ${mismatch.details.register}.`,
          );
        }
      }
    }

    const output = buildOutputMap(matches);

    if (Object.keys(output).length > 0) {
      const structuredOutput = {
        version: 1,
        model: inverterType,
        metrics: Object.fromEntries(
          Object.entries(output).map(([metricId, register]) => [
            metricId,
            {register},
          ]),
        ),
      };
      fs.writeFileSync(
        'modbus-registers.json',
        JSON.stringify(structuredOutput, null, 2),
      );
      console.log(
        'Discovered register mapping written to modbus-registers.json:',
      );
      console.log(JSON.stringify(matches, null, 2));
      if (filteredMeterCandidates.length > 0) {
        console.log('Meter candidate statistics:');
        console.log(
          JSON.stringify(
            filteredMeterCandidates.slice(0, 5).map(candidate => ({
              register: candidate.register,
              average: candidate.average,
              min: candidate.min,
              max: candidate.max,
              samples: candidate.samples,
              signChanges: candidate.signChanges,
              diff: candidate.diff,
            })),
            null,
            2,
          ),
        );
      }
    } else {
      console.log(
        'No likely registers found. Try expanding the scan range or update your expected values.',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Discovery failed: ${message}`);
  } finally {
    rl.close();
    if (client) {
      try {
        client.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  runCli,
};
