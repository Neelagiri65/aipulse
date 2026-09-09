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
 * Degradation is ISR's, not ours. `fetchAllStatus` resolves per-tool failures
 * into `failures[]` and isolates each card's assembly, so a partial outage
 * yields a partial page rather than a throw.
 *
 * There is deliberately NO `.catch()` here. It used to read
 * `.catch(() => undefined)`, and measuring it against a real `next start` build
 * showed it did the opposite of protecting the page. On a throwing
 * regeneration:
 *
 *   catch removed  → the last good entry keeps serving, 156,563 bytes with the
 *                    real numbers, and the error is logged loudly
 *   catch present  → the 144,144-byte "awaiting first poll" shell is COMMITTED
 *                    to the cache and served for the whole revalidate window,
 *                    silently — nothing reached the log at all
 *
 * The catch converted a page ISR had already saved into the exact shell #123
 * existed to remove, and hid the failure while doing it. Next preserves the
 * stale entry on a failed background regeneration; letting the error propagate
 * is what keeps that guarantee.
 *
 * The cost of removing it, stated: at BUILD time there is no previous entry to
 * preserve, so a throw during prerender fails the build instead of shipping the
 * shell. That is the intended trade — a loud deploy failure beats silently
 * serving crawlers a page with no numbers in it.
 */

import { Dashboard } from "@/components/dashboard/Dashboard";
import { fetchAllStatus } from "@/lib/data/fetch-status";

// The homepage's own canonical. It used to be inherited from the root layout,
// where it also applied to every other page and told Google to drop them.
export const metadata = {
  alternates: { canonical: "/" },
};

/**
 * Five minutes matches the status sources' own poll cadence
 * (`REVALIDATE_SECONDS` in fetch-status.ts) — regenerating faster would only
 * re-serve the same upstream numbers.
 */
export const revalidate = 300;

export default async function Home() {
  const initialStatus = await fetchAllStatus();
  return (
    <Dashboard initialStatus={initialStatus} initialFeedResponse={undefined} />
  );
}
