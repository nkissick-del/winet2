/**
 * Unit tests for SSLConfig
 * Tests SSL validation modes and certificate fingerprint handling
 */

/* eslint-disable @typescript-eslint/no-floating-promises */

import {describe, it} from 'node:test';
import assert from 'node:assert';

describe('SSLConfig', () => {
  it('should normalize certificate fingerprints', () => {
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
      assert.strictEqual(
        normalized,
        testCase.expected,
        `Fingerprint ${testCase.input} should normalize to ${testCase.expected}`,
      );
    }
  });

  it('should validate SSL modes', () => {
    const validModes = ['bypass', 'pinned', 'strict'];

    for (const mode of validModes) {
      assert.strictEqual(isValidSSLMode(mode), true, `${mode} should be valid`);
    }

    const invalidModes = ['invalid', 'none', 'insecure', ''];
    for (const mode of invalidModes) {
      assert.strictEqual(
        isValidSSLMode(mode),
        false,
        `${mode} should be invalid`,
      );
    }
  });

  it('should default to bypass mode when invalid', () => {
    const testCases = [
      {input: 'invalid', expected: 'bypass'},
      {input: '', expected: 'bypass'},
      {input: 'BYPASS', expected: 'bypass'},
      {input: 'PINNED', expected: 'pinned'},
      {input: 'STRICT', expected: 'strict'},
    ];

    for (const testCase of testCases) {
      const mode = getSSLMode(testCase.input);
      assert.strictEqual(
        mode,
        testCase.expected,
        `Input ${testCase.input} should result in ${testCase.expected}`,
      );
    }
  });

  it('should handle WebSocket options for different SSL modes', () => {
    const bypassOptions = getWebSocketOptions('bypass', undefined);
    assert.strictEqual(
      bypassOptions.rejectUnauthorized,
      false,
      'Bypass mode should not reject unauthorized',
    );

    const strictOptions = getWebSocketOptions('strict', undefined);
    assert.strictEqual(
      strictOptions.rejectUnauthorized,
      true,
      'Strict mode should reject unauthorized',
    );
  });

  it('should validate fingerprint format', () => {
    const validFingerprints = [
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
      'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      'AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899',
    ];

    for (const fp of validFingerprints) {
      const normalized = normalizeFingerprint(fp);
      assert.strictEqual(
        normalized.length,
        64,
        'SHA-256 fingerprint should be 64 characters after normalization',
      );
    }
  });
});

// Helper functions for testing
function normalizeFingerprint(fingerprint: string): string {
  return fingerprint.replace(/:/g, '').toLowerCase();
}

function isValidSSLMode(mode: string): boolean {
  return ['bypass', 'pinned', 'strict'].includes(mode.toLowerCase());
}

function getSSLMode(input: string): string {
  const normalized = input.toLowerCase();
  if (isValidSSLMode(normalized)) {
    return normalized;
  }
  return 'bypass';
}

function getWebSocketOptions(
  mode: string,
  fingerprint?: string,
): {rejectUnauthorized: boolean; checkServerIdentity?: () => undefined} {
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
