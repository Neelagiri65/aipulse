/**
 * AI Pulse — Feed card-id
 *
 * Deterministic id for a feed card. Stable across re-derivations within
 * the same hour bucket so a tweet of `/feed/[id]` keeps unfurling for the
 * lifetime of the underlying event (within the bucket).
 *
 * Hash inputs are pinned: `${type}-${primaryKeyHash}-${hourBucket}`.
 * Bucket = floor(timestampMs / HOUR_BUCKET_MS). A 90-min incident
 * therefore resolves to two distinct ids — accepted v1 trade-off
 * (incident-grouping is v2).
 *
 * Output is URL-safe: only `[A-Za-z0-9_-]`.
 */

import type { CardType } from "@/lib/feed/types";

export const HOUR_BUCKET_MS = 60 * 60 * 1000;

/**
 * FNV-1a 32-bit hash → base36. Deterministic, dependency-free, and
 * stable across Node + edge runtimes (no Web Crypto required).
 * Collision rate is acceptable: card ids are scoped per (type, hour) so
 * two distinct primary keys would need to collide *within* the same
 * type-hour bucket to produce a false-share-URL hit.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function cardId(
  type: CardType,
  primaryKey: string,
  timestampMs: number,
): string {
  const bucket = Math.floor(timestampMs / HOUR_BUCKET_MS);
  return `${type}-${fnv1a(primaryKey)}-${bucket.toString(36)}`;
}
