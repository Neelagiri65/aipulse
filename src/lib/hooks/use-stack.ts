"use client";

import { useCallback, useSyncExternalStore } from "react";
import { parseStack, serializeStack, STACK_CHANGE_EVENT, STACK_STORAGE_KEY, type Stack, type ToolId } from "@/lib/stack";

/**
 * The visitor's stack as an external store over localStorage.
 *
 * Same shape as use-now.ts / use-is-mobile.ts: the server snapshot is null,
 * so server HTML and the first client render never carry a stack (no
 * hydration mismatch — see the #418 fix on this very page), and the stored
 * value applies on the first post-hydration render. Same-tab writes
 * dispatch STACK_CHANGE_EVENT; other tabs arrive via the storage event.
 */
let cachedRaw: string | null | undefined;
let cachedStack: ToolId[] | null = null;

function read(): ToolId[] | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STACK_STORAGE_KEY);
  } catch {
    raw = null; // private mode / blocked storage → no stack
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedStack = parseStack(raw);
  }
  return cachedStack;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener(STACK_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STACK_CHANGE_EVENT, cb);
  };
}

function getSnapshot(): ToolId[] | null {
  if (typeof window === "undefined") return null;
  return read();
}

const getServerSnapshot = (): ToolId[] | null => null;

export function writeStack(stack: Stack | null): void {
  const raw = serializeStack(stack);
  try {
    if (raw === null) window.localStorage.removeItem(STACK_STORAGE_KEY);
    else window.localStorage.setItem(STACK_STORAGE_KEY, raw);
  } catch {
    // storage unavailable: the choice lasts for this render only
  }
  window.dispatchEvent(new Event(STACK_CHANGE_EVENT));
}

export function useStack(): { stack: ToolId[] | null; setStack: (next: Stack | null) => void } {
  const stack = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setStack = useCallback((next: Stack | null) => writeStack(next), []);
  return { stack, setStack };
}
