"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProperties = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const sslConfig_1 = require("./sslConfig");
function getProperties(logger, host, lang, ssl) {
    return new Promise((resolve, reject) => {
        const url = `${ssl ? 'https' : 'http'}://${host}/i18n/${lang}.properties`;
        const request = () => {
            const sslConfig = new sslConfig_1.SSLConfig(logger);
            const options = ssl ? sslConfig.getSSLOptions(host) : {};
            (ssl ? https : http)
                .get(url, options, res => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('error', (err) => {
                    if (!ssl) {
                        // Retry with ssl set to true
                        getProperties(logger, host, lang, true)
                            .then(resolve)
                            .catch(reject);
                    }
                    else {
                        reject(err);
                    }
                });
                res.on('end', () => {
                    // Optimized properties parsing with reduced array operations
                    const properties = {};
                    const lines = data.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const equalPos = line.indexOf('=');
                        if (equalPos > 0) {
                            const key = line.substring(0, equalPos);
                            const value = line.substring(equalPos + 1);
                            if (key && value) {
                                properties[key] = value;
                            }
                        }
                    }
                    resolve({ properties, forceSsl: ssl });
                });
            })
                .on('error', (err) => {
                if (!ssl) {
                    logger.warn('Newer Winet versions require SSL to be enabled. Retrying');
                    // Retry with ssl set to true
                    getProperties(logger, host, lang, true).then(resolve).catch(reject);
                }
                else {
                    reject(err);
                }
            });
        };
        request();
    });
}
exports.getProperties = getProperties;
//# sourceMappingURL=getProperties.js.map