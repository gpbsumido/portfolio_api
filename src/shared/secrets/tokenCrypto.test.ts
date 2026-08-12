import { describe, test, expect, beforeEach, afterEach } from 'vitest';
// Shared with the CommonJS utils/*.js layer, which also handles these tokens.
// One implementation rather than two: a second copy of a crypto routine is a
// second place for it to be subtly wrong.
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptIfConfigured,
  encryptionConfigured,
  MissingEncryptionKeyError,
} from '../../../utils/tokenCrypto.js';

const KEY = 'a'.repeat(64);
const REFRESH_TOKEN = '1//0eXaMpLe-refresh-token-value';

const original = process.env.TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  if (original === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = original;
});

describe('tokenCrypto', () => {
  test('a round trip returns the original token', () => {
    expect(decryptToken(encryptToken(REFRESH_TOKEN))).toBe(REFRESH_TOKEN);
  });

  test('the ciphertext does not contain the token', () => {
    expect(encryptToken(REFRESH_TOKEN)).not.toContain(REFRESH_TOKEN);
  });

  test('encrypting twice gives different ciphertext for the same input', () => {
    // A fresh IV each time, so identical tokens don't produce identical rows.
    expect(encryptToken(REFRESH_TOKEN)).not.toBe(encryptToken(REFRESH_TOKEN));
  });

  test('a tampered ciphertext fails rather than decrypting to something', () => {
    const encrypted = encryptToken(REFRESH_TOKEN);
    const parts = encrypted.split(':');
    const body = Buffer.from(parts[3], 'base64');
    body[0] ^= 0xff;
    parts[3] = body.toString('base64');

    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  test('a different key cannot decrypt', () => {
    const encrypted = encryptToken(REFRESH_TOKEN);
    process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);

    expect(() => decryptToken(encrypted)).toThrow();
  });

  test('plaintext passes through, so pre-migration rows still work', () => {
    expect(isEncrypted(REFRESH_TOKEN)).toBe(false);
    expect(decryptToken(REFRESH_TOKEN)).toBe(REFRESH_TOKEN);
  });

  test('an encrypted value is recognised as such', () => {
    expect(isEncrypted(encryptToken(REFRESH_TOKEN))).toBe(true);
  });

  test('encryptIfConfigured stores plaintext when no key is set', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;

    expect(encryptionConfigured()).toBe(false);
    expect(encryptIfConfigured(REFRESH_TOKEN)).toBe(REFRESH_TOKEN);
  });

  test('encrypting without a key is a clear error, not a silent passthrough', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;

    expect(() => encryptToken(REFRESH_TOKEN)).toThrow(MissingEncryptionKeyError);
  });

  test('a wrong-length key is rejected', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'abcd';

    expect(() => encryptToken(REFRESH_TOKEN)).toThrow(/32 bytes/);
  });
});
