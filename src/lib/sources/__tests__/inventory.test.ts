import { describe, expect, it } from "vitest";

import { ALL_SOURCES } from "@/lib/data-sources";
import {
  CATEGORIES,
  buildInventory,
  formatFrequency,
  groupByCategory,
} from "@/lib/sources/inventory";

describe("sources inventory", () => {
  it("covers every typed-registry source plus the virtual entries (OpenRouter + Stanford AI Index)", () => {
    const inventory = buildInventory();
    const inventoryIds = new Set(inventory.map((e) => e.id));
    for (const src of ALL_SOURCES) {
      expect(inventoryIds.has(src.id)).toBe(true);
    }
    expect(inventoryIds.has("openrouter-rankings")).toBe(true);
    expect(inventoryIds.has("stanford-ai-index")).toBe(true);
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

  it("Stanford AI Index is a static reference — not polled, not auditor-pending", () => {
    const inventory = buildInventory();
    const aiIndex = inventory.find((e) => e.id === "stanford-ai-index");
    expect(aiIndex).toBeDefined();
    expect(aiIndex?.auditorPending ?? false).toBe(false);
    expect(aiIndex?.freshness.kind).toBe("static");
    expect(aiIndex?.category).toBe("research");
  });

  it("assigns every entry to one of the 10 user-facing categories", () => {
    const inventory = buildInventory();
    const ids = new Set(CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(10);
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
    // Docker + Homebrew + VS Code Marketplace), 7 ai-publishers (5 regional
    // press + Analytics Vidhya + latent.space, S59 expansion),
    // 1 discussion, 1 research. Models is 3 (HF + Arena + OpenRouter).
    // Agents is 1 (github-repo-meta — PyPI + npm appear under
    // SDK Adoption since they primarily power that panel).
    expect(grouped.get("sdk-adoption")?.length).toBe(6);
    expect(grouped.get("agents")?.length).toBe(1);
    expect(grouped.get("ai-publishers")?.length).toBe(7);
    expect(grouped.get("discussion")?.length).toBe(3);
    expect(grouped.get("research")?.length).toBe(2);
    expect(grouped.get("models")?.length).toBe(3);
    expect(grouped.get("platform-infrastructure")?.length).toBe(4);
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
