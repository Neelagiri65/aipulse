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
