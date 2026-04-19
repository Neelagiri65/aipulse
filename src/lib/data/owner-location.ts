/**
 * Owner-location cache for the registry.
 *
 * Geocoding a repo's owner is a two-step process: GET /users/{owner} for
 * the raw location string, then run `geocode()` from the dictionary. Both
 * steps are deterministic but the GitHub call counts against the 5000/hr
 * core API budget and latency-sensitive discovery runs can't afford to
 * repeat the lookup per run. We cache by owner login.
 *
 * Tri-state semantics match RegistryEntry.location:
 *   - missing key  → not yet looked up
 *   - stored null  → looked up, no location (raw profile string absent or
 *                    failed to geocode)
 *   - stored value → geocoded lat/lng with the raw label preserved
 *
 * Cache lives alongside the registry in Upstash at `aipulse:registry:owner-location`.
 * 30-day TTL so org locations auto-refresh if someone moves / renames.
 */

import { Redis } from "@upstash/redis";
import { geocode } from "../geocoding";
import { fetchUser } from "../github";
import type { RegistryLocation } from "./repo-registry";

const KEY = "aipulse:registry:owner-location";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

type CachedValue = RegistryLocation | null;

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
 * Lookup the cached value for this owner. Returns:
 *   - `{ hit: false }`              → no entry; caller should resolve
 *   - `{ hit: true, value: null }`  → looked up, no location
 *   - `{ hit: true, value: {...} }` → resolved lat/lng
 */
export async function readOwnerLocation(
  owner: string,
): Promise<{ hit: boolean; value?: CachedValue }> {
  const r = redis();
  if (!r) return { hit: false };
  try {
    const raw = await r.hget(KEY, owner);
    if (raw === null || raw === undefined) return { hit: false };
    if (typeof raw === "string") {
      if (raw === "null") return { hit: true, value: null };
      return { hit: true, value: JSON.parse(raw) as RegistryLocation };
    }
    if (typeof raw === "object") {
      const v = raw as RegistryLocation;
      if (
        typeof v.lat === "number" &&
        typeof v.lng === "number" &&
        typeof v.label === "string"
      ) {
        return { hit: true, value: v };
      }
    }
    return { hit: false };
  } catch {
    return { hit: false };
  }
}

/**
 * Persist a lookup result. `null` stores "looked up, no location" so we
 * don't retry dead lookups every run.
 */
export async function writeOwnerLocation(
  owner: string,
  value: CachedValue,
): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const encoded = value === null ? "null" : JSON.stringify(value);
    await r.hset(KEY, { [owner]: encoded });
    await r.expire(KEY, TTL_SECONDS);
  } catch {
    // no-op: next run retries
  }
}

/**
 * Resolve owner → location with the shared cache. Single source of truth
 * for discovery + enrichment. `null` means "looked up, no coords" and is
 * persisted so subsequent runs short-circuit.
 */
export async function resolveOwnerLocation(
  owner: string,
): Promise<CachedValue> {
  const cachedResult = await readOwnerLocation(owner);
  if (cachedResult.hit) return cachedResult.value ?? null;

  let raw: string | null = null;
  try {
    const user = await fetchUser(owner);
    raw = user?.location?.trim() || null;
  } catch {
    // fetchUser throws on rate limit / transient error — treat as miss for
    // this run, don't persist a negative cache entry. Next run retries.
    return null;
  }

  if (!raw) {
    await writeOwnerLocation(owner, null);
    return null;
  }

  const coords = geocode(raw);
  if (!coords) {
    await writeOwnerLocation(owner, null);
    return null;
  }

  const value: RegistryLocation = { lat: coords[0], lng: coords[1], label: raw };
  await writeOwnerLocation(owner, value);
  return value;
}
