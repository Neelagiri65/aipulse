/**
 * The point-shaped registry read — `/api/registry/points`.
 *
 * `Dashboard.tsx` polls the registry on an interval and draws one map dot per
 * LOCATED entry. Until this module existed it polled `/api/registry`: every
 * entry (33,996 on 2026-09-22), every field, 16.2 MB and 8.5 s per poll, of
 * which the map used 25,083 entries and nine fields. This body carries only
 * what a dot and its hover card need: 7.0 MB measured on the same corpus.
 *
 * An entry with no finite `lat` AND `lng` is not a point. The trust contract
 * says no made-up coordinates, so it is dropped here rather than plotted at
 * 0,0 — and the counts say how many were dropped, so nobody reads "fewer
 * dots" as "fewer repos".
 *
 * `degraded` keeps its meaning exactly: true means the registry could not be
 * READ and `points` carries no information. Both counts are then `null`,
 * never a 0 nobody measured.
 */

import { readAllEntriesDetailed, type RegistryEntry } from "@/lib/data/repo-registry";
import type { ConfigKind } from "@/lib/data/registry-shared";

export type RegistryPoint = {
  fullName: string;
  lat: number;
  lng: number;
  /** The resolved place name, e.g. "Berlin, Germany". */
  label: string;
  lastActivity: string;
  stars?: number;
  language?: string | null;
  description?: string | null;
  /** The config kinds that verified the repo — never their samples. */
  kinds: ConfigKind[];
};

export type RegistryPointsBody = {
  ok: true;
  points: RegistryPoint[];
  /** Entries with a plottable location: `points.length`. Null when degraded. */
  located: number | null;
  /** Entries in the whole registry, located or not. Null when degraded. */
  corpus: number | null;
  degraded: boolean;
  degradedReason: string | null;
  generatedAt: string;
};

/** Null unless both coordinates are finite numbers — no dot without a place. */
export function toRegistryPoint(entry: RegistryEntry): RegistryPoint | null {
  const loc = entry.location;
  if (!loc) return null;
  const { lat, lng } = loc;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    fullName: entry.fullName,
    lat,
    lng,
    label: loc.label,
    lastActivity: entry.lastActivity,
    stars: entry.stars,
    language: entry.language,
    description: entry.description,
    kinds: entry.configs.map((c) => c.kind),
  };
}

export async function buildRegistryPointsBody(): Promise<RegistryPointsBody> {
  const generatedAt = new Date().toISOString();
  const read = await readAllEntriesDetailed();
  if (!read.ok) {
    return {
      ok: true,
      points: [],
      located: null,
      corpus: null,
      degraded: true,
      degradedReason: read.reason,
      generatedAt,
    };
  }
  const points: RegistryPoint[] = [];
  for (const e of read.entries) {
    const p = toRegistryPoint(e);
    if (p) points.push(p);
  }
  return {
    ok: true,
    points,
    located: points.length,
    corpus: read.entries.length,
    degraded: false,
    degradedReason: null,
    generatedAt,
  };
}
