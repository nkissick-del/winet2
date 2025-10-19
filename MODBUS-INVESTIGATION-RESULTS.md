# Modbus Investigation Results - SG50RS Inverter

## Connection Status
✅ **Modbus TCP**: Successfully connected to 192.168.1.12:502  
✅ **Slave ID**: 1  
✅ **Response**: Inverter responding to register queries

## Finding: Register Documentation Mismatch

### Expected (from documentation)
- Register 13009: Meter Active Power
- Register 13036: Forward Active Energy  
- Register 13046: Reverse Active Energy
- Register 13048: Daily Forward Energy

### Reality
❌ **Registers 13000-13100 are NOT accessible** on this SG50RS model

✅ **Found active data in ranges:**
- **5000-5100**: Inverter status data
- **5100-5200**: Grid-related data (likely including meter)
- **5600-5700**: Additional meter/grid data

## Key Observation
The SG50RS (Device Type 21, string inverter) uses **different register addresses** than the documentation suggests. The 13000+ range appears to be for hybrid inverters (SH series).

## Next Steps Required

### Option 1: Decode Existing Registers
Map the found registers (5000-5700) to identify:
- Which register contains meter active power?
- Which registers contain cumulative energy?

**Method**: Cross-reference values with inverter web UI during daylight hours

### Option 2: Check SunGather SG50RS-Specific Registers
SunGather auto-detects inverter model and loads appropriate register map. We need to find the SG50RS-specific register definitions.

### Option 3: Contact Repository/Documentation
- Check bohdan-s/SunGather for SG50RS register yaml files
- Review Sungrow official documentation for SG50RS specifically (not generic string inverters)

## Registers Found (with current values at night)

### Range 5000-5100 (Inverter Status)
```
5000: 50      (could be model/firmware indicator)
5002: 219    
5003: 25351   (0x6307)
5005: 10189   (0x27cd)
5037: 5120    (0x1400)
5048: 30
5070: 2130    (0x852)
5076: 5000    (0x1388)
5082: 726     (0x2d6)
5094: 62785   (0xf541 - negative as INT16 = -2751)
5098: 45752   (0xb2b8)
```

### Range 5100-5200 (Grid Data)
```
5112: 750     (could be grid frequency * 10 = 75.0 Hz? unlikely - probably 50.0 Hz)
5113: 6
5124: 1000    (0x3e8)
5127: 4025    (0xfb9)
5143: 56903   (0xde47)
```

### Range 5600-5700 (Meter Data - Likely!)
```
5600: 727     (0x2d7)
5610: 62785   (0xf541 - same as 5094, negative INT16 = -2751)
5614: 45752   (0xb2b8 - same as 5098)
5621: 500     (limits/thresholds?)
5622: 1000
5623: 500
5624: 1000
5626: 500
```

## Hypothesis: Meter Power in 5600 Range

Register **5610** showing `-2751` (as signed INT16) could be meter active power at night (small consumption/standby). This would make sense:
- Negative value = importing from grid
- Small magnitude = nighttime standby power
- Same value repeated at 5094 (might be cached/mirrored)

**Validation needed**: Check these register values during daylight when:
- Solar is generating
- Grid export is happening
- Values should change significantly

## Action Plan

1. **Daytime Testing Required** 🌞
   - Wait for solar production
   - Re-scan registers 5000-5700
   - Cross-reference with web UI values
   - Identify which registers correspond to:
     * Meter active power
     * Total import energy
     * Total export energy

2. **Alternative: Find SunGather Register Map**
   - Search SunGather repository for SG50RS register YAML
   - May contain exact register addresses for this model

3. **WiNet-S Comparison**
   - The WiNet-S API returns meter voltage/current
   - Those must come from SOME Modbus registers
   - Find which registers match the voltage/current values

## Current Blocker

⚠️ **Cannot proceed with full implementation** until we identify the correct register addresses for:
- Meter Active Power (W)
- Forward Active Energy (kWh) - cumulative import
- Reverse Active Energy (kWh) - cumulative export

**These registers exist** (proven by web UI showing the data), but we need to find their addresses in the 5000-5700 range.

---

**Status**: Modbus connectivity confirmed ✅  
**Next**: Daytime register value correlation OR find SunGather SG50RS register map  
**Date**: 2025-10-19 (nighttime - limited data validation possible)
