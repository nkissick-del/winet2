const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRegister,
  scanRegisters,
  DEFAULT_METER_TOLERANCE,
  DEFAULT_ENERGY_TOLERANCE,
  DEFAULT_ENERGY_TOLERANCE_RATIO,
  toInt16,
} = require('../discoveryLib');

function toUint16(value) {
  return value < 0 ? (0x10000 + value) & 0xffff : value & 0xffff;
}

class StubModbusClient {
  constructor(responseMap) {
    this.responseMap = responseMap;
    this.callCount = {};
  }

  async readInputRegisters(register, length) {
    if (length !== 2) {
      throw new Error('Stub client only supports length 2');
    }
    const entries = this.responseMap[register];
    if (!entries || entries.length === 0) {
      throw new Error(`Register ${register} not available in stub`);
    }
    const currentIndex =
      this.callCount[register] === undefined ? 0 : this.callCount[register];
    const dataIndex = Math.min(currentIndex, entries.length - 1);
    this.callCount[register] = currentIndex + 1;
    return {data: entries[dataIndex]};
  }
}

test('evaluateRegister detects meter power within tolerance', () => {
  const expected = {meterPower: 5120, importEnergy: null, exportEnergy: null};
  const matches = evaluateRegister([5105, 0], expected, {meterTolerance: 30});

  const meterMatch = matches.find(match => match.metric === 'meter_power');
  assert.ok(meterMatch, 'meter_power match should be present');
  assert.equal(meterMatch.value, 5105);
});

test('evaluateRegister handles big-endian energy representation', () => {
  const expected = {meterPower: null, importEnergy: 1234.5, exportEnergy: null};
  const matches = evaluateRegister([0x0000, 0x3039], expected, {
    energyTolerance: 1,
  });

  const importMatch = matches.find(
    match => match.metric === 'grid_import_energy',
  );
  assert.ok(importMatch, 'grid_import_energy match should be present');
  assert.equal(importMatch.encoding, 'uint32_be_x0.1');
});

test('scanRegisters finds all metrics across range', async () => {
  const stubClient = new StubModbusClient({
    5599: [[0, 0]],
    5600: [[5120, 0]],
    5094: [[0x223d, 0x0000]], // 876.5 kWh (little endian)
    5098: [[0x0000, 0x3039]], // 1234.5 kWh (big endian)
  });

  const result = await scanRegisters(stubClient, {
    scanStart: 5094,
    scanEnd: 5600,
    expected: {
      meterPower: 5125,
      importEnergy: 1234.5,
      exportEnergy: 876.5,
    },
    meterTolerance: DEFAULT_METER_TOLERANCE,
    energyTolerance: DEFAULT_ENERGY_TOLERANCE,
    confirmationReads: 0,
    energyToleranceRatio: 0,
  });

  const {matches} = result;
  assert.equal(matches.meter_power.register, 5600);
  assert.equal(matches.grid_import_energy.register, 5098);
  assert.equal(matches.grid_export_energy.register, 5094);
});

test('scanRegisters drops match if confirmation fails', async () => {
  const stubClient = new StubModbusClient({
    5600: [
      [5120, 0], // initial match
      [4900, 0], // confirmation fails
    ],
  });

  const result = await scanRegisters(stubClient, {
    scanStart: 5600,
    scanEnd: 5600,
    expected: {
      meterPower: 5120,
      importEnergy: null,
      exportEnergy: null,
    },
    meterTolerance: 30,
    energyTolerance: DEFAULT_ENERGY_TOLERANCE,
    confirmationReads: 2,
    energyToleranceRatio: 0,
  });

  const {matches} = result;
  assert.ok(
    !matches.meter_power,
    'meter_power should be omitted when confirmation fails',
  );
});

test('evaluateRegister uses relative energy tolerance when values are large', () => {
  const expected = {meterPower: null, importEnergy: 11100, exportEnergy: null};
  const matches = evaluateRegister(
    [0x0000, 0x0315], // 789 kWh big-endian -> should not match
    expected,
    {
      energyTolerance: 2,
      energyToleranceRatio: DEFAULT_ENERGY_TOLERANCE_RATIO,
    },
  );
  assert.equal(matches.length, 0);

  const nearValue = 11100 + 50; // within 1% tolerance
  const high = Math.floor(((nearValue * 10) >>> 16) & 0xffff);
  const low = Math.floor((nearValue * 10) & 0xffff);
  const matchesRelative = evaluateRegister([low, high], expected, {
    energyTolerance: 2,
    energyToleranceRatio: DEFAULT_ENERGY_TOLERANCE_RATIO,
  });
  assert.ok(
    matchesRelative.some(match => match.metric === 'grid_import_energy'),
    'Relative tolerance should allow match within 1%',
  );
});
test('evaluateRegister matches meter power when register stores int16 negative', () => {
  const expected = {meterPower: -4900, importEnergy: null, exportEnergy: null};
  const low = (0x10000 - 4900) & 0xffff;
  assert.equal(toInt16(low), -4900);
  const matches = evaluateRegister([low, 0], expected, {
    meterTolerance: 100,
  });
  const meterMatch = matches.find(match => match.metric === 'meter_power');
  assert.ok(meterMatch, 'meter_power match should be present for int16');
  assert.equal(meterMatch.value, -4900);
  assert.equal(meterMatch.encoding, 'int16');
});

test('scanRegisters surfaces meter power candidates with statistics', async () => {
  const stubClient = new StubModbusClient({
    5600: [
      [toUint16(-5200), 0],
      [toUint16(-5100), 0],
      [toUint16(-4800), 0],
      [toUint16(-5000), 0],
      [toUint16(-4950), 0],
    ],
  });

  const result = await scanRegisters(stubClient, {
    scanStart: 5600,
    scanEnd: 5600,
    expected: {
      meterPower: -4900,
      importEnergy: null,
      exportEnergy: null,
    },
    meterTolerance: DEFAULT_METER_TOLERANCE,
    energyTolerance: DEFAULT_ENERGY_TOLERANCE,
    confirmationReads: 0,
    energyToleranceRatio: 0,
  });

  assert.equal(result.matches.meter_power, undefined);
  assert.ok(result.meterCandidates.length > 0);
  const topCandidate = result.meterCandidates[0];
  assert.equal(topCandidate.register, 5600);
  assert.ok(topCandidate.samples >= 4);
  assert.ok(Math.abs(topCandidate.average - -5000) < 200);
});
