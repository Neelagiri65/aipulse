/**
 * Chatbot Arena benchmarks — pure-logic layer.
 *
 * No network, no file I/O. Parses HuggingFace Datasets Server rows,
 * computes week-over-week deltas, runs sanity-range guards, builds the
 * payload the `/api/benchmarks` route serves.
 *
 * Transparency contract: Gawk does not recompute Elo, does not
 * re-rank, does not rename models. `rating_upper`/`rating_lower` arrive
 * as floats from lmarena-ai's Bradley-Terry fit and are integer-rounded
 * at display time (PRD AC 4). `rating` itself is integer-rounded for
 * table display; the raw float stays available in the payload for the
 * sanity-range guard.
 *
 * See docs/prd-chatbot-arena.md for the full acceptance criteria.
 */

export type ArenaRow = {
  rank: number;
  modelName: string;
  organization: string;
  rating: number;
  ratingLower: number;
  ratingUpper: number;
  voteCount: number;
  category: string;
  leaderboardPublishDate: string;
};

export type RankDelta =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up"; amount: number }
  | { kind: "down"; amount: number };

export type EloDelta =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "change"; amount: number };

export type ArenaRowWithDelta = ArenaRow & {
  rankDelta: RankDelta;
  eloDelta: EloDelta;
};

export type BenchmarksMeta = {
  leaderboardPublishDate: string;
  prevPublishDate: string | null;
  totalVotes: number;
  staleDays: number;
  fetchedAt: string;
};

export type SanityReport = {
  ok: boolean;
  warnings: string[];
};

export type BenchmarksPayload =
  | {
      ok: true;
      rows: ArenaRowWithDelta[];
      meta: BenchmarksMeta;
      sanity: SanityReport;
    }
  | {
      ok: false;
      reason: string;
      rows: [];
      meta: null;
      sanity?: SanityReport;
    };

// ---------------------------------------------------------------------------
// parseHfRow — deterministic shape verification.
// Upstream: HuggingFace Datasets Server returns { rows: [ { row_idx, row }, …] }
// We accept the inner `row` object; caller unwraps the envelope.
// ---------------------------------------------------------------------------

export function parseHfRow(raw: unknown): ArenaRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rank = toNumber(r.rank);
  const rating = toNumber(r.rating);
  const ratingLower = toNumber(r.rating_lower ?? r.rating_q025);
  const ratingUpper = toNumber(r.rating_upper ?? r.rating_q975);
  const voteCount = toNumber(r.vote_count ?? r.num_battles);
  const modelName = toString(r.model_name ?? r.model);
  // organization is allowed empty (lmarena occasionally ships "" for
  // newly-appearing models whose lab hasn't been tagged yet — e.g.,
  // `dola-seed-2.0-pro` at rank 13 on 2026-04-17). The transparency
  // contract says "raw organization verbatim" so we mirror "" as "".
  const organization = toStringOrEmpty(r.organization ?? r.organisation ?? r.org);
  const category = toString(r.category);
  const leaderboardPublishDate = toString(r.leaderboard_publish_date ?? r.snapshot_date);

  if (
    rank === null ||
    rating === null ||
    ratingLower === null ||
    ratingUpper === null ||
    voteCount === null ||
    modelName === null ||
    category === null ||
    leaderboardPublishDate === null
  ) {
    return null;
  }

  if (!Number.isFinite(rank) || rank < 1) return null;
  if (!Number.isFinite(rating)) return null;
  if (!Number.isFinite(voteCount) || voteCount < 0) return null;

  return {
    rank: Math.trunc(rank),
    modelName,
    organization,
    rating,
    ratingLower,
    ratingUpper,
    voteCount: Math.trunc(voteCount),
    category,
    leaderboardPublishDate,
  };
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function toStringOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Filters — keep the selection deterministic and auditable.
// ---------------------------------------------------------------------------

/**
 * Subset (`text`) is selected by the config= URL param and never appears as
 * a column in the response. Inside a `text` config fetch, the only filter
 * Gawk applies is category === "overall".
 */
export function isOverall(row: ArenaRow): boolean {
  return row.category.toLowerCase() === "overall";
}

/**
 * Filter → sort → take-20. Stable within the same rank (HF ranks are unique
 * but the sort keeps behaviour defined if a dataset ever ships duplicates).
 */
export function selectTop20(rows: ArenaRow[]): ArenaRow[] {
  return rows
    .filter(isOverall)
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Deltas — computed against the previous publish-date's snapshot.
// NEW: model absent in `previous`. Identical rank/Elo → "same" / "—".
// ---------------------------------------------------------------------------

export function computeDeltas(
  current: ArenaRow[],
  previous: ArenaRow[] | null,
): ArenaRowWithDelta[] {
  if (!previous || previous.length === 0) {
    return current.map((row) => ({
      ...row,
      rankDelta: { kind: "new" },
      eloDelta: { kind: "new" },
    }));
  }

  const prevByModel = new Map<string, ArenaRow>();
  for (const p of previous) {
    prevByModel.set(p.modelName, p);
  }

  return current.map((row) => {
    const prev = prevByModel.get(row.modelName);
    if (!prev) {
      return {
        ...row,
        rankDelta: { kind: "new" } as RankDelta,
        eloDelta: { kind: "new" } as EloDelta,
      };
    }

    const rankDiff = prev.rank - row.rank; // positive = moved up the board
    const rankDelta: RankDelta =
      rankDiff === 0
        ? { kind: "same" }
        : rankDiff > 0
          ? { kind: "up", amount: rankDiff }
          : { kind: "down", amount: -rankDiff };

    const eloDiff = Math.round(row.rating) - Math.round(prev.rating);
    const eloDelta: EloDelta =
      eloDiff === 0 ? { kind: "same" } : { kind: "change", amount: eloDiff };

    return { ...row, rankDelta, eloDelta };
  });
}

// ---------------------------------------------------------------------------
// Sanity ranges — pre-committed per the Part 0 non-negotiable.
// Values outside range log a warning; writes still proceed (existing pattern).
// ---------------------------------------------------------------------------

export const SANITY_RANGES = {
  top1Rating: { min: 1300, max: 1500 },
  // Upper bound widened from 1400 → 1500 after the 2026-04-17 live ingest
  // observed rank20_rating=1447.7. Frontier Elo values bunch near the top;
  // the original narrower range was guesswork before real data. Mirror in
  // `data-sources.ts` / `public/data-sources.md` is authoritative for the
  // transparency contract.
  rank20Rating: { min: 1100, max: 1500 },
  rowCount: { min: 20, max: 20 },
  publishAgeDays: { min: 0, max: 14 },
  top1VoteCount: { min: 5000, max: Infinity },
} as const;

export function runSanityCheck(
  rows: ArenaRow[],
  meta: { leaderboardPublishDate: string; fetchedAt: string },
): SanityReport {
  const warnings: string[] = [];

  const rowCount = rows.length;
  if (
    rowCount < SANITY_RANGES.rowCount.min ||
    rowCount > SANITY_RANGES.rowCount.max
  ) {
    warnings.push(
      `row_count=${rowCount} outside [${SANITY_RANGES.rowCount.min},${SANITY_RANGES.rowCount.max}]`,
    );
  }

  if (rowCount > 0) {
    const top = rows[0];
    const tail = rows[rowCount - 1];

    if (
      top.rating < SANITY_RANGES.top1Rating.min ||
      top.rating > SANITY_RANGES.top1Rating.max
    ) {
      warnings.push(
        `top1_rating=${top.rating.toFixed(1)} outside [${SANITY_RANGES.top1Rating.min},${SANITY_RANGES.top1Rating.max}]`,
      );
    }

    if (
      tail.rating < SANITY_RANGES.rank20Rating.min ||
      tail.rating > SANITY_RANGES.rank20Rating.max
    ) {
      warnings.push(
        `rank20_rating=${tail.rating.toFixed(1)} outside [${SANITY_RANGES.rank20Rating.min},${SANITY_RANGES.rank20Rating.max}]`,
      );
    }

    if (top.voteCount < SANITY_RANGES.top1VoteCount.min) {
      warnings.push(
        `top1_vote_count=${top.voteCount} below ${SANITY_RANGES.top1VoteCount.min}`,
      );
    }
  }

  const age = publishAgeDays(meta.leaderboardPublishDate, meta.fetchedAt);
  if (
    age !== null &&
    (age < SANITY_RANGES.publishAgeDays.min || age > SANITY_RANGES.publishAgeDays.max)
  ) {
    warnings.push(
      `publish_age_days=${age} outside [${SANITY_RANGES.publishAgeDays.min},${SANITY_RANGES.publishAgeDays.max}]`,
    );
  }

  return { ok: warnings.length === 0, warnings };
}

export function publishAgeDays(
  publishDate: string,
  fetchedAt: string,
): number | null {
  const pub = Date.parse(publishDate);
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(pub) || !Number.isFinite(fetched)) return null;
  const ms = fetched - pub;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// buildPayload — the shape the API serves.
// ---------------------------------------------------------------------------

export function buildPayload(
  current: ArenaRow[],
  previous: ArenaRow[] | null,
  opts: { fetchedAt: string },
): BenchmarksPayload {
  if (current.length === 0) {
    return {
      ok: false,
      reason: "no_rows",
      rows: [],
      meta: null,
    };
  }

  const publishDate = current[0].leaderboardPublishDate;
  const prevPublishDate = previous && previous.length > 0
    ? previous[0].leaderboardPublishDate
    : null;

  const rows = computeDeltas(current, previous);
  const totalVotes = current.reduce((s, r) => s + r.voteCount, 0);
  const staleDays = publishAgeDays(publishDate, opts.fetchedAt) ?? 0;

  const meta: BenchmarksMeta = {
    leaderboardPublishDate: publishDate,
    prevPublishDate,
    totalVotes,
    staleDays,
    fetchedAt: opts.fetchedAt,
  };

  const sanity = runSanityCheck(current, {
    leaderboardPublishDate: publishDate,
    fetchedAt: opts.fetchedAt,
  });

  return { ok: true, rows, meta, sanity };
}
