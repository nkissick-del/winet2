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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProperties = getProperties;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const sslConfig_1 = require("./sslConfig");
function getProperties(logger, host, lang, ssl) {
    return new Promise((resolve, reject) => {
        const url = `${ssl ? 'https' : 'http'}://${host}/i18n/${lang}.properties`;
        const request = () => {
            const sslConfig = new sslConfig_1.SSLConfig(logger);
            const options = ssl ? sslConfig.getSSLOptions() : {};
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
//# sourceMappingURL=getProperties.js.map