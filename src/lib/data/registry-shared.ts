/**
 * Client-safe registry types + pure helpers.
 *
 * Mirrors the types in `repo-registry.ts` but carries no Redis import —
 * safe to pull into client components that render registry data on the
 * globe/map. The Redis-backed store re-exports from here.
 */

export type ConfigKind =
  | "claude-md"
  | "agents-md"
  | "cursorrules"
  | "windsurfrules"
  | "copilot-instructions"
  | "continue-config";

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
  path: string;
  sample: string;
  score: number;
  verifiedAt: string;
};

export type RegistryLocation = {
  lat: number;
  lng: number;
  label: string;
};

export type RegistryEntry = {
  fullName: string;
  owner: string;
  name: string;
  firstSeen: string;
  lastActivity: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  configs: DetectedConfig[];
  location?: RegistryLocation | null;
};

export type RegistryMeta = {
  totalEntries: number;
  verifiedEntries: number;
  lastDiscoveryRun: string;
  lastDiscoverySource: string;
  failures: Array<{ step: string; message: string }>;
};

/**
 * Map last-activity to a 0..1 brightness band. Step function so the UI
 * legend can explain exactly which band a dot sits in.
 *   ≤24h → 1.0  | ≤7d → 0.85 | ≤30d → 0.55 | ≤90d → 0.25 | >90d → 0.10
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
 * "Last activity: Xd ago" — human-readable age for the EventCard hover.
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

/* ---- List projection + paging -------------------------------------------------------------- */

/**
 * A config as the LIST shape carries it: everything except `sample`.
 *
 * The sample is a verbatim quote of the file that made a repo qualify and it
 * is the trust contract — but it is 58.6% of the corpus by weight (23.8MB of
 * 40.7MB, measured 2026-09-18 across 45,756 configs). Shipping it 45,756
 * times to answer "which repos are in the registry" is what made
 * /api/v1/sources a 38MB response. It stays reachable per repo (`?repo=`),
 * which is the only context a reader can actually use it in.
 */
export type ListedConfig = Omit<DetectedConfig, "sample">;

export type ListedRegistryEntry = Omit<RegistryEntry, "configs"> & {
  configs: ListedConfig[];
};

/** Default page size for a registry list response. */
export const REGISTRY_PAGE_DEFAULT = 100;

/** Ceiling on `?limit`. 1000 entries ≈ 1.3MB in the full shape, ≈ 0.5MB listed. */
export const REGISTRY_PAGE_MAX = 1000;

/**
 * Clamp a caller-supplied `?limit`. Anything unparseable, absent, zero or
 * negative falls back to the default rather than erroring: a page size is a
 * hint, and refusing the request would be a worse answer than a sane page.
 */
export function clampPageLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return REGISTRY_PAGE_DEFAULT;
  return Math.min(Math.floor(n), REGISTRY_PAGE_MAX);
}

/**
 * Drop unpaired UTF-16 surrogates.
 *
 * `config-verifier` quotes the first 500 characters of a file, and slicing at
 * a fixed count can cut an emoji's surrogate pair in half. One such half is a
 * lone surrogate, which `JSON.stringify` happily emits as `\ud83d` — valid for
 * JS, invalid JSON to a stricter parser. On 2026-09-18 three configs on
 * `NVIDIA/cuopt` (cut at index 499) made `jq` fail on the whole 38MB
 * /api/v1/sources body. The cap now avoids splitting pairs, and this runs on
 * the read path because ~45k configs were already stored the old way.
 */
export function stripLoneSurrogates(text: string): string {
  // Matches a high surrogate not followed by a low one, or a low surrogate
  // not preceded by a high one.
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** Project an entry into the list shape: same entry, configs without samples. */
export function toListEntry(entry: RegistryEntry): ListedRegistryEntry {
  return {
    ...entry,
    configs: entry.configs.map(({ sample: _sample, ...rest }) => rest),
  };
}

/** Sanitise an entry's samples for serving. Identity apart from lone surrogates. */
export function sanitiseEntry(entry: RegistryEntry): RegistryEntry {
  return {
    ...entry,
    configs: entry.configs.map((c) => ({
      ...c,
      sample: stripLoneSurrogates(c.sample),
    })),
  };
}
