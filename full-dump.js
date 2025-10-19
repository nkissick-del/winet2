#!/usr/bin/env node

/**
 * Full dump of all non-zero values in active meter ranges
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function fullDump() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    console.log(`📋 All non-zero values in registers 5000-5700:\n`);

    const allValues = [];

    for (let addr = 5000; addr <= 5700; addr++) {
      try {
        const result = await client.readInputRegisters(addr, 2);
        
        const uint16 = result.data[0];
        const uint32 = (result.data[0] << 16) | result.data[1];
        
        if (uint16 !== 0) {
          allValues.push({ addr, uint16, uint32 });
        }
        
      } catch (err) {
        // Skip
      }
      
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Print all non-zero values
    for (const v of allValues) {
      console.log(`${v.addr}: ${v.uint16} (UINT16), ${v.uint32} (UINT32)`);
      
      // Check if UINT32 matches our energy values
      const scaledImport = Math.round(11.1 * 1000); // 11100
      const scaledExport = Math.round(25.9 * 1000); // 25900
      
      if (Math.abs(v.uint32 - scaledImport) < 100) {
        console.log(`   ⚡ POSSIBLE IMPORT ENERGY! (${v.uint32} ≈ ${scaledImport} kWh)`);
      }
      if (Math.abs(v.uint32 - scaledExport) < 100) {
        console.log(`   ⚡ POSSIBLE EXPORT ENERGY! (${v.uint32} ≈ ${scaledExport} kWh)`);
      }
    }

    client.close();
    console.log(`\n✅ Done! Found ${allValues.length} non-zero registers`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

fullDump();
