/**
 * Containment loop — persistence (Redis).
 *
 * Two families of keys:
 *
 *   `containment:state`      — the single ContainmentState blob.
 *   `containment:state:ver`  — its version (computedAt), used for CAS.
 *   `containment:lastgood:{sourceId}` — the last DTO that PASSED probes,
 *                              with its own provenance timestamp. This is what
 *                              a content-class (hard) quarantine displays;
 *                              the condemned current DTO is never shown
 *                              (Auditor change 1).
 *
 * Writes to the state blob are compare-and-set on the version key via a Lua
 * script: a writer that based its transition maths on version V refuses to
 * overwrite a blob at any other version (Auditor change 4 / F16 — overlapping
 * probe cycles under GH Actions drift must not corrupt hysteresis counters;
 * the loser drops its cycle and the next cycle re-probes from honest state).
 *
 * Every operation degrades to null/false when Redis is unavailable — the
 * caller maps that to PROBE_ERROR semantics (state unchanged, UNKNOWN
 * disclosure), never to a fabricated data failure (plan F3/F7).
 */

import { Redis } from "@upstash/redis";

import type { ContainmentState } from "./types";

const STATE_KEY = "containment:state";
const VERSION_KEY = "containment:state:ver";
const LASTGOOD_PREFIX = "containment:lastgood:";

/** Envelope for a last-good DTO copy. */
export interface LastGoodEnvelope<T = unknown> {
  data: T;
  /** The DTO's OWN provenance timestamp (generatedAt) — never render time. */
  provenance: string;
  /** When the passing probe captured this copy (epoch ms). */
  capturedAt: number;
}

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

/**
 * Test-only seam — lets unit tests inject a fake Redis client.
 * Consulted on every call so tests can flip behaviour between cases.
 */
let redisOverride: (() => Redis | null) | null = null;

export function __setRedisOverrideForTests(
  factory: (() => Redis | null) | null,
): void {
  redisOverride = factory;
  cached = undefined;
}

function client(): Redis | null {
  if (redisOverride) return redisOverride();
  return redis();
}

/** Result of a state read. `error` distinguishes "Redis unreachable" from
 *  "state genuinely absent/corrupt": a read ERROR must abort the probe cycle
 *  (monitoring failure, F7) — treating it as a cold start would rebuild a
 *  fresh state over standing quarantines, un-greying lying sources at the
 *  precise moment monitoring dies (the F5 failure the fail-safe must resist). */
export interface StateReadResult {
  state: ContainmentState | null;
  error: boolean;
}

/**
 * Read the containment state blob. `state: null, error: false` means the
 * key is missing or structurally invalid — a genuine cold start, safe to
 * rebuild (plan F3). `error: true` means Redis itself failed — the caller
 * must treat the whole cycle as PROBE_ERROR and mutate nothing.
 */
export async function readContainmentState(): Promise<StateReadResult> {
  const r = client();
  if (!r) return { state: null, error: true };
  try {
    const raw = await r.get<ContainmentState>(STATE_KEY);
    if (!isContainmentState(raw)) return { state: null, error: false };
    return { state: raw, error: false };
  } catch (err) {
    console.error("[containment:store] state read failed", err);
    return { state: null, error: true };
  }
}

/**
 * Compare-and-set write of the state blob.
 *
 * `basedOnVersion` is the `computedAt` of the state this cycle's transitions
 * were computed FROM (0 for a cold-start write against no prior state). The
 * write applies only if the stored version still matches; a concurrent cycle
 * having written first makes this one lose, returning false with nothing
 * modified.
 */
export async function writeContainmentState(
  next: ContainmentState,
  basedOnVersion: number,
): Promise<boolean> {
  const r = client();
  if (!r) return false;
  try {
    const result = await r.eval(
      CAS_SCRIPT,
      [VERSION_KEY, STATE_KEY],
      [String(basedOnVersion), String(next.computedAt), JSON.stringify(next)],
    );
    return result === 1;
  } catch (err) {
    console.error("[containment:store] state CAS write failed", err);
    return false;
  }
}

const CAS_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
return 1
`;

/**
 * Unconditional state write — bypasses the CAS guard. ONLY for cold-start
 * wedge recovery: a stale version key over a missing/corrupt blob would make
 * every CAS write fail forever (basedOnVersion 0 never matches). Callers must
 * have verified state absence via readContainmentState (error: false, state:
 * null) in the SAME cycle; using this anywhere else reintroduces the F16
 * lost-update race.
 */
export async function forceWriteContainmentState(
  next: ContainmentState,
): Promise<boolean> {
  const r = client();
  if (!r) return false;
  try {
    await r.set(VERSION_KEY, String(next.computedAt));
    await r.set(STATE_KEY, JSON.stringify(next));
    return true;
  } catch (err) {
    console.error("[containment:store] state force write failed", err);
    return false;
  }
}

/**
 * Capture a last-good copy of a source's DTO on a passing probe. The caller
 * invokes this only when the DTO's provenance key CHANGED (bounded by source
 * update cadence, not probe cadence — 8 identical green reads a day of a
 * daily source would otherwise rewrite the same bytes 8 times).
 */
export async function writeLastGood(
  sourceId: string,
  data: unknown,
  provenance: string,
  capturedAt: number,
): Promise<boolean> {
  const r = client();
  if (!r) return false;
  try {
    const envelope: LastGoodEnvelope = { data, provenance, capturedAt };
    await r.set(`${LASTGOOD_PREFIX}${sourceId}`, JSON.stringify(envelope));
    return true;
  } catch (err) {
    console.error(`[containment:store] lastgood write failed (${sourceId})`, err);
    return false;
  }
}

/**
 * Read the last-good copy for a source. Null when absent or unreadable —
 * the display layer then renders the honest empty ("no trustworthy value
 * available", Auditor change 14), never the condemned current DTO.
 */
export async function readLastGood<T = unknown>(
  sourceId: string,
): Promise<LastGoodEnvelope<T> | null> {
  const r = client();
  if (!r) return null;
  try {
    const raw = await r.get<LastGoodEnvelope<T>>(`${LASTGOOD_PREFIX}${sourceId}`);
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.provenance !== "string" ||
      typeof raw.capturedAt !== "number"
    ) {
      return null;
    }
    return raw;
  } catch (err) {
    console.error(`[containment:store] lastgood read failed (${sourceId})`, err);
    return null;
  }
}

function isContainmentState(value: unknown): value is ContainmentState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ContainmentState>;
  return (
    v.schemaVersion === 1 &&
    typeof v.computedAt === "number" &&
    Number.isFinite(v.computedAt) &&
    typeof v.sources === "object" &&
    v.sources !== null
  );
}
