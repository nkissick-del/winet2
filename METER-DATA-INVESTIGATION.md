# METER DATA INVESTIGATION RESULTS

## Summary
The WiNet-S API is **NOT returning meter power/energy data** despite:
- ✅ Meter being physically connected to inverter A22C1208343
- ✅ Inverter web UI showing grid import/export data
- ✅ WiNet-S API query includes `grid: 'true'` parameter
- ✅ API successfully returns meter voltage/current for all 3 phases

## What IS Being Received (22 datapoints)
```
Total On-grid Running Time (h)
Daily Yield (kWh)
Total Yield (kWh)
Running Status ()
Bus Voltage (V)
Internal Air Temperature (℃)
Array Insulation Resistance (kΩ)
Total DC Power (kW)
Total Active Power (kW)          ← Inverter power, not meter power
Total Reactive Power (kvar)
Total Apparent Power (kVA)
Total Power Factor ()
Grid Frequency (Hz)
Phase A Voltage (V)              ← Inverter output
Phase A Current (A)              ← Inverter output
Maximum Apparent Power (kVA)
Meter Phase-A Voltage (V)        ← Meter voltage ✓
Meter Phase-B Voltage (V)        ← Meter voltage ✓
Meter Phase-C Voltage (V)        ← Meter voltage ✓
Meter Phase-A Current (A)        ← Meter current ✓
Meter Phase-B Current (A)        ← Meter current ✓
Meter Phase-C Current (A)        ← Meter current ✓
```

## What is MISSING (but visible in web UI)
```
Meter Active Power              ← Grid power (import/export instantaneous)
Forward Active Energy           ← Total grid import (cumulative kWh)
Reverse Active Energy           ← Total grid export (cumulative kWh)
Daily Forward Active Energy     ← Daily grid import (kWh)
```

## API Query Parameters (from winetHandler.ts:638)
```javascript
{
  service: 'real',           // realtime data query
  dev_id: '2',              // inverter A22C1208343
  time123456: Date.now(),   // timestamp
  level: 3,                 // detail level (0-3)
  extended: 'true',         // extended data
  grid: 'true'              // grid data flag ← Already enabled!
}
```

## Root Cause Analysis

### Hypothesis 1: WiNet-S API Limitation
The WiNet-S dongle API may not expose all registers that the web interface can access. The web UI likely has direct Modbus access or uses a different API endpoint.

**Evidence:**
- `grid: 'true'` is already set but not returning power/energy data
- `level: 3` is maximum detail level
- `extended: 'true'` is enabled
- No other query services available (only `real`, `direct`, `real_battery`)

### Hypothesis 2: Firmware Version Difference
Different WiNet-S firmware versions may expose different data points.

**Evidence:**
- Code detects WiNet version: 1 (older), 2 (S2 old firmware), 3 (S2 new firmware)
- No version-specific query parameters found in code

### Hypothesis 3: Register Mapping Issue
The meter registers might be queried but not included in the i18n properties file, causing them to be dropped.

**Counter-evidence:**
- Debug logs show ALL 22 datapoints being processed
- Other meter data (voltage/current) IS present with proper names
- Missing data isn't appearing even with raw data_name

## Possible Solutions

### ❌ Solution 1: Try Different Query Parameters
**Status:** Limited options remain
- Could try `level: 0, 1, 2` to see if different levels return different data
- Could try `grid: 'false'` to see what changes
- Could try omitting `extended` parameter

**Likelihood of success:** 10% - we're already using maximum detail

### ⚠️ Solution 2: Check if Different Service Exists
**Status:** Need to research WiNet-S API documentation
- Look for undocumented services beyond `real`, `direct`, `real_battery`
- Check if there's a `meter` or `grid` specific service

**Likelihood of success:** 30% - APIs rarely have hidden services

### ✅ Solution 3: Calculate Meter Power from Voltage/Current
**Status:** Implementable immediately
- We have Phase A/B/C voltage and current
- Can calculate: `Meter Power = V_A × I_A + V_B × I_B + V_C × I_C`
- Positive = export, negative = import

**Limitations:**
- ❌ No cumulative energy (kWh) - only instantaneous power (W)
- ❌ Cannot populate HA Energy Dashboard without total_increasing sensors
- ✅ Can show current grid flow direction and magnitude

**Likelihood of success:** 100% - we have the data

### ⚠️ Solution 4: Direct Modbus TCP Access
**Status:** Requires network changes
- Bypass WiNet-S dongle entirely
- Connect directly to inverter Modbus TCP (port 502)
- Use modbus-mqtt-bridge or similar tool

**Requirements:**
- Network access to inverter (may require VLAN/firewall changes)
- Modbus register map for SG50RS
- Additional container/service

**Likelihood of success:** 90% - but significant architecture change

### ❌ Solution 5: Reverse Engineer Web UI API
**Status:** Complex, fragile
- Inspect web interface network requests
- Find if it uses different WebSocket commands
- Attempt to replicate in winet2

**Likelihood of success:** 40% - web UI might use same limited API

## Recommended Next Steps

### Immediate (Calculate from existing data)
1. ✅ We already have meter voltage and current
2. Add calculated sensor: `Meter Active Power = Sum(V × I)` for all phases
3. Deploy and verify it shows grid import/export direction

### Short-term (Verify API limitations)
1. Test different `level` parameter values (0, 1, 2)
2. Capture web UI network traffic to see if it uses different queries
3. Check Sungrow forums for WiNet-S API documentation

### Long-term (Architecture change)
1. Evaluate direct Modbus TCP access feasibility
2. Test with tools like `mbpoll` or `modbus-cli`
3. Implement modbus-mqtt-bridge if successful

## Code Changes for Calculated Power

```typescript
// In winetHandler.ts, after processing meter voltage/current:
if (device?.dev_sn === 'A22C1208343') {
  const deviceStatus = this.deviceStatus[receivedDevice!];
  const vA = deviceStatus?.meter_phasea_voltage?.value;
  const vB = deviceStatus?.meter_phaseb_voltage?.value;
  const vC = deviceStatus?.meter_phasec_voltage?.value;
  const iA = deviceStatus?.meter_phasea_current?.value;
  const iB = deviceStatus?.meter_phaseb_current?.value;
  const iC = deviceStatus?.meter_phasec_current?.value;

  if (vA !== undefined && iA !== undefined) {
    const powerA = vA * iA;
    const powerB = (vB || 0) * (iB || 0);
    const powerC = (vC || 0) * (iC || 0);
    const totalPower = powerA + powerB + powerC;

    const meterPowerDataPoint = {
      name: 'Meter Active Power',
      slug: 'meter_active_power',
      value: Math.round(totalPower * 100) / 100,
      unit: 'W',
      dirty: true,
    };

    this.updateDeviceStatus(receivedDevice!, meterPowerDataPoint);
    this.logger.info(`[METER DEBUG] Calculated Meter Active Power = ${totalPower.toFixed(2)} W`);
  }
}
```

## Questions for User

1. **What WiNet-S version do you have?** (Check startup logs for "Connected to a Winet-S..." message)

2. **Can you access the inverter's web UI and check Developer Tools (F12) → Network tab?**
   - What API endpoints does it call when showing grid data?
   - Are there WebSocket messages with different `service` names?

3. **Do you have network access to the inverter's Modbus TCP port (502)?**
   - Would you be willing to try direct Modbus access?

4. **For now, would calculating Meter Active Power from V×I be useful?**
   - It won't give cumulative kWh for HA Energy Dashboard
   - But it WILL show real-time grid import/export flow

