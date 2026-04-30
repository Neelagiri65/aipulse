/**
 * GET /api/benchmarks/history — last-N-day Elo history per model.
 *
 * Powers the Trend column in BenchmarksPanel (S48g sparkline retrofit).
 * Decoupled from the static `/api/benchmarks` route so the per-row Elo
 * snapshot data (Redis-backed, dynamic) doesn't break the existing
 * static caching of the leaderboard JSON. The panel fetches both and
 * renders progressively — the table appears the moment the static
 * payload lands; sparklines fill in when this dynamic call returns.
 *
 * Shape:
 *   {
 *     ok: true,
 *     dates: ["2026-04-18", "2026-04-19", ...],   // oldest → newest
 *     byModel: { "<modelName>": [1290, 1295, null, 1301, ...], ... }
 *   }
 *
 * Graceful degradation: if Redis is unavailable, returns
 * `{ ok: true, dates: [], byModel: {} }` so the panel renders sparkline
 * cells as empty SVGs rather than erroring. Snapshot store absence isn't
 * a 500 — it's just "no history yet".
 *
 * Cache: edge `s-maxage=600` (10 min) so user fan-out doesn't fan out to
 * Redis. The window only mutates when a new daily snapshot lands.
 */

import { readEloHistory } from "@/lib/data/benchmarks-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_DAYS = 14;

export async function GET() {
  try {
    const result = await readEloHistory(HISTORY_DAYS);
    const byModel: Record<string, Array<number | null>> = {};
    for (const [k, v] of result.byModel) {
      byModel[k] = v;
    }
    return Response.json(
      { ok: true, dates: result.dates, byModel },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return Response.json(
      { ok: true, dates: [], byModel: {} },
      { headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }
}
