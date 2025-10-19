# 📊 Grid Import/Export Analysis & Recommendations

**Date:** 2025-10-19  
**Inverters:** 2x Sungrow SG50RS (String Inverters, Device Type 21)  
**Goal:** Derive grid import/export energy metrics for Home Assistant Energy Dashboard

---

## 🔍 Investigation Summary

### ✅ What Data IS Available

**From MQTT Discovery Analysis:**
- ✅ **Meter Phase Voltages** (A, B, C) - sensors exist
- ✅ **Meter Phase Currents** (A, B, C) - sensors exist  
- ✅ **Solar Production Power** (Total Active Power, MPPT1/2)
- ✅ **Solar Energy** (Daily Yield, Total Yield)
- ✅ **Grid Frequency**

**Critical Finding:**
Meter voltage/current sensors are **defined** but have **NO VALUES**:
```json
{"unit_of_measurement":"V"}  // No "value" key = no data
```

### ❌ What Data is MISSING

**NOT available from WiNet-S API:**
- ❌ `Meter Active Power` (instantaneous W - signed value)
- ❌ `Meter Import Energy` (cumulative kWh from grid)
- ❌ `Meter Export Energy` (cumulative kWh to grid)
- ❌ `Purchased Power`
- ❌ `Export Power` / `Feed-in Power`

**These sensors require:**
1. Physical smart meter connected via RS485 to inverter
2. Meter configured in inverter settings
3. Different register query (or hybrid inverter)

---

## 🎯 Root Cause Analysis

### Why Meter Data is Missing

**Option A: No Physical Meter Connected** ⭐ MOST LIKELY
- Your SG50RS inverters may not have a smart meter connected via RS485
- Meter sensors are created by code but receive no data from inverter
- The WiNet-S dongle can only report what the inverter provides

**Option B: Meter Not Configured in Inverter**
- Meter is physically connected but not enabled in inverter settings
- Need to access inverter LCD menu or web interface to enable

**Option C: Wrong Query Type**
- SG50RS (Device Type 21) uses `REAL` + `DIRECT` query stages
- Meter power/energy data might require additional query or different device type

---

## 💡 Solution Options

### **Option 1: Calculate from Existing Data** ⭐ RECOMMENDED

**Concept:** Use phase voltage × current to calculate meter power

**Pros:**
- ✅ Uses existing meter voltage/current sensors
- ✅ No code changes needed (pure Home Assistant templates)
- ✅ Works immediately if meter sensors have values
- ✅ No hardware changes required

**Cons:**
- ❌ Only works if meter sensors actually report data
- ❌ Requires accurate power factor calculation
- ❌ Less accurate than direct power measurement

**Implementation (in Home Assistant `configuration.yaml`):**
```yaml
template:
  - sensor:
      # Calculate 3-phase power from voltage × current
      - name: "Grid Meter Power"
        unique_id: grid_meter_power
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        value_template: >
          {% set va = states('sensor.meter_phase_a_voltage_inverter_1') | float(0) %}
          {% set vb = states('sensor.meter_phase_b_voltage_inverter_1') | float(0) %}
          {% set vc = states('sensor.meter_phase_c_voltage_inverter_1') | float(0) %}
          {% set ia = states('sensor.meter_phase_a_current_inverter_1') | float(0) %}
          {% set ib = states('sensor.meter_phase_b_current_inverter_1') | float(0) %}
          {% set ic = states('sensor.meter_phase_c_current_inverter_1') | float(0) %}
          {% set pf = states('sensor.total_power_factor_inverter_1') | float(1) %}
          {{ ((va * ia + vb * ib + vc * ic) * pf) | round(0) }}
      
      # Positive = importing from grid
      - name: "Grid Import Power"
        unique_id: grid_import_power
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        value_template: >
          {% set meter = states('sensor.grid_meter_power') | float(0) %}
          {{ [meter, 0] | max }}
      
      # Negative meter power = exporting to grid
      - name: "Grid Export Power"
        unique_id: grid_export_power
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        value_template: >
          {% set meter = states('sensor.grid_meter_power') | float(0) %}
          {{ [meter * -1, 0] | max }}

  # Convert power to energy using Riemann sum integration
  - sensor:
      - name: "Grid Import Energy"
        unique_id: grid_import_energy
        platform: integration
        source: sensor.grid_import_power
        unit: kWh
        round: 2
        method: left
      
      - name: "Grid Export Energy"
        unique_id: grid_export_energy
        platform: integration
        source: sensor.grid_export_power
        unit: kWh
        round: 2
        method: left
```

**Status:** ⚠️ BLOCKED until meter sensors show actual values

---

### **Option 2: Energy Balance Calculation** 

**Concept:** Grid flow = Solar Production - House Consumption

**Formula:**
```
If (Solar > Consumption): Exporting = Solar - Consumption
If (Solar < Consumption): Importing = Consumption - Solar
```

**Pros:**
- ✅ Works with existing sensors
- ✅ No meter required
- ✅ Accurate if you have house consumption monitoring

**Cons:**
- ❌ Requires separate whole-house energy monitor
- ❌ Additional hardware cost ($50-200)
- ❌ Installation complexity

**Hardware Options:**
- Shelly EM (2-channel CT clamps, $70)
- Emporia Vue (8-16 channels, $80-150)
- IoTaWatt (14 channels, $150)
- Sense (ML-based, $300)

**Implementation:**
```yaml
template:
  - sensor:
      - name: "Grid Import Power"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        value_template: >
          {% set solar = states('sensor.total_active_power_inverter_1') | float(0) * 1000 %}
          {% set consumption = states('sensor.house_consumption') | float(0) %}
          {{ [consumption - solar, 0] | max }}
      
      - name: "Grid Export Power"
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        value_template: >
          {% set solar = states('sensor.total_active_power_inverter_1') | float(0) * 1000 %}
          {% set consumption = states('sensor.house_consumption') | float(0) %}
          {{ [solar - consumption, 0] | max }}
```

---

### **Option 3: Add Missing Meter Registers to Code** 🔧

**Concept:** Modify winet2 to query additional meter registers

**What to add:**
Based on SunGather/GoSungrow register maps for SG series:
- Register `13009`: Meter Total Active Power (W, signed)
- Register `13036`: Meter Total Import Energy (kWh)
- Register `13046`: Meter Total Export Energy (kWh)

**Pros:**
- ✅ Direct, accurate meter data
- ✅ Native kWh values (no integration needed)
- ✅ Works like original winet-extractor

**Cons:**
- ❌ Code modification required
- ❌ Testing needed
- ❌ Still requires physical meter to be connected
- ❌ WiNet-S API may not expose these registers for SG series

**Implementation Complexity:** Medium  
**Success Probability:** ⚠️ 50% (depends on WiNet-S API support)

---

### **Option 4: Switch to Modbus TCP** 🔄

**Concept:** Bypass WiNet-S, use direct Modbus connection

**Use:** SunGather or ModbusTCP integration

**Pros:**
- ✅ Full register access (all 13xxx meter registers)
- ✅ More reliable than WebSocket
- ✅ Better documented

**Cons:**
- ❌ Requires Modbus TCP enabled on inverter
- ❌ May conflict with WiNet-S dongle
- ❌ Replaces entire winet2 solution
- ❌ More complex network setup

**Not Recommended:** Too disruptive for current setup

---

### **Option 5: Parallel GoSungrow** 📡

**Concept:** Run GoSungrow alongside winet2

**Pros:**
- ✅ No code changes to winet2
- ✅ Mature, well-tested
- ✅ May expose meter data if available

**Cons:**
- ❌ Duplicate polling (inefficient)
- ❌ More containers to manage
- ❌ Still needs physical meter

---

## 🎯 My Recommendation

### **Immediate Action: Verify Meter Connection**

**Before implementing any solution, confirm:**

1. **Is a smart meter physically connected to your inverters?**
   - Check inverter RS485 ports for meter connection
   - Look for CT clamps or meter wiring

2. **Check inverter LCD/Web UI:**
   - Access inverter interface (usually http://INVERTER_IP)
   - Look for "Meter" or "Grid" menu
   - Check if import/export values are shown

3. **If meter values ARE shown on inverter:**
   - Meter is connected and working
   - Proceed to **Option 3** (add registers to code)

4. **If NO meter values on inverter:**
   - No physical meter installed
   - Proceed to **Option 2** (energy balance calculation)
   - Requires purchasing Shelly EM or similar

---

### **Best Path Forward**

#### **Scenario A: Meter IS Connected**
1. Verify meter shows data on inverter display
2. I'll help you add registers 13009, 13036, 13046 to winet2
3. Test and validate meter power/energy sensors
4. Add to HA Energy Dashboard

**Timeline:** 1-2 hours  
**Cost:** $0  
**Success Rate:** 80%

#### **Scenario B: NO Meter Connected** ⭐ MOST LIKELY
1. Purchase Shelly EM ($70) or Emporia Vue ($80)
2. Install CT clamps on main breaker
3. Use Option 2 templates to calculate grid flow
4. Add calculated sensors to HA Energy Dashboard

**Timeline:** 2-3 days (shipping + install)  
**Cost:** $70-150  
**Success Rate:** 95%

---

## 📋 Next Steps

**Tell me:**
1. Can you access your inverter's web interface or LCD screen?
2. Do you see any "Grid Power" or "Meter" readings there?
3. Do you have CT clamps or a smart meter installed near your main breaker?

Based on your answers, I'll provide:
- Exact code changes (if meter exists)
- OR hardware recommendations (if no meter)
- OR complete Home Assistant template configs

---

**Status:** ⏸️ Awaiting inverter meter verification  
**Analysis Complete:** ✅  
**Ready to Implement:** Pending hardware confirmation
