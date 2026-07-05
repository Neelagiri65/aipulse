/**
 * Throwaway/spam actor detection for the globe firehose.
 *
 * The 2026-07-05 incident: `amendashelani-commits` — a GitHub account
 * created 9 minutes before its event, 0 public repos, 0 followers, a bio
 * of 51 heart emojis — put a dot on the live map. Star-farm and
 * engagement-spam accounts churn events that carry no real ecosystem
 * signal. Dropping WatchEvent/ForkEvent (#54) removed pure star-spam; this
 * is defence-in-depth for the DURABLE event types a spam account can still
 * emit (a throwaway push/PR to a junk repo).
 *
 * The ingest already fetches each actor's profile for geo, so the signals
 * are free — no extra API call. The predicate is deliberately CONSERVATIVE
 * (all three signals required) to avoid dropping a legitimate brand-new
 * contributor: a real first-day dev almost always has ≥1 repo or ≥1
 * follower; a throwaway has none and is minutes old.
 *
 * Trust posture: this errs toward NOT placing an unverifiable actor. The
 * cost of dropping a rare genuine newcomer is one missing dot; the cost of
 * showing a spam dot is the map looking fabricated (the founder's exact
 * complaint).
 */

export type ActorProfile = {
  createdAt?: string | null;
  publicRepos?: number | null;
  followers?: number | null;
};

/** Max account age to be considered "brand new" for the throwaway signal. */
export const THROWAWAY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * True when an actor is an obvious throwaway: brand-new AND zero footprint
 * (no public repos AND no followers). All three required. A missing
 * `createdAt` is NOT treated as throwaway — absence of the signal must not
 * fabricate a spam verdict (fail open on unknown, unlike the durable-type
 * gate which fails closed; here a false positive drops a real person).
 */
export function isThrowawayActor(
  profile: ActorProfile,
  nowMs: number,
): boolean {
  const { createdAt, publicRepos, followers } = profile;
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const ageMs = nowMs - created;
  return (
    ageMs >= 0 &&
    ageMs < THROWAWAY_MAX_AGE_MS &&
    (publicRepos ?? 0) === 0 &&
    (followers ?? 0) === 0
  );
}
