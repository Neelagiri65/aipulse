/**
 * Incident-to-Codex attribution (`mentionsCodex`) — the single inclusion
 * rule shared by the codex card's activeIncidents filter and its history
 * filter, so the incident block and the uptime bar can never disagree.
 *
 * Reconstructed incident (live, 2026-07-05): OpenAI ran a 4-day incident
 * named "Codex, workspace analytics, … not working in FedRAMP workspaces"
 * with an EMPTY components[] while declaring Codex Web/API operational —
 * so attribution must work name-first, and unnamed incidents are kept
 * (conservative: disclosing an extra incident beats hiding a real one).
 */
import { describe, expect, it } from "vitest";

import { mentionsCodex } from "@/lib/data/fetch-status";

describe("mentionsCodex — incident attribution for the codex card", () => {
  it("keeps the reconstructed live incident: names Codex, components[] empty", () => {
    expect(
      mentionsCodex({
        name: "Codex, workspace analytics, conversation search, searching for custom GPTs, ChatGPT user invites, and Compliance Log Platform download endpoint not working in FedRAMP workspaces",
        components: [],
      }),
    ).toBe(true);
  });

  it("drops a page-level incident that neither names Codex nor lists a Codex component", () => {
    expect(
      mentionsCodex({ name: "ChatGPT login issues", components: [] }),
    ).toBe(false);
  });

  it("keeps an incident scoped to a Codex component even when the name doesn't say Codex", () => {
    expect(
      mentionsCodex({
        name: "Elevated error rates",
        components: [{ name: "Codex API" }],
      }),
    ).toBe(true);
  });

  it("keeps unnamed incidents — attribution unverifiable, conservative = disclose", () => {
    expect(mentionsCodex({})).toBe(true);
    expect(mentionsCodex({ name: "" })).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(mentionsCodex({ name: "CODEX degraded performance" })).toBe(true);
  });
});
