/**
 * Build a consolidated Modbus metric catalog from the generated
 * MQTT metadata file. Groups metrics by metric_id and aggregates
 * topics, units, examples, and discovery hints so downstream tooling
 * can reason about each metric at the logical level rather than per-topic.
 *
 * Usage: node tools/modbus-discovery/buildMetricCatalog.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.resolve(__dirname, 'sungrow_mqtt_metadata.json');
const OUTPUT_PATH = path.resolve(__dirname, 'modbus-metric-catalog.json');

function loadMetadata() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Metadata file not found: ${INPUT_PATH}`);
  }
  const file = fs.readFileSync(INPUT_PATH, 'utf8');
  return JSON.parse(file);
}

function uniqueStrings(arr, max = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of arr) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
      if (result.length >= max) break;
    }
  }
  return result;
}

function aggregateMetrics(metadata) {
  const catalog = {};
  for (const metric of metadata.metrics || []) {
    const id = metric.metric_id || 'unknown';
    if (!catalog[id]) {
      catalog[id] = {
        metric_id: id,
        description: metric.description || null,
        unit: metric.unit || null,
        discovery_hint: metric.discovery_hint || null,
        initial_modbus_guess: metric.initial_modbus_guess || null,
        topics: [],
        value_examples: [],
        update_patterns: [],
      };
    }

    const entry = catalog[id];
    entry.topics.push(metric.topic);
    if (metric.description && !entry.description) {
      entry.description = metric.description;
    }
    if (metric.unit && !entry.unit) {
      entry.unit = metric.unit;
    }
    if (metric.discovery_hint && !entry.discovery_hint) {
      entry.discovery_hint = metric.discovery_hint;
    }
    if (metric.initial_modbus_guess && !entry.initial_modbus_guess) {
      entry.initial_modbus_guess = metric.initial_modbus_guess;
    }
    if (Array.isArray(metric.value_examples)) {
      entry.value_examples.push(...metric.value_examples.map(String));
    }
    if (metric.update_pattern) {
      entry.update_patterns.push(metric.update_pattern);
    }
  }

  return Object.values(catalog)
    .map(entry => ({
      ...entry,
      topics: entry.topics.sort(),
      value_examples: uniqueStrings(entry.value_examples, 5),
      update_patterns: uniqueStrings(entry.update_patterns, 3),
    }))
    .sort((a, b) => a.metric_id.localeCompare(b.metric_id));
}

function buildCatalog() {
  const metadata = loadMetadata();
  const catalog = aggregateMetrics(metadata);

  const output = {
    generated_at: new Date().toISOString(),
    source: path.basename(INPUT_PATH),
    metrics: catalog,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(
    `Catalog written to ${OUTPUT_PATH} with ${catalog.length} metrics.`,
  );
}

buildCatalog();
