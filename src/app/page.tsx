/**
 * Root page — static shell entry.
 *
 * Renders the Dashboard shell with no server pre-fetch, so this route is
 * statically prerendered and served from the edge CDN. On mobile that
 * takes TTFB from ~1.5s (a per-visit US-region Upstash round-trip under
 * the old `force-dynamic` SSR) down to edge latency — the phone paints
 * the shell immediately instead of hanging blank while the server renders.
 *
 * Real data still arrives on the first client poll tick: the Dashboard's
 * `initialStatus` / `initialFeedResponse` props are optional and, when
 * absent, its status + feed hooks fetch on mount and fill in within the
 * first second. Every card still carries its primary-source URL from
 * `data-sources.ts` — no data is invented.
 *
 * Why not pre-fetch server-side any more: `fetchAllStatus` / `loadFeedResponse`
 * are shared with ~10 API routes and probe LIVE reachability via
 * `cache: "no-store"` fetches, which cannot be cached without breaking those
 * callers — and a single `no-store` fetch in the render forces the whole
 * route dynamic, defeating edge caching. Trading server-rendered real data on
 * first paint for a ~1s skeleton is worth a ~1.4s TTFB win on mobile.
 * A future streaming/PPR pass could restore real-data-first-paint without the
 * TTFB cost. See HANDOFF S98.
 */

import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  return <Dashboard initialStatus={undefined} initialFeedResponse={undefined} />;
}
