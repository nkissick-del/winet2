#!/usr/bin/env node

/**
 * Search for daily import/export energy registers
 * Looking for: 8.3 kWh (import) and 30.6 kWh (export)
 */

const ModbusRTU = require('modbus-serial');

const INVERTER_IP = '192.168.1.12';
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function searchDailyEnergy() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    console.log(`🎯 Searching for daily energy values:\n`);
    console.log(`   Daily Import: 8.3 kWh`);
    console.log(`   Daily Export: 30.6 kWh\n`);
    
    const importMatches = [];
    const exportMatches = [];

    // Possible representations:
    const importPossible = [8, 83, 830, 8300];  // direct, ×10, ×100, in Wh
    const exportPossible = [31, 306, 3060, 30600]; // direct, ×10, ×100, in Wh (rounded)

    // Scan active ranges
    for (let addr = 5000; addr <= 5700; addr++) {
      try {
        const result = await client.readInputRegisters(addr, 2);
        
        const uint16 = result.data[0];
        const uint32LE = (result.data[1] << 16) | result.data[0]; // Little endian
        
        // Check import
        if (importPossible.includes(uint16)) {
          importMatches.push({ addr, type: 'UINT16', value: uint16 });
        }
        if (importPossible.includes(uint32LE)) {
          importMatches.push({ addr, type: 'UINT32-LE', value: uint32LE });
        }
        
        // Check export
        if (exportPossible.includes(uint16)) {
          exportMatches.push({ addr, type: 'UINT16', value: uint16 });
        }
        if (exportPossible.includes(uint32LE)) {
          exportMatches.push({ addr, type: 'UINT32-LE', value: uint32LE });
        }
        
      } catch (err) {
        // Skip inaccessible registers
      }
      
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    client.close();
    
    console.log(`\n📊 Daily Import Energy (8.3 kWh) matches:`);
    if (importMatches.length > 0) {
      for (const m of importMatches) {
        console.log(`   ✅ Register ${m.addr}: ${m.value} (${m.type})`);
        console.log(`      → Likely scale: ${m.value === 8 ? '1 kWh' : m.value === 83 ? '0.1 kWh' : m.value === 830 ? '0.01 kWh' : '1 Wh'}`);
      }
    } else {
      console.log(`   ❌ No matches found`);
    }
    
    console.log(`\n📊 Daily Export Energy (30.6 kWh) matches:`);
    if (exportMatches.length > 0) {
      for (const m of exportMatches) {
        console.log(`   ✅ Register ${m.addr}: ${m.value} (${m.type})`);
        console.log(`      → Likely scale: ${m.value === 31 ? '1 kWh' : m.value === 306 ? '0.1 kWh' : m.value === 3060 ? '0.01 kWh' : '1 Wh'}`);
      }
    } else {
      console.log(`   ❌ No matches found`);
    }

    console.log(`\n🎉 Search complete!`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

searchDailyEnergy();
