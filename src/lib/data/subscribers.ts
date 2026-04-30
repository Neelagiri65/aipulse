/**
 * subscribers — Redis I/O for the email-capture ledger.
 *
 * Key shape (see PRD §"Data model (Redis keys)"):
 *   sub:{emailHash}                 — the subscriber record (JSON)
 *   sub:index                       — SADD of every emailHash
 *   sub:confirmToken:{tokenHash}    — reverse lookup, 24h TTL
 *   sub:unsubToken:{tokenHash}      — reverse lookup, no TTL
 *
 * Every call returns the fail-soft value if Redis is unconfigured
 * (null / empty / false), mirroring the pattern in pkg-store / hn-store.
 * Production call sites already handle "unavailable" gracefully.
 *
 * Tests inject a minimal in-memory client via the `client` parameter;
 * the default pulls from the shared Upstash singleton.
 */

import { Redis } from "@upstash/redis";
import { tokenLookupKey } from "@/lib/email/hash";

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export type SubscriberRecord = {
  emailHash: string;
  status: SubscriberStatus;
  geo: { country: string | null; region: string | null; covered: boolean };
  consentCategories: {
    necessary: true;
    analytics: boolean;
    marketing: boolean;
  };
  createdAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
  confirmToken?: string;
  unsubToken: string;
  lastDeliveryError?: string;
  /**
   * AES-256-GCM ciphertext of the plaintext email, base64-encoded.
   * Populated at subscribe-time (we have the plaintext in the POST body);
   * cleared to null on unsubscribe so a former subscriber's address is
   * not sitting in the ledger. Absence (undefined) on older records is
   * backwards-compatible with the S33 shape — `readConfirmedSubscribersWithEmail`
   * simply skips them.
   */
  encryptedEmail?: string | null;
};

export type SubscriberClient = Pick<
  Redis,
  "get" | "set" | "del" | "sadd" | "scard" | "smembers"
>;

let cached: Redis | null | undefined;

function defaultClient(): SubscriberClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return cached;
  }
  cached = new Redis({ url, token });
  return cached;
}

export function __resetSubscriberClientCache(): void {
  cached = undefined;
}

export function subscriberKey(emailHash: string): string {
  return `sub:${emailHash}`;
}

export function confirmTokenKey(token: string): string {
  return `sub:confirmToken:${tokenLookupKey(token)}`;
}

export function unsubTokenKey(token: string): string {
  return `sub:unsubToken:${tokenLookupKey(token)}`;
}

type Opts = { client?: SubscriberClient };

export async function readSubscriber(
  emailHash: string,
  opts: Opts = {},
): Promise<SubscriberRecord | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const raw = await r.get(subscriberKey(emailHash));
    return parseRecord(raw);
  } catch {
    return null;
  }
}

export async function writeSubscriber(
  record: SubscriberRecord,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.set(subscriberKey(record.emailHash), JSON.stringify(record));
    await r.sadd("sub:index", record.emailHash);
  } catch {
    // caller treats "unavailable" as the response
  }
}

export async function updateSubscriberStatus(
  emailHash: string,
  patch: Partial<
    Pick<
      SubscriberRecord,
      | "status"
      | "confirmedAt"
      | "unsubscribedAt"
      | "confirmToken"
      | "lastDeliveryError"
      | "encryptedEmail"
    >
  >,
  opts: Opts = {},
): Promise<SubscriberRecord | null> {
  const current = await readSubscriber(emailHash, opts);
  if (!current) return null;
  const next: SubscriberRecord = { ...current, ...patch };
  if (patch.confirmToken === undefined && "confirmToken" in patch) {
    delete next.confirmToken;
  }
  await writeSubscriber(next, opts);
  return next;
}

export async function findByConfirmToken(
  token: string,
  opts: Opts = {},
): Promise<SubscriberRecord | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const hash = await r.get(confirmTokenKey(token));
    if (typeof hash !== "string") return null;
    return readSubscriber(hash, opts);
  } catch {
    return null;
  }
}

export async function findByUnsubToken(
  token: string,
  opts: Opts = {},
): Promise<SubscriberRecord | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const hash = await r.get(unsubTokenKey(token));
    if (typeof hash !== "string") return null;
    return readSubscriber(hash, opts);
  } catch {
    return null;
  }
}

export async function indexConfirmToken(
  token: string,
  emailHash: string,
  ttlSec: number,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.set(confirmTokenKey(token), emailHash, { ex: ttlSec });
  } catch {
    /* fail-soft */
  }
}

export async function indexUnsubToken(
  token: string,
  emailHash: string,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.set(unsubTokenKey(token), emailHash);
  } catch {
    /* fail-soft */
  }
}

export async function deleteConfirmToken(
  token: string,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.del(confirmTokenKey(token));
  } catch {
    /* fail-soft */
  }
}

export async function countSubscribers(opts: Opts = {}): Promise<number> {
  const r = opts.client ?? defaultClient();
  if (!r) return 0;
  try {
    return (await r.scard("sub:index")) ?? 0;
  } catch {
    return 0;
  }
}

export async function deleteSubscriber(
  emailHash: string,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  try {
    await r.del(subscriberKey(emailHash));
    // intentionally leave sub:index membership — the anonymised count
    // is used for ops telemetry; remove by explicit SREM if we add that.
  } catch {
    /* fail-soft */
  }
}

export type ConfirmedSubscriberWithEmail = {
  emailHash: string;
  email: string;
  unsubToken: string;
  geo: SubscriberRecord["geo"];
};

/**
 * Operator-side projection of a subscriber for the /admin/subscribers
 * dashboard. Email is plaintext when decryption succeeds; null otherwise
 * (legacy record without encryptedEmail, key rotation, decrypt error).
 * Status is preserved verbatim — the admin view renders pending and
 * unsubscribed alongside confirmed so the operator can see the funnel.
 */
export type AdminSubscriberView = {
  emailHash: string;
  email: string | null;
  status: SubscriberStatus;
  geo: SubscriberRecord["geo"];
  createdAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
  lastDeliveryError?: string;
};

/**
 * Iterate every confirmed subscriber and return a list with decrypted
 * plaintext emails. Skips records that are:
 *   - not `confirmed` status
 *   - missing `encryptedEmail` (S33 legacy records never re-subscribed)
 *   - fail-to-decrypt (stale ciphertext under a rotated key, etc.)
 *
 * Decrypt is imported from `@/lib/mail/email-encryption` but injected
 * via `opts.decrypt` so tests avoid touching `SUBSCRIBER_EMAIL_ENC_KEY`.
 */
export async function readConfirmedSubscribersWithEmail(
  opts: Opts & { decrypt?: (ciphertext: string) => string } = {},
): Promise<ConfirmedSubscriberWithEmail[]> {
  const r = opts.client ?? defaultClient();
  if (!r) return [];
  let hashes: string[] = [];
  try {
    hashes = await r.smembers("sub:index");
  } catch {
    return [];
  }
  const decrypt =
    opts.decrypt ??
    ((ct: string) => {
      // Lazy import to keep non-send call sites free of the crypto dep.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require("@/lib/mail/email-encryption") as {
        decryptEmail: (s: string) => string;
      };
      return m.decryptEmail(ct);
    });
  const out: ConfirmedSubscriberWithEmail[] = [];
  for (const hash of hashes) {
    const rec = await readSubscriber(hash, { client: r });
    if (!rec || rec.status !== "confirmed") continue;
    if (!rec.encryptedEmail) continue;
    let email: string;
    try {
      email = decrypt(rec.encryptedEmail);
    } catch {
      continue;
    }
    out.push({
      emailHash: rec.emailHash,
      email,
      unsubToken: rec.unsubToken,
      geo: rec.geo,
    });
  }
  return out;
}

/**
 * Read every subscriber (any status) projected for the /admin view.
 * Plaintext email is decrypted when ciphertext is present and the key
 * decrypts cleanly; otherwise emits null and the row still renders so
 * the operator sees the record exists.
 *
 * Soft cap: returns the most recently created `limit` records (default
 * 500). Skips malformed or unparseable JSON silently; bumps the count
 * without surfacing them — corruption would be an upstream bug, not a
 * UI concern.
 *
 * Output is sorted by `createdAt` descending so the most recent signups
 * appear first.
 */
export async function readAllSubscribers(
  opts: Opts & {
    decrypt?: (ciphertext: string) => string;
    limit?: number;
  } = {},
): Promise<AdminSubscriberView[]> {
  const r = opts.client ?? defaultClient();
  if (!r) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));
  let hashes: string[] = [];
  try {
    hashes = await r.smembers("sub:index");
  } catch {
    return [];
  }
  if (hashes.length === 0) return [];

  const decrypt =
    opts.decrypt ??
    ((ct: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require("@/lib/mail/email-encryption") as {
        decryptEmail: (s: string) => string;
      };
      return m.decryptEmail(ct);
    });

  const out: AdminSubscriberView[] = [];
  for (const hash of hashes) {
    const rec = await readSubscriber(hash, { client: r });
    if (!rec) continue;
    let email: string | null = null;
    if (rec.encryptedEmail) {
      try {
        email = decrypt(rec.encryptedEmail);
      } catch {
        email = null;
      }
    }
    const view: AdminSubscriberView = {
      emailHash: rec.emailHash,
      email,
      status: rec.status,
      geo: rec.geo,
      createdAt: rec.createdAt,
    };
    if (rec.confirmedAt !== undefined) view.confirmedAt = rec.confirmedAt;
    if (rec.unsubscribedAt !== undefined) view.unsubscribedAt = rec.unsubscribedAt;
    if (rec.lastDeliveryError !== undefined) {
      view.lastDeliveryError = rec.lastDeliveryError;
    }
    out.push(view);
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out.slice(0, limit);
}

function parseRecord(value: unknown): SubscriberRecord | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.emailHash !== "string" ||
      typeof o.status !== "string" ||
      typeof o.createdAt !== "string"
    ) {
      return null;
    }
    return obj as SubscriberRecord;
  } catch {
    return null;
  }
}
