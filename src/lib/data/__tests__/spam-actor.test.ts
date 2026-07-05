import { describe, expect, it } from "vitest";

import { isThrowawayActor, THROWAWAY_MAX_AGE_MS } from "@/lib/data/spam-actor";

const NOW = Date.parse("2026-07-05T00:00:00Z");

describe("isThrowawayActor — the amendashelani spam class", () => {
  it("THE INCIDENT: 9-min-old account, 0 repos, 0 followers → throwaway", () => {
    expect(
      isThrowawayActor(
        {
          createdAt: "2026-07-04T23:51:00Z", // ~9 min before NOW
          publicRepos: 0,
          followers: 0,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("spares an established account (old, or with any footprint)", () => {
    // Old account, no footprint — established, keep.
    expect(
      isThrowawayActor({ createdAt: "2019-01-01T00:00:00Z", publicRepos: 0, followers: 0 }, NOW),
    ).toBe(false);
    // Brand-new but HAS a repo — a real first-day dev, keep.
    expect(
      isThrowawayActor({ createdAt: "2026-07-04T23:00:00Z", publicRepos: 1, followers: 0 }, NOW),
    ).toBe(false);
    // Brand-new but HAS a follower — keep.
    expect(
      isThrowawayActor({ createdAt: "2026-07-04T23:00:00Z", publicRepos: 0, followers: 3 }, NOW),
    ).toBe(false);
  });

  it("fails OPEN on missing/unparseable createdAt (never fabricate a spam verdict)", () => {
    expect(isThrowawayActor({ publicRepos: 0, followers: 0 }, NOW)).toBe(false);
    expect(isThrowawayActor({ createdAt: null, publicRepos: 0, followers: 0 }, NOW)).toBe(false);
    expect(isThrowawayActor({ createdAt: "nonsense", publicRepos: 0, followers: 0 }, NOW)).toBe(false);
  });

  it("the age boundary is exactly 1 day", () => {
    const justUnder = new Date(NOW - THROWAWAY_MAX_AGE_MS + 1000).toISOString();
    const justOver = new Date(NOW - THROWAWAY_MAX_AGE_MS - 1000).toISOString();
    expect(isThrowawayActor({ createdAt: justUnder, publicRepos: 0, followers: 0 }, NOW)).toBe(true);
    expect(isThrowawayActor({ createdAt: justOver, publicRepos: 0, followers: 0 }, NOW)).toBe(false);
  });
});
