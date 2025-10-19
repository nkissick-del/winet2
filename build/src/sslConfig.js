"use strict";
// SSL Configuration Helper
// This module handles SSL security level configuration and validation
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSLConfig = void 0;
class SSLConfig {
    logger;
    validationMode;
    sslEnabled;
    certificateFingerprints;
    constructor(logger) {
        this.logger = logger;
        this.validationMode = process.env.SSL_VALIDATION || 'bypass';
        this.sslEnabled = process.env.SSL === 'true';
        this.certificateFingerprints = this.parseCertificateFingerprints();
        this.validateConfiguration();
        this.logConfiguration();
    }
    parseCertificateFingerprints() {
        const fingerprintsEnv = process.env.INVERTER_CERT_FINGERPRINTS;
        if (!fingerprintsEnv)
            return [];
        return fingerprintsEnv
            .split(',')
            .map(fp => fp.trim())
            .filter(fp => fp.length > 0)
            .map(fp => fp.replace(/:/g, '').toLowerCase()); // Normalize format
    }
    validateConfiguration() {
        const validModes = ['bypass', 'pinned', 'strict'];
        if (!validModes.includes(this.validationMode)) {
            this.logger.warn(`⚠️  Invalid SSL_VALIDATION mode: ${this.validationMode}. Using 'bypass'.`);
            this.validationMode = 'bypass';
        }
        if (this.validationMode === 'pinned' &&
            this.certificateFingerprints.length === 0) {
            this.logger.warn("⚠️  SSL_VALIDATION=pinned but no INVERTER_CERT_FINGERPRINTS provided. Falling back to 'bypass'.");
            this.validationMode = 'bypass';
        }
    }
    logConfiguration() {
        if (!this.sslEnabled) {
            this.logger.info('🔓 SSL: DISABLED - Using unencrypted HTTP/WS connections');
            return;
        }
        const securityIcons = {
            bypass: '⚠️',
            pinned: '🛡️',
            strict: '🔒',
        };
        const securityLevels = {
            bypass: 'MEDIUM-LOW (accepts any certificate)',
            pinned: 'MEDIUM-HIGH (validates against known certificates)',
            strict: 'HIGH (full certificate validation)',
        };
        this.logger.info('🔐 SSL Configuration:');
        this.logger.info(`   Mode: ${securityIcons[this.validationMode]} ${this.validationMode.toUpperCase()}`);
        this.logger.info(`   Security Level: ${securityLevels[this.validationMode]}`);
        if (this.validationMode === 'pinned') {
            this.logger.info(`   Certificate Fingerprints: ${this.certificateFingerprints.length} configured`);
        }
        if (this.validationMode === 'bypass') {
            this.logger.info("   ℹ️  Consider upgrading to 'pinned' mode for enhanced security");
            this.logger.info("   ℹ️  Run './quick-ssl-check.sh' to analyze your inverter certificates");
        }
    }
    getSSLOptions(host) {
        if (!this.sslEnabled) {
            return {};
        }
        switch (this.validationMode) {
            case 'strict':
                return {
                    rejectUnauthorized: true,
                };
            case 'pinned':
                return {
                    rejectUnauthorized: false, // Still bypass for self-signed certs
                    checkServerIdentity: (hostname, cert) => {
                        const certFingerprint = cert.fingerprint256
                            .replace(/:/g, '')
                            .toLowerCase();
                        if (this.certificateFingerprints.includes(certFingerprint)) {
                            return undefined; // Valid certificate
                        }
                        this.logger.error(`❌ Certificate fingerprint mismatch for ${hostname}`);
                        this.logger.error(`   Expected one of: ${this.certificateFingerprints.join(', ')}`);
                        this.logger.error(`   Received: ${certFingerprint}`);
                        return new Error('Certificate fingerprint not in pinned list');
                    },
                };
            case 'bypass':
            default:
                return {
                    rejectUnauthorized: false,
                };
        }
    }
    // Generate user-friendly SSL status for logs
    getConnectionStatus(host, success, error) {
        const icon = success ? '✅' : '❌';
        const status = success ? 'SUCCESS' : 'FAILED';
        let message = `${icon} SSL Connection to ${host}: ${status}`;
        if (!success && error) {
            message += ` (${error.message})`;
            if (this.validationMode === 'strict' &&
                error.message.includes('certificate')) {
                message +=
                    '\n   💡 Try SSL_VALIDATION=bypass if inverter uses self-signed certificates';
            }
            if (this.validationMode === 'pinned' &&
                error.message.includes('fingerprint')) {
                message +=
                    '\n   💡 Run ./quick-ssl-check.sh to get updated certificate fingerprints';
            }
        }
        return message;
    }
    // Display configuration help
    static displayConfigHelp(logger) {
        logger.info('');
        logger.info('🔐 SSL Security Configuration Help:');
        logger.info('=====================================');
        logger.info('');
        logger.info('Add to your .env file:');
        logger.info('');
        logger.info('# Basic SSL setting');
        logger.info('SSL=true');
        logger.info('');
        logger.info('# Security level (choose one):');
        logger.info('SSL_VALIDATION=bypass    # Default - works with all inverters');
        logger.info('SSL_VALIDATION=pinned    # Enhanced security with certificate pinning');
        logger.info('SSL_VALIDATION=strict    # Maximum security (may fail with most inverters)');
        logger.info('');
        logger.info('# For pinned mode, add certificate fingerprints:');
        logger.info('INVERTER_CERT_FINGERPRINTS=sha256:ABC123...,sha256:DEF456...');
        logger.info('');
        logger.info('📖 Full guide: SSL-SECURITY-GUIDE.md');
        logger.info('🔍 Analyze certificates: ./quick-ssl-check.sh');
        logger.info('');
    }
}
exports.SSLConfig = SSLConfig;
//# sourceMappingURL=sslConfig.js.map