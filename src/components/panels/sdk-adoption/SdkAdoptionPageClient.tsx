"use client";

/**
 * Standalone-page client wrapper. Polls the read endpoint every 60s
 * and feeds the panel. Keeps the page-shell server-rendered while
 * letting the panel itself stay interactive (drawer state, resize
 * listening, ?focus= seed).
 */

import { usePolledEndpoint } from "@/lib/hooks/use-polled-endpoint";
import type { SdkAdoptionDto } from "@/lib/data/sdk-adoption";
import { SdkAdoptionPanel } from "@/components/panels/sdk-adoption/SdkAdoptionPanel";

const POLL_MS = 60_000;

export function SdkAdoptionPageClient({
  initialFocusedRowId,
}: {
  initialFocusedRowId: string | null;
}) {
  const { data, error, isInitialLoading } = usePolledEndpoint<SdkAdoptionDto>(
    "/api/panels/sdk-adoption",
    POLL_MS,
  );
  const originUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  return (
    <SdkAdoptionPanel
      data={data ?? null}
      error={error ?? null}
      isInitialLoading={isInitialLoading}
      originUrl={originUrl}
      initialFocusedRowId={initialFocusedRowId}
    />
  );
}
