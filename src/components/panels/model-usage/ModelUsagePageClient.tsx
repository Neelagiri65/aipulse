"use client";

/**
 * Standalone-page client wrapper. Polls /api/panels/model-usage every
 * 60s and feeds the panel. Server page renders the page chrome; the
 * client subtree handles drawer state, polling, and `?focus=` seeding.
 */

import { usePolledEndpoint } from "@/lib/hooks/use-polled-endpoint";
import { ModelUsagePanel } from "@/components/panels/model-usage/ModelUsagePanel";
import type { ModelUsageDto } from "@/lib/data/openrouter-types";

const POLL_MS = 60_000;

export function ModelUsagePageClient({
  initialFocusedSlug,
}: {
  initialFocusedSlug: string | null;
}) {
  const { data, error, isInitialLoading } = usePolledEndpoint<ModelUsageDto>(
    "/api/panels/model-usage",
    POLL_MS,
  );
  const originUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  return (
    <ModelUsagePanel
      data={data ?? null}
      error={error ?? null}
      isInitialLoading={isInitialLoading}
      originUrl={originUrl}
      initialFocusedSlug={initialFocusedSlug}
    />
  );
}
