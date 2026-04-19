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
 *   - 14-day TTL — if no discovery has landed for two weeks the data is
 *     stale enough to expire and the UI correctly reflects "registry not
 *     maintained" via the meta block.
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
 *
 * Trust contract:
 *   - `configs[i].sample` is a verbatim first-500-bytes quote of the file
 *     that made this repo qualify. It's kept so the /archives page (future)
 *     can show "this is WHY we counted it" — no scoring opacity.
 *   - `lastActivity` comes straight from the GitHub API's `pushed_at` — we
 *     never synthesise activity.
 */

import { Redis } from "@upstash/redis";

export type ConfigKind =
  | "claude-md" // CLAUDE.md (Anthropic Claude Code)
  | "agents-md" // AGENTS.md (OpenAI Codex convention)
  | "cursorrules" // .cursorrules (Cursor)
  | "windsurfrules" // .windsurfrules (Windsurf)
  | "copilot-instructions" // .github/copilot-instructions.md
  | "continue-config"; // .continue/config.json (Continue)

/**
 * Map a ConfigKind back to its canonical on-disk path. Single source of
 * truth — used by discovery queries and the verifier.
 */
export const CONFIG_PATHS: Record<ConfigKind, string> = {
  "claude-md": "CLAUDE.md",
  "agents-md": "AGENTS.md",
  cursorrules: ".cursorrules",
  windsurfrules: ".windsurfrules",
  "copilot-instructions": ".github/copilot-instructions.md",
  "continue-config": ".continue/config.json",
};

export type DetectedConfig = {
  kind: ConfigKind;
  /** Exact path in repo where the file was found. */
  path: string;
  /**
   * UTF-8 first 500 bytes of the file, truncated. Used for transparency —
   * downstream surfaces (/archives, /sources) can show the quoted sample
   * so users see WHY we counted this file as a real AI-config.
   */
  sample: string;
  /** Verifier score 0..1. ≥0.4 means "shape looks like a real config". */
  score: number;
  /** ISO timestamp of last verification pass. */
  verifiedAt: string;
};

export type RegistryLocation = {
  lat: number;
  lng: number;
  /** The raw GitHub profile location string that geocoded to these coords. */
  label: string;
};

export type RegistryEntry = {
  /** "owner/name" — the stable identifier. */
  fullName: string;
  owner: string;
  name: string;
  /** ISO — first time this repo passed verification and entered the registry. */
  firstSeen: string;
  /** ISO — repo's `pushed_at` from the GitHub API. Drives decay. */
  lastActivity: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  /** One entry per detected & verified config file. */
  configs: DetectedConfig[];
  /**
   * Owner's geocoded location. Tri-state:
   *   - undefined → location lookup not yet attempted
   *   - null      → looked up, owner has no geocodable location string
   *   - object    → resolved lat/lng with raw GitHub profile string
   * Lets the UI render the dot only when coords exist without re-trying
   * dead lookups every discovery run.
   */
  location?: RegistryLocation | null;
};

export type RegistryMeta = {
  totalEntries: number;
  verifiedEntries: number;
  /** ISO of the most recent discovery run (any trigger). */
  lastDiscoveryRun: string;
  /** Human label: "cron" | "manual-seed" | etc. */
  lastDiscoverySource: string;
  /** Non-fatal errors surfaced during the most recent run. */
  failures: Array<{ step: string; message: string }>;
};

const ENTRIES_KEY = "aipulse:registry:entries";
const META_KEY = "aipulse:registry:meta";
const KEY_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

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
 * commands (HSET + EXPIRE).
 */
export async function upsertEntries(entries: RegistryEntry[]): Promise<void> {
  const r = redis();
  if (!r || entries.length === 0) return;
  const payload: Record<string, string> = {};
  for (const e of entries) payload[e.fullName] = JSON.stringify(e);
  try {
    await r.hset(ENTRIES_KEY, payload);
    await r.expire(ENTRIES_KEY, KEY_TTL_SECONDS);
  } catch {
    // Swallow — discovery retries on the next cron tick.
  }
}

export async function readAllEntries(): Promise<RegistryEntry[]> {
  const r = redis();
  if (!r) return [];
  try {
    const all = await r.hgetall<Record<string, unknown>>(ENTRIES_KEY);
    if (!all) return [];
    const out: RegistryEntry[] = [];
    for (const v of Object.values(all)) {
      const parsed = parseEntry(v);
      if (parsed) out.push(parsed);
    }
    return out;
  } catch {
    return [];
  }
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

export async function writeMeta(meta: RegistryMeta): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(META_KEY, JSON.stringify(meta), { ex: KEY_TTL_SECONDS });
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

// ---------------------------------------------------------------------------
// Decay scoring
// ---------------------------------------------------------------------------

/**
 * Map a repo's last pushed_at to a 0..1 brightness / confidence score.
 *
 * Bands match the spec's decay contract:
 *   - ≤24h       → 1.0  (full brightness, "active now")
 *   - ≤7d        → 0.85 ("active recently")
 *   - ≤30d       → 0.55 ("quiet but not dormant")
 *   - ≤90d       → 0.25 ("fading")
 *   - >90d       → 0.10 ("archival presence — we still know it exists")
 *
 * Step function rather than exponential so the mapping stays explainable:
 * users can see the band in a legend instead of guessing why a dot is 47%
 * bright.
 */
export function decayScore(
  lastActivityIso: string,
  nowMs: number = Date.now(),
): number {
  const t = Date.parse(lastActivityIso);
  if (Number.isNaN(t)) return 0;
  const ageHours = Math.max(0, (nowMs - t) / (1000 * 60 * 60));
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 24 * 7) return 0.85;
  if (ageHours <= 24 * 30) return 0.55;
  if (ageHours <= 24 * 90) return 0.25;
  return 0.1;
}

/**
 * Human-readable age label for the EventCard hover: "Last activity: 43d ago".
 * Keeps the exact units the spec calls out (hours, days, months, years) so
 * copy tests can match on known strings.
 */
export function formatAgeLabel(
  lastActivityIso: string,
  nowMs: number = Date.now(),
): string {
  const t = Date.parse(lastActivityIso);
  if (Number.isNaN(t)) return "unknown";
  const ageMs = Math.max(0, nowMs - t);
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 1) return "Last activity: <1h ago";
  if (hours < 24) return `Last activity: ${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `Last activity: ${Math.round(days)}d ago`;
  const months = days / 30;
  if (months < 12) return `Last activity: ${Math.round(months)}mo ago`;
  return `Last activity: ${Math.round(months / 12)}y ago`;
}
