import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  EmailEncryptionError,
  decodeKeyHex,
  decryptEmail,
  encryptEmail,
} from "@/lib/mail/email-encryption";

function newKey(): Buffer {
  return randomBytes(32);
}

describe("encryptEmail / decryptEmail round-trip", () => {
  it("recovers the original plaintext", () => {
    const key = newKey();
    const ct = encryptEmail("user@example.com", { key });
    expect(decryptEmail(ct, { key })).toBe("user@example.com");
  });

  it("produces different ciphertext for the same plaintext on each call", () => {
    const key = newKey();
    const a = encryptEmail("u@x.com", { key });
    const b = encryptEmail("u@x.com", { key });
    expect(a).not.toBe(b);
  });

  it("handles unicode and long emails", () => {
    const key = newKey();
    const addr = "brindhä+tag@nativerse-ventures.com";
    expect(decryptEmail(encryptEmail(addr, { key }), { key })).toBe(addr);
  });
});

describe("decryptEmail — tamper detection", () => {
  it("throws on truncated ciphertext", () => {
    const key = newKey();
    const ct = encryptEmail("u@x.com", { key });
    const truncated = Buffer.from(ct, "base64").subarray(0, 8).toString("base64");
    expect(() => decryptEmail(truncated, { key })).toThrow(EmailEncryptionError);
  });

  it("throws when the auth tag is flipped", () => {
    const key = newKey();
    const ct = encryptEmail("u@x.com", { key });
    const raw = Buffer.from(ct, "base64");
    raw[raw.length - 1] ^= 0x01;
    const tampered = raw.toString("base64");
    expect(() => decryptEmail(tampered, { key })).toThrow(EmailEncryptionError);
  });

  it("throws when the ciphertext body is flipped", () => {
    const key = newKey();
    const ct = encryptEmail("u@x.com", { key });
    const raw = Buffer.from(ct, "base64");
    raw[12] ^= 0x01; // first byte after IV
    const tampered = raw.toString("base64");
    expect(() => decryptEmail(tampered, { key })).toThrow(EmailEncryptionError);
  });
});

describe("decryptEmail — key rotation", () => {
  it("throws when decrypted with a different key", () => {
    const k1 = newKey();
    const k2 = newKey();
    const ct = encryptEmail("u@x.com", { key: k1 });
    expect(() => decryptEmail(ct, { key: k2 })).toThrow(EmailEncryptionError);
  });
});

describe("decodeKeyHex", () => {
  it("accepts 64 hex chars", () => {
    const hex = "00".repeat(32);
    expect(decodeKeyHex(hex).length).toBe(32);
  });

  it("rejects non-hex input", () => {
    expect(() => decodeKeyHex("z".repeat(64))).toThrow(EmailEncryptionError);
  });

  it("rejects wrong length", () => {
    expect(() => decodeKeyHex("00".repeat(16))).toThrow(EmailEncryptionError);
  });
});
