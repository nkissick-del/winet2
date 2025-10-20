/**
 * Type declarations for modbus-serial
 */

declare module 'modbus-serial' {
  interface ReadRegisterResult {
    data: number[];
    buffer: Buffer;
  }

  interface ConnectionOptions {
    port?: number;
  }

  class ModbusRTU {
    constructor();

    connectTCP(ip: string, options?: ConnectionOptions): Promise<void>;
    setID(id: number): void;
    setTimeout(timeout: number): void;
    close(callback?: () => void): void;

    readHoldingRegisters(
      address: number,
      length: number,
    ): Promise<ReadRegisterResult>;
    readInputRegisters(
      address: number,
      length: number,
    ): Promise<ReadRegisterResult>;
    writeRegister(address: number, value: number): Promise<void>;
    writeRegisters(address: number, values: number[]): Promise<void>;
  }

  export = ModbusRTU;
}
