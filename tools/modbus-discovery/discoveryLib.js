const DEFAULT_METER_TOLERANCE = 75; // Watts
const DEFAULT_ENERGY_TOLERANCE = 2; // kWh
const DEFAULT_CONFIRMATION_READS = 2;
const DEFAULT_ENERGY_TOLERANCE_RATIO = 0.01; // 1%
const METER_CANDIDATE_MAX_ABSOLUTE = 40000; // W (safety clamp)
const METER_CANDIDATE_MIN_SAMPLES = 4;
const METER_CANDIDATE_EXTRA_READS = 4;
const METER_CANDIDATE_TOLERANCE_MIN = 1000; // W
const METER_CANDIDATE_TOLERANCE_FRACTION = 0.2; // 20%

/**
 * Evaluate how closely a current value matches the expected value.
 * Returns true if the values are within the provided tolerance.
 * @param {number} value - The candidate value read from the inverter.
 * @param {number|null} expected - User supplied expected value.
 * @param {number} tolerance - Allowed absolute difference.
 * @returns {boolean}
 */
function isWithinTolerance(value, expected, tolerance) {
  if (typeof expected !== 'number' || Number.isNaN(expected)) {
    return false;
  }
  return Math.abs(value - expected) <= tolerance;
}

/**
 * Interpret a pair of Modbus registers as possible energy readings.
 * Returns an array of candidate values (kWh) derived from little/big endian.
 * @param {number} low
 * @param {number} high
 * @returns {Array<{value: number, encoding: string}>}
 */
function interpretEnergyCandidates(low, high) {
  const littleEndian = ((high << 16) | low) >>> 0;
  const bigEndian = ((low << 16) | high) >>> 0;
  return [
    {value: littleEndian / 10, encoding: 'uint32_le_x0.1'},
    {value: bigEndian / 10, encoding: 'uint32_be_x0.1'},
  ];
}

/**
 * Convert a register value into a signed 16-bit integer.
 * @param {number} value
 * @returns {number}
 */
function toInt16(value) {
  return value > 0x7fff ? value - 0x10000 : value;
}

/**
 * Determine which metrics (if any) match the supplied register reading.
 * @param {number[]} words - Array returned from readInputRegisters.
 * @param {{meterPower: number|null, importEnergy: number|null, exportEnergy: number|null}} expected
 * @param {{meterTolerance?: number, energyTolerance?: number}} tolerances
 * @returns {Array<{metric: string, value: number, encoding?: string, difference: number}>}
 */
function evaluateRegister(words, expected, tolerances = {}) {
  const [low, high = 0] = words;
  const {
    meterTolerance = DEFAULT_METER_TOLERANCE,
    energyTolerance = DEFAULT_ENERGY_TOLERANCE,
    energyToleranceRatio = 0,
  } = tolerances;

  const matches = [];

  if (
    typeof expected.meterPower === 'number' &&
    !Number.isNaN(expected.meterPower)
  ) {
    const signedLow = toInt16(low);
    let candidateValue = low;
    let difference = Math.abs(low - expected.meterPower);

    if (isWithinTolerance(low, expected.meterPower, meterTolerance)) {
      matches.push({
        metric: 'meter_power',
        value: low,
        difference: Math.abs(low - expected.meterPower),
      });
    } else if (
      isWithinTolerance(signedLow, expected.meterPower, meterTolerance)
    ) {
      candidateValue = signedLow;
      difference = Math.abs(signedLow - expected.meterPower);
      matches.push({
        metric: 'meter_power',
        value: candidateValue,
        encoding: 'int16',
        difference,
      });
    }
  }

  const energyExpected = [
    {metric: 'grid_import_energy', expected: expected.importEnergy},
    {metric: 'grid_export_energy', expected: expected.exportEnergy},
  ];

  const candidates = interpretEnergyCandidates(low, high);
  for (const candidate of candidates) {
    for (const {metric, expected: expectedValue} of energyExpected) {
      if (typeof expectedValue !== 'number' || Number.isNaN(expectedValue)) {
        continue;
      }
      const effectiveTolerance = Math.max(
        energyTolerance,
        Math.abs(expectedValue) * energyToleranceRatio,
      );
      if (
        isWithinTolerance(candidate.value, expectedValue, effectiveTolerance)
      ) {
        matches.push({
          metric,
          value: candidate.value,
          encoding: candidate.encoding,
          difference: Math.abs(candidate.value - expectedValue),
        });
      }
    }
  }

  return matches;
}

/**
 * Confirm that a register consistently matches the expected value by
 * performing additional reads and re-validating tolerance.
 * @param {object} client - Modbus client with readInputRegisters.
 * @param {number} register - Register address to verify.
 * @param {string} metric - Metric identifier.
 * @param {{meterPower: number|null, importEnergy: number|null, exportEnergy: number|null}} expected
 * @param {{meterTolerance?: number, energyTolerance?: number}} tolerances
 * @param {number} confirmationReads
 * @returns {Promise<boolean>}
 */
async function confirmMatch(
  client,
  register,
  metric,
  expected,
  tolerances,
  confirmationReads,
) {
  for (let i = 0; i < confirmationReads; i++) {
    const result = await client.readInputRegisters(register, 2);
    const matches = evaluateRegister(result.data, expected, tolerances);
    if (!matches.some(match => match.metric === metric)) {
      return false;
    }
  }
  return true;
}

/**
 * Scan a register range looking for matches to expected values.
 * Returns an object keyed by metric with details about the discovered register.
 * @param {object} client - Modbus client with readInputRegisters.
 * @param {{
 *   scanStart: number,
 *   scanEnd: number,
 *   expected: {meterPower: number|null, importEnergy: number|null, exportEnergy: number|null},
 *   meterTolerance?: number,
 *   energyTolerance?: number,
 *   confirmationReads?: number,
 *   stopWhenFound?: boolean
 * }} options
 * @returns {Promise<{
 *   matches: Record<string, {register: number, value: number, encoding?: string, difference: number}>,
 *   meterCandidates: Array<{
 *     register: number,
 *     samples: number,
 *     average: number,
 *     min: number,
 *     max: number,
 *     range: number,
 *     stddev: number,
 *     diff: number,
 *     signChanges: number,
 *     encoding: string
 *   }>
 * }>}
 */
async function scanRegisters(client, options) {
  const {
    scanStart,
    scanEnd,
    expected,
    meterTolerance = DEFAULT_METER_TOLERANCE,
    energyTolerance = DEFAULT_ENERGY_TOLERANCE,
    energyToleranceRatio = DEFAULT_ENERGY_TOLERANCE_RATIO,
    confirmationReads = DEFAULT_CONFIRMATION_READS,
    stopWhenFound = true,
  } = options;

  if (scanStart > scanEnd) {
    throw new Error(
      `scanStart (${scanStart}) cannot exceed scanEnd (${scanEnd}).`,
    );
  }

  const tolerances = {meterTolerance, energyTolerance, energyToleranceRatio};
  const results = {};
  const meterCandidatesMap = new Map();
  const shouldEvaluateMeterCandidates =
    typeof expected.meterPower === 'number' &&
    !Number.isNaN(expected.meterPower);
  const meterCandidateTolerance = shouldEvaluateMeterCandidates
    ? Math.max(
        meterTolerance * 10,
        Math.abs(expected.meterPower) * METER_CANDIDATE_TOLERANCE_FRACTION,
        METER_CANDIDATE_TOLERANCE_MIN,
      )
    : 0;

  function recordMeterCandidate(register, value) {
    const previous = meterCandidatesMap.get(register);
    const samples = previous ? previous.samples + 1 : 1;
    const sum = (previous ? previous.sum : 0) + value;
    const sumSquares = (previous ? previous.sumSquares : 0) + value * value;
    const min = previous ? Math.min(previous.min, value) : value;
    const max = previous ? Math.max(previous.max, value) : value;
    const signChanges =
      previous && previous.lastValue !== null
        ? Math.sign(previous.lastValue) !== Math.sign(value) && value !== 0
          ? previous.signChanges + 1
          : previous.signChanges
        : 0;

    meterCandidatesMap.set(register, {
      register,
      samples,
      sum,
      sumSquares,
      min,
      max,
      lastValue: value,
      signChanges,
    });
  }

  for (let register = scanStart; register <= scanEnd; register++) {
    let readResult;
    try {
      readResult = await client.readInputRegisters(register, 2);
    } catch (error) {
      continue;
    }

    if (!readResult || !Array.isArray(readResult.data)) {
      continue;
    }

    if (shouldEvaluateMeterCandidates) {
      const signedLow = toInt16(readResult.data[0]);
      const highWord = readResult.data[1];
      const looksLikeMeterHighWord = highWord === 0 || highWord === 0xffff;
      if (
        Math.abs(signedLow) <= METER_CANDIDATE_MAX_ABSOLUTE &&
        Math.abs(signedLow - expected.meterPower) <= meterCandidateTolerance &&
        looksLikeMeterHighWord
      ) {
        recordMeterCandidate(register, signedLow);
      }
    }

    const matches = evaluateRegister(readResult.data, expected, tolerances);

    for (const match of matches) {
      if (results[match.metric]) {
        continue;
      }
      const confirmed =
        confirmationReads > 0
          ? await confirmMatch(
              client,
              register,
              match.metric,
              expected,
              tolerances,
              confirmationReads,
            )
          : true;
      if (confirmed) {
        results[match.metric] = {
          register,
          value: match.value,
          encoding: match.encoding,
          difference: match.difference,
        };
      }
    }

    if (stopWhenFound && Object.keys(results).length === 3) {
      break;
    }
  }

  if (shouldEvaluateMeterCandidates) {
    for (const register of meterCandidatesMap.keys()) {
      let extraReads = 0;
      // Gather a few additional samples for better statistics.
      while (extraReads < METER_CANDIDATE_EXTRA_READS) {
        const entry = meterCandidatesMap.get(register);
        if (!entry || entry.samples >= METER_CANDIDATE_MIN_SAMPLES) {
          break;
        }
        let additional;
        try {
          additional = await client.readInputRegisters(register, 2);
        } catch (error) {
          break;
        }
        if (!additional || !Array.isArray(additional.data)) {
          break;
        }
        const signedLow = toInt16(additional.data[0]);
        const highWord = additional.data[1];
        const looksLikeMeterHighWord = highWord === 0 || highWord === 0xffff;
        if (
          Math.abs(signedLow) > METER_CANDIDATE_MAX_ABSOLUTE ||
          Math.abs(signedLow - expected.meterPower) > meterCandidateTolerance ||
          !looksLikeMeterHighWord
        ) {
          break;
        }
        recordMeterCandidate(register, signedLow);
        extraReads += 1;
      }
    }
  }

  const meterCandidates = [];
  if (shouldEvaluateMeterCandidates) {
    for (const entry of meterCandidatesMap.values()) {
      if (entry.samples < METER_CANDIDATE_MIN_SAMPLES) {
        continue;
      }
      const average = entry.sum / entry.samples;
      const variance = entry.sumSquares / entry.samples - average * average;
      const stddev = Math.sqrt(Math.max(variance, 0));
      const diff = Math.abs(average - expected.meterPower);
      meterCandidates.push({
        register: entry.register,
        samples: entry.samples,
        average,
        min: entry.min,
        max: entry.max,
        range: entry.max - entry.min,
        stddev,
        diff,
        signChanges: entry.signChanges,
        encoding: 'int16',
      });
    }
  }

  return {matches: results, meterCandidates};
}

module.exports = {
  confirmMatch,
  evaluateRegister,
  interpretEnergyCandidates,
  isWithinTolerance,
  toInt16,
  scanRegisters,
  DEFAULT_METER_TOLERANCE,
  DEFAULT_ENERGY_TOLERANCE,
  DEFAULT_CONFIRMATION_READS,
  DEFAULT_ENERGY_TOLERANCE_RATIO,
};
