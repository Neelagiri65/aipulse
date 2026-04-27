import { describe, expect, it } from "vitest";
import { cardId, HOUR_BUCKET_MS } from "@/lib/feed/card-id";

describe("cardId", () => {
  const baseTs = Date.UTC(2026, 3, 27, 12, 0, 0); // 2026-04-27T12:00:00Z

  it("returns the same id for the same inputs (deterministic)", () => {
    const a = cardId("TOOL_ALERT", "anthropic-status:claude-api", baseTs);
    const b = cardId("TOOL_ALERT", "anthropic-status:claude-api", baseTs);
    expect(a).toBe(b);
  });

  it("collapses two timestamps within the same hour bucket to the same id", () => {
    const earlyInHour = baseTs + 1_000;
    const lateInHour = baseTs + 59 * 60 * 1000 + 59_000;
    const a = cardId("TOOL_ALERT", "anthropic-status:claude-api", earlyInHour);
    const b = cardId("TOOL_ALERT", "anthropic-status:claude-api", lateInHour);
    expect(a).toBe(b);
  });

  it("yields a different id when the hour bucket rolls over", () => {
    const before = baseTs;
    const after = baseTs + HOUR_BUCKET_MS;
    const a = cardId("TOOL_ALERT", "anthropic-status:claude-api", before);
    const b = cardId("TOOL_ALERT", "anthropic-status:claude-api", after);
    expect(a).not.toBe(b);
  });

  it("yields a different id when the card type changes", () => {
    const a = cardId("TOOL_ALERT", "anthropic-status:claude-api", baseTs);
    const b = cardId("MODEL_MOVER", "anthropic-status:claude-api", baseTs);
    expect(a).not.toBe(b);
  });

  it("yields a different id when the primary key changes", () => {
    const a = cardId("TOOL_ALERT", "anthropic-status:claude-api", baseTs);
    const b = cardId("TOOL_ALERT", "anthropic-status:claude-code", baseTs);
    expect(a).not.toBe(b);
  });

  it("returns a URL-safe string with no slashes, spaces, or hash characters", () => {
    const id = cardId(
      "MODEL_MOVER",
      "openrouter:anthropic/claude-sonnet-4.6",
      baseTs,
    );
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("encodes the card type as a stable prefix", () => {
    const id = cardId("RESEARCH", "arxiv:2604.12345", baseTs);
    expect(id.startsWith("RESEARCH-")).toBe(true);
  });
});
