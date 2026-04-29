import { describe, expect, it, vi } from "vitest";

import {
  parseExtensionQueryResponse,
  runVSCodeIngest,
  VSCODE_TRACKED_EXTENSIONS,
} from "@/lib/data/pkg-vscode";

const NOW = new Date("2026-04-29T12:00:00.000Z");

function fakeMarketplaceBody(rows: Array<{ publisher: string; extension: string; installs: number | null }>): unknown {
  return {
    results: [
      {
        extensions: rows.map((r) => ({
          publisher: { publisherName: r.publisher },
          extensionName: r.extension,
          statistics:
            r.installs === null
              ? []
              : [{ statisticName: "install", value: r.installs }],
        })),
      },
    ],
  };
}

function makeFetch(
  status: number,
  body: unknown,
): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("parseExtensionQueryResponse", () => {
  it("maps each row by lowercased {publisher}.{extension}", () => {
    const map = parseExtensionQueryResponse(
      fakeMarketplaceBody([
        { publisher: "GitHub", extension: "copilot", installs: 73_134_892 },
        { publisher: "Continue", extension: "continue", installs: 2_740_673 },
      ]),
    );
    expect(map.get("github.copilot")?.installs).toBe(73_134_892);
    expect(map.get("continue.continue")?.installs).toBe(2_740_673);
  });

  it("records installs:null when statistics array is missing the install entry", () => {
    const map = parseExtensionQueryResponse(
      fakeMarketplaceBody([
        { publisher: "GitHub", extension: "copilot", installs: null },
      ]),
    );
    expect(map.get("github.copilot")?.installs).toBeNull();
  });

  it("throws on non-object body", () => {
    expect(() => parseExtensionQueryResponse(null)).toThrow();
    expect(() => parseExtensionQueryResponse("nope")).toThrow();
  });

  it("throws when results is not an array", () => {
    expect(() => parseExtensionQueryResponse({ results: 42 })).toThrow();
  });
});

describe("runVSCodeIngest", () => {
  it("writes a counter with allTime=installs for every extension that returned a stat", async () => {
    const body = fakeMarketplaceBody([
      { publisher: "GitHub", extension: "copilot", installs: 73_000_000 },
      { publisher: "Continue", extension: "continue", installs: 2_700_000 },
    ]);
    const result = await runVSCodeIngest({
      fetchImpl: makeFetch(200, body),
      now: () => NOW,
      extensions: ["GitHub.copilot", "Continue.continue"],
    });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(2);
    expect(result.counters["GitHub.copilot"]?.allTime).toBe(73_000_000);
    expect(result.counters["Continue.continue"]?.allTime).toBe(2_700_000);
    expect(result.failures).toEqual([]);
    expect(result.fetchedAt).toBe(NOW.toISOString());
  });

  it("partial-fails per-extension rather than the whole batch when a row is missing", async () => {
    const body = fakeMarketplaceBody([
      { publisher: "GitHub", extension: "copilot", installs: 73_000_000 },
      // Continue.continue intentionally absent — marketplace pruned it
    ]);
    const result = await runVSCodeIngest({
      fetchImpl: makeFetch(200, body),
      now: () => NOW,
      extensions: ["GitHub.copilot", "Continue.continue"],
    });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(result.counters["GitHub.copilot"]?.allTime).toBe(73_000_000);
    expect(result.counters["Continue.continue"]).toBeUndefined();
    expect(result.failures).toEqual([
      {
        pkg: "Continue.continue",
        message: "marketplace returned no row for this extension",
      },
    ]);
  });

  it("returns ok:false on whole-batch HTTP failure (preserves previous blob)", async () => {
    const result = await runVSCodeIngest({
      fetchImpl: makeFetch(503, { error: "service unavailable" }),
      now: () => NOW,
      extensions: ["GitHub.copilot", "Continue.continue"],
    });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].message).toMatch(/HTTP 503/);
  });

  it("flags rows with a present-but-missing install statistic", async () => {
    const body = fakeMarketplaceBody([
      { publisher: "GitHub", extension: "copilot", installs: null },
    ]);
    const result = await runVSCodeIngest({
      fetchImpl: makeFetch(200, body),
      now: () => NOW,
      extensions: ["GitHub.copilot"],
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0].message).toMatch(/missing install statistic/);
  });

  it("tracks all six AI coding-assistant extensions by default", () => {
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("GitHub.copilot");
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("Continue.continue");
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("sourcegraph.cody-ai");
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("Codeium.codeium");
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("saoudrizwan.claude-dev");
    expect(VSCODE_TRACKED_EXTENSIONS).toContain("TabNine.tabnine-vscode");
    expect(VSCODE_TRACKED_EXTENSIONS).toHaveLength(6);
  });
});
