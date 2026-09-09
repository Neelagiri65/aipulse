import type { GlobePoint } from "@/components/globe/Globe";
import type { EventMeta } from "@/components/globe/event-detail";

/**
 * Split placed events by how precisely they were placed.
 *
 * The geocoder resolves a profile string in three bands: a settlement
 * ("city"), a US state centroid ("region"), or a national centroid
 * ("country"). Only the first is a place. Drawing the other two as ordinary
 * dots claims a precision the profile never had — 102 events at 51.17, 10.45
 * is not 102 people in a field near Kassel, it is 102 people who wrote
 * "Germany".
 *
 * Imprecise points are grouped by coordinate so the map can draw ONE ring per
 * centroid carrying a count, instead of a pile that looks like an address and
 * that markercluster would otherwise fan onto invented positions.
 */
export type PrecisionSplit = {
  precise: GlobePoint[];
  /** Keyed "lat,lng" — every point in a bucket shares one centroid. */
  impreciseByCoord: Map<string, GlobePoint[]>;
  impreciseCount: number;
  /**
   * How many points are placed EVENTS — the only population the imprecise
   * count is drawn from, and therefore the only honest denominator for
   * "X% of placed events are areas".
   *
   * The map also carries curated-HQ layers (registry, labs, regional RSS,
   * HN). Those never carry a band, so they can only ever land in `precise`.
   * Dividing by every marker therefore diluted the disclosed share: measured
   * on a real payload, 156 imprecise events among 215 all-layer marks
   * reported 73% when the true share of placed events was 100%. Understating
   * an honesty number is the wrong direction to be wrong in.
   */
  eventTotal: number;
};

export function splitByPrecision(points: readonly GlobePoint[]): PrecisionSplit {
  const precise: GlobePoint[] = [];
  const impreciseByCoord = new Map<string, GlobePoint[]>();
  let impreciseCount = 0;
  let eventTotal = 0;

  for (const p of points) {
    const meta = p.meta as (EventMeta & { eventId?: string }) | undefined;
    // A placed event carries an eventId; a graded one carries a band. The
    // curated-HQ layers (registry, labs, regional RSS) carry neither, which is
    // what excludes them. Both signals are checked rather than just eventId,
    // so an event arriving without one is still counted — undercounting here
    // would swing the disclosed share the other way.
    if (meta?.eventId !== undefined || meta?.precision !== undefined) {
      eventTotal += 1;
    }
    const precision = meta?.precision;
    // Absent precision is treated as precise.
    //
    // That is right for the curated-HQ layers (labs, regional RSS, registry),
    // which are exact by construction. It is NOT universally true, and the
    // comment here used to say it was: `gitlab-events`, `owner-location` and
    // `wire-hn` all place points via plain `geocode()` and never record a
    // band, so a GitLab actor who wrote "Germany" arrives with no grade and
    // renders as a solid dot on the national centroid — beside the dashed
    // ring drawn for the GitHub actor who wrote the same thing.
    //
    // Read-time grading in `fetch-events.ts` closes this for the GH events
    // layer only. Teaching the other three paths to record a band is a
    // separate checkpoint; until then this fallback is a known
    // under-disclosure, not a guarantee.
    if (precision === "country" || precision === "region") {
      const key = `${p.lat},${p.lng}`;
      const bucket = impreciseByCoord.get(key);
      if (bucket) bucket.push(p);
      else impreciseByCoord.set(key, [p]);
      impreciseCount += 1;
    } else {
      precise.push(p);
    }
  }

  return { precise, impreciseByCoord, impreciseCount, eventTotal };
}
