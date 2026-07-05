/**
 * Layer A trust test — LAB_HIGHLIGHT (AI Labs registry) deriver.
 *
 * Output-invariant (prd-trust-harness §1) over the REAL deriver fn.
 * The card claims "leads 7-day GitHub activity (N events)":
 *   F — the payload may be at most as old as the window it measures
 *       (LABS_MAX_AGE_MS = WINDOW_MS from fetch-labs). Within that,
 *       staleness is disclosed at feed level via staleSources ("cited
 *       stale > blank"); beyond it, the claimed window has zero overlap
 *       with the actual last 7 days and the card is dropped.
 *   A/V — sourceUrl is a resolvable https URL (lab site or GH org).
 *   R — the headline's event count IS the payload's total, never an
 *       invented number; an all-zero registry emits nothing.
 */
import { describe, expect, it } from "vitest";

import { WINDOW_MS, type LabsPayload } from "@/lib/data/fetch-labs";
import {
  deriveLabHighlightCards,
  LABS_MAX_AGE_MS,
} from "@/lib/feed/derivers/lab-highlight";
import {
  auditItem,
  checkFresh,
  checkResolvableSource,
} from "@/lib/trust/invariants";

const NOW = Date.parse("2026-07-05T12:00:00Z");
const H = 3_600_000;

function payloadAt(generatedAt: string, total = 200): LabsPayload {
  return {
    generatedAt,
    failures: [],
    labs: [
      {
        id: "anthropic-sf",
        displayName: "Anthropic",
        kind: "labs",
        city: "San Francisco",
        country: "United States",
        lat: 37.78,
        lng: -122.42,
        hqSourceUrl: "https://www.anthropic.com/company",
        url: "https://www.anthropic.com",
        orgs: ["anthropics"],
        repos: [],
        total,
        byType: { PushEvent: total },
        stale: false,
      },
    ],
  };
}

describe("LAB_HIGHLIGHT — Layer A trust invariants", () => {
  it("the gate is the claim: LABS_MAX_AGE_MS equals the 7-day window the headline measures", () => {
    expect(LABS_MAX_AGE_MS).toBe(WINDOW_MS);
  });

  it("a fresh payload passes every invariant on the real deriver output", () => {
    const cards = deriveLabHighlightCards(
      payloadAt("2026-07-05T11:00:00Z"),
      NOW,
    );
    expect(cards).toHaveLength(1);
    expect(
      auditItem([
        checkFresh(cards[0].timestamp, NOW, LABS_MAX_AGE_MS),
        checkResolvableSource(cards[0].sourceUrl),
      ]),
    ).toEqual([]);
  });

  it("R: the headline count IS the payload total, never invented", () => {
    const cards = deriveLabHighlightCards(
      payloadAt("2026-07-05T11:00:00Z", 347),
      NOW,
    );
    expect(cards[0].headline).toContain("(347 events)");
    expect(cards[0].meta.total).toBe(347);
  });

  it("the frozen-ingest class: a payload older than its own window is DROPPED, not served", () => {
    // Reconstructs the withLastKnown fallback serving an 8-day-old
    // payload — the claimed 7-day window has zero overlap with reality.
    const eightDaysAgo = new Date(NOW - 8 * 24 * H).toISOString();
    expect(deriveLabHighlightCards(payloadAt(eightDaysAgo), NOW)).toEqual([]);
  });

  it("a stale-but-within-window payload IS served (feed-level staleSources discloses it)", () => {
    const twoDaysAgo = new Date(NOW - 2 * 24 * H).toISOString();
    const cards = deriveLabHighlightCards(payloadAt(twoDaysAgo), NOW);
    expect(cards).toHaveLength(1);
    expect(
      checkFresh(cards[0].timestamp, NOW, LABS_MAX_AGE_MS),
    ).toBeNull();
  });

  it("an unparseable generatedAt is dropped — freshness unverifiable, don't ship", () => {
    expect(
      deriveLabHighlightCards(payloadAt("not-a-date"), NOW),
    ).toEqual([]);
  });

  it("an all-zero registry emits nothing — never fabricate a highlight", () => {
    expect(
      deriveLabHighlightCards(payloadAt("2026-07-05T11:00:00Z", 0), NOW),
    ).toEqual([]);
  });
});
