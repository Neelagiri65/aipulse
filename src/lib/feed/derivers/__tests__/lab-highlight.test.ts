import { describe, expect, it } from "vitest";
import { deriveLabHighlightCards } from "@/lib/feed/derivers/lab-highlight";
import type { LabActivity, LabsPayload } from "@/lib/data/fetch-labs";

function lab(
  partial: Partial<LabActivity> & Pick<LabActivity, "id" | "displayName" | "total">,
): LabActivity {
  return {
    id: partial.id,
    displayName: partial.displayName,
    kind: partial.kind ?? "industry",
    city: partial.city ?? "San Francisco",
    country: partial.country ?? "United States",
    lat: partial.lat ?? 37.78,
    lng: partial.lng ?? -122.42,
    hqSourceUrl: partial.hqSourceUrl ?? "https://example.com",
    url: partial.url ?? "https://example.com",
    orgs: partial.orgs ?? [partial.id],
    notes: partial.notes,
    repos: partial.repos ?? [],
    total: partial.total,
    byType: partial.byType ?? {
      PushEvent: 0,
      PullRequestEvent: 0,
      IssuesEvent: 0,
      IssueCommentEvent: 0,
      PullRequestReviewEvent: 0,
      ReleaseEvent: 0,
      CreateEvent: 0,
      ForkEvent: 0,
      WatchEvent: 0,
    },
    stale: partial.stale ?? false,
  };
}

const basePayload: LabsPayload = {
  labs: [],
  generatedAt: "2026-04-27T12:00:00.000Z",
  failures: [],
};

describe("deriveLabHighlightCards", () => {
  it("emits exactly one card — the lab with the highest 7d total", () => {
    const payload: LabsPayload = {
      ...basePayload,
      labs: [
        lab({ id: "anthropic", displayName: "Anthropic", total: 250 }),
        lab({ id: "openai", displayName: "OpenAI", total: 800 }),
        lab({ id: "stanford-crfm", displayName: "Stanford CRFM", total: 50 }),
      ],
    };
    const cards = deriveLabHighlightCards(payload);
    expect(cards).toHaveLength(1);
    expect(cards[0].severity).toBe(10);
    expect(cards[0].type).toBe("LAB_HIGHLIGHT");
    expect(cards[0].headline).toContain("OpenAI");
  });

  it("populates sourceUrl from the lab's url", () => {
    const payload: LabsPayload = {
      ...basePayload,
      labs: [
        lab({
          id: "anthropic",
          displayName: "Anthropic",
          total: 100,
          url: "https://github.com/anthropics",
        }),
      ],
    };
    const cards = deriveLabHighlightCards(payload);
    expect(cards[0].sourceUrl).toBe("https://github.com/anthropics");
  });

  it("uses the payload generatedAt as the card timestamp", () => {
    const payload: LabsPayload = {
      ...basePayload,
      generatedAt: "2026-04-27T12:00:00.000Z",
      labs: [lab({ id: "anthropic", displayName: "Anthropic", total: 100 })],
    };
    const cards = deriveLabHighlightCards(payload);
    expect(cards[0].timestamp).toBe("2026-04-27T12:00:00.000Z");
  });

  it("returns [] when there are no labs", () => {
    expect(deriveLabHighlightCards(basePayload)).toEqual([]);
  });

  it("returns [] when the top lab has zero events (quiet across the registry)", () => {
    const payload: LabsPayload = {
      ...basePayload,
      labs: [lab({ id: "x", displayName: "X", total: 0 })],
    };
    expect(deriveLabHighlightCards(payload)).toEqual([]);
  });
});
