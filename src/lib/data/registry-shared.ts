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
