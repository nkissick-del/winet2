#!/usr/bin/env node

/**
 * Modbus Register Scanner
 * Scans a range of Modbus registers to find available data
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function scanRegisters() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    // Scan common Sungrow register ranges
    const ranges = [
      { start: 5000, end: 5100, name: "Inverter Status" },
      { start: 5100, end: 5200, name: "Grid Data" },
      { start: 5600, end: 5700, name: "Meter Data (possible)" },
      { start: 13000, end: 13100, name: "Extended Meter" }
    ];
    
    for (const range of ranges) {
      console.log(`\n📡 Scanning ${range.name} (${range.start}-${range.end})...`);
      let foundCount = 0;
      
      for (let addr = range.start; addr <= range.end; addr++) {
        try {
          const result = await client.readInputRegisters(addr, 1);
          const value = result.data[0];
          if (value !== 0 && value !== 65535) { // Skip likely empty registers
            console.log(`  ✅ Register ${addr}: ${value} (0x${value.toString(16)})`);
            foundCount++;
          }
        } catch (err) {
          // Silently skip errors
        }
        
        // Small delay to avoid overwhelming the inverter
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      
      if (foundCount === 0) {
        console.log(`  (No active registers found)`);
      }
    }

    client.close();
    console.log(`\n🎉 Scan complete!`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

scanRegisters();
