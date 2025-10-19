#!/usr/bin/env node

/**
 * Check specific registers with different byte orders
 */

const ModbusRTU = require("modbus-serial");

const INVERTER_IP = "192.168.1.12";
const MODBUS_PORT = 502;
const SLAVE_ID = 1;

async function checkByteOrders() {
  const client = new ModbusRTU();
  
  try {
    console.log(`\n🔌 Connecting to ${INVERTER_IP}:${MODBUS_PORT}...`);
    await client.connectTCP(INVERTER_IP, { port: MODBUS_PORT });
    client.setID(SLAVE_ID);
    console.log(`✅ Connected!\n`);

    // Check interesting registers
    const registers = [5094, 5098, 5610, 5614];

    for (const addr of registers) {
      const result = await client.readInputRegisters(addr, 2);
      
      const r1 = result.data[0];
      const r2 = result.data[1];
      
      // Different interpretations
      const bigEndian32 = (r1 << 16) | r2;
      const littleEndian32 = (r2 << 16) | r1;
      const r1_r2_separate = [r1, r2];
      
      console.log(`\n📍 Register ${addr}:`);
      console.log(`   Raw: [${r1}, ${r2}]`);
      console.log(`   Big Endian UINT32: ${bigEndian32}`);
      console.log(`   Little Endian UINT32: ${littleEndian32}`);
      
      // Check if any interpretation matches our energy values
      const importKWh = 11100;  // 11.1 MWh
      const exportKWh = 25900;  // 25.9 MWh
      
      if (Math.abs(r1 - importKWh) < 200) {
        console.log(`   ⚡⚡⚡ REGISTER[0] MATCHES IMPORT! ${r1} ≈ ${importKWh} kWh`);
      }
      if (Math.abs(r2 - importKWh) < 200) {
        console.log(`   ⚡⚡⚡ REGISTER[1] MATCHES IMPORT! ${r2} ≈ ${importKWh} kWh`);
      }
      if (Math.abs(r1 - exportKWh) < 200) {
        console.log(`   ⚡⚡⚡ REGISTER[0] MATCHES EXPORT! ${r1} ≈ ${exportKWh} kWh`);
      }
      if (Math.abs(r2 - exportKWh) < 200) {
        console.log(`   ⚡⚡⚡ REGISTER[1] MATCHES EXPORT! ${r2} ≈ ${exportKWh} kWh`);
      }
      
      // Check scaled versions (× 10)
      const import_x10 = 111000;
      const export_x10 = 259000;
      
      if (Math.abs(bigEndian32 - import_x10) < 2000) {
        console.log(`   ⚡ Big Endian might be import×10: ${bigEndian32} ≈ ${import_x10}`);
      }
      if (Math.abs(littleEndian32 - import_x10) < 2000) {
        console.log(`   ⚡ Little Endian might be import×10: ${littleEndian32} ≈ ${import_x10}`);
      }
      if (Math.abs(bigEndian32 - export_x10) < 2000) {
        console.log(`   ⚡ Big Endian might be export×10: ${bigEndian32} ≈ ${export_x10}`);
      }
      if (Math.abs(littleEndian32 - export_x10) < 2000) {
        console.log(`   ⚡ Little Endian might be export×10: ${littleEndian32} ≈ ${export_x10}`);
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

checkByteOrders();
