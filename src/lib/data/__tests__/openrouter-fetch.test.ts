import { describe, expect, it, vi } from "vitest";
import {
  fetchOpenRouterRankings,
  OPENROUTER_FRONTEND_URL,
  OPENROUTER_V1_URL,
} from "@/lib/data/openrouter-fetch";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function nominalFrontendBody(slugs: string[] = ["anthropic/a", "openai/b"]) {
  return {
    data: { models: slugs.map((slug) => ({ slug, name: slug })) },
  };
}

function nominalCatalogueBody(slugs: string[] = ["anthropic/a"]) {
  return {
    data: slugs.map((slug) => ({ slug, name: slug })),
  };
}

describe("fetchOpenRouterRankings", () => {
  it("happy path: primary OK, no secondary requested, no catalogue fetch", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        return jsonResponse(nominalFrontendBody());
      }
      throw new Error(`unexpected url ${url}`);
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.primary?.data?.models?.length).toBe(2);
    expect(out.secondary).toBeNull();
    expect(out.catalogue).toBeNull();
    expect(out.frontendErrored).toBe(false);
    expect(out.secondaryErrored).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetches both primary and secondary when secondary requested", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      jsonResponse(nominalFrontendBody()),
    );
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      secondaryOrdering: "trending",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.primary).not.toBeNull();
    expect(out.secondary).not.toBeNull();
    expect(out.frontendErrored).toBe(false);
    expect(out.secondaryErrored).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = fetcher.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("order=top-weekly"))).toBe(true);
    expect(calls.some((u) => u.includes("order=trending"))).toBe(true);
  });

  it("falls back to catalogue when primary returns 404", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        return new Response("not found", { status: 404 });
      }
      if (url.startsWith(OPENROUTER_V1_URL)) {
        return jsonResponse(nominalCatalogueBody());
      }
      throw new Error(`unexpected url ${url}`);
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.primary).toBeNull();
    expect(out.catalogue).not.toBeNull();
    expect(out.catalogue?.data?.length).toBe(1);
    expect(out.frontendErrored).toBe(true);
  });

  it("falls back to catalogue when primary returns 500", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        return new Response("err", { status: 500 });
      }
      return jsonResponse(nominalCatalogueBody());
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.frontendErrored).toBe(true);
    expect(out.catalogue).not.toBeNull();
  });

  it("falls back to catalogue when primary throws (network error)", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        throw new TypeError("network failure");
      }
      return jsonResponse(nominalCatalogueBody());
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.frontendErrored).toBe(true);
    expect(out.catalogue).not.toBeNull();
  });

  it("falls back to catalogue when primary returns empty models[]", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        return jsonResponse({ data: { models: [] } });
      }
      return jsonResponse(nominalCatalogueBody());
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.frontendErrored).toBe(true);
    expect(out.catalogue).not.toBeNull();
  });

  it("falls back to catalogue when primary returns wrong shape", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(OPENROUTER_FRONTEND_URL)) {
        // Missing top-level `data` wrapper.
        return jsonResponse({ models: [{ slug: "a/b" }] });
      }
      return jsonResponse(nominalCatalogueBody());
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.frontendErrored).toBe(true);
    expect(out.catalogue).not.toBeNull();
  });

  it("primary OK + secondary failed → secondaryErrored true, no catalogue fetch", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("order=top-weekly")) {
        return jsonResponse(nominalFrontendBody());
      }
      if (url.includes("order=trending")) {
        return new Response("err", { status: 500 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      secondaryOrdering: "trending",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.primary).not.toBeNull();
    expect(out.secondary).toBeNull();
    expect(out.frontendErrored).toBe(false);
    expect(out.secondaryErrored).toBe(true);
    expect(out.catalogue).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates AbortSignal to every underlying fetch", async () => {
    const ctrl = new AbortController();
    const seenSignals: (AbortSignal | undefined)[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      seenSignals.push(init?.signal ?? undefined);
      return jsonResponse(nominalFrontendBody());
    });
    await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      secondaryOrdering: "trending",
      fetcher: fetcher as unknown as typeof fetch,
      signal: ctrl.signal,
    });
    expect(seenSignals.length).toBe(2);
    for (const s of seenSignals) {
      expect(s).toBe(ctrl.signal);
    }
  });

  it("includes ISO fetchedAt on the result", async () => {
    const fetcher = vi.fn(async () => jsonResponse(nominalFrontendBody()));
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("uses the injected fetcher (network not hit by tests)", async () => {
    const sentinel = { data: { models: [{ slug: "sentinel/m" }] } };
    const fetcher = vi.fn(async () => jsonResponse(sentinel));
    const out = await fetchOpenRouterRankings({
      primaryOrdering: "top-weekly",
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(out.primary?.data?.models?.[0]?.slug).toBe("sentinel/m");
  });
});
