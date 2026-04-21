/**
 * consent — cookie state mirror + append-only audit log in Upstash.
 *
 * Keys:
 *   consent:{visitorId}              — current state JSON
 *   consent:audit:{YYYY-MM}          — LPUSH-ordered event list
 *
 * The cookie `aip_consent` is the primary read path (server component
 * + client both read it); Redis is the authoritative copy. On every
 * state change we write both and append to audit. `visitorId` is a
 * server-minted UUIDv4 stored in `aip_visitor` (HttpOnly) — never a
 * user fingerprint.
 *
 * No PII in the audit log. We store visitorId + geo + timestamp +
 * action + categories. IP, UA, email are all out.
 */

import { Redis } from "@upstash/redis";

export type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentState = {
  visitorId: string;
  categories: ConsentCategories;
  updatedAt: string;
  geo: { country: string | null; region: string | null; covered: boolean };
};

export type ConsentAction = "grant" | "revoke" | "update" | "delete";

export type ConsentAuditEntry = {
  visitorId: string;
  action: ConsentAction;
  categories: ConsentCategories;
  geo: ConsentState["geo"];
  ts: string;
};

export type ConsentClient = Pick<Redis, "get" | "set" | "del" | "lpush" | "lrange">;

let cached: Redis | null | undefined;

function defaultClient(): ConsentClient | null {
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

export function __resetConsentClientCache(): void {
  cached = undefined;
}

export function consentKey(visitorId: string): string {
  return `consent:${visitorId}`;
}

export function auditKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `consent:audit:${year}-${month}`;
}

type Opts = { client?: ConsentClient; now?: Date };

export async function readConsent(
  visitorId: string,
  opts: Opts = {},
): Promise<ConsentState | null> {
  const r = opts.client ?? defaultClient();
  if (!r) return null;
  try {
    const raw = await r.get(consentKey(visitorId));
    return parseState(raw);
  } catch {
    return null;
  }
}

export async function writeConsent(
  next: ConsentState,
  action: ConsentAction,
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  const now = opts.now ?? new Date();
  try {
    await r.set(consentKey(next.visitorId), JSON.stringify(next));
    const entry: ConsentAuditEntry = {
      visitorId: next.visitorId,
      action,
      categories: next.categories,
      geo: next.geo,
      ts: now.toISOString(),
    };
    await r.lpush(auditKey(now), JSON.stringify(entry));
  } catch {
    /* fail-soft */
  }
}

export async function deleteConsent(
  visitorId: string,
  geo: ConsentState["geo"],
  opts: Opts = {},
): Promise<void> {
  const r = opts.client ?? defaultClient();
  if (!r) return;
  const now = opts.now ?? new Date();
  try {
    await r.del(consentKey(visitorId));
    // tombstone the delete — categories are zeroed, visitorId is retained
    // for the legal audit trail but carries no profile.
    const tombstone: ConsentAuditEntry = {
      visitorId,
      action: "delete",
      categories: { necessary: true, analytics: false, marketing: false },
      geo,
      ts: now.toISOString(),
    };
    await r.lpush(auditKey(now), JSON.stringify(tombstone));
  } catch {
    /* fail-soft */
  }
}

export async function listAudit(
  date: Date,
  limit = 100,
  opts: Opts = {},
): Promise<ConsentAuditEntry[]> {
  const r = opts.client ?? defaultClient();
  if (!r) return [];
  try {
    const raws = await r.lrange(auditKey(date), 0, Math.max(0, limit - 1));
    const entries: ConsentAuditEntry[] = [];
    for (const raw of raws ?? []) {
      const parsed = parseAudit(raw);
      if (parsed) entries.push(parsed);
    }
    return entries;
  } catch {
    return [];
  }
}

function parseState(value: unknown): ConsentState | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.visitorId !== "string" ||
      typeof o.updatedAt !== "string" ||
      !o.categories ||
      typeof o.categories !== "object"
    ) {
      return null;
    }
    return obj as ConsentState;
  } catch {
    return null;
  }
}

function parseAudit(value: unknown): ConsentAuditEntry | null {
  if (!value) return null;
  try {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (
      typeof o.visitorId !== "string" ||
      typeof o.action !== "string" ||
      typeof o.ts !== "string"
    ) {
      return null;
    }
    return obj as ConsentAuditEntry;
  } catch {
    return null;
  }
}
