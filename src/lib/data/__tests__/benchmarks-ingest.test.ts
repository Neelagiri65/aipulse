import { describe, expect, it } from "vitest";
import {
  type CommittedBenchmarks,
  choosePrevious,
  toArenaRows,
} from "@/lib/data/benchmarks-ingest";
import {
  type ArenaRow,
  buildPayload,
  isOverall,
  parseHfRow,
} from "@/lib/data/benchmarks-lmarena";
import hfTail from "./fixtures/hf-full-split-tail.json";
// Frozen copies of the committed boards (2026-11-04). NOT the live data/benchmarks files: the bot
// rewrites those at every lmarena publish, and a test pinned to them goes red on its own.
import committedLatest from "./fixtures/lmarena-latest-2026-10-28.json";
import committedPrevious from "./fixtures/lmarena-previous-2026-10-22.json";
import { computeDeltas } from "@/lib/data/benchmarks-lmarena";

const row = (over: Partial<ArenaRow> = {}): ArenaRow => ({
  rank: 1,
  modelName: "Model A",
  organization: "lab",
  rating: 1400,
  ratingLower: 1390,
  ratingUpper: 1410,
  voteCount: 9000,
  category: "overall",
  leaderboardPublishDate: "2026-10-22",
  ...over,
});

const committed = (latestDate: string | null, previous: ArenaRow[] | null = null): CommittedBenchmarks => ({
  latest: latestDate === null ? null : {
    meta: { leaderboardPublishDate: latestDate },
    rows: [{ ...row({ leaderboardPublishDate: latestDate }), rankDelta: { kind: "new" }, eloDelta: { kind: "new" } } as ArenaRow],
  },
  previous,
});

describe("HF split=full layout (why the previous snapshot is not read from it)", () => {
  // Recorded 2026-11-04: the LAST page of split=full (offset 1,234,732 of 1,234,832). The old
  // fetcher assumed the split is ordered oldest-first and scanned its last 3,000 rows for
  // `overall`. The split is grouped by category; that tail is all `spanish`. Zero candidates →
  // null → 188 snapshots of all-"new" deltas with no error logged.
  it("the tail of split=full carries no overall rows", () => {
    const parsed = hfTail.rows.map((r) => parseHfRow(r.row)).filter((r): r is ArenaRow => r !== null);
    expect(parsed.length).toBe(100);
    expect(parsed.filter(isOverall)).toHaveLength(0);
  });
});

describe("choosePrevious", () => {
  it("rolls the committed board over when lmarena publishes a newer one", () => {
    const c = choosePrevious("2026-10-28", committed("2026-10-22"));
    expect(c.previous?.[0].leaderboardPublishDate).toBe("2026-10-22");
    expect(c.rollover).toEqual(c.previous);
    // The delta fields of the committed rows do not leak into the stored previous snapshot.
    expect(Object.keys(c.rollover![0])).not.toContain("rankDelta");
  });

  it("reuses the stored previous on a same-date rerun, and writes nothing", () => {
    const prev = [row({ leaderboardPublishDate: "2026-10-22" })];
    const c = choosePrevious("2026-10-28", committed("2026-10-28", prev));
    expect(c.previous).toBe(prev);
    expect(c.rollover).toBeNull();
  });

  it("does not compare a board with itself when the stored previous is the same date", () => {
    const c = choosePrevious("2026-10-28", committed("2026-10-28", [row({ leaderboardPublishDate: "2026-10-28" })]));
    expect(c.previous).toBeNull();
  });

  it("gives no comparison when there is no stored previous", () => {
    expect(choosePrevious("2026-10-28", committed("2026-10-28", null)).previous).toBeNull();
  });

  it("gives no comparison, never an invented one, when upstream goes backwards", () => {
    const c = choosePrevious("2026-10-20", committed("2026-10-28", [row()]));
    expect(c.previous).toBeNull();
    expect(c.rollover).toBeNull();
    expect(c.reason).toMatch(/backwards/);
    expect(c.behindCommitted).toBe(true);
  });

  it("only the backwards case tells the caller not to write", () => {
    expect(choosePrevious("2026-10-28", committed("2026-10-22")).behindCommitted).toBeUndefined();
    expect(choosePrevious("2026-10-28", committed("2026-10-28", null)).behindCommitted).toBeUndefined();
  });

  it("gives no comparison on the very first ingest", () => {
    expect(choosePrevious("2026-10-28", committed(null)).previous).toBeNull();
  });
});

describe("no earlier board → no comparison, not NEW", () => {
  it("marks every row none (rendered as a dash), never new", () => {
    const rows = computeDeltas([row(), row({ rank: 2, modelName: "Model B" })], null);
    expect(rows.map((r) => [r.rankDelta.kind, r.eloDelta.kind])).toEqual([["none", "none"], ["none", "none"]]);
  });

  it("a model absent from a real previous board is still new", () => {
    const rows = computeDeltas([row(), row({ rank: 2, modelName: "Model B" })], [row()]);
    expect(rows[1].rankDelta.kind).toBe("new");
  });
});

describe("deltas against the committed boards (frozen real data)", () => {
  // The previous board was seeded from the 2026-10-22 commit of lmarena-latest.json (c3fd660).
  const current = toArenaRows((committedLatest as { rows: ArenaRow[] }).rows);
  const choice = choosePrevious(current[0].leaderboardPublishDate, {
    latest: committedLatest as CommittedBenchmarks["latest"],
    previous: committedPrevious as ArenaRow[],
  });
  const payload = buildPayload(current, choice.previous, { fetchedAt: "2026-11-04T12:00:00.000Z" });

  it("names the previous publish date", () => {
    expect(payload.ok && payload.meta?.prevPublishDate).toBe("2026-10-22");
  });

  it("produces real movement, not a board of NEW", () => {
    const kinds = payload.rows.map((r) => r.rankDelta.kind);
    expect(kinds.filter((k) => k === "new").length).toBeLessThan(kinds.length);
    expect(kinds).toContain("down");
    expect(payload.rows.some((r) => r.eloDelta.kind === "change")).toBe(true);
  });
});
