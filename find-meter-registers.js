#!/usr/bin/env node

/**
 * Targeted Register Search
 * Looking for specific values from the web UI
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

// Values from web UI to search for
const TARGET_VALUES = {
  meter_active_power: 754,        // W (might be INT16 or UINT16)
  forward_active_energy: 11100,   // 11.1 MWh = 11,100 kWh (might need scaling)
  reverse_active_energy: 25900,   // 25.9 MWh = 25,900 kWh (might need scaling)
};

async function searchForValues() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    console.log(`🎯 Searching for:`);
    console.log(`   Meter Active Power: ${TARGET_VALUES.meter_active_power} W`);
    console.log(`   Forward Active Energy: 11.1 MWh (${TARGET_VALUES.forward_active_energy} kWh)`);
    console.log(`   Reverse Active Energy: 25.9 MWh (${TARGET_VALUES.reverse_active_energy} kWh)\n`);

    const matches = [];

    // Scan comprehensive range
    for (let addr = 5000; addr <= 5800; addr++) {
      try {
        const result = await client.readInputRegisters(addr, 2); // Read 2 registers for UINT32
        
        const uint16 = result.data[0];
        const int16 = uint16 > 32767 ? uint16 - 65536 : uint16;
        const uint32 = (result.data[0] << 16) | result.data[1];
        
        // Check for meter active power (754 W)
        if (uint16 === TARGET_VALUES.meter_active_power || Math.abs(int16 - TARGET_VALUES.meter_active_power) < 10) {
          matches.push({
            address: addr,
            type: 'INT16/UINT16',
            value: `${uint16} (int16: ${int16})`,
            match: 'Meter Active Power',
            unit: 'W'
          });
        }
        
        // Check for forward energy (11,100 kWh or 111,000 with 0.1 scale)
        if (uint16 === TARGET_VALUES.forward_active_energy || uint16 === TARGET_VALUES.forward_active_energy * 10) {
          matches.push({
            address: addr,
            type: 'UINT16',
            value: uint16,
            match: 'Forward Active Energy',
            unit: uint16 === TARGET_VALUES.forward_active_energy ? 'kWh' : 'kWh*10'
          });
        }
        
        if (uint32 === TARGET_VALUES.forward_active_energy || uint32 === TARGET_VALUES.forward_active_energy * 10) {
          matches.push({
            address: addr,
            type: 'UINT32',
            value: uint32,
            match: 'Forward Active Energy',
            unit: uint32 === TARGET_VALUES.forward_active_energy ? 'kWh' : 'kWh*10'
          });
        }
        
        // Check for reverse energy (25,900 kWh or 259,000 with 0.1 scale)
        if (uint16 === TARGET_VALUES.reverse_active_energy || uint16 === TARGET_VALUES.reverse_active_energy * 10) {
          matches.push({
            address: addr,
            type: 'UINT16',
            value: uint16,
            match: 'Reverse Active Energy',
            unit: uint16 === TARGET_VALUES.reverse_active_energy ? 'kWh' : 'kWh*10'
          });
        }
        
        if (uint32 === TARGET_VALUES.reverse_active_energy || uint32 === TARGET_VALUES.reverse_active_energy * 10) {
          matches.push({
            address: addr,
            type: 'UINT32',
            value: uint32,
            match: 'Reverse Active Energy',
            unit: uint32 === TARGET_VALUES.reverse_active_energy ? 'kWh' : 'kWh*10'
          });
        }
        
      } catch (err) {
        // Silently skip errors
      }
      
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    client.close();
    
    if (matches.length > 0) {
      console.log(`\n✅ FOUND ${matches.length} MATCHES:\n`);
      for (const match of matches) {
        console.log(`📍 Register ${match.address}:`);
        console.log(`   Type: ${match.type}`);
        console.log(`   Value: ${match.value}`);
        console.log(`   Match: ${match.match}`);
        console.log(`   Unit: ${match.unit}\n`);
      }
    } else {
      console.log(`\n❌ No exact matches found. The values might be scaled differently.`);
      console.log(`   Try checking the web UI again for updated values.`);
    }

    console.log(`\n🎉 Search complete!`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

searchForValues();
