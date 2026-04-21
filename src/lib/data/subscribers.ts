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
      "status" | "confirmedAt" | "unsubscribedAt" | "confirmToken" | "lastDeliveryError"
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
