#!/usr/bin/env node

const ModbusRTU = require('modbus-serial');

async function test() {
  const client = new ModbusRTU();
  
  try {
    await client.connectTCP('192.168.1.12', {port: 502});
    client.setID(1);
    
    console.log('Testing register 5098...');
    const result = await client.readInputRegisters(5098, 2);
    console.log('Success! Data:', result.data);
    console.log('Raw values:', result.data[0], result.data[1]);
    
    const raw = (result.data[1] << 16) | result.data[0];
    console.log('Combined (little-endian):', raw);
    console.log('Energy (kWh):', raw / 10);
    
    client.close();
  } catch (error) {
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error errno:', error.errno);
    console.error('Full error:', JSON.stringify(error, null, 2));
  }
}

test();
