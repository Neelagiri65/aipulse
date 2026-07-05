import { describe, expect, it } from "vitest";

import {
  archivePaths,
  eventKey,
  makeEnvelope,
  mergeEventLines,
  shouldArchive,
} from "../archive";

const T = "2026-07-05T20:00:00.000Z";
const EP = "/api/globe-events";

const point = (id: string | number, kind = "events-api") => ({
  lat: 51.5,
  lng: -0.13,
  meta: { eventId: id, sourceKind: kind, repo: "a/b" },
});

describe("eventKey — sourceKind-qualified dedup identity", () => {
  it("qualifies by sourceKind so GitHub and GitLab numeric ids cannot collide", () => {
    expect(eventKey(point(123, "events-api"))).toBe("events-api:123");
    expect(eventKey(point(123, "gitlab"))).toBe("gitlab:123");
    expect(eventKey(point(123, "events-api"))).not.toBe(eventKey(point(123, "gitlab")));
  });

  it("returns null for unidentifiable points — never a synthetic key", () => {
    expect(eventKey({ meta: {} })).toBeNull();
    expect(eventKey({})).toBeNull();
    expect(eventKey({ meta: { eventId: "" } })).toBeNull();
  });
});

describe("mergeEventLines — append-only, dedup across ticks", () => {
  it("first tick writes all identifiable points as envelopes", () => {
    const r = mergeEventLines("", [point(1), point(2)], EP, T);
    expect(r.added).toBe(2);
    expect(r.total).toBe(2);
    const lines = r.content.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ v: 1, capturedAt: T, endpoint: EP });
    expect(lines[0].record.meta.eventId).toBe(1);
  });

  it("second tick appends only unseen ids and never rewrites existing lines", () => {
    const first = mergeEventLines("", [point(1), point(2)], EP, T);
    const second = mergeEventLines(first.content, [point(2), point(3)], EP, "2026-07-05T21:00:00.000Z");
    expect(second.added).toBe(1);
    expect(second.total).toBe(3);
    // existing lines byte-identical (append-only)
    expect(second.content.startsWith(first.content)).toBe(true);
  });

  it("skips (and counts) points with no event id rather than inventing a key", () => {
    const r = mergeEventLines("", [point(1), { lat: 0, lng: 0, meta: {} }], EP, T);
    expect(r.added).toBe(1);
    expect(r.skippedNoId).toBe(1);
  });

  it("throws loudly on a corrupt existing line — never papers over history", () => {
    expect(() => mergeEventLines("not-json\n", [point(1)], EP, T)).toThrow(/Corrupt archive line 1/);
  });
});

describe("shouldArchive — the trust-audit gate", () => {
  it("archives only on a clean audit", () => {
    expect(shouldArchive({ ok: true, findings: [] })).toBe(true);
  });

  it("skips on breaches, not-ok, or an unreachable audit", () => {
    expect(shouldArchive({ ok: true, findings: [{ any: "breach" }] })).toBe(false);
    expect(shouldArchive({ ok: false, findings: [] })).toBe(false);
    expect(shouldArchive(null)).toBe(false);
    expect(shouldArchive(undefined)).toBe(false);
  });
});

describe("archivePaths — UTC-keyed layout", () => {
  it("keys by UTC date regardless of local timezone", () => {
    expect(archivePaths("2026-07-05T23:59:59.000Z")).toEqual({
      eventsFile: "events/2026/07/2026-07-05.ndjson",
      snapshotsDir: "snapshots/2026/07/2026-07-05",
    });
    expect(archivePaths("2026-07-06T00:00:01.000Z").eventsFile).toBe("events/2026/07/2026-07-06.ndjson");
  });

  it("rejects an invalid instant", () => {
    expect(() => archivePaths("garbage")).toThrow(/Invalid capturedAt/);
  });
});

describe("makeEnvelope — provenance shape", () => {
  it("wraps the record verbatim with version, instant, endpoint", () => {
    const rec = { anything: [1, 2, 3] };
    expect(makeEnvelope(rec, "/api/feed", T)).toEqual({ v: 1, capturedAt: T, endpoint: "/api/feed", record: rec });
  });
});
