/**
 * The push payload for a tool-alert transition. Pure, so the tool-alerts
 * route stays thin and the payload shape — including the `toolId` that
 * drives targeting (src/lib/push/target.ts) — is pinned by tests.
 */
import type { PushPayload } from "@/lib/push/send";
import { hhmmUtc } from "@/lib/format/utc-stamp";
import { toolDisplayNameFromHeadline, type AlertTransition, type RecoveryTransition } from "./tool-alert-transitions";

const SITE_URL = "https://gawk.dev";

/** `primaryKey` is "${sourceId}:${toolId}"; the id after the first colon. */
export function toolIdFromPrimaryKey(primaryKey: string): string {
  return primaryKey.slice(primaryKey.indexOf(":") + 1);
}

export function alertPushPayload(t: AlertTransition): PushPayload {
  const toolName = toolDisplayNameFromHeadline(t.card.headline);
  const status = String(t.card.meta.status);
  const toolId = typeof t.card.meta.toolId === "string" ? t.card.meta.toolId : toolIdFromPrimaryKey(t.primaryKey);
  return {
    title: `gawk.dev: ${toolName} ${status}`,
    // "reason · source · read time" (iOS PRD §14): the banner is the only line
    // most people read, so the provenance is IN it, not only in custom keys.
    body: withProvenance(t.card.detail || `Status changed to ${status}`, t.card.sourceName, t.card.timestamp),
    url: SITE_URL,
    tag: `tool-alert-${toolName}`,
    toolId,
    source: t.card.sourceName,
    generatedAt: t.card.timestamp,
  };
}

/** `<reason> · <source> · <HH:MM UTC>` — every push says where and when, in the visible line. */
export function withProvenance(reason: string, source: string, iso: string): string {
  return `${reason} · ${source} · ${hhmmUtc(iso)}`;
}

/** A recovery targets the same tool the alert did; legacy state without an id falls back to the key. */
export function recoveryPushPayload(r: RecoveryTransition, now = new Date()): PushPayload {
  return {
    title: `gawk.dev: ${r.state.toolDisplayName} recovered`,
    body: withProvenance(`Back to operational from ${r.state.status}`, r.state.sourceName, now.toISOString()),
    url: SITE_URL,
    tag: `tool-alert-${r.state.toolDisplayName}`,
    toolId: r.state.toolId || toolIdFromPrimaryKey(r.primaryKey),
    source: r.state.sourceName,
    generatedAt: now.toISOString(),
  };
}
