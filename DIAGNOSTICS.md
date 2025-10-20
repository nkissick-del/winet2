# Winet2 Diagnostics & Knowledge Base

This document consolidates the working notes and investigations spread across the repository. It is the single place to check when validating the deployment, triaging issues, or re‑running discovery.

## System Overview

- **Target hardware**: Sungrow SG50RS string inverters with optional Modbus smart meter.
- **Runtime**: `docker-compose` service `winet2-bridge` (Node 20 Alpine, runs `node build/src/index.js`).
- **Configuration**: `.env` (or Home Assistant add-on `options.json`) supplies MQTT/WinET credentials, `MODBUS_IPS`, and `INVERTER_TYPE` (`STRING`/`HYBRID`).
- **Modbus defaults**: Generated JSON at `tools/modbus-discovery/modbus-register-defaults.json` (built from latest CSV exports). User-specific overrides live in `modbus-registers.json`; the discovery CLI rewrites this file.

## Key Registers & Metrics

| Metric                   | Register | Notes                                                                 |
|--------------------------|----------|-----------------------------------------------------------------------|
| `meter_power`            | 5600     | Signed watts; positive import, negative export.                       |
| `grid_import_energy`     | 5098     | UINT32 little-endian, 0.1 kWh scale.                                  |
| `grid_export_energy`     | 5094     | UINT32 little-endian, 0.1 kWh scale.                                  |
| `daily_power_yields`     | 5003     | 0.1 kWh daily production.                                             |
| `total_output_energy`    | 5004     | kWh lifetime production.                                              |
| `internal_temperature`   | 5008     | 0.1 °C.                                                               |
| MPPT currents/voltages   | 5012/5016 etc. | All validated against inverter UI and the discovery CLI output. |

The discovery CLI (`tools/modbus-discovery/discover.js`) confirms these addresses on the live inverter and persists the subset it can prove to `modbus-registers.json`.

## Operational Procedures

### 1. Running Discovery
1. `npm run build:register-defaults` (regenerate defaults after CSV/PDF updates).  
2. `node tools/modbus-discovery/discover.js`  
   - Enter inverter IP / port / slave ID (default 1).  
   - Choose `1` for string or `2` for hybrid when prompted.  
   - Optional: provide expected power/energy values to tighten tolerance.  
3. Review `modbus-registers.json` for the updated override map.

### 2. Deploying / Restarting
```
docker compose down
docker compose up --build -d
docker compose logs -f
```
Look for `📊 Modbus meter data:` messages to confirm healthy Modbus reads. Any range violations are logged as warnings by the health monitor in `ModbusReader`.

### 3. Home Assistant Energy Dashboard
Feed the following entities into the Energy dashboard:
- `sensor.<node>_grid_import_energy`
- `sensor.<node>_grid_export_energy`
- Optional live `sensor.<node>_meter_power`.

Each energy entity must be `device_class: energy`, `state_class: total_increasing`, `unit_of_measurement: kWh`.

## Investigations & Findings (Historical Context)

- **WiNet vs Modbus**: The WiNet API never surfaced meter power/energy; Modbus TCP is the authoritative source.
- **Register discovery**: Scans of the 5000–5100 range confirmed the active meter/energy registers and ruled out the legacy 130xx block.
- **Energy validation**: Raw Modbus readings matched the inverter web UI (≈11 MWh import, ≈26 MWh export), confirming scaling.
- **Home Assistant fixes**: MQTT value templates now tolerate missing payload keys, eliminating `value_json` errors.
- **Implementation**: The production app publishes meter power/import/export every scan; they are ready for Home Assistant Energy in their current form.
- **Cleanup**: Historical notes and exploratory scripts have been removed; refer to this document for future context.

## File Map (Live Artifacts vs. Reference)

| Path                                        | Role                                      |
|---------------------------------------------|-------------------------------------------|
| `src/`                                      | TypeScript sources (app logic).           |
| `tools/modbus-discovery/*.csv/.json`        | Register definitions & generator scripts. |
| `modbus-registers.json`                     | Site-specific overrides from discovery.   |
| `Dockerfile`, `docker-compose.yml`          | Deployment.                               |
| `README.md`, `DIAGNOSTICS.md`               | High-level docs and operational knowledge.|
| `pdf` manuals                               | Reference for future CSV regeneration.    |

This document replaces the ad-hoc Markdown notes; refer back here first when diagnosing issues or refreshing definitions.
