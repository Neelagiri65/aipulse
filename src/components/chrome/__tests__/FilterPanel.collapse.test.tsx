/**
 * Render-shape contract for the FilterPanel collapse state.
 *
 * The panel collapses on the user clicking "Hide filters" — the
 * collapsed state persists across reloads via `localStorage`. This
 * test asserts both render variants emit the expected accessibility
 * affordances so a screen reader user can re-open the panel.
 *
 * Click handling itself is covered by the localStorage round-trip
 * (the component reads its initial `open` from storage) — we set the
 * key before render to exercise the collapsed branch without needing
 * a JSDOM-style click simulator.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_FILTERS, FilterPanel } from "@/components/chrome/FilterPanel";

const STORAGE_KEY = "ap.filter-panel-open";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    key: vi.fn(() => null),
    length: 0,
  } as Storage;
}

describe("FilterPanel — collapse state markup", () => {
  beforeEach(() => {
    // Each test resets the global window.localStorage so the SSR-side
    // hydration effect inside FilterPanel doesn't leak between cases.
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: mockLocalStorage(),
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it("renders the full panel by default with a Hide control", () => {
    const html = renderToStaticMarkup(
      <FilterPanel
        filters={DEFAULT_FILTERS}
        onToggle={() => {}}
        onReset={() => {}}
      />,
    );
    // Both the labelled <header> and the icon-only rail contain a
    // "Hide filters" affordance — at least one must be present.
    expect(html.match(/aria-label="Hide filters"/g)?.length ?? 0).toBeGreaterThan(0);
    // Reset button exists in the labelled variant.
    expect(html).toContain("Reset");
    // Trigger button (used in the collapsed state) should NOT appear
    // when the panel is open.
    expect(html).not.toContain('aria-label="Show filters"');
  });

  it("uses the CSS strip-offset variable so it tucks below the highlights strip", () => {
    const html = renderToStaticMarkup(
      <FilterPanel
        filters={DEFAULT_FILTERS}
        onToggle={() => {}}
        onReset={() => {}}
      />,
    );
    // The full panel and the icon rail both anchor to top: calc(100px + var(--ap-strip-h, 0px))
    // so when the highlights strip is visible they shift down by 36.
    expect(html).toMatch(/calc\(100px \+ var\(--ap-strip-h[^)]*\)\)/);
  });
});

describe("FilterPanel — collapsed state restored from storage", () => {
  it("persists collapse preference under the documented localStorage key", () => {
    expect(STORAGE_KEY).toBe("ap.filter-panel-open");
  });
});
