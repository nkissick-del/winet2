#!/usr/bin/env node

/**
 * Energy Register Search - Extended
 * Looking for 11.1 MWh and 25.9 MWh with various scaling factors
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function searchEnergy() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    console.log(`🎯 Searching for energy values with various scaling:\n`);
    
    const forwardMatches = [];
    const reverseMatches = [];

    // Possible representations of 11.1 MWh:
    // - 11.1 (if stored as float)
    // - 111 (if scaled by 10)
    // - 1110 (if scaled by 100)
    // - 11100 (if in kWh)
    // - 111000 (if in kWh * 10)
    // - 11100000 (if in Wh)
    
    const forwardPossible = [11, 111, 1110, 11100, 111000];
    const reversePossible = [26, 259, 2590, 25900, 259000];

    for (let addr = 5000; addr <= 5800; addr++) {
      try {
        const result = await client.readInputRegisters(addr, 2);
        
        const uint16 = result.data[0];
        const uint32 = (result.data[0] << 16) | result.data[1];
        
        // Check forward energy
        if (forwardPossible.includes(uint16)) {
          forwardMatches.push({ addr, type: 'UINT16', value: uint16 });
        }
        if (forwardPossible.includes(uint32)) {
          forwardMatches.push({ addr, type: 'UINT32', value: uint32 });
        }
        
        // Check reverse energy
        if (reversePossible.includes(uint16)) {
          reverseMatches.push({ addr, type: 'UINT16', value: uint16 });
        }
        if (reversePossible.includes(uint32)) {
          reverseMatches.push({ addr, type: 'UINT32', value: uint32 });
        }
        
      } catch (err) {
        // Skip
      }
      
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    client.close();
    
    console.log(`\n📊 Forward Active Energy (11.1 MWh) matches:`);
    if (forwardMatches.length > 0) {
      for (const m of forwardMatches) {
        console.log(`   ✅ Register ${m.addr}: ${m.value} (${m.type})`);
      }
    } else {
      console.log(`   ❌ No matches found`);
    }
    
    console.log(`\n📊 Reverse Active Energy (25.9 MWh) matches:`);
    if (reverseMatches.length > 0) {
      for (const m of reverseMatches) {
        console.log(`   ✅ Register ${m.addr}: ${m.value} (${m.type})`);
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

searchEnergy();
