/**
 * Root page — server-rendered, then revalidated.
 *
 * S98 made this a static shell with `initialStatus={undefined}` to win ~1.4s of
 * mobile TTFB, on the reasoning that `fetchAllStatus` probes live reachability
 * with `cache: "no-store"` and so would force the route dynamic. That reasoning
 * does not match the code: `src/lib/data/fetch-status.ts` fetches every status
 * page with `next: { revalidate: 300 }` and contains no `no-store` at all. The
 * trade-off it described was a false dichotomy, and the price was paid on the
 * only visitors who cannot pay it back.
 *
 * What the shell cost: a crawler with no JavaScript — which is EVERY AI answer
 * engine we explicitly invite in `robots.ts` (GPTBot, ClaudeBot, PerplexityBot,
 * CCBot) and Googlebot before its render pass — received 2,054 characters
 * reading "connecting… / awaiting first poll / checking". The site's entire
 * claim is publicly-sourced, citable numbers, and the citable numbers were the
 * one thing not in the HTML.
 *
 * So: ISR. The page is prerendered and served from the edge exactly as before,
 * regenerated in the background every `revalidate` seconds, and the HTML that
 * reaches a crawler carries each tool's real state, the time it was polled, and
 * the source behind it. The client dashboard still polls on mount and takes
 * over; `initialDataAt` makes the freshness chrome age from the server's
 * `polledAt` rather than from hydration, so nothing claims to be newer than it
 * is.
 *
 * If the poll fails at build or revalidation time, `initialStatus` is undefined
 * and the page is the S98 shell again — the degradation is the old behaviour,
 * not an error state.
 */

import { Dashboard } from "@/components/dashboard/Dashboard";
import { fetchAllStatus } from "@/lib/data/fetch-status";

/**
 * Five minutes matches the status sources' own poll cadence
 * (`REVALIDATE_SECONDS` in fetch-status.ts) — regenerating faster would only
 * re-serve the same upstream numbers.
 */
export const revalidate = 300;

export default async function Home() {
  const initialStatus = await fetchAllStatus().catch(() => undefined);
  return (
    <Dashboard initialStatus={initialStatus} initialFeedResponse={undefined} />
  );
}
