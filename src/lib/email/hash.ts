/**
 * email hash + HMAC tokens.
 *
 * `hashEmail` — stable server-side fingerprint of a subscriber address.
 * SHA-256 of the lowercased, trimmed email. Rainbow-table-able for
 * common addresses, which is acceptable for this stage (the hash is
 * the primary key of the consent ledger, not a password). Re-evaluate
 * at 10k subscribers — consider HMAC-SHA-256 with a rotating pepper
 * (flagged in PRD §AUDITOR-REVIEW).
 *
 * `mintToken` / `verifyToken` — short-lived signed tokens for
 * confirmation and unsubscribe links. Format:
 *
 *   base64url(payloadJson) "." base64url(hmac256(payloadJson, secret))
 *
 * Payload is `{id, kind, emailHash, exp?}`. `exp` (unix seconds) is
 * optional — confirm tokens expire after 24h, unsub tokens don't.
 * Verification uses a constant-time MAC compare; mismatches return
 * a structured reason rather than throwing.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

export function hashEmail(raw: string): string {
  const normalised = raw.trim().toLowerCase();
  return createHash("sha256").update(normalised).digest("hex");
}

export type TokenKind = "confirm" | "unsub";

export type TokenPayload = {
  id: string;
  kind: TokenKind;
  emailHash: string;
  exp?: number;
};

type MintInput = {
  kind: TokenKind;
  emailHash: string;
  ttlSec?: number;
  nowMs?: number;
};

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signPayload(payloadB64: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(payloadB64).digest();
  return base64url(mac);
}

/**
 * Mint a signed token. Caller supplies `secret` (for tests) or the
 * helper pulls `TOKEN_SIGNING_SECRET` from env.
 */
export function mintToken(input: MintInput, secret?: string): string {
  const signingSecret = secret ?? requireEnv("TOKEN_SIGNING_SECRET");
  const id = randomBytes(16).toString("hex");
  const now = input.nowMs ?? Date.now();
  const payload: TokenPayload = {
    id,
    kind: input.kind,
    emailHash: input.emailHash,
  };
  if (input.ttlSec !== undefined) {
    payload.exp = Math.floor(now / 1000) + input.ttlSec;
  }
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = signPayload(payloadB64, signingSecret);
  return `${payloadB64}.${mac}`;
}

export type VerifyResult =
  | { valid: true; payload: TokenPayload }
  | { valid: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyToken(
  token: string,
  secret?: string,
  nowMs?: number,
): VerifyResult {
  const signingSecret = secret ?? requireEnv("TOKEN_SIGNING_SECRET");
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadB64, mac] = parts;
  if (!payloadB64 || !mac) return { valid: false, reason: "malformed" };

  const expectedMac = signPayload(payloadB64, signingSecret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad-signature" };
  }

  let payload: TokenPayload;
  try {
    const json = fromBase64url(payloadB64).toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.id !== "string" ||
      (parsed.kind !== "confirm" && parsed.kind !== "unsub") ||
      typeof parsed.emailHash !== "string"
    ) {
      return { valid: false, reason: "malformed" };
    }
    payload = parsed as TokenPayload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (payload.exp !== undefined) {
    const now = nowMs ?? Date.now();
    if (Math.floor(now / 1000) >= payload.exp) {
      return { valid: false, reason: "expired" };
    }
  }

  return { valid: true, payload };
}

/**
 * Convenience: SHA-256 of a token string, used as the Redis key for
 * reverse-lookup (we never store the raw token server-side; we store
 * sha256(token) so even a Redis leak doesn't yield live tokens).
 */
export function tokenLookupKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
