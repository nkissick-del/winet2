#!/usr/bin/env node

/**
 * Modbus TCP Test Script
 * Tests connectivity to Sungrow SG50RS inverter and reads meter registers
 * 
 * Usage: node test-modbus.js
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

// Register definitions from Sungrow documentation
// NOTE: Trying both 0-based and 1-based addressing
const REGISTERS = {
  // Try 0-based (subtract 1 from documentation)
  METER_ACTIVE_POWER: { address: 13008, length: 1, type: 'INT16', scale: 1, unit: 'W', docAddress: 13009 },
  FORWARD_ACTIVE_ENERGY: { address: 13035, length: 2, type: 'UINT32', scale: 0.1, unit: 'kWh', docAddress: 13036 },
  REVERSE_ACTIVE_ENERGY: { address: 13045, length: 2, type: 'UINT32', scale: 0.1, unit: 'kWh', docAddress: 13046 },
  DAILY_FORWARD_ENERGY: { address: 13047, length: 1, type: 'UINT16', scale: 0.1, unit: 'kWh', docAddress: 13048 },
};

async function testModbusConnection() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to inverter at ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected! Slave ID: ${SLAVE_ID}\n`);

    // Test each register
    for (const [name, config] of Object.entries(REGISTERS)) {
      let success = false;
      
      // Try both holding registers and input registers
      for (const regType of ['holding', 'input']) {
        if (success) break; // Skip if already successful
        
        try {
          console.log(`📖 Reading ${name} as ${regType} register (Doc: ${config.docAddress}, Modbus: ${config.address})...`);
          
          let result;
          if (regType === 'holding') {
            result = await client.readHoldingRegisters(config.address, config.length);
          } else {
            result = await client.readInputRegisters(config.address, config.length);
          }
        
          let value;
          if (config.type === 'INT16') {
            // Signed 16-bit integer
            value = result.data[0];
            if (value > 32767) value -= 65536; // Handle negative values
          } else if (config.type === 'UINT16') {
            // Unsigned 16-bit integer
            value = result.data[0];
          } else if (config.type === 'UINT32') {
            // Unsigned 32-bit integer (big-endian: high word first)
            value = (result.data[0] << 16) | result.data[1];
          }
          
          const scaledValue = value * config.scale;
          console.log(`   Raw: ${value}, Scaled: ${scaledValue} ${config.unit}`);
          console.log(`   ✅ Success with ${regType} registers!\n`);
          success = true;
        } catch (err) {
          console.log(`   ❌ Error with ${regType}: ${err.message}`);
        }
      }
      
      if (!success) {
        console.log(`   ⚠️  Failed to read ${name} from both register types\n`);
      }
    }

    client.close();
    console.log(`\n🎉 Modbus test complete!`);
    
  } catch (err) {
    console.error(`\n❌ Connection failed: ${err.message}`);
    process.exit(1);
  }
}

// Check if modbus-serial is installed
try {
  require.resolve('modbus-serial');
  testModbusConnection();
} catch (e) {
  console.error('❌ modbus-serial not installed. Run: npm install modbus-serial');
  process.exit(1);
}
