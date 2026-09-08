import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTheme, subscribeTheme } from "@/lib/hooks/use-theme";

// The suite runs in the node environment (vitest.config.ts) — no jsdom in this repo — so the two
// globals these functions touch are stubbed. What is under test is the resolution rule, not the DOM.

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDocument(attr: string | null) {
  vi.stubGlobal("document", {
    documentElement: { getAttribute: (name: string) => (name === "data-theme" ? attr : null) },
  });
}

/** matchMedia says "the OS is dark". The page does not care, so neither may the map. */
function stubOsDark() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener, removeEventListener })),
  );
  vi.stubGlobal("window", { matchMedia: globalThis.matchMedia });
  return { addEventListener, removeEventListener };
}

describe("resolveTheme", () => {
  it("is light with no attribute, even when the OS prefers dark", () => {
    // globals.css defines the dark set on [data-theme="dark"] only — there is no
    // prefers-color-scheme block. A resolver that read the OS made the basemap dark under light
    // chrome for every OS-dark visitor with no stored choice (seen on prod after #111).
    stubOsDark();
    stubDocument(null);
    expect(resolveTheme()).toBe("light");
  });

  it("follows the explicit attribute in both directions", () => {
    stubOsDark();
    stubDocument("light");
    expect(resolveTheme()).toBe("light");
    stubDocument("dark");
    expect(resolveTheme()).toBe("dark");
  });

  it("treats an unknown attribute value as light", () => {
    stubDocument("sepia");
    expect(resolveTheme()).toBe("light");
  });

  it("is light on the server, where there is no document", () => {
    expect(resolveTheme()).toBe("light");
  });
});

describe("subscribeTheme", () => {
  it("watches the attribute and disconnects on unsubscribe, without touching the OS preference", () => {
    const os = stubOsDark();
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(readonly cb: () => void) {}
        observe = observe;
        disconnect = disconnect;
      },
    );
    stubDocument(null);

    const unsubscribe = subscribeTheme(vi.fn());
    expect(observe).toHaveBeenCalledWith(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    expect(os.addEventListener).not.toHaveBeenCalled();

    unsubscribe();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(os.removeEventListener).not.toHaveBeenCalled();
  });
});
