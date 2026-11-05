import { describe, expect, it, vi } from "vitest";
import type { HnWireItem } from "@/lib/data/wire-hn";
import { machineSummaryConfig, machineSummaryKey, runHnMachineSummaries } from "@/lib/summaries/run-hn";
import type { MachineSummary } from "@/lib/summaries/machine-summary";
import { MACHINE_SUMMARY_ATTEMPTS_PER_DAY, type MachineSummaryFailure, type MachineSummaryStore } from "@/lib/summaries/store";

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

function memoryStore(alreadySpent = 0, existing: Record<string, MachineSummary> = {}, priorFailures: Record<string, MachineSummaryFailure> = {}) {
  const saved = new Map<string, MachineSummary>(Object.entries(existing));
  const failures = new Map<string, MachineSummaryFailure>(Object.entries(priorFailures));
  let used = alreadySpent;
  let attempts = 0;
  const store: MachineSummaryStore = {
    available: () => true,
    read: async (keys) => new Map(keys.filter((k) => saved.has(k)).map((k) => [k, saved.get(k)!])),
    write: async (k, s) => { saved.set(k, s); },
    spent: async () => used,
    claim: async () => ++used <= 60,
    readFailures: async (keys) => new Map(keys.filter((k) => failures.has(k)).map((k) => [k, failures.get(k)!])),
    writeFailure: async (k, f) => { failures.set(k, f); },
    attempted: async () => attempts,
    countAttempt: async () => { attempts += 1; },
  };
  return { store, saved, failures, used: () => used, attempts: () => attempts, setAttempts: (n: number) => { attempts = n; } };
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
    const run = await runHnMachineSummaries({ items: ["a", "b", "c"].map((id) => item(id)), store: mem.store, env: ON, nowMs: NOW, fetchImpl: failing, clock: () => NOW, retryWaitMs: 0 });
    expect(run.written).toBe(0);
    expect(run.skipped.model).toBe(3);
    expect(mem.used()).toBe(0);
  });
});

describe("failures are remembered, not retried every 15 minutes", () => {
  const HOUR = 3600_000;
  const pageHits = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([u]) => !String(u).includes("nvidia")).length;
  const modelHits = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([u]) => String(u).includes("nvidia")).length;
  // The post stays an hour old at every run, so it stays a NEWS card while the clock moves.
  const runAt = (mem: ReturnType<typeof memoryStore>, f: typeof fetch, at: number) =>
    runHnMachineSummaries({
      items: [item("1", { createdAtI: at / 1000 - 3600 })],
      store: mem.store, env: ON, nowMs: at, fetchImpl: f, clock: () => at, retryWaitMs: 0,
    });

  it("a model failure backs off 15 min, then 1 h, then gives up after 3 attempts", async () => {
    const f = vi.fn(async (url: string) => url.includes("nvidia") ? new Response("busy", { status: 503 }) : new Response(PAGE));
    const mem = memoryStore();
    const r1 = await runAt(mem, f as unknown as typeof fetch, NOW);
    expect(r1.failures).toEqual([{ id: "1", reason: "model", attempts: 1 }]);
    // The why is kept for the operator in Redis, never in the run result (echoed to a public log).
    expect(mem.failures.get(machineSummaryKey("1"))?.detail).toBe("HTTP 503 busy");
    expect(modelHits(f)).toBe(2); // one immediate retry on a 503

    expect((await runAt(mem, f as unknown as typeof fetch, NOW + 10 * 60_000)).waiting).toBe(1);
    expect((await runAt(mem, f as unknown as typeof fetch, NOW + 15 * 60_000)).failures?.[0].attempts).toBe(2);
    expect((await runAt(mem, f as unknown as typeof fetch, NOW + 15 * 60_000 + 59 * 60_000)).waiting).toBe(1);
    expect((await runAt(mem, f as unknown as typeof fetch, NOW + 15 * 60_000 + HOUR)).failures?.[0].attempts).toBe(3);
    const calls = f.mock.calls.length;
    const gaveUp = await runAt(mem, f as unknown as typeof fetch, NOW + 48 * HOUR);
    expect(gaveUp.waiting).toBe(1);
    expect(f.mock.calls.length).toBe(calls);
  });

  it("a fetch failure keeps its reason in Redis, and a page that refuses us is given up after one attempt", async () => {
    const down = vi.fn(async (url: string) => url.includes("nvidia") ? new Response("") : new Response("", { status: 502 }));
    const memDown = memoryStore();
    await runAt(memDown, down as unknown as typeof fetch, NOW);
    expect(memDown.failures.get(machineSummaryKey("1"))).toMatchObject({ reason: "fetch", attempts: 1, detail: "HTTP 502" });
    expect((await runAt(memDown, down as unknown as typeof fetch, NOW + 15 * 60_000)).failures?.[0].attempts).toBe(2);

    const refused = vi.fn(async (url: string) => url.includes("nvidia") ? new Response("") : new Response("", { status: 403 }));
    const mem = memoryStore();
    const r1 = await runAt(mem, refused as unknown as typeof fetch, NOW);
    expect(r1.failures).toEqual([{ id: "1", reason: "blocked", attempts: 1 }]);
    expect(mem.failures.get(machineSummaryKey("1"))?.detail).toBe("HTTP 403");
    const later = await runAt(mem, refused as unknown as typeof fetch, NOW + 6 * HOUR);
    expect(later.waiting).toBe(1);
    expect(pageHits(refused)).toBe(1);
    expect(modelHits(refused)).toBe(0);
  });

  it("a 4xx from the model is not retried immediately", async () => {
    const f = vi.fn(async (url: string) => url.includes("nvidia") ? new Response("no", { status: 404 }) : new Response(PAGE));
    await runAt(memoryStore(), f as unknown as typeof fetch, NOW);
    expect(modelHits(f)).toBe(1);
  });

  it("an ungrounded answer is final for that text: re-read after 6 h, model asked again only if the page changed", async () => {
    let page = PAGE;
    const f = vi.fn(async (url: string) => url.includes("nvidia")
      ? new Response(JSON.stringify({ choices: [{ message: { content: "Mistral released Devstral 3 with 99 percent accuracy." } }] }))
      : new Response(page));
    const mem = memoryStore();
    expect((await runAt(mem, f as unknown as typeof fetch, NOW)).skipped.ungrounded).toBe(1);
    expect(mem.failures.get(machineSummaryKey("1"))?.detail).toMatch(/99 percent/);

    // Every 15-min run for the next 6 h: nothing fetched, nothing asked.
    for (let t = NOW + 15 * 60_000; t < NOW + 6 * HOUR; t += 15 * 60_000) await runAt(mem, f as unknown as typeof fetch, t);
    expect(pageHits(f)).toBe(1);
    expect(modelHits(f)).toBe(1);

    // After 6 h, same page: read, but the model is not asked.
    const same = await runAt(mem, f as unknown as typeof fetch, NOW + 6 * HOUR);
    expect(same.skipped.unchanged).toBe(1);
    expect(modelHits(f)).toBe(1);
    expect(mem.failures.get(machineSummaryKey("1"))?.reason).toBe("ungrounded");

    // The page changed: the model is asked again.
    page = PAGE + "<p>An update was added to this article later in the day by its editors.</p>";
    await runAt(mem, f as unknown as typeof fetch, NOW + 12 * HOUR);
    expect(modelHits(f)).toBe(2);
  });

  it("a too-short page is not fetched again for 6 h", async () => {
    const f = vi.fn(async () => new Response("<p>Subscribe to read this article in full today.</p>"));
    const mem = memoryStore();
    for (let t = NOW; t < NOW + 6 * HOUR; t += 15 * 60_000) await runAt(mem, f as unknown as typeof fetch, t);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("stops at the day's attempt ceiling, separate from the success cap", async () => {
    const mem = memoryStore();
    mem.setAttempts(MACHINE_SUMMARY_ATTEMPTS_PER_DAY);
    const f = vi.fn(async () => new Response(PAGE));
    const run = await runAt(mem, f as unknown as typeof fetch, NOW);
    expect(run.attemptsCapped).toBe(true);
    expect(run.written).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it("the run result never carries the rejected answer or the error body", async () => {
    const f = vi.fn(async (url: string) => url.includes("nvidia")
      ? new Response(JSON.stringify({ choices: [{ message: { content: "Mistral released Devstral 3 with 99 percent accuracy." } }] }))
      : new Response(PAGE));
    const run = await runAt(memoryStore(), f as unknown as typeof fetch, NOW);
    expect(JSON.stringify(run)).not.toMatch(/99 percent/);
  });

  it("a page whose text changes on every read is given up after 3 attempts", async () => {
    let n = 0;
    const f = vi.fn(async (url: string) => url.includes("nvidia")
      ? new Response(JSON.stringify({ choices: [{ message: { content: "Mistral released Devstral 3 with 99 percent accuracy." } }] }))
      : new Response(PAGE + `<p>Related reading, rotated on every page load, number ${++n} of many.</p>`));
    const mem = memoryStore();
    for (let t = NOW; t < NOW + 48 * HOUR; t += 15 * 60_000) await runAt(mem, f as unknown as typeof fetch, t);
    expect(modelHits(f)).toBe(3);
  });

  it("no second model call once the run's time budget is spent", async () => {
    let t = NOW;
    const f = vi.fn(async (url: string) => {
      if (url.includes("nvidia")) { t += 41_000; return new Response("busy", { status: 503 }); }
      return new Response(PAGE);
    });
    await runHnMachineSummaries({
      items: [item("1")], store: memoryStore().store, env: ON, nowMs: NOW,
      fetchImpl: f as unknown as typeof fetch, clock: () => t, retryWaitMs: 0,
    });
    expect(modelHits(f)).toBe(1);
  });

  it("an unreadable failure record stops the run rather than retrying everything", async () => {
    const mem = memoryStore();
    mem.store.readFailures = async () => { throw new Error("redis down"); };
    const f = vi.fn() as unknown as typeof fetch;
    const run = await runAt(mem, f, NOW);
    expect(run.skipped.store).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });
});
