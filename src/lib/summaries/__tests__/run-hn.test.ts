import { describe, expect, it, vi } from "vitest";
import type { HnWireItem } from "@/lib/data/wire-hn";
import { machineSummaryConfig, machineSummaryKey, runHnMachineSummaries } from "@/lib/summaries/run-hn";
import type { MachineSummary } from "@/lib/summaries/machine-summary";
import type { MachineSummaryStore } from "@/lib/summaries/store";

const NOW = Date.parse("2026-09-26T10:00:00Z");
const ON = { MACHINE_SUMMARIES: "on", NVIDIA_NIM_KEY: "k" };
const PAGE = "<p>" + "Mistral released Devstral 3, a 24B coding model, under the Apache 2.0 licence. ".repeat(8) + "</p>";

function item(id: string, over: Partial<HnWireItem> = {}): HnWireItem {
  return {
    id, title: "Mistral releases Devstral 3", url: `https://example.com/${id}`, author: "u", points: 150, numComments: 10,
    createdAtI: NOW / 1000 - 3600, createdAt: new Date(NOW - 3600_000).toISOString(),
    firstSeenTs: "", lastRefreshTs: "", kind: "hn", lat: null, lng: null, locationLabel: null, ...over,
  };
}

function memoryStore(alreadySpent = 0, existing: Record<string, MachineSummary> = {}) {
  const saved = new Map<string, MachineSummary>(Object.entries(existing));
  let used = alreadySpent;
  const store: MachineSummaryStore = {
    available: () => true,
    read: async (keys) => new Map(keys.filter((k) => saved.has(k)).map((k) => [k, saved.get(k)!])),
    write: async (k, s) => { saved.set(k, s); },
    spent: async () => used,
    claim: async () => ++used <= 60,
  };
  return { store, saved, used: () => used };
}

const fetchOk = vi.fn(async (url: string) =>
  url.includes("nvidia")
    ? new Response(JSON.stringify({ choices: [{ message: { content: "Mistral released Devstral 3, a 24B coding model." } }] }))
    : new Response(PAGE),
) as unknown as typeof fetch;

describe("machineSummaryConfig — off unless the flag is on AND a key is set", () => {
  it("reads the key only when both are present", () => {
    expect(machineSummaryConfig({})).toBeNull();
    expect(machineSummaryConfig({ NVIDIA_NIM_KEY: "k" })).toBeNull();
    expect(machineSummaryConfig({ MACHINE_SUMMARIES: "on" })).toBeNull();
    expect(machineSummaryConfig({ MACHINE_SUMMARIES: "on", NVIDIA_NIM_KEY: "  " })).toBeNull();
    expect(machineSummaryConfig(ON)).toEqual({ apiKey: "k" });
  });
});

describe("runHnMachineSummaries", () => {
  it("does nothing, and calls nothing, when off", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const { store } = memoryStore();
    const run = await runHnMachineSummaries({ items: [item("1")], store, env: {}, nowMs: NOW, fetchImpl: f });
    expect(run.enabled).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("summarises only NEWS link posts without text of their own, and not twice", async () => {
    const done: MachineSummary = { text: "old", model: "m", promptVersion: "ms-1", inputUrl: "u", inputHash: "h", generatedAt: "t" };
    const { store, saved } = memoryStore(0, { [machineSummaryKey("4")]: done });
    const run = await runHnMachineSummaries({
      items: [item("1"), item("2", { storyText: "Ask HN: …" }), item("3", { url: null }), item("4"), item("5", { points: 50 })],
      store, env: ON, nowMs: NOW, fetchImpl: fetchOk, clock: () => NOW,
    });
    expect(run.written).toBe(1);
    expect([...saved.keys()].sort()).toEqual([machineSummaryKey("1"), machineSummaryKey("4")]);
    expect(saved.get(machineSummaryKey("4"))).toBe(done);
  });

  it("stops at the day's cap, at the per-run cap, and at the time budget", async () => {
    const items = ["a", "b", "c", "d", "e", "f"].map((id) => item(id));
    const capped = memoryStore(58);
    const r1 = await runHnMachineSummaries({ items, store: capped.store, env: ON, nowMs: NOW, fetchImpl: fetchOk, clock: () => NOW });
    expect(r1.written).toBe(2);
    expect(r1.capped).toBe(true);

    const perRun = memoryStore();
    const r2 = await runHnMachineSummaries({ items, store: perRun.store, env: ON, nowMs: NOW, fetchImpl: fetchOk, perRun: 3, clock: () => NOW });
    expect(r2.written).toBe(3);

    let t = NOW;
    const slow = memoryStore();
    const r3 = await runHnMachineSummaries({ items, store: slow.store, env: ON, nowMs: NOW, fetchImpl: fetchOk, clock: () => (t += 40_000) });
    expect(r3.written).toBe(1);
    expect(r3.skipped.time).toBe(1);
  });

  it("the day's cap counts written summaries, not failed attempts", async () => {
    const failing = vi.fn(async (url: string) =>
      url.includes("nvidia") ? new Response("busy", { status: 503 }) : new Response(PAGE),
    ) as unknown as typeof fetch;
    const mem = memoryStore(0);
    const run = await runHnMachineSummaries({ items: ["a", "b", "c"].map((id) => item(id)), store: mem.store, env: ON, nowMs: NOW, fetchImpl: failing, clock: () => NOW });
    expect(run.written).toBe(0);
    expect(run.skipped.model).toBe(3);
    expect(mem.used()).toBe(0);
  });
});
