/**
 * Layer A trust test — the digest body (composeDigest), the last all-✗
 * row in GAP-TABLE. The digest composes every other feed and lands in
 * real inboxes daily, so its own invariants get pinned on the REAL
 * compose fn:
 *
 *   D — delta-provenance: a movement token (▲/▼/+N/−N) may appear ONLY
 *       when a real yesterday baseline existed. Bootstrap (no yesterday)
 *       and quiet (yesterday equal) bodies must carry ZERO movement
 *       tokens anywhere. Detector = the SAME `deltaDirection` the email
 *       renderer uses to colour deltas — one truth, so a token the
 *       renderer would paint green/red is exactly a token this test
 *       polices.
 *   A/V — every item sourceUrl and section sourceUrl passes
 *       checkResolvableSource (the #53 nested-host and #60
 *       fabricated-domain classes, asserted at the digest surface).
 *   R — the diff-mode TL;DR counts equal the actual section item
 *       counts; never an invented number.
 */
import { describe, expect, it } from "vitest";

import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import { composeDigest } from "@/lib/digest/compose";
import type { DigestBody } from "@/lib/digest/types";
import { deltaDirection } from "@/lib/email/delta";
import { checkResolvableSource } from "@/lib/trust/invariants";

const NOW = new Date("2026-07-05T08:00:00Z");

function mkSnapshot(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date: "2026-07-05",
    capturedAt: "2026-07-05T04:00:00Z",
    sources: { total: 42, verified: 42, pending: 0 },
    registry: null,
    events24h: null,
    tools: [
      { id: "openai", status: "operational", activeIncidents: 0 },
      { id: "anthropic", status: "operational", activeIncidents: 0 },
    ],
    benchmarks: {
      publishDate: "2026-07-04",
      top3: [
        { rank: 1, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1500 },
        { rank: 2, modelName: "GPT-6", organization: "OpenAI", rating: 1490 },
        { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
      ],
    },
    packages: null,
    labs24h: [
      {
        id: "anthropic-sf",
        displayName: "Anthropic",
        kind: "labs",
        city: "San Francisco",
        country: "United States",
        total: 200,
        byType: { PushEvent: 200 },
        stale: false,
      },
    ],
    failures: [],
    ...overrides,
  };
}

function mkHn(): HnWireResult {
  return {
    ok: true,
    items: [],
    points: [],
    polledAt: "2026-07-05T08:00:00Z",
    coverage: { itemsTotal: 0, itemsWithLocation: 0, geocodeResolutionPct: 0 },
    meta: { lastFetchOkTs: null, staleMinutes: null },
    source: "redis",
  };
}

/** Every human-visible text slot a movement token could hide in. */
function allTexts(body: DigestBody): string[] {
  const out: string[] = [body.subject, body.tldr ?? ""];
  for (const s of body.sections) {
    out.push(s.headline);
    for (const i of s.items) out.push(i.headline, i.detail ?? "");
  }
  return out.filter(Boolean);
}

describe("digest — Layer A trust invariants (composeDigest)", () => {
  it("D: bootstrap (no yesterday) carries ZERO movement tokens anywhere", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: null,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("bootstrap");
    for (const text of allTexts(body)) {
      expect
        .soft(deltaDirection(text), `movement token in bootstrap: "${text}"`)
        .toBe("neutral");
    }
  });

  it("D: quiet (yesterday identical) carries ZERO movement tokens anywhere", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot(),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("quiet");
    for (const text of allTexts(body)) {
      expect
        .soft(deltaDirection(text), `movement token in quiet: "${text}"`)
        .toBe("neutral");
    }
  });

  it("D (detector sanity): a REAL baseline movement produces a token the detector sees", () => {
    const yesterday = mkSnapshot({
      benchmarks: {
        publishDate: "2026-07-03",
        top3: [
          { rank: 1, modelName: "GPT-6", organization: "OpenAI", rating: 1502 },
          { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1495 },
          { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
        ],
      },
    });
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday,
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("diff");
    const hasMovement = allTexts(body).some((t) => deltaDirection(t) !== "neutral");
    expect(hasMovement).toBe(true);
  });

  it("A/V: every item sourceUrl and section sourceUrl is resolvable (#53/#60 classes)", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot({
        benchmarks: {
          publishDate: "2026-07-03",
          top3: [
            { rank: 1, modelName: "GPT-6", organization: "OpenAI", rating: 1502 },
            { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1495 },
            { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
          ],
        },
      }),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    for (const s of body.sections) {
      for (const u of s.sourceUrls ?? []) {
        expect
          .soft(checkResolvableSource(u), `section ${s.id} sourceUrl: ${u}`)
          .toBeNull();
      }
      for (const i of s.items) {
        if (i.sourceUrl === undefined) continue; // optional by type; absence ≠ fabrication
        expect
          .soft(checkResolvableSource(i.sourceUrl), `item "${i.headline}" -> ${i.sourceUrl}`)
          .toBeNull();
      }
    }
  });

  it("R: diff-mode TL;DR counts equal the actual section item counts", () => {
    const body = composeDigest({
      today: mkSnapshot(),
      yesterday: mkSnapshot({
        benchmarks: {
          publishDate: "2026-07-03",
          top3: [
            { rank: 1, modelName: "GPT-6", organization: "OpenAI", rating: 1502 },
            { rank: 2, modelName: "Claude Opus 4.7", organization: "Anthropic", rating: 1495 },
            { rank: 3, modelName: "Gemini 3", organization: "Google", rating: 1480 },
          ],
        },
      }),
      hn: mkHn(),
      incidents24h: [],
      now: NOW,
    });
    expect(body.mode).toBe("diff");
    expect(body.tldr).toBeDefined();
    const claimed = body.tldr!.match(/(\d+) benchmark mover/);
    if (claimed) {
      const benchmarks = body.sections.find((s) => s.id === "benchmarks")!;
      expect(Number(claimed[1])).toBe(benchmarks.items.length);
    } else {
      // If the tldr stops mentioning benchmarks while movers exist, that's
      // an under-claim (allowed) — but assert it never OVER-claims by
      // requiring at least the mention when items exist in diff mode.
      const benchmarks = body.sections.find((s) => s.id === "benchmarks")!;
      expect(benchmarks.mode === "diff" && benchmarks.items.length > 0).toBe(false);
    }
  });
});
