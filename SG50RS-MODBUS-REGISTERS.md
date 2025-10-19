# Sungrow SG50RS Modbus Register Map - CONFIRMED

## Summary
Successfully identified Modbus registers for smart meter data on Sungrow SG50RS inverter (Device Type 21).

**Inverter**: A22C1208343 at `192.168.1.12:502`  
**Discovery Date**: January 2025  
**Method**: Direct Modbus TCP scanning and value matching

---

## 📊 Confirmed Registers

### Meter Active Power
- **Register**: `5600` (Input Register)
- **Data Type**: UINT16
- **Unit**: Watts (W)
- **Current Value**: ~750W (varies with load)
- **Verified**: ✅ Matches web UI value (754W)

### Forward Active Energy (Grid Import)
- **Register**: `5098` (Input Register, 2 registers)
- **Data Type**: UINT32 (Little Endian)
- **Unit**: 0.1 kWh (divide by 10 for kWh)
- **Current Value**: 111,289 → **11.1289 MWh**
- **Verified**: ✅ Matches web UI value (11.1 MWh)
- **Raw Bytes**: `[45753, 1]` → Little Endian: `(1 << 16) | 45753 = 111289`

### Reverse Active Energy (Grid Export)
- **Register**: `5094` (Input Register, 2 registers)
- **Data Type**: UINT32 (Little Endian)
- **Unit**: 0.1 kWh (divide by 10 for kWh)
- **Current Value**: 259,393 → **25.9393 MWh**
- **Verified**: ✅ Matches web UI value (25.9 MWh)
- **Raw Bytes**: `[62785, 3]` → Little Endian: `(3 << 16) | 62785 = 259393`

---

## 🔍 Discovery Process

### 1. Initial Investigation
- WiNet-S WebSocket API only exposes 22 datapoints
- Meter voltage/current available, but NOT power or energy
- Documented registers (13000+) don't exist on SG50RS

### 2. Register Scanning
- Scanned ranges 5000-5800 via Modbus TCP
- Found active registers in 5000-5100, 5100-5200, 5600-5700
- Identified 3 candidates for meter power: 5112, 5239, 5600

### 3. Value Matching
- User provided web UI values: 754W, 11.1 MWh import, 25.9 MWh export
- Searched for exact matches with various scaling factors
- Found power at 5600 (705-750W range, live updating)

### 4. Byte Order Discovery
- Energy values not found with big-endian interpretation
- Tested little-endian byte order on UINT32 values
- Found matches at 5094/5098 with 0.1 kWh scaling:
  - 111,289 ÷ 10 = 11.1289 MWh ✅
  - 259,393 ÷ 10 = 25.9393 MWh ✅

### 5. Validation
- Duplicate values found at registers 5610/5614 (confirmation)
- All values match web UI within acceptable tolerance
- Registers stable across multiple reads

---

## 💻 Implementation Code

### Reading Meter Power (JavaScript/TypeScript)
```javascript
const result = await client.readInputRegisters(5600, 1);
const meterPowerW = result.data[0]; // Watts
```

### Reading Import Energy (JavaScript/TypeScript)
```javascript
const result = await client.readInputRegisters(5098, 2);
const raw = [(result.data[1] << 16) | result.data[0]]; // Little endian!
const importEnergyKWh = raw / 10; // Convert from 0.1 kWh to kWh
```

### Reading Export Energy (JavaScript/TypeScript)
```javascript
const result = await client.readInputRegisters(5094, 2);
const raw = (result.data[1] << 16) | result.data[0]; // Little endian!
const exportEnergyKWh = raw / 10; // Convert from 0.1 kWh to kWh
```

---

## ⚠️ Important Notes

1. **Byte Order**: Energy registers use **little-endian** format (low word first, high word second)
2. **Scaling**: Energy is in **0.1 kWh units** (divide by 10 for kWh, by 10,000 for MWh)
3. **Register Type**: All are **Input Registers** (function code 0x04)
4. **Modbus Slave ID**: 1
5. **Port**: 502 (standard Modbus TCP)

6. **Model-Specific**: These registers are for **SG50RS (Device Type 21)** - may differ on other models
7. **Duplicate Registers**: 5610/5614 contain same energy values as 5094/5098 (use either)

---

## 🎯 Next Steps

1. Create `modbusReader.ts` module to query these registers
2. Integrate with `winetHandler.ts` (hybrid WiNet-S + Modbus)
3. Publish to MQTT with proper Home Assistant device classes:
   - `sensor.meter_power`: `device_class: power`, `unit: W`
   - `sensor.grid_import_energy`: `device_class: energy`, `state_class: total_increasing`, `unit: kWh`
   - `sensor.grid_export_energy`: `device_class: energy`, `state_class: total_increasing`, `unit: kWh`
4. Test in Home Assistant Energy Dashboard
5. Monitor for 24 hours to verify cumulative counters are stable

---

## 📚 References

- [SunGather Project](https://github.com/bohdan-s/SunGather) - Modbus approach for other models
- [Sungrow Modbus Documentation](https://github.com/bohdan-s/SunGather/tree/main/SunGather/registers) - Register definitions (note: SG50RS differs)
- Discovery scripts: `test-modbus.js`, `scan-modbus.js`, `find-meter-registers.js`, `check-byte-orders.js`
