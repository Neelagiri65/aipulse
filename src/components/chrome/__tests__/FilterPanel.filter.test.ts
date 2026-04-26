import { describe, expect, it } from "vitest";
import {
  applyFilterToggle,
  DEFAULT_FILTERS,
  EVENT_TYPE_FILTER_IDS,
  eventTypeToFilterId,
  filterLivePoints,
  isAiConfigStranded,
  type FilterState,
} from "@/components/chrome/FilterPanel";

type Point = {
  meta?: { type?: string; hasAiConfig?: boolean };
};

function mkPoint(type: string, hasAiConfig = false): Point {
  return { meta: { type, hasAiConfig } };
}

const ALL_DEFAULT = DEFAULT_FILTERS;
const AI_ONLY: FilterState = { ...DEFAULT_FILTERS, "ai-config-only": true };

describe("filterLivePoints — ai-config-only behaviour", () => {
  it("with ai-config-only OFF, keeps every point whose type maps to a bucket", () => {
    const points = [
      mkPoint("PullRequestEvent", false),
      mkPoint("PushEvent", true),
      mkPoint("IssuesEvent", false),
    ];
    expect(filterLivePoints(points, ALL_DEFAULT)).toHaveLength(3);
  });

  it("with ai-config-only ON, keeps only points where meta.hasAiConfig === true", () => {
    const points = [
      mkPoint("PullRequestEvent", false),
      mkPoint("PushEvent", true),
      mkPoint("IssuesEvent", true),
      mkPoint("ForkEvent", false),
    ];
    const out = filterLivePoints(points, AI_ONLY);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.meta?.hasAiConfig === true)).toBe(true);
  });

  it("returns non-empty when ai-config events exist (regression: filter must NOT empty the map)", () => {
    // 5 points; 2 carry hasAiConfig=true. With ai-config-only ON,
    // result must be exactly the 2 ai-config points — never empty.
    const points = [
      mkPoint("PullRequestEvent", true),
      mkPoint("PushEvent", false),
      mkPoint("IssuesEvent", true),
      mkPoint("ForkEvent", false),
      mkPoint("WatchEvent", false),
    ];
    const out = filterLivePoints(points, AI_ONLY);
    expect(out.length).toBe(2);
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns empty when ai-config-only ON and zero points carry hasAiConfig", () => {
    const points = [
      mkPoint("PullRequestEvent", false),
      mkPoint("PushEvent", false),
    ];
    expect(filterLivePoints(points, AI_ONLY)).toEqual([]);
  });

  it("treats hasAiConfig=undefined as false (excluded under ai-config-only)", () => {
    const points: Point[] = [{ meta: { type: "PushEvent" } }];
    expect(filterLivePoints(points, AI_ONLY)).toEqual([]);
  });

  it("does NOT invert: ai-config-only ON does not hide hasAiConfig=true points", () => {
    // The exact bug shape the user worried about — verify the polarity
    // is "show only AI", not "hide AI".
    const points = [mkPoint("PushEvent", true)];
    const out = filterLivePoints(points, AI_ONLY);
    expect(out).toHaveLength(1);
  });
});

describe("filterLivePoints — type bucket gating (independent of ai-config-only)", () => {
  it("drops events whose type doesn't map to any bucket", () => {
    const points: Point[] = [
      { meta: { type: "GollumEvent", hasAiConfig: true } },
      { meta: { type: "MemberEvent", hasAiConfig: true } },
    ];
    expect(filterLivePoints(points, AI_ONLY)).toEqual([]);
    expect(filterLivePoints(points, ALL_DEFAULT)).toEqual([]);
  });

  it("hides events whose mapped type is unchecked", () => {
    const noPush: FilterState = { ...DEFAULT_FILTERS, push: false };
    const points = [
      mkPoint("PushEvent", true),
      mkPoint("PullRequestEvent", true),
    ];
    const out = filterLivePoints(points, noPush);
    expect(out).toHaveLength(1);
    expect(out[0].meta?.type).toBe("PullRequestEvent");
  });

  it("auxiliary types route to the right bucket (regression: session-29)", () => {
    // Auxiliary types must follow their parent bucket's checkbox.
    const noPr: FilterState = { ...DEFAULT_FILTERS, pr: false };
    const points = [
      mkPoint("PullRequestReviewEvent", true),
      mkPoint("PullRequestReviewCommentEvent", true),
    ];
    expect(filterLivePoints(points, noPr)).toEqual([]);
  });
});

describe("filterLivePoints — meta-shape edge cases", () => {
  it("handles undefined meta gracefully (drops the point)", () => {
    const points: Point[] = [{}, mkPoint("PushEvent", true)];
    const out = filterLivePoints(points, ALL_DEFAULT);
    expect(out).toHaveLength(1);
  });

  it("handles missing type (drops the point — no checkbox owns it)", () => {
    const points: Point[] = [{ meta: { hasAiConfig: true } }];
    expect(filterLivePoints(points, AI_ONLY)).toEqual([]);
  });

  it("preserves point identity (returns the same object references)", () => {
    const ai = mkPoint("PushEvent", true);
    const out = filterLivePoints([ai], AI_ONLY);
    expect(out[0]).toBe(ai);
  });
});

describe("applyFilterToggle — ai-config-only auto-enable for event types", () => {
  it("flipping ai-config-only OFF→ON enables every event-type checkbox", () => {
    // Reproduces the user-reported bug: ai-config-only on, all event
    // types off, map empty. After this fix, toggling ai-config-only
    // ON should bring every event-type filter back ON.
    const allOff: FilterState = {
      ...DEFAULT_FILTERS,
      "ai-config-only": false,
      push: false,
      pr: false,
      issue: false,
      release: false,
      fork: false,
      watch: false,
    };
    const next = applyFilterToggle(allOff, "ai-config-only");
    expect(next["ai-config-only"]).toBe(true);
    for (const t of EVENT_TYPE_FILTER_IDS) {
      expect(next[t]).toBe(true);
    }
  });

  it("flipping ai-config-only ON→OFF leaves event-type state alone", () => {
    // The reverse direction must NOT undo the user's curation —
    // re-enabling ai-config-only later should remain a non-destructive
    // operation if they had specific buckets ticked.
    const onCurated: FilterState = {
      ...DEFAULT_FILTERS,
      "ai-config-only": true,
      push: true,
      pr: false,
      issue: false,
      release: false,
      fork: false,
      watch: false,
    };
    const next = applyFilterToggle(onCurated, "ai-config-only");
    expect(next["ai-config-only"]).toBe(false);
    expect(next.push).toBe(true);
    expect(next.pr).toBe(false);
    expect(next.fork).toBe(false);
  });

  it("toggling a non-signal filter is a plain boolean flip", () => {
    const next = applyFilterToggle(DEFAULT_FILTERS, "push");
    expect(next.push).toBe(false);
    // Other state unchanged.
    expect(next.pr).toBe(true);
    expect(next["ai-config-only"]).toBe(false);
  });

  it("does not mutate the input state", () => {
    const original: FilterState = { ...DEFAULT_FILTERS };
    applyFilterToggle(original, "ai-config-only");
    expect(original).toEqual(DEFAULT_FILTERS);
  });
});

describe("isAiConfigStranded — empty-state warning detector", () => {
  it("false when ai-config-only is off", () => {
    expect(isAiConfigStranded(DEFAULT_FILTERS)).toBe(false);
  });

  it("false when ai-config-only is on AND at least one event type is on", () => {
    const partialOn: FilterState = {
      ...DEFAULT_FILTERS,
      "ai-config-only": true,
      push: true,
      pr: false,
      issue: false,
      release: false,
      fork: false,
      watch: false,
    };
    expect(isAiConfigStranded(partialOn)).toBe(false);
  });

  it("true when ai-config-only is on AND every event type is off", () => {
    const stranded: FilterState = {
      ...DEFAULT_FILTERS,
      "ai-config-only": true,
      push: false,
      pr: false,
      issue: false,
      release: false,
      fork: false,
      watch: false,
    };
    expect(isAiConfigStranded(stranded)).toBe(true);
  });
});

describe("eventTypeToFilterId — bucket mapping coverage", () => {
  it("covers the live event types observed in prod (2026-04-26 snapshot)", () => {
    // From `/api/globe-events` fixture taken at debug time. Every type
    // we see in the wild must map to a bucket — otherwise the
    // ai-config-only filter would drop it for the wrong reason.
    expect(eventTypeToFilterId("PushEvent")).toBe("push");
    expect(eventTypeToFilterId("PullRequestEvent")).toBe("pr");
    expect(eventTypeToFilterId("PullRequestReviewEvent")).toBe("pr");
    expect(eventTypeToFilterId("IssuesEvent")).toBe("issue");
    expect(eventTypeToFilterId("IssueCommentEvent")).toBe("issue");
    expect(eventTypeToFilterId("ReleaseEvent")).toBe("release");
    expect(eventTypeToFilterId("ForkEvent")).toBe("fork");
    expect(eventTypeToFilterId("WatchEvent")).toBe("watch");
    expect(eventTypeToFilterId("CreateEvent")).toBe("push");
  });

  it("returns null for unknown types (forward-compat with new GH events)", () => {
    expect(eventTypeToFilterId("FutureNewEvent")).toBeNull();
    expect(eventTypeToFilterId(undefined)).toBeNull();
    expect(eventTypeToFilterId("")).toBeNull();
  });
});
