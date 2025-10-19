# Modbus Integration Research - SunGather Analysis

## Key Findings from SunGather Project

### Project Overview
- **SunGather**: Python-based Modbus data collector for Sungrow inverters
- **Uses**: `pymodbus`, `SungrowModbusTcpClient`, `SungrowModbusWebClient`
- **Supports**: Direct Modbus TCP, WiNet-S WebClient, and Modbus TCP Client modes
- **SG50RS**: Listed in supported devices (PV Grid-Connected String Inverters)

### Register Names (from SunGather documentation)

**Meter-Related Registers:**
1. **meter_power** - Power usage at meter box. +ve = importing, -ve = exporting (W)
2. **export_to_grid** - Currently exporting to grid (calculated from meter_power if negative) (W)
3. **import_from_grid** - Currently importing from grid (calculated from meter_power if positive) (W)

**Energy Registers:**
- **daily_power_yields** - Total kWh generated today
- **total_power_yields** - Total kWh since install
- **total_active_power** - Current inverter generation (W)
- **load_power** - Total power consumption (W)

### Smart Meter Configuration

From README.md:
```yaml
# Only for SG* Models (String Inverters like SG50RS)
smart_meter: True
```

**Important Note:**  
> "smart_meter: True - Set to true if you have a smart meter installed, this will return power usage at the meter box, without it you cannot calculate house power usage."

### Home Assistant Energy Dashboard Integration

SunGather creates these MQTT sensors:
```
sensor.inverter_active_power
sensor.inverter_daily_generation
sensor.inverter_export_to_grid
sensor.inverter_import_from_grid
sensor.inverter_load_power
sensor.inverter_meter_power
```

**Power to Energy Conversion:**
Since inverters report Power (W) but HA needs Energy (Wh), SunGather uses Riemann sum integration:

```yaml
sensor:
  - platform: integration
    source: sensor.inverter_export_to_grid
    name: Return to Grid (Sungather)
  - platform: integration
    source: sensor.inverter_import_from_grid
    name: Grid Consumption (Sungather)
```

**Energy Dashboard Configuration:**
- Grid Consumption → `sensor.grid_consumption_sungather`
- Return to Grid → `sensor.return_to_grid_sungather`
- Solar Production → `sensor.solar_production_sungather`

## Critical Insight: Modbus vs WebSocket API

### The Key Difference
**SunGather uses direct Modbus TCP** (port 502) or `SungrowModbusWebClient`, NOT the WiNet-S WebSocket API that winet2 uses.

### Evidence:
```python
# From SunGather setup.py
install_requires=[
    'pymodbus>=2.3.0',          # Direct Modbus TCP
    'websocket-client>=1.2.1',   # For SungrowModbusWebClient
]
```

**Connection types:**
```python
connection: "modbus"     # Direct Modbus TCP to inverter
connection: "http"       # SungrowModbusWebClient (different from WiNet-S)
```

### Why WiNet-S WebSocket API Doesn't Expose Meter Energy

The WiNet-S dongle's WebSocket API (`service: 'real'`) is a **simplified interface** that:
1. Returns pre-filtered datapoints (22 for SG50RS)
2. Does NOT expose all Modbus registers
3. Designed for monitoring, not full data access

The web interface likely uses:
- **Direct Modbus queries** (registers 13009, 13036, 13046)
- **Different API endpoint** (not the WebSocket we're using)
- **Firmware-level access** to all register

s

## Modbus Register Map (from Sungrow Documentation)

Based on official "Communication Protocol of PV Grid-Connected String Inverters":

### Meter Registers (Smart Meter Data)
| Register | Address | Name                    | Unit | Type   | Scale |
|----------|---------|-------------------------|------|--------|-------|
| 13009    | 0x32D1  | Meter Active Power      | W    | INT16  | 1     |
| 13036    | 0x32EC  | Forward Active Energy   | kWh  | UINT32 | 0.1   |
| 13046    | 0x32F6  | Reverse Active Energy   | kWh  | UINT32 | 0.1   |
| 13048    | 0x32F8  | Daily Forward Energy    | kWh  | UINT16 | 0.1   |

**Note:** Register addresses are commonly 1-indexed in documentation but 0-indexed in Modbus protocol.

### Existing Registers (from winet2 WiNet-S API)
| Data Name            | Unit | Currently Available |
|----------------------|------|---------------------|
| Meter Phase-A Voltage| V    | ✅ Yes              |
| Meter Phase-B Voltage| V    | ✅ Yes              |
| Meter Phase-C Voltage| V    | ✅ Yes              |
| Meter Phase-A Current| A    | ✅ Yes              |
| Meter Phase-B Current| A    | ✅ Yes              |
| Meter Phase-C Current| A    | ✅ Yes              |
| Meter Active Power   | W    | ❌ No               |
| Forward Active Energy| kWh  | ❌ No               |
| Reverse Active Energy| kWh  | ❌ No               |
| Daily Forward Energy | kWh  | ❌ No               |

## Implementation Options for winet2

### Option A: Add Modbus TCP Client (RECOMMENDED)
**Approach:** Query missing registers via direct Modbus TCP alongside existing WiNet-S WebSocket

**Advantages:**
- ✅ Complete data access (all registers)
- ✅ Cumulative energy values (kWh) for HA Energy Dashboard
- ✅ Same approach as SunGather (proven to work)
- ✅ Can coexist with existing WiNet-S code
- ✅ Direct access to inverter (no dongle limitations)

**Requirements:**
- Network access to inverter IP:502 (Modbus TCP port)
- Add `jsmodbus` or `modbus-serial` npm package
- Query registers 13009, 13036, 13046, 13048 every scan cycle

**Implementation:**
```typescript
import ModbusRTU from 'modbus-serial';

class ModbusReader {
  private client: ModbusRTU;
  
  async readMeterData(inverterIP: string) {
    await this.client.connectTCP(inverterIP, { port: 502 });
    this.client.setID(1); // Slave ID typically 1
    
    // Read Meter Active Power (1 register at 13009)
    const power = await this.client.readHoldingRegisters(13009, 1);
    
    // Read Forward Active Energy (2 registers at 13036 - UINT32)
    const import_energy = await this.client.readHoldingRegisters(13036, 2);
    
    // Read Reverse Active Energy (2 registers at 13046 - UINT32)
    const export_energy = await this.client.readHoldingRegisters(13046, 2);
    
    // Read Daily Forward Energy (1 register at 13048)
    const daily_import = await this.client.readHoldingRegisters(13048, 1);
    
    return {
      meter_active_power: power.data[0], // W
      forward_active_energy: (import_energy.data[0] << 16 | import_energy.data[1]) * 0.1, // kWh
      reverse_active_energy: (export_energy.data[0] << 16 | export_energy.data[1]) * 0.1, // kWh
      daily_forward_energy: daily_import.data[0] * 0.1, // kWh
    };
  }
}
```

**Deployment Changes:**
```yaml
# docker-compose.yml - expose inverter Modbus port
environment:
  - INVERTER_IP=192.168.x.x  # Direct inverter IP
  - MODBUS_PORT=502
  - WINET_HOST=192.168.x.x   # WiNet-S dongle IP
```

### Option B: Calculated Power (FALLBACK)
**Approach:** Calculate `Meter Active Power` from existing V×I, skip cumulative energy

**Advantages:**
- ✅ No network changes
- ✅ Real-time grid flow visibility
- ✅ Quick to implement

**Disadvantages:**
- ❌ No cumulative kWh (can't use HA Energy Dashboard directly)
- ❌ Must use Riemann integration in HA (adds complexity)
- ❌ Less accurate than native registers

### Option C: Reverse Engineer WiNet-S Web UI
**Approach:** Capture web UI API calls to find meter data endpoint

**Likelihood of Success:** Low
- Web UI may use same WebSocket with different query
- Web UI may have firmware-level access
- Even if found, API may be undocumented/unstable

## Recommended Next Steps

### Phase 1: Validate Modbus Access (1 hour)
1. SSH to Unraid server
2. Install `mbpoll` tool: `docker run -it --rm --network host alpine sh -c 'apk add mbpoll && mbpoll -a 1 -r 13009 -c 1 192.168.x.x'`
3. Confirm register 13009 (Meter Active Power) returns valid data
4. Test registers 13036, 13046, 13048

### Phase 2: Implement Modbus Client in winet2 (2-3 hours)
1. Add `modbus-serial` package to package.json
2. Create `src/modbusReader.ts` with register definitions
3. Integrate with `winetHandler.ts` callback
4. Add datapoints to device status for meter-connected inverter

### Phase 3: Configure HA Energy Sensors (30 min)
1. Update `homeassistant.ts` with proper device classes:
   - `meter_active_power`: `device_class: power`, `state_class: measurement`
   - `forward_active_energy`: `device_class: energy`, `state_class: total_increasing`
   - `reverse_active_energy`: `device_class: energy`, `state_class: total_increasing`
   - `daily_forward_energy`: `device_class: energy`, `state_class: total`
2. Publish MQTT discovery messages
3. Verify in HA Energy Dashboard configuration

### Phase 4: Test & Validate (30 min)
1. Verify values match inverter web UI
2. Add to HA Energy Dashboard
3. Monitor for 24 hours to confirm cumulative counters work

## Questions to Answer

1. **What is the inverter's IP address?** (needed for Modbus TCP)
2. **Is Modbus TCP port 502 accessible from your winet2 container?**
3. **Should we keep WiNet-S WebSocket for other data, or switch entirely to Modbus?**

**Recommendation:** Hybrid approach - keep WiNet-S for 22 standard datapoints, add Modbus TCP queries only for missing meter registers.

