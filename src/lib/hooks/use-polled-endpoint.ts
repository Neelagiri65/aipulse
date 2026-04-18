"use client";

import { useEffect, useRef, useState } from "react";

export type PolledState<T> = {
  data: T | undefined;
  error: string | undefined;
  /** Last time a successful response was received (client-local ms epoch). */
  lastSuccessAt: number | undefined;
  /** True while the first request is in flight. */
  isInitialLoading: boolean;
};

/**
 * Polls a JSON endpoint on a fixed interval.
 *
 * Design choices:
 *  - Holds the last successful data when a poll fails (graceful degradation).
 *  - Aborts in-flight requests on unmount so tab close ≠ phantom state.
 *  - Pauses polling when the tab is hidden (Page Visibility API) to avoid
 *    burning rate limit on background tabs. Resumes + fires immediately on
 *    return.
 *
 * Not using SWR / React Query intentionally: the polling surface is two
 * endpoints with fixed cadences. A 40-line hook is cheaper than a dependency.
 */
export function usePolledEndpoint<T>(
  url: string,
  intervalMs: number,
): PolledState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | undefined>(
    undefined,
  );
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function run() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`${url} returned ${res.status}`);
        const json = (await res.json()) as T;
        if (cancelled) return;
        setData(json);
        setError(undefined);
        setLastSuccessAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await run();
        schedule();
      }, intervalMs);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        run();
        schedule();
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    run();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, intervalMs]);

  return { data, error, lastSuccessAt, isInitialLoading };
}
