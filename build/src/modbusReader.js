"use strict";
/**
 * Modbus TCP Reader for Sungrow SG50RS Smart Meter Data
 *
 * Reads meter power and energy data via Modbus TCP that is not available
 * through the WiNet-S WebSocket API.
 *
 * Registers discovered for SG50RS (Device Type 21):
 * - 5600: Meter Active Power (W)
 * - 5098: Forward Active Energy / Grid Import (0.1 kWh)
 * - 5094: Reverse Active Energy / Grid Export (0.1 kWh)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModbusReader = void 0;
const modbus_serial_1 = __importDefault(require("modbus-serial"));
const MODBUS_PORT = 502;
const SLAVE_ID = 1;
const CONNECTION_TIMEOUT = 10000; // 10 seconds
const READ_TIMEOUT = 10000; // 10 seconds
class ModbusReader {
    client;
    host;
    connected = false;
    constructor(host) {
        this.host = host;
        this.client = new modbus_serial_1.default();
        this.client.setTimeout(READ_TIMEOUT);
    }
    /**
     * Connect to the inverter via Modbus TCP
     */
    async connect() {
        if (this.connected) {
            return;
        }
        try {
            await this.client.connectTCP(this.host, { port: MODBUS_PORT });
            this.client.setID(SLAVE_ID);
            this.connected = true;
            console.log(`✅ Modbus connected to ${this.host}:${MODBUS_PORT}`);
        }
        catch (error) {
            console.error(`❌ Modbus connection failed: ${error}`);
            throw error;
        }
    }
    /**
     * Disconnect from the inverter
     */
    async disconnect() {
        if (this.connected) {
            this.client.close(() => {
                this.connected = false;
                console.log(`🔌 Modbus disconnected from ${this.host}`);
            });
        }
    }
    /**
     * Read meter power from register 5600
     * @returns Power in Watts (UINT16)
     */
    async readMeterPower() {
        try {
            const result = await this.client.readInputRegisters(5600, 1);
            return result.data[0]; // Direct UINT16 value in Watts
        }
        catch (error) {
            console.error(`Error reading meter power: ${error}`);
            throw error;
        }
    }
    /**
     * Read forward active energy (grid import) from register 5098
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    async readImportEnergy() {
        try {
            const result = await this.client.readInputRegisters(5098, 2);
            // Little-endian UINT32: (high_word << 16) | low_word
            const raw = (result.data[1] << 16) | result.data[0];
            // Convert from 0.1 kWh units to kWh
            return raw / 10;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error reading import energy: ${errorMsg}`);
            console.error(`Error details: ${JSON.stringify(error)}`);
            throw error;
        }
    }
    /**
     * Read reverse active energy (grid export) from register 5094
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    async readExportEnergy() {
        try {
            const result = await this.client.readInputRegisters(5094, 2);
            // Little-endian UINT32: (high_word << 16) | low_word
            const raw = (result.data[1] << 16) | result.data[0];
            // Convert from 0.1 kWh units to kWh
            return raw / 10;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error reading export energy: ${errorMsg}`);
            console.error(`Error details: ${JSON.stringify(error)}`);
            throw error;
        }
    }
    /**
     * Read all meter data in one call
     */
    async readMeterData() {
        if (!this.connected) {
            await this.connect();
        }
        try {
            // Read values sequentially to avoid timeouts (some inverters don't handle parallel well)
            const power = await this.readMeterPower();
            const importEnergy = await this.readImportEnergy();
            const exportEnergy = await this.readExportEnergy();
            return {
                power,
                importEnergy,
                exportEnergy,
                timestamp: new Date()
            };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error reading meter data: ${errorMsg}`);
            // Try to reconnect on error
            this.connected = false;
            throw error;
        }
    }
    /**
     * Check if connection is alive
     */
    isConnected() {
        return this.connected;
    }
}
exports.ModbusReader = ModbusReader;
//# sourceMappingURL=modbusReader.js.map