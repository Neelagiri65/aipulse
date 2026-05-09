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

  it("renders collapsed by default with a Show filters trigger", () => {
    const html = renderToStaticMarkup(
      <FilterPanel
        filters={DEFAULT_FILTERS}
        onToggle={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Show filters"');
  });

  it("uses the CSS strip-offset variable so it tucks below the highlights strip", () => {
    const html = renderToStaticMarkup(
      <FilterPanel
        filters={DEFAULT_FILTERS}
        onToggle={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toMatch(/calc\(156px \+ var\(--ap-strip-h[^)]*\)\)/);
  });
});

describe("FilterPanel — collapsed state restored from storage", () => {
  it("persists collapse preference under the documented localStorage key", () => {
    expect(STORAGE_KEY).toBe("ap.filter-panel-open");
  });
});
