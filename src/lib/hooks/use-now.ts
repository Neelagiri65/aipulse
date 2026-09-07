"use client";

import { useSyncExternalStore } from "react";

/**
 * A ticking clock for relative times ("12m", "3h") without calling Date.now() during render.
 * The store advances every 30 s while at least one component subscribes; the server snapshot is 0
 * so SSR output never carries a client-only time (callers fall back to a real reference such as
 * the poll time).
 */
const INTERVAL_MS = 30_000;
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, INTERVAL_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (now === 0) now = Date.now();
  return now;
}

const getServerSnapshot = (): number => 0;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
