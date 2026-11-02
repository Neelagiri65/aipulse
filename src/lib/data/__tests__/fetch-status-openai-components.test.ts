/**
 * OpenAI's statuspage summary.json stopped listing every component (2026-11-02: 25 of the 37
 * that components.json carries; `Codex Web` and `Codex API` among the missing). The codex card
 * then fell into failures[] on every poll, and the iOS app — which could not decode that entry —
 * showed no tool health at all. The full list comes from components.json; summary.json's own list
 * is the fallback when that request fails.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/status-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/status-history")>();
  return {
    ...actual,
    fetchHistoricalIncidents: vi.fn(async () => []),
    readSamples: vi.fn(async () => []),
    readProbeSignals: vi.fn(async () => ({})),
    recordSample: vi.fn(async () => undefined),
    hasRedisConfigured: () => false,
    bucketToDays: () => [],
  };
});

import { fetchAllStatus } from "@/lib/data/fetch-status";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const summary = (components: { name: string; status: string }[]) => ({
  page: { name: "OpenAI" },
  status: { indicator: "none", description: "All Systems Operational" },
  components,
  incidents: [],
});
const truncated = summary([{ name: "Chat Completions", status: "operational" }, { name: "Codex in ChatGPT Desktop", status: "operational" }]);
const full = {
  components: [
    { name: "Chat Completions", status: "operational" },
    { name: "Codex Web", status: "degraded_performance" },
    { name: "Codex API", status: "operational" },
  ],
};
const other = summary([{ name: "Copilot", status: "operational" }]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI components come from components.json", () => {
  it("reads Codex from components.json when summary.json leaves it out", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("status.openai.com/api/v2/components.json")) return ok(full);
      if (u.includes("status.openai.com/api/v2/summary.json")) return ok(truncated);
      return ok(other);
    }));
    const r = await fetchAllStatus({ skipHistory: true });
    expect(r.failures.find((f) => f.toolId === "codex")).toBeUndefined();
    expect(r.data["codex"]?.status).toBe("degraded");
  });

  it("falls back to summary.json's list when components.json fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("components.json")) return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      if (u.includes("status.openai.com/api/v2/summary.json"))
        return ok(summary([{ name: "Codex Web", status: "operational" }, { name: "Codex API", status: "operational" }]));
      return ok(other);
    }));
    const r = await fetchAllStatus({ skipHistory: true });
    expect(r.data["codex"]?.status).toBe("operational");
    expect(r.data["openai-api"]).toBeDefined();
  });
});
