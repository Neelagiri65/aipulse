import { describe, expect, it } from "vitest";
import { alertPushPayload, recoveryPushPayload, toolIdFromPrimaryKey } from "@/lib/notify/push-payloads";
import type { AlertTransition, RecoveryTransition, ToolAlertCard } from "@/lib/notify/tool-alert-transitions";

const card: ToolAlertCard = {
  id: "TOOL_ALERT-x",
  type: "TOOL_ALERT",
  severity: 100,
  headline: "Cursor is reporting degraded performance",
  detail: "Upstream status page reports degraded.",
  sourceName: "Cursor Status",
  sourceUrl: "https://status.cursor.com",
  timestamp: "2026-09-15T12:00:00.000Z",
  meta: { toolId: "cursor", status: "degraded", statusSourceId: "cursor-status", activeIncidents: 0 },
};

describe("alertPushPayload", () => {
  it("carries the tool id from the card, plus the same title/body/tag as before", () => {
    const t: AlertTransition = { kind: "alert", primaryKey: "cursor-status:cursor", card };
    expect(alertPushPayload(t)).toEqual({
      title: "gawk.dev: Cursor degraded",
      body: "Upstream status page reports degraded.",
      url: "https://gawk.dev",
      tag: "tool-alert-Cursor",
      toolId: "cursor",
      // Source name + the card's own timestamp: the iOS app renders nothing
      // without both (constraint test 1), and web push ignores the extras.
      source: card.sourceName,
      generatedAt: "2026-09-15T12:00:00.000Z",
    });
  });
  it("falls back to the id inside the primary key when the card has none, and to a generic body when detail is empty", () => {
    const t: AlertTransition = {
      kind: "alert",
      primaryKey: "cursor-status:cursor",
      card: { ...card, detail: undefined, meta: { status: "outage", statusSourceId: "cursor-status" } },
    };
    const p = alertPushPayload(t);
    expect(p.toolId).toBe("cursor");
    expect(p.body).toBe("Status changed to outage");
  });
});

describe("recoveryPushPayload", () => {
  const base = { status: "degraded" as const, alertedAt: "2026-09-15T11:00:00Z", sourceUrl: "u", sourceName: "n", toolDisplayName: "Cursor" };
  it("targets the tool the alert targeted", () => {
    const r: RecoveryTransition = { kind: "recovery", primaryKey: "cursor-status:cursor", state: { ...base, toolId: "cursor" } };
    expect(recoveryPushPayload(r, new Date("2026-09-15T12:00:00Z"))).toEqual({
      title: "gawk.dev: Cursor recovered",
      body: "Back to operational from degraded",
      url: "https://gawk.dev",
      tag: "tool-alert-Cursor",
      toolId: "cursor",
      // The app renders nothing without a source and a time (iOS constraint test 1).
      source: "n",
      generatedAt: "2026-09-15T12:00:00.000Z",
    });
  });
  it("legacy cached state without a tool id still targets, via the primary key", () => {
    const r: RecoveryTransition = { kind: "recovery", primaryKey: "openai-status:codex", state: base };
    expect(recoveryPushPayload(r).toolId).toBe("codex");
  });
});

describe("toolIdFromPrimaryKey", () => {
  it("takes everything after the first colon", () => {
    expect(toolIdFromPrimaryKey("anthropic-status:claude-code")).toBe("claude-code");
    expect(toolIdFromPrimaryKey("nocolon")).toBe("nocolon");
  });
});
