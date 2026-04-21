/**
 * Email-plaintext encryption — AES-256-GCM using `SUBSCRIBER_EMAIL_ENC_KEY`.
 *
 * Why encrypt instead of hash? S33 stored only `sha256(email)` so the
 * subscriber ledger was pseudonymous. S34 needs to *send* the digest,
 * which requires the plaintext address. Keeping plaintext in Redis
 * alongside the hash trades pseudonymity for a single point of
 * compromise; encrypting with an env-held key keeps the ledger leakage-
 * resistant (a stolen Redis dump without the key is useless).
 *
 * Key format: 32-byte key, hex-encoded (64 chars). Rotate by changing
 * the env var; old ciphertexts become undecryptable by design — on
 * rotate, operator must re-subscribe the list (or run a re-encrypt
 * migration in a future issue).
 *
 * Output shape: base64(iv || ciphertext || authTag) where iv is 12 bytes
 * and authTag is 16 bytes (GCM standard). No separator — fixed offsets.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const TAG_LEN = 16;

export class EmailEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailEncryptionError";
  }
}

function loadKey(): Buffer {
  const hex = process.env.SUBSCRIBER_EMAIL_ENC_KEY;
  if (!hex) {
    throw new EmailEncryptionError(
      "SUBSCRIBER_EMAIL_ENC_KEY is not set",
    );
  }
  return decodeKeyHex(hex);
}

/** Parse a 64-char hex string into a 32-byte Buffer. Exported for tests
 *  and for dependency-injected calls that prefer not to read env. */
export function decodeKeyHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== KEY_LEN * 2) {
    throw new EmailEncryptionError(
      `SUBSCRIBER_EMAIL_ENC_KEY must be ${KEY_LEN * 2} hex chars (got ${hex.length})`,
    );
  }
  return Buffer.from(hex, "hex");
}

export type EncryptOpts = { key?: Buffer };

export function encryptEmail(plaintext: string, opts: EncryptOpts = {}): string {
  const key = opts.key ?? loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decryptEmail(ciphertext: string, opts: EncryptOpts = {}): string {
  const key = opts.key ?? loadKey();
  const raw = Buffer.from(ciphertext, "base64");
  if (raw.length < IV_LEN + TAG_LEN + 1) {
    throw new EmailEncryptionError("ciphertext too short");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(raw.length - TAG_LEN);
  const body = raw.subarray(IV_LEN, raw.length - TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new EmailEncryptionError("ciphertext authentication failed");
  }
}
