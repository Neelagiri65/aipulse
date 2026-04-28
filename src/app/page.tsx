/**
 * Root page — SSR entry.
 *
 * Async server component. Pre-fetches the two surfaces most visible in
 * the first 10 seconds (status for the StatusBar, the ranked feed for
 * the mobile FeedView) so the first paint shows real data instead of
 * a loading shell. The client Dashboard then takes over polling.
 *
 * Both pre-fetches go through `withLastKnown` upstream so a dead arxiv,
 * a flaky GitHub events fetch, or an Anthropic-status outage still
 * yields stale-but-real cards with an "as of $time" disclosure rather
 * than a blank panel — per the trust contract on /methodology.
 *
 * No data here is invented. Every card carries a primary-source URL
 * read from `data-sources.ts`.
 */

import { Dashboard } from "@/components/dashboard/Dashboard";
import {
  fetchAllStatus,
  type StatusResult,
} from "@/lib/data/fetch-status";
import { withLastKnown } from "@/lib/feed/last-known";
import { loadFeedResponse } from "@/lib/feed/load";
import type { FeedResponse } from "@/lib/feed/types";

// Force dynamic rendering. The upstream `fetch` calls (Upstash Redis,
// arxiv, GitHub) all carry their own `next: { revalidate }` hints, so
// the per-visit cost on Vercel is bounded by Next Data Cache anyway.
// `revalidate = 60` would make Next attempt build-time prerender, which
// fails because Upstash uses `cache: "no-store"` — and a per-visit SSR
// is fine when individual fetches are cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [initialStatus, initialFeedResponse] = await Promise.all([
    loadInitialStatus(),
    loadInitialFeed(),
  ]);

  return (
    <Dashboard
      initialStatus={initialStatus}
      initialFeedResponse={initialFeedResponse}
    />
  );
}

async function loadInitialStatus(): Promise<StatusResult | undefined> {
  try {
    const wrapped = await withLastKnown<StatusResult>(
      "status",
      () => fetchAllStatus(),
      { data: {}, polledAt: new Date().toISOString(), failures: [] },
    );
    return wrapped.staleAsOf
      ? { ...wrapped.data, staleAsOf: wrapped.staleAsOf }
      : wrapped.data;
  } catch (err) {
    // Belt-and-braces: SSR must never throw. The client poll will
    // recover on first tick.
    console.error("[page] loadInitialStatus failed", err);
    return undefined;
  }
}

async function loadInitialFeed(): Promise<FeedResponse | undefined> {
  try {
    return await loadFeedResponse(Date.now());
  } catch (err) {
    console.error("[page] loadInitialFeed failed", err);
    return undefined;
  }
}
