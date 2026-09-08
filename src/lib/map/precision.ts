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
};

export function splitByPrecision(points: readonly GlobePoint[]): PrecisionSplit {
  const precise: GlobePoint[] = [];
  const impreciseByCoord = new Map<string, GlobePoint[]>();
  let impreciseCount = 0;

  for (const p of points) {
    const precision = (p.meta as EventMeta | undefined)?.precision;
    // Absent precision is treated as precise. A point with no grade is either
    // a curated HQ (labs, RSS) or a placement the dictionary no longer
    // recognises; either way, inventing a doubt about it would be as wrong as
    // hiding one.
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

  return { precise, impreciseByCoord, impreciseCount };
}
