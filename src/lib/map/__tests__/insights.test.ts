/**
 * map/insights — pickTopActiveCity + summariseClusterTypes +
 * formatBreakdownLine. Pure functions with deterministic outputs;
 * tests pin the visible UI contract.
 */

import { describe, it, expect } from "vitest";
import {
  pickTopActiveCity,
  summariseClusterTypes,
  formatBreakdownLine,
  pickClusterDelta,
  formatClusterDelta,
} from "@/lib/map/insights";
import type { GlobePoint } from "@/components/globe/Globe";

const SF: [number, number] = [37.7749, -122.4194];
const LDN: [number, number] = [51.5074, -0.1278];
const NYC: [number, number] = [40.7128, -74.006];

function ev(
  coords: [number, number],
  type = "PushEvent",
  kind?: "event" | "registry" | "hn" | "lab" | "rss",
): GlobePoint {
  return {
    lat: coords[0],
    lng: coords[1],
    color: "#fff",
    size: 0.5,
    meta: kind ? { kind, type } : { type },
  } as GlobePoint;
}

describe("pickTopActiveCity", () => {
  it("returns null for empty input", () => {
    expect(pickTopActiveCity([])).toBeNull();
  });

  it("returns null when no live events have a recoverable city", () => {
    expect(pickTopActiveCity([ev([0, 0])])).toBeNull(); // 0,0 isn't in dictionary
  });

  it("ignores non-live overlays (registry / lab / hn / rss)", () => {
    const result = pickTopActiveCity([
      ev(SF, "PushEvent", "registry"),
      ev(LDN, "PushEvent", "lab"),
      ev(LDN, "PushEvent", "hn"),
    ]);
    expect(result).toBeNull();
  });

  it("returns the city with the most live events", () => {
    const result = pickTopActiveCity([
      ev(SF),
      ev(SF),
      ev(SF),
      ev(LDN),
      ev(LDN),
    ]);
    expect(result).toEqual({ city: "San Francisco", count: 3 });
  });

  it("breaks ties alphabetically", () => {
    const result = pickTopActiveCity([ev(SF), ev(LDN), ev(NYC)]);
    expect(result?.count).toBe(1);
    // London / New York / San Francisco — alphabetic first wins.
    expect(result?.city).toBe("London");
  });

  it("counts events with kind='event' as live", () => {
    const result = pickTopActiveCity([ev(SF, "PushEvent", "event")]);
    expect(result?.count).toBe(1);
  });
});

describe("summariseClusterTypes", () => {
  it("returns [] when no live events", () => {
    expect(summariseClusterTypes([])).toEqual([]);
    expect(
      summariseClusterTypes([ev(SF, "PushEvent", "registry")]),
    ).toEqual([]);
  });

  it("groups by friendly label, sorted by count desc", () => {
    const rows = summariseClusterTypes([
      ev(SF, "PushEvent"),
      ev(SF, "PushEvent"),
      ev(SF, "PushEvent"),
      ev(SF, "PullRequestEvent"),
      ev(SF, "IssuesEvent"),
      ev(SF, "IssuesEvent"),
    ]);
    expect(rows).toEqual([
      { label: "push", count: 3 },
      { label: "issue", count: 2 },
      { label: "PR", count: 1 },
    ]);
  });

  it("collapses unknown types into 'other'", () => {
    const rows = summariseClusterTypes([
      ev(SF, "MysteryEvent"),
      ev(SF, "AnotherEvent"),
      ev(SF, "PushEvent"),
    ]);
    expect(rows).toEqual([
      { label: "other", count: 2 },
      { label: "push", count: 1 },
    ]);
  });

  it("maps WatchEvent to 'star' (GH naming oddity)", () => {
    const rows = summariseClusterTypes([ev(SF, "WatchEvent")]);
    expect(rows[0]).toEqual({ label: "star", count: 1 });
  });

  it("ties broken alphabetically by label", () => {
    const rows = summariseClusterTypes([
      ev(SF, "PushEvent"),
      ev(SF, "ForkEvent"),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["fork", "push"]);
  });
});

describe("formatBreakdownLine", () => {
  it("returns empty string for empty input", () => {
    expect(formatBreakdownLine([])).toBe("");
  });

  it("formats per spec: '52 pushes · 23 PRs · 12 issues'", () => {
    expect(
      formatBreakdownLine([
        { label: "push", count: 52 },
        { label: "PR", count: 23 },
        { label: "issue", count: 12 },
      ]),
    ).toBe("52 pushes · 23 PRs · 12 issues");
  });

  it("singular when count is 1", () => {
    expect(
      formatBreakdownLine([
        { label: "PR", count: 1 },
        { label: "issue", count: 1 },
      ]),
    ).toBe("1 PR · 1 issue");
  });

  it("'star' → 'stars' (regular plural)", () => {
    expect(formatBreakdownLine([{ label: "star", count: 4 }])).toBe(
      "4 stars",
    );
  });

  it("'push' → 'pushes' (sibilant ending)", () => {
    expect(formatBreakdownLine([{ label: "push", count: 2 }])).toBe(
      "2 pushes",
    );
  });
});

function evWithCountry(
  country: string | null,
  type = "PushEvent",
): GlobePoint {
  return {
    lat: 0,
    lng: 0,
    color: "#fff",
    size: 0.5,
    meta: { type, country },
  } as GlobePoint;
}

describe("pickClusterDelta", () => {
  it("returns null when byCountry is null/undefined (no prior data)", () => {
    const events = Array.from({ length: 20 }, () => evWithCountry("India"));
    expect(pickClusterDelta(events, null)).toBeNull();
    expect(pickClusterDelta(events, undefined)).toBeNull();
  });

  it("returns null when cluster has fewer than minEvents labelled events (default 10)", () => {
    const events = Array.from({ length: 9 }, () => evWithCountry("India"));
    const byCountry = { India: { deltaPct: 30 } };
    expect(pickClusterDelta(events, byCountry)).toBeNull();
  });

  it("returns null when dominant country's deltaPct is null (bootstrap, no prior data)", () => {
    const events = Array.from({ length: 20 }, () => evWithCountry("India"));
    const byCountry = { India: { deltaPct: null } };
    expect(pickClusterDelta(events, byCountry)).toBeNull();
  });

  it("returns null when |deltaPct| is below noise floor (default 5%)", () => {
    const events = Array.from({ length: 20 }, () => evWithCountry("India"));
    expect(pickClusterDelta(events, { India: { deltaPct: 4.9 } })).toBeNull();
    expect(pickClusterDelta(events, { India: { deltaPct: -4.9 } })).toBeNull();
  });

  it("returns dominant-country delta when all guards pass", () => {
    const events = Array.from({ length: 20 }, () => evWithCountry("India"));
    const result = pickClusterDelta(events, { India: { deltaPct: 30 } });
    expect(result).toEqual({ country: "India", deltaPct: 30 });
  });

  it("dominant country = highest count among labelled live events; ignores other layers", () => {
    const events: GlobePoint[] = [
      ...Array.from({ length: 7 }, () => evWithCountry("India")),
      ...Array.from({ length: 12 }, () => evWithCountry("United States")),
      ...Array.from({ length: 5 }, () => evWithCountry(null)), // unattributed
    ];
    const byCountry = {
      India: { deltaPct: 50 },
      "United States": { deltaPct: 10 },
    };
    const result = pickClusterDelta(events, byCountry);
    expect(result?.country).toBe("United States");
  });

  it("ignores non-live overlays (registry / lab / hn / rss) when counting", () => {
    const events: GlobePoint[] = [
      ...Array.from({ length: 12 }, () => evWithCountry("India")),
      // 50 lab/registry/hn events shouldn't pull dominant country to United Kingdom
      ...Array.from({ length: 50 }, () => ({
        lat: 0,
        lng: 0,
        color: "#fff",
        size: 0.5,
        meta: { kind: "lab", country: "United Kingdom" },
      } as GlobePoint)),
    ];
    const byCountry = {
      India: { deltaPct: 30 },
      "United Kingdom": { deltaPct: 200 },
    };
    expect(pickClusterDelta(events, byCountry)?.country).toBe("India");
  });

  it("ties broken alphabetically — deterministic", () => {
    const events: GlobePoint[] = [
      ...Array.from({ length: 10 }, () => evWithCountry("India")),
      ...Array.from({ length: 10 }, () => evWithCountry("Brazil")),
    ];
    const byCountry = {
      India: { deltaPct: 50 },
      Brazil: { deltaPct: 80 },
    };
    expect(pickClusterDelta(events, byCountry)?.country).toBe("Brazil");
  });

  it("respects custom minEvents + minPct overrides", () => {
    const events = Array.from({ length: 5 }, () => evWithCountry("India"));
    expect(pickClusterDelta(events, { India: { deltaPct: 6 } })).toBeNull();
    expect(
      pickClusterDelta(events, { India: { deltaPct: 6 } }, { minEvents: 5 }),
    ).toEqual({ country: "India", deltaPct: 6 });
    expect(
      pickClusterDelta(events, { India: { deltaPct: 6 } }, { minEvents: 5, minPct: 10 }),
    ).toBeNull();
  });
});

describe("formatClusterDelta", () => {
  it("up arrow for positive deltas", () => {
    expect(formatClusterDelta({ country: "X", deltaPct: 12 })).toBe("↑12%");
    expect(formatClusterDelta({ country: "X", deltaPct: 0.4 })).toBe("↑0%");
  });

  it("down arrow for negative deltas, magnitude shown", () => {
    expect(formatClusterDelta({ country: "X", deltaPct: -8 })).toBe("↓8%");
    expect(formatClusterDelta({ country: "X", deltaPct: -100 })).toBe("↓100%");
  });

  it("rounds to nearest integer", () => {
    expect(formatClusterDelta({ country: "X", deltaPct: 12.6 })).toBe("↑13%");
    expect(formatClusterDelta({ country: "X", deltaPct: -7.4 })).toBe("↓7%");
  });
});
