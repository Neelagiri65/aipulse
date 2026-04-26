"use client";

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the viewport is ≤767px wide. SSR-safe via useSyncExternalStore;
 * returns false on the server (so SSR renders the desktop tree), then
 * resolves to the real value on the client immediately after hydration.
 *
 * On mobile devices this means a one-frame flicker as the desktop tree
 * unmounts and the mobile tree mounts. Acceptable trade-off — the
 * alternative (mounting both trees and swapping via CSS) doubles the
 * polled-endpoint work and the FlatMap canvas instances.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
