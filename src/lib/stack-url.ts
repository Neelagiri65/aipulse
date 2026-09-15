/**
 * "Your stack" in a URL: `/?stack=cursor,copilot`. Pure helpers plus the
 * one window-touching store the Health panel reads the param through.
 *
 * A URL never writes storage on its own (stack.ts constraint 1: explicit
 * choice only). It proposes; the visitor clicks "Use it" or "Keep mine".
 * The param is read the way `?tab=` is (useSyncExternalStore with a null
 * server snapshot), so server HTML is unchanged, and the page's canonical
 * is already `/`.
 */
import { parseStack, type Stack, type ToolId } from "./stack";

export const STACK_PARAM = "stack";
export const STACK_PARAM_EVENT = "gawk-stack-param-change";

/** `cursor,copilot,foo` → ["cursor","copilot"]; nothing usable → null. */
export function stackFromParam(raw: string | null | undefined): ToolId[] | null {
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parseStack(JSON.stringify(ids));
}

/** Same tools regardless of order. Two nulls are the same; null vs a stack is not. */
export function sameStack(a: Stack | null, b: Stack | null): boolean {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  const set = new Set<ToolId>(a);
  return b.every((id) => set.has(id));
}

/** The shareable URL: origin + `/?stack=…`, nothing else (Health is the default tab). */
export function shareUrlFor(stack: Stack, origin: string): string {
  return `${origin.replace(/\/$/, "")}/?${STACK_PARAM}=${stack.join(",")}`;
}

/* ---- The window side ------------------------------------------------------------------- */

/** The raw param value (a primitive, so useSyncExternalStore can compare it). */
export function readStackParam(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(STACK_PARAM) ?? "";
}

/** Remove the param without a navigation, and tell subscribers. */
export function clearStackParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(STACK_PARAM)) return;
  url.searchParams.delete(STACK_PARAM);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(STACK_PARAM_EVENT));
}

export function subscribeStackParam(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(STACK_PARAM_EVENT, cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener(STACK_PARAM_EVENT, cb);
    window.removeEventListener("popstate", cb);
  };
}

export const getStackParamServerSnapshot = (): string => "";
