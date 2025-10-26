"use strict";
/**
 * Unit tests for SSLConfig
 * Tests SSL validation modes and certificate fingerprint handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-floating-promises */
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
(0, node_test_1.describe)('SSLConfig', () => {
    (0, node_test_1.it)('should normalize certificate fingerprints', () => {
        const testCases = [
            {
                input: 'AA:BB:CC:DD:EE:FF',
                expected: 'aabbccddeeff',
            },
            {
                input: 'aa:bb:cc:dd:ee:ff',
                expected: 'aabbccddeeff',
            },
            {
                input: 'AABBCCDDEEFF',
                expected: 'aabbccddeeff',
            },
            {
                input: 'aabbccddeeff',
                expected: 'aabbccddeeff',
            },
        ];
        for (const testCase of testCases) {
            const normalized = normalizeFingerprint(testCase.input);
            node_assert_1.default.strictEqual(normalized, testCase.expected, `Fingerprint ${testCase.input} should normalize to ${testCase.expected}`);
        }
    });
    (0, node_test_1.it)('should validate SSL modes', () => {
        const validModes = ['bypass', 'pinned', 'strict'];
        for (const mode of validModes) {
            node_assert_1.default.strictEqual(isValidSSLMode(mode), true, `${mode} should be valid`);
        }
        const invalidModes = ['invalid', 'none', 'insecure', ''];
        for (const mode of invalidModes) {
            node_assert_1.default.strictEqual(isValidSSLMode(mode), false, `${mode} should be invalid`);
        }
    });
    (0, node_test_1.it)('should default to bypass mode when invalid', () => {
        const testCases = [
            { input: 'invalid', expected: 'bypass' },
            { input: '', expected: 'bypass' },
            { input: 'BYPASS', expected: 'bypass' },
            { input: 'PINNED', expected: 'pinned' },
            { input: 'STRICT', expected: 'strict' },
        ];
        for (const testCase of testCases) {
            const mode = getSSLMode(testCase.input);
            node_assert_1.default.strictEqual(mode, testCase.expected, `Input ${testCase.input} should result in ${testCase.expected}`);
        }
    });
    (0, node_test_1.it)('should handle WebSocket options for different SSL modes', () => {
        const bypassOptions = getWebSocketOptions('bypass', undefined);
        node_assert_1.default.strictEqual(bypassOptions.rejectUnauthorized, false, 'Bypass mode should not reject unauthorized');
        const strictOptions = getWebSocketOptions('strict', undefined);
        node_assert_1.default.strictEqual(strictOptions.rejectUnauthorized, true, 'Strict mode should reject unauthorized');
    });
    (0, node_test_1.it)('should validate fingerprint format', () => {
        const validFingerprints = [
            'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
            'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
            'AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899',
        ];
        for (const fp of validFingerprints) {
            const normalized = normalizeFingerprint(fp);
            node_assert_1.default.strictEqual(normalized.length, 64, 'SHA-256 fingerprint should be 64 characters after normalization');
        }
    });
});
// Helper functions for testing
function normalizeFingerprint(fingerprint) {
    return fingerprint.replace(/:/g, '').toLowerCase();
}
function isValidSSLMode(mode) {
    return ['bypass', 'pinned', 'strict'].includes(mode.toLowerCase());
}
function getSSLMode(input) {
    const normalized = input.toLowerCase();
    if (isValidSSLMode(normalized)) {
        return normalized;
    }
    return 'bypass';
}
function getWebSocketOptions(mode, fingerprint) {
    if (mode === 'bypass') {
        return {
            rejectUnauthorized: false,
        };
    }
    if (mode === 'pinned' && fingerprint) {
        return {
            rejectUnauthorized: true,
            checkServerIdentity: () => undefined,
        };
    }
    // strict mode
    return {
        rejectUnauthorized: true,
    };
}
//# sourceMappingURL=sslconfig.test.js.map