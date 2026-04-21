import { describe, expect, it } from "vitest";
import {
  hashEmail,
  mintToken,
  tokenLookupKey,
  verifyToken,
} from "@/lib/email/hash";

const TEST_SECRET = "test-signing-secret-dont-ship-this";
const HASH = "a".repeat(64);

describe("hashEmail", () => {
  it("produces a stable 64-char hex string", () => {
    const h = hashEmail("user@example.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-insensitive in the local part and domain", () => {
    expect(hashEmail("User@Example.COM")).toBe(hashEmail("user@example.com"));
  });

  it("trims surrounding whitespace", () => {
    expect(hashEmail("  user@example.com\n")).toBe(hashEmail("user@example.com"));
  });

  it("differs for different emails", () => {
    expect(hashEmail("a@x.com")).not.toBe(hashEmail("b@x.com"));
  });
});

describe("mintToken / verifyToken", () => {
  it("mints then verifies a token successfully", () => {
    const token = mintToken(
      { kind: "confirm", emailHash: HASH, ttlSec: 3600 },
      TEST_SECRET,
    );
    const result = verifyToken(token, TEST_SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.kind).toBe("confirm");
      expect(result.payload.emailHash).toBe(HASH);
      expect(result.payload.id).toMatch(/^[0-9a-f]{32}$/);
      expect(result.payload.exp).toBeGreaterThan(0);
    }
  });

  it("mints distinct tokens for repeated calls (random id)", () => {
    const a = mintToken({ kind: "confirm", emailHash: HASH }, TEST_SECRET);
    const b = mintToken({ kind: "confirm", emailHash: HASH }, TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it("rejects a token signed with a different secret (bad-signature)", () => {
    const token = mintToken({ kind: "confirm", emailHash: HASH }, TEST_SECRET);
    const result = verifyToken(token, "different-secret");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("bad-signature");
  });

  it("rejects a tampered payload (bad-signature)", () => {
    const token = mintToken(
      { kind: "confirm", emailHash: HASH },
      TEST_SECRET,
    );
    const [, mac] = token.split(".");
    const tampered = `AAAA.${mac}`;
    const result = verifyToken(tampered, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("bad-signature");
  });

  it("rejects a malformed token (no dot)", () => {
    const result = verifyToken("nodothere", TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed");
  });

  it("rejects a token with three parts (malformed)", () => {
    const result = verifyToken("a.b.c", TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed");
  });

  it("rejects an expired token (exp in the past)", () => {
    const now = 1_700_000_000_000;
    const token = mintToken(
      { kind: "confirm", emailHash: HASH, ttlSec: 60, nowMs: now },
      TEST_SECRET,
    );
    // 1 hour later: token (60s TTL) is expired
    const result = verifyToken(token, TEST_SECRET, now + 3600 * 1000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });

  it("accepts an unexpired unsub token (no exp field)", () => {
    const token = mintToken(
      { kind: "unsub", emailHash: HASH },
      TEST_SECRET,
    );
    const result = verifyToken(token, TEST_SECRET, Date.now() + 365 * 86400 * 1000);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.kind).toBe("unsub");
      expect(result.payload.exp).toBeUndefined();
    }
  });

  it("treats payload that decodes to non-object as malformed", () => {
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const payloadB64 = Buffer.from("\"a string\"", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const mac = createHmac("sha256", TEST_SECRET)
      .update(payloadB64)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = verifyToken(`${payloadB64}.${mac}`, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed");
  });

  it("treats payload with unknown kind as malformed", () => {
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const payloadB64 = Buffer.from(
      JSON.stringify({ id: "x", kind: "other", emailHash: HASH }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const mac = createHmac("sha256", TEST_SECRET)
      .update(payloadB64)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = verifyToken(`${payloadB64}.${mac}`, TEST_SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed");
  });
});

describe("tokenLookupKey", () => {
  it("sha256s the raw token to a 64-char hex string", () => {
    const token = mintToken({ kind: "confirm", emailHash: HASH }, TEST_SECRET);
    const key = tokenLookupKey(token);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const token = mintToken({ kind: "confirm", emailHash: HASH }, TEST_SECRET);
    expect(tokenLookupKey(token)).toBe(tokenLookupKey(token));
  });
});
