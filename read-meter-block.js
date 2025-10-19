#!/usr/bin/env node

/**
 * Read blocks around discovered meter power registers
 * to see what other meter data is stored nearby
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function readMeterBlocks() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    // Read around each power register candidate
    const blocks = [
      { name: "Around 5112", start: 5100, count: 30 },
      { name: "Around 5239", start: 5230, count: 30 },
      { name: "Around 5600", start: 5590, count: 30 }
    ];

    for (const block of blocks) {
      console.log(`\n📖 ${block.name} (${block.start} - ${block.start + block.count - 1}):\n`);
      
      try {
        const result = await client.readInputRegisters(block.start, block.count);
        
        for (let i = 0; i < result.data.length; i++) {
          const addr = block.start + i;
          const uint16 = result.data[i];
          
          // Also try to interpret as UINT32 with next register
          let uint32 = null;
          if (i < result.data.length - 1) {
            uint32 = (result.data[i] << 16) | result.data[i + 1];
          }
          
          if (uint16 !== 0 || (uint32 !== null && uint32 !== 0)) {
            console.log(`   ${addr}: ${uint16} (UINT16)${uint32 !== null ? `, ${uint32} (UINT32 with next)` : ''}`);
          }
        }
        
      } catch (err) {
        console.log(`   ❌ Error reading block: ${err.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    client.close();
    console.log(`\n✅ Done!`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

readMeterBlocks();
