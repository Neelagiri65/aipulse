/**
 * Repo registry — persistent list of public GitHub repos where at least one
 * AI-tool config file has been *verified* (file exists AND first 500 bytes
 * look config-shaped, not a placeholder or template stub).
 *
 * Motivation: the globe currently shows *live activity* (last 240 min) only.
 * When a Push/PR/Issue event happens in a repo with AI config, that repo's
 * dot lights up teal. But a repo that hasn't pushed in 10 days falls off the
 * globe entirely — even though its AI-config story is still true. The
 * registry is the long-term memory layer: 2k+ verified repos with decay-
 * coded "last activity" signals so the map can render the full ecosystem,
 * not just the last-4-hour slice.
 *
 * Storage:
 *   - Single HASH keyed by full_name ("owner/name") → JSON blob. One HSET
 *     batch per discovery run (1 command regardless of batch size on
 *     Upstash). One HGETALL per read (also 1 command).
 *   - Meta in a separate STRING key (discovery stats, failures).
 *   - NO TTL. Both keys are persistent.
 *
 *     This used to carry a 14-day TTL on the *entire* corpus, on the
 *     theory that "no discovery for two weeks" should expire the data so
 *     the UI reflects "registry not maintained". That was wrong twice
 *     over, and it cost us the corpus:
 *
 *       1. Staleness is a *display* property, derivable from
 *          `meta.lastDiscoveryRun` without destroying anything. Deleting
 *          9,670 verified repos to express "this is old" is not graceful
 *          degradation, it is data loss.
 *       2. The whole dataset sat behind one key, so a single expiry — or
 *          a single eviction under storage pressure — took 100% of it
 *          atomically. On 2026-06-05 `registry.total` went 9,670 → 0 in
 *          one day and every collector still recorded success, because
 *          "key absent" and "registry genuinely empty" were the same
 *          value by the time anything downstream saw it.
 *
 *     Staleness now reads off `meta.lastDiscoveryRun`; absence is
 *     reported as a degraded state (see `readAllEntriesDetailed`) and
 *     never as `total: 0`.
 *
 * Command budget (Upstash free tier, 10k/day):
 *   - Discovery cron every 6h: 4 HSET + 4 SET meta = 8 commands/day.
 *   - Reads: 1 HGETALL per UI poll. At 60s poll cadence × 3 clients avg
 *     that's ~4k reads/day. Comfortably inside budget alongside the
 *     existing globe-store's ~4k commands/day.
 *
 * Graceful degradation:
 *   - When Redis is unconfigured, every function is a silent no-op and
 *     readers return empty. The globe falls back to live-activity only;
 *     nothing crashes, nothing fabricates.
 *   - "Returns empty" is fail-soft for *rendering* (an empty map layer is
 *     honest) but it is NOT a measurement. Anything that publishes a
 *     COUNT — the daily snapshot, /api/registry, /api/v1/sources — must
 *     use `readAllEntriesDetailed` and report `degraded` instead of
 *     printing a zero it cannot stand behind.
 *
 * Trust contract:
 *   - `configs[i].sample` is a verbatim first-500-bytes quote of the file
 *     that made this repo qualify. It's kept so the /archives page (future)
 *     can show "this is WHY we counted it" — no scoring opacity.
 *   - `lastActivity` comes straight from the GitHub API's `pushed_at` — we
 *     never synthesise activity.
 */

import { Redis } from "@upstash/redis";

// Types + pure helpers are defined in `registry-shared.ts` so client
// components can import them without pulling in the Upstash SDK. This
// module adds the Redis-backed read/write path on top.
export {
  CONFIG_PATHS,
  decayScore,
  formatAgeLabel,
  type ConfigKind,
  type DetectedConfig,
  type RegistryEntry,
  type RegistryLocation,
  type RegistryMeta,
} from "./registry-shared";

import type {
  RegistryEntry,
  RegistryMeta,
} from "./registry-shared";

const ENTRIES_KEY = "aipulse:registry:entries";
const META_KEY = "aipulse:registry:meta";

/**
 * A run that observes fewer than this fraction of the previously recorded
 * `meta.totalEntries` is treated as an integrity event, not a reading.
 * The registry only ever shrinks by explicit `removeEntries` calls, so a
 * halving between two consecutive successful reads means something
 * happened to the store, not to the ecosystem.
 */
export const REGISTRY_SHRINK_FLOOR = 0.5;

/**
 * Fields requested per HSCAN page. COUNT is advisory in Redis, so this is
 * a ceiling on effort rather than an exact batch size; it is set well
 * below the point where a page could approach Upstash's 10MB response cap
 * even if per-entry payloads grow several times their current size.
 */
const REGISTRY_SCAN_BATCH = 100;

/**
 * Hard stop on the scan loop. A cursor that never returns to "0" would
 * otherwise spin forever; failing loudly beats hanging the request.
 */
const REGISTRY_SCAN_MAX_PAGES = 1000;

let cached: Redis | null | undefined;

function redis(): Redis | null {
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

export function isRegistryAvailable(): boolean {
  return redis() !== null;
}

/**
 * Upsert a batch of entries. Single HSET call — Upstash counts this as one
 * command regardless of field count, so a 2k-entry seed costs exactly 2
 * commands (HSET + PERSIST).
 *
 * `persist` clears any TTL still attached to the key. It is a no-op on a
 * key that has none, and exists so the legacy 14-day expiry left on the
 * production key by the previous implementation is cleared by the next
 * discovery run rather than needing a manual intervention.
 */
export async function upsertEntries(entries: RegistryEntry[]): Promise<void> {
  const r = redis();
  if (!r || entries.length === 0) return;
  const payload: Record<string, string> = {};
  for (const e of entries) payload[e.fullName] = JSON.stringify(e);
  try {
    await r.hset(ENTRIES_KEY, payload);
    await r.persist(ENTRIES_KEY);
  } catch {
    // Swallow — discovery retries on the next cron tick.
  }
}

/** Why a registry read produced no usable entries. */
export type RegistryReadFailure =
  /** Redis env vars absent — local dev, or a misconfigured deploy. */
  | "unconfigured"
  /** The key does not exist: evicted, expired, flushed, or never seeded. */
  | "absent"
  /** The read threw (network, auth, quota). */
  | "error"
  /** Fields are present but none parsed — corrupt payloads. */
  | "corrupt";

export type RegistryRead =
  | { ok: true; entries: RegistryEntry[] }
  | { ok: false; reason: RegistryReadFailure; message: string };

/**
 * Read the registry, distinguishing "no entries" from "could not read".
 *
 * The distinction is the whole point. `readAllEntries` collapses every
 * failure mode to `[]`, which downstream becomes `total: 0` — a number
 * that looks like a measurement and is not one. Callers that publish a
 * count use this; callers that only render a map layer can keep using
 * the fail-soft version.
 *
 * A hash that exists always has at least one field, so an empty result
 * from a *completed* scan means the key is gone — never that the registry
 * legitimately holds zero repos.
 *
 * Read via HSCAN, not HGETALL. The entries hash outgrew Upstash's 10MB
 * per-response cap (25.8MB on 2026-08-27), and HGETALL is all-or-nothing:
 * one oversized response took down every registry reader at once —
 * /api/registry and /api/v1/sources served `degraded` for eight days, and
 * the fail-soft callers silently saw an empty registry, which quietly
 * disabled `skipKnown` dedup in discovery. Paging keeps each response
 * small enough to return whatever the hash grows to.
 *
 * A partial scan is never reported as success. If the loop throws
 * halfway, the entries read so far are discarded and the failure is
 * surfaced — half a registry is exactly the number-that-looks-like-a-
 * measurement this function exists to prevent.
 */
export async function readAllEntriesDetailed(): Promise<RegistryRead> {
  const r = redis();
  if (!r) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Redis is not configured (UPSTASH_REDIS_REST_* absent)",
    };
  }
  // Keyed by field name, not pushed to a list: HSCAN may return the same
  // field twice if the hash is written mid-scan (discovery runs every 6h),
  // and keying collapses those duplicates instead of double-counting.
  const byField = new Map<string, unknown>();
  let cursor = "0";
  let pages = 0;
  try {
    do {
      const [next, flat] = await r.hscan(ENTRIES_KEY, cursor, {
        count: REGISTRY_SCAN_BATCH,
      });
      // HSCAN returns a flat [field, value, field, value, ...] array.
      for (let i = 0; i + 1 < flat.length; i += 2) {
        byField.set(String(flat[i]), flat[i + 1]);
      }
      cursor = String(next);
      if (++pages > REGISTRY_SCAN_MAX_PAGES) {
        return {
          ok: false,
          reason: "error",
          message: `registry scan exceeded ${REGISTRY_SCAN_MAX_PAGES} pages without completing — cursor did not return to 0`,
        };
      }
    } while (cursor !== "0");
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
  const fields = [...byField.values()];
  if (fields.length === 0) {
    return {
      ok: false,
      reason: "absent",
      message: `registry key ${ENTRIES_KEY} holds no fields — evicted, expired, or never seeded`,
    };
  }
  const out: RegistryEntry[] = [];
  for (const v of fields) {
    const parsed = parseEntry(v);
    if (parsed) out.push(parsed);
  }
  if (out.length === 0) {
    return {
      ok: false,
      reason: "corrupt",
      message: `${fields.length} field(s) present, 0 parsed as registry entries`,
    };
  }
  return { ok: true, entries: out };
}

/**
 * Fail-soft read. Returns `[]` on every failure mode.
 *
 * Kept for the render path (map layers, "skip repos we already know"
 * filters) where an empty list degrades correctly. Do NOT use it to
 * produce a published count — use `readAllEntriesDetailed`.
 */
export async function readAllEntries(): Promise<RegistryEntry[]> {
  const res = await readAllEntriesDetailed();
  return res.ok ? res.entries : [];
}

export async function readEntry(
  fullName: string,
): Promise<RegistryEntry | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.hget(ENTRIES_KEY, fullName);
    return parseEntry(v);
  } catch {
    return null;
  }
}

export async function removeEntries(fullNames: string[]): Promise<void> {
  const r = redis();
  if (!r || fullNames.length === 0) return;
  try {
    await r.hdel(ENTRIES_KEY, ...fullNames);
  } catch {
    // no-op
  }
}

/**
 * Persist run stats. No TTL: `lastDiscoveryRun` is what tells a reader the
 * registry has gone stale, so expiring the meta key would delete the only
 * evidence that anything is wrong.
 */
export async function writeMeta(meta: RegistryMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta));
  } catch {
    // no-op
  }
}

export async function readMeta(): Promise<RegistryMeta | null> {
  const r = redis();
  if (!r) return null;
  try {
    const v = await r.get(META_KEY);
    if (!v) return null;
    if (typeof v === "string") return JSON.parse(v) as RegistryMeta;
    if (typeof v === "object") return v as RegistryMeta;
    return null;
  } catch {
    return null;
  }
}

/**
 * Compare an observed entry count against the previous run's recorded
 * total. Pure — no I/O — so the threshold behaviour is unit-testable.
 *
 * Returns `shrunk: true` only for a drop past `REGISTRY_SHRINK_FLOOR`.
 * Growth, a flat count, and a modest decline all pass: repos do get
 * deleted, renamed, or made private, and that churn is real. A halving
 * is not churn.
 */
export function assessRegistryShrink(
  observedTotal: number,
  previous: RegistryMeta | null,
): { shrunk: false } | { shrunk: true; message: string } {
  const prevTotal = previous?.totalEntries ?? 0;
  if (prevTotal <= 0) return { shrunk: false };
  if (observedTotal >= prevTotal * REGISTRY_SHRINK_FLOOR) {
    return { shrunk: false };
  }
  const pct = Math.round((1 - observedTotal / prevTotal) * 100);
  return {
    shrunk: true,
    message:
      `registry shrank ${prevTotal} → ${observedTotal} (−${pct}%) since ` +
      `${previous?.lastDiscoveryRun ?? "unknown"} — past the ` +
      `${Math.round(REGISTRY_SHRINK_FLOOR * 100)}% floor; treat as a store ` +
      `integrity event, not a measurement`,
  };
}

/**
 * Failure `step` labels that mean "the store misbehaved", as opposed to
 * "an upstream sweep returned less than we hoped".
 */
export const REGISTRY_INTEGRITY_STEPS: readonly string[] = [
  "registry-read",
  "registry-integrity",
];

/**
 * True when a run recorded a store-integrity problem.
 *
 * Callers use this to fail the run outright. The partial-success contract
 * (`isTotalFailure`) is the wrong lens here: it asks "did the sweep
 * deliver anything?", and a sweep can deliver 40 fresh repos on the very
 * tick the corpus behind it collapses from 9,670 to 0. That run is not a
 * success with a footnote.
 */
export function hasRegistryIntegrityFailure(
  failures: RegistryMeta["failures"],
): boolean {
  return failures.some((f) => REGISTRY_INTEGRITY_STEPS.includes(f.step));
}

export type FinaliseMetaResult = {
  /** False when this step found a problem the caller must report. */
  ok: boolean;
  /** Observed total, or null when the read was degraded. */
  totalEntries: number | null;
  /** Failures this step added — callers push these onto their own list. */
  addedFailures: RegistryMeta["failures"];
  /** True when meta was actually persisted. */
  wrote: boolean;
};

/**
 * Close out a collector run: read the registry back, guard the result,
 * and write meta.
 *
 * Every collector (discovery, deps, topics, events-backfill) used to end
 * with the same three lines — `readAllEntries()`, build meta from
 * `.length`, `writeMeta()`. That shape is what made the 2026-06-05 loss
 * invisible AND unrecoverable: a failed read returned `[]`, so the run
 * recorded `totalEntries: 0` with `failures: []`, overwriting the last
 * known good count with a number it had just failed to measure.
 *
 * Two rules, applied here once instead of in four places:
 *   - A degraded read NEVER writes meta. The previous total survives as
 *     the baseline for the next run's shrink check.
 *   - A read that lands but collapses is written (the count is a real
 *     observation) AND recorded as a failure, so the cron goes red.
 */
export async function finaliseRegistryMeta(opts: {
  source: string;
  runAt: string;
  failures: RegistryMeta["failures"];
}): Promise<FinaliseMetaResult> {
  const addedFailures: RegistryMeta["failures"] = [];

  const read = await readAllEntriesDetailed();
  if (!read.ok) {
    addedFailures.push({
      step: "registry-read",
      message:
        `${read.reason}: ${read.message} — meta left untouched so the ` +
        `previous total survives as the next run's baseline`,
    });
    return { ok: false, totalEntries: null, addedFailures, wrote: false };
  }

  const total = read.entries.length;
  const shrink = assessRegistryShrink(total, await readMeta());
  if (shrink.shrunk) {
    addedFailures.push({
      step: "registry-integrity",
      message: shrink.message,
    });
  }

  await writeMeta({
    totalEntries: total,
    // Every entry in the registry is verified by construction — it only
    // gets written after the config-file probe passes.
    verifiedEntries: total,
    lastDiscoveryRun: opts.runAt,
    lastDiscoverySource: opts.source,
    failures: [...opts.failures, ...addedFailures],
  });

  return {
    ok: addedFailures.length === 0,
    totalEntries: total,
    addedFailures,
    wrote: true,
  };
}

function parseEntry(raw: unknown): RegistryEntry | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.fullName !== "string") return null;
    if (!Array.isArray(o.configs)) return null;
    return obj as RegistryEntry;
  } catch {
    return null;
  }
}

// decayScore + formatAgeLabel live in `registry-shared.ts` and are
// re-exported from the top of this file so client code can import them
// without pulling in the Upstash SDK.
