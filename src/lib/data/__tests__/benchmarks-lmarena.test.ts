import { describe, expect, it } from "vitest";
import {
  type ArenaRow,
  buildPayload,
  computeDeltas,
  isOverall,
  parseHfRow,
  publishAgeDays,
  runSanityCheck,
  selectTop20,
} from "@/lib/data/benchmarks-lmarena";

const baseRow = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  rank: 1,
  model_name: "Claude 4.7 Opus",
  organization: "Anthropic",
  rating: 1411.24,
  rating_lower: 1405.1,
  rating_upper: 1415.3,
  vote_count: 50321,
  category: "overall",
  leaderboard_publish_date: "2026-04-17",
  ...over,
});

const row = (o: Partial<ArenaRow> = {}): ArenaRow => ({
  rank: 1,
  modelName: "Claude 4.7 Opus",
  organization: "Anthropic",
  rating: 1411.24,
  ratingLower: 1405.1,
  ratingUpper: 1415.3,
  voteCount: 50321,
  category: "overall",
  leaderboardPublishDate: "2026-04-17",
  ...o,
});

describe("parseHfRow", () => {
  it("parses a happy-path row", () => {
    const parsed = parseHfRow(baseRow());
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      rank: 1,
      modelName: "Claude 4.7 Opus",
      organization: "Anthropic",
      rating: 1411.24,
      ratingLower: 1405.1,
      ratingUpper: 1415.3,
      voteCount: 50321,
      category: "overall",
      leaderboardPublishDate: "2026-04-17",
    });
  });

  it("parses a row missing the optional `subset` column (HF text config)", () => {
    const raw = baseRow();
    // HF never returns a `subset` column in the response — config=text selects it.
    delete (raw as { subset?: unknown }).subset;
    const parsed = parseHfRow(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.modelName).toBe("Claude 4.7 Opus");
  });

  it("returns null when rank is missing", () => {
    expect(parseHfRow(baseRow({ rank: undefined }))).toBeNull();
  });

  it("returns null when model_name is missing", () => {
    expect(parseHfRow(baseRow({ model_name: "" }))).toBeNull();
  });

  it("returns null when rating is non-numeric", () => {
    expect(parseHfRow(baseRow({ rating: "not-a-number" }))).toBeNull();
  });

  it("accepts organization field under legacy key", () => {
    const parsed = parseHfRow(baseRow({ organization: undefined, org: "Anthropic" }));
    expect(parsed?.organization).toBe("Anthropic");
  });

  it("mirrors empty organization verbatim (lmarena ships '' for un-tagged models)", () => {
    const parsed = parseHfRow(baseRow({ organization: "" }));
    expect(parsed).not.toBeNull();
    expect(parsed?.organization).toBe("");
  });

  it("coerces numeric strings (HF sometimes serialises rating as string)", () => {
    const parsed = parseHfRow(baseRow({ rating: "1411.24", vote_count: "50321" }));
    expect(parsed?.rating).toBeCloseTo(1411.24, 2);
    expect(parsed?.voteCount).toBe(50321);
  });

  it("returns null on an empty object", () => {
    expect(parseHfRow({})).toBeNull();
  });

  it("returns null on null / non-object input", () => {
    expect(parseHfRow(null)).toBeNull();
    expect(parseHfRow(undefined)).toBeNull();
    expect(parseHfRow("nope")).toBeNull();
    expect(parseHfRow(42)).toBeNull();
  });

  it("rejects negative rank", () => {
    expect(parseHfRow(baseRow({ rank: -1 }))).toBeNull();
  });

  it("rejects negative vote_count", () => {
    expect(parseHfRow(baseRow({ vote_count: -5 }))).toBeNull();
  });
});

describe("isOverall / selectTop20", () => {
  it("keeps category=overall, drops everything else", () => {
    const rows: ArenaRow[] = [
      row({ rank: 1, modelName: "A" }),
      row({ rank: 2, modelName: "B", category: "coding" }),
      row({ rank: 3, modelName: "C", category: "chinese" }),
      row({ rank: 4, modelName: "D" }),
    ];
    expect(rows.filter(isOverall).map((r) => r.modelName)).toEqual(["A", "D"]);
  });

  it("selectTop20 sorts by rank asc and caps at 20", () => {
    const rows: ArenaRow[] = [];
    for (let i = 25; i >= 1; i--) {
      rows.push(row({ rank: i, modelName: `M${i}` }));
    }
    const top = selectTop20(rows);
    expect(top).toHaveLength(20);
    expect(top[0].rank).toBe(1);
    expect(top[19].rank).toBe(20);
  });

  it("selectTop20 filters non-text-overall before slicing", () => {
    const rows: ArenaRow[] = [
      row({ rank: 1, modelName: "keep-1" }),
      row({ rank: 2, modelName: "drop-coding", category: "coding" }),
      row({ rank: 3, modelName: "keep-3" }),
    ];
    expect(selectTop20(rows).map((r) => r.modelName)).toEqual(["keep-1", "keep-3"]);
  });
});

describe("computeDeltas", () => {
  it("marks every row NEW when previous is null", () => {
    const current = [row({ rank: 1, modelName: "A" })];
    const out = computeDeltas(current, null);
    expect(out[0].rankDelta).toEqual({ kind: "new" });
    expect(out[0].eloDelta).toEqual({ kind: "new" });
  });

  it("marks every row NEW when previous is empty", () => {
    const out = computeDeltas([row()], []);
    expect(out[0].rankDelta).toEqual({ kind: "new" });
  });

  it("rank up: model moved from rank 5 to rank 2 → up:3", () => {
    const cur = [row({ rank: 2, modelName: "A", rating: 1410 })];
    const prev = [row({ rank: 5, modelName: "A", rating: 1400 })];
    const [out] = computeDeltas(cur, prev);
    expect(out.rankDelta).toEqual({ kind: "up", amount: 3 });
  });

  it("rank down: model moved from rank 2 to rank 7 → down:5", () => {
    const cur = [row({ rank: 7, modelName: "A", rating: 1400 })];
    const prev = [row({ rank: 2, modelName: "A", rating: 1410 })];
    const [out] = computeDeltas(cur, prev);
    expect(out.rankDelta).toEqual({ kind: "down", amount: 5 });
  });

  it("rank same + elo same → '—' / '—'", () => {
    const cur = [row({ rank: 3, modelName: "A", rating: 1400 })];
    const prev = [row({ rank: 3, modelName: "A", rating: 1400 })];
    const [out] = computeDeltas(cur, prev);
    expect(out.rankDelta).toEqual({ kind: "same" });
    expect(out.eloDelta).toEqual({ kind: "same" });
  });

  it("elo change +12 / -7 computed on integer-rounded ratings", () => {
    const cur = [row({ rank: 1, modelName: "A", rating: 1412.6 })];
    const prev = [row({ rank: 1, modelName: "A", rating: 1400.2 })];
    const [out] = computeDeltas(cur, prev);
    expect(out.eloDelta).toEqual({ kind: "change", amount: 13 });
  });

  it("model absent in previous → NEW", () => {
    const cur = [row({ rank: 1, modelName: "BrandNew" })];
    const prev = [row({ rank: 1, modelName: "Old" })];
    const [out] = computeDeltas(cur, prev);
    expect(out.rankDelta).toEqual({ kind: "new" });
    expect(out.eloDelta).toEqual({ kind: "new" });
  });
});

describe("runSanityCheck", () => {
  it("passes with rows in range + fresh publish date", () => {
    const rows: ArenaRow[] = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(
        row({
          rank: i,
          modelName: `M${i}`,
          rating: 1450 - i * 10,
          voteCount: 30000,
        }),
      );
    }
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-04-17",
      fetchedAt: "2026-04-20T03:15:00Z",
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  it("fails when row_count != 20", () => {
    const rows = [row()];
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-04-17",
      fetchedAt: "2026-04-20",
    });
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.includes("row_count"))).toBe(true);
  });

  it("fails when top1 rating is out of range (too low)", () => {
    const rows: ArenaRow[] = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(row({ rank: i, modelName: `M${i}`, rating: 1000, voteCount: 30000 }));
    }
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-04-17",
      fetchedAt: "2026-04-20",
    });
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.includes("top1_rating"))).toBe(true);
  });

  it("fails when rank20 rating is out of range (too high)", () => {
    const rows: ArenaRow[] = [];
    for (let i = 1; i <= 19; i++) {
      rows.push(
        row({ rank: i, modelName: `M${i}`, rating: 1450 - i * 2, voteCount: 30000 }),
      );
    }
    rows.push(row({ rank: 20, modelName: "M20", rating: 1500, voteCount: 30000 }));
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-04-17",
      fetchedAt: "2026-04-20",
    });
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.includes("rank20_rating"))).toBe(true);
  });

  it("fails when publish date is stale (>14d)", () => {
    const rows: ArenaRow[] = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(row({ rank: i, modelName: `M${i}`, rating: 1450 - i * 10, voteCount: 30000 }));
    }
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-03-01",
      fetchedAt: "2026-04-20",
    });
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.includes("publish_age_days"))).toBe(true);
  });

  it("fails when top1 vote_count below 5000", () => {
    const rows: ArenaRow[] = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(row({ rank: i, modelName: `M${i}`, rating: 1450 - i * 10, voteCount: 1000 }));
    }
    const report = runSanityCheck(rows, {
      leaderboardPublishDate: "2026-04-17",
      fetchedAt: "2026-04-20",
    });
    expect(report.ok).toBe(false);
    expect(report.warnings.some((w) => w.includes("top1_vote_count"))).toBe(true);
  });
});

describe("publishAgeDays", () => {
  it("returns 0 same-day", () => {
    expect(publishAgeDays("2026-04-20", "2026-04-20T12:00:00Z")).toBe(0);
  });
  it("returns positive for a past publish date", () => {
    expect(publishAgeDays("2026-04-15", "2026-04-20T00:00:00Z")).toBe(5);
  });
  it("returns null on invalid date strings", () => {
    expect(publishAgeDays("never", "whenever")).toBeNull();
  });
});

describe("buildPayload", () => {
  it("returns ok=false when current is empty", () => {
    const out = buildPayload([], null, { fetchedAt: "2026-04-20T03:15:00Z" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("no_rows");
  });

  it("builds the full shape when current is populated", () => {
    const current: ArenaRow[] = [];
    for (let i = 1; i <= 20; i++) {
      current.push(
        row({ rank: i, modelName: `M${i}`, rating: 1450 - i * 10, voteCount: 30000 }),
      );
    }
    const out = buildPayload(current, null, { fetchedAt: "2026-04-20T03:15:00Z" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.rows).toHaveLength(20);
      expect(out.rows[0].rankDelta).toEqual({ kind: "new" });
      expect(out.meta.leaderboardPublishDate).toBe("2026-04-17");
      expect(out.meta.totalVotes).toBe(20 * 30000);
      expect(out.meta.prevPublishDate).toBeNull();
      expect(out.meta.staleDays).toBe(3);
    }
  });

  it("surfaces previous publish date when available", () => {
    const current = [row({ rank: 1, modelName: "A", rating: 1410 })];
    const previous = [
      row({
        rank: 1,
        modelName: "A",
        rating: 1400,
        leaderboardPublishDate: "2026-04-10",
      }),
    ];
    const out = buildPayload(current, previous, { fetchedAt: "2026-04-20T03:15:00Z" });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.meta.prevPublishDate).toBe("2026-04-10");
      expect(out.rows[0].eloDelta).toEqual({ kind: "change", amount: 10 });
    }
  });
});
