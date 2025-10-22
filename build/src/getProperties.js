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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sslConfig_1 = require("./sslConfig");
// Cache configuration
const CACHE_DIR = process.env.PROPERTIES_CACHE_DIR || '/data/cache';
const CACHE_TTL_MS = parseInt(process.env.PROPERTIES_CACHE_TTL || '604800000') || 604800000; // 7 days default
const CACHE_ENABLED = process.env.PROPERTIES_CACHE_ENABLED !== 'false' &&
    process.env.DISABLE_PROPERTIES_CACHE !== 'true';
/**
 * Get cache file path for host and language
 */
function getCacheFilePath(host, lang) {
    // Sanitize host for filename (replace dots and special chars with underscores)
    const sanitizedHost = host.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `properties_${sanitizedHost}_${lang}.json`;
    return path.join(CACHE_DIR, filename);
}
/**
 * Load properties from cache if valid
 */
function loadFromCache(logger, host, lang) {
    if (!CACHE_ENABLED) {
        return null;
    }
    try {
        const cacheFile = getCacheFilePath(host, lang);
        // Check if cache file exists
        if (!fs.existsSync(cacheFile)) {
            logger.debug(`No cache file found for ${host}/${lang}`);
            return null;
        }
        // Read and parse cache file
        const cacheData = fs.readFileSync(cacheFile, 'utf-8');
        const cached = JSON.parse(cacheData);
        // Validate cache age
        const age = Date.now() - cached.timestamp;
        if (age > CACHE_TTL_MS) {
            logger.info(`Properties cache expired for ${host}/${lang} (age: ${Math.floor(age / 1000 / 60 / 60)}h)`);
            return null;
        }
        // Validate cache matches request
        if (cached.host !== host || cached.lang !== lang) {
            logger.warn(`Cache mismatch for ${host}/${lang} (cached: ${cached.host}/${cached.lang})`);
            return null;
        }
        logger.info(`Loaded properties from cache for ${host}/${lang} (age: ${Math.floor(age / 1000 / 60)}m)`);
        return {
            properties: cached.properties,
            forceSsl: cached.forceSsl,
        };
    }
    catch (error) {
        logger.warn(`Failed to load properties cache: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
/**
 * Save properties to cache
 */
function saveToCache(logger, host, lang, result) {
    if (!CACHE_ENABLED) {
        return;
    }
    try {
        // Create cache directory if it doesn't exist
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            logger.debug(`Created cache directory: ${CACHE_DIR}`);
        }
        const cacheFile = getCacheFilePath(host, lang);
        const cached = {
            properties: result.properties,
            forceSsl: result.forceSsl,
            timestamp: Date.now(),
            host,
            lang,
        };
        fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2), 'utf-8');
        logger.info(`Saved properties to cache: ${cacheFile}`);
    }
    catch (error) {
        logger.warn(`Failed to save properties cache: ${error instanceof Error ? error.message : String(error)}`);
        // Don't throw - caching failure shouldn't break the application
    }
}
function getProperties(logger, host, lang, ssl) {
    // Try to load from cache first
    const cached = loadFromCache(logger, host, lang);
    if (cached) {
        return Promise.resolve(cached);
    }
    // Fetch from network if cache miss
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
                    const result = { properties, forceSsl: ssl };
                    // Save to cache for future use
                    saveToCache(logger, host, lang, result);
                    resolve(result);
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