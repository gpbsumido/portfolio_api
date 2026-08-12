const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");

/**
 * Envelope encryption for OAuth tokens held at rest.
 *
 * Google refresh tokens are long-lived, offline-scope credentials for a user's
 * whole calendar. Stored as plain text they turn any backup, replica or leaked
 * connection string into permanent access to every connected account, so the
 * column is worth encrypting even though the database itself is private.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding garbage that gets sent to Google as a credential.
 *
 * The stored format is self-describing -- `v1:<iv>:<tag>:<ciphertext>`, all
 * base64 -- so `isEncrypted` can tell an already-migrated row from a plaintext
 * one. That is what lets the code run correctly before, during and after the
 * migration rather than requiring a synchronised cutover.
 */
const PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

/** Reads the key at call time so tests and migrations can set it per-process. */
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new MissingEncryptionKeyError();

  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes as hex (64 characters); got ${buf.length}`,
    );
  }
  return buf;
}

/** Whether a stored value is already in the encrypted envelope format. */
function isEncrypted(value) {
  if (!value) return false;
  return value.startsWith(`${PREFIX}:`) && value.split(':').length === 4;
}

/** Whether a key is configured at all, without throwing. */
function encryptionConfigured() {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
}

function encryptToken(plaintext) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a stored value, passing plaintext through unchanged.
 *
 * The passthrough is deliberate: rows written before the migration are still
 * plaintext, and a read path that threw on them would take calendar sync down
 * for every connected user the moment this deployed.
 */
function decryptToken(stored) {
  if (!isEncrypted(stored)) return stored;

  const [, ivB64, tagB64, ctB64] = stored.split(':');
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Encrypts when a key is configured, otherwise stores as-is. */
function encryptIfConfigured(plaintext) {
  return encryptionConfigured() ? encryptToken(plaintext) : plaintext;
}

module.exports = {
  isEncrypted,
  encryptionConfigured,
  encryptToken,
  decryptToken,
  encryptIfConfigured,
  MissingEncryptionKeyError,
};
