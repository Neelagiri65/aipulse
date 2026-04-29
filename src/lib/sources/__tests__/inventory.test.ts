import { describe, expect, it } from "vitest";

import { ALL_SOURCES } from "@/lib/data-sources";
import {
  CATEGORIES,
  buildInventory,
  formatFrequency,
  groupByCategory,
} from "@/lib/sources/inventory";

describe("sources inventory", () => {
  it("covers every typed-registry source plus the OpenRouter virtual entry", () => {
    const inventory = buildInventory();
    const inventoryIds = new Set(inventory.map((e) => e.id));
    for (const src of ALL_SOURCES) {
      expect(inventoryIds.has(src.id)).toBe(true);
    }
    expect(inventoryIds.has("openrouter-rankings")).toBe(true);
  });

  it("flags OpenRouter as auditor-pending until promoted to the typed registry", () => {
    const inventory = buildInventory();
    const openrouter = inventory.find((e) => e.id === "openrouter-rankings");
    expect(openrouter?.auditorPending).toBe(true);
    const typed = inventory.filter((e) => e.id !== "openrouter-rankings");
    for (const e of typed) {
      // Typed-registry sources should never be auditor-pending — that
      // flag is reserved for entries living outside ALL_SOURCES.
      expect(e.auditorPending ?? false).toBe(false);
    }
  });

  it("assigns every entry to one of the 8 user-facing categories", () => {
    const inventory = buildInventory();
    const ids = new Set(CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(8);
    for (const e of inventory) {
      expect(ids.has(e.category)).toBe(true);
    }
  });

  it("groups entries deterministically with every category present", () => {
    const grouped = groupByCategory(buildInventory());
    for (const cat of CATEGORIES) {
      expect(grouped.has(cat.id)).toBe(true);
    }
    // Per spec brief: 5 tool-status, 6 sdk-adoption (PyPI + npm + crates +
    // Docker + Homebrew + VS Code Marketplace), 5 regional-news,
    // 1 discussion, 1 research. Models is 3 (HF + Arena + OpenRouter).
    expect(grouped.get("sdk-adoption")?.length).toBe(6);
    expect(grouped.get("regional-news")?.length).toBe(5);
    expect(grouped.get("discussion")?.length).toBe(1);
    expect(grouped.get("research")?.length).toBe(1);
    expect(grouped.get("models")?.length).toBe(3);
  });

  it("formats every UpdateFrequency variant", () => {
    expect(formatFrequency("realtime")).toMatch(/Real-time/);
    expect(formatFrequency("minutely")).toMatch(/1–5 minutes/);
    expect(formatFrequency("hourly")).toBe("Hourly");
    expect(formatFrequency("six-hourly")).toBe("Every 6 hours");
    expect(formatFrequency("daily")).toBe("Daily");
    expect(formatFrequency("weekly")).toBe("Weekly");
    expect(formatFrequency("event-driven")).toBe("Event-driven");
  });
});
