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
export interface MeterData {
    power: number;
    importEnergy: number;
    exportEnergy: number;
    timestamp: Date;
}
export declare class ModbusReader {
    private client;
    private host;
    private connected;
    constructor(host: string);
    /**
     * Connect to the inverter via Modbus TCP
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the inverter
     */
    disconnect(): Promise<void>;
    /**
     * Read meter power from register 5600
     * @returns Power in Watts (UINT16)
     */
    private readMeterPower;
    /**
     * Read forward active energy (grid import) from register 5098
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    private readImportEnergy;
    /**
     * Read reverse active energy (grid export) from register 5094
     * @returns Energy in kWh (UINT32 little-endian, scaled by 0.1)
     */
    private readExportEnergy;
    /**
     * Read all meter data in one call
     */
    readMeterData(): Promise<MeterData>;
    /**
     * Check if connection is alive
     */
    isConnected(): boolean;
}
