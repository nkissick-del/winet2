import * as winston from 'winston';
import * as tls from 'tls';
export declare class SSLConfig {
    private logger;
    private validationMode;
    private sslEnabled;
    private certificateFingerprints;
    constructor(logger: winston.Logger);
    private parseCertificateFingerprints;
    private validateConfiguration;
    private logConfiguration;
    getSSLOptions(host: string): tls.ConnectionOptions;
    getConnectionStatus(host: string, success: boolean, error?: Error): string;
    static displayConfigHelp(logger: winston.Logger): void;
}
