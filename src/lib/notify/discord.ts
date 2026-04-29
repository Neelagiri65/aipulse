/**
 * Gawk — Discord webhook sender for tool-status transitions.
 *
 * Env-gated by DISCORD_TOOL_ALERTS_WEBHOOK_URL. When unset the module is a
 * no-op — every public function returns the "skipped" outcome and never
 * throws. This is the same graceful-degradation contract every other
 * outbound source obeys.
 *
 * Color discipline (matches StatusBar palette):
 *   - degraded_performance → yellow
 *   - partial_outage / major_outage → red
 *   - recovery (back to operational) → green
 *
 * Retry policy: one retry on 5xx (after a 1s wait). On 429 we do NOT retry —
 * the cron runs every 5 min and a backed-off retry inside one tick would
 * just stack. 4xx other than 429 is a permanent client error (bad webhook
 * URL, invalid payload), surface as failure.
 */
import type { ToolHealthStatus } from "@/components/health/tools";

const COLOR_DEGRADED = 0xfacc15; // yellow-400
const COLOR_OUTAGE = 0xef4444; // red-500
const COLOR_RECOVERY = 0x10b981; // emerald-500

export type AlertEmbedInput = {
  toolDisplayName: string;
  /** Active status of the tool right now. */
  status: ToolHealthStatus;
  /** Detail line, e.g. the upstream incident name. */
  detail: string;
  /** Public source URL (status page) — appears as the embed title link. */
  sourceUrl: string;
  /** Source name for the footer (e.g. "Anthropic Status"). */
  sourceName: string;
  /** ISO timestamp of the underlying status change. */
  timestamp: string;
};

export type RecoveryEmbedInput = {
  toolDisplayName: string;
  /** What status the tool was in before recovering — informational only. */
  previousStatus: ToolHealthStatus;
  sourceUrl: string;
  sourceName: string;
  timestamp: string;
};

export type DiscordOutcome =
  | { ok: true; sent: number }
  | { ok: false; skipped: "no_webhook_url" }
  | { ok: false; error: string; status?: number };

function colorForStatus(status: ToolHealthStatus): number {
  if (status === "degraded") return COLOR_DEGRADED;
  if (status === "partial_outage" || status === "major_outage") {
    return COLOR_OUTAGE;
  }
  return COLOR_DEGRADED;
}

function statusLabel(status: ToolHealthStatus): string {
  switch (status) {
    case "degraded":
      return "degraded performance";
    case "partial_outage":
      return "partial outage";
    case "major_outage":
      return "major outage";
    case "operational":
      return "operational";
    default:
      return status.replace("_", " ");
  }
}

export function buildAlertEmbed(input: AlertEmbedInput): unknown {
  return {
    title: `${input.toolDisplayName} — ${statusLabel(input.status)}`,
    url: input.sourceUrl,
    description: input.detail,
    color: colorForStatus(input.status),
    timestamp: input.timestamp,
    footer: { text: `Source: ${input.sourceName}` },
  };
}

export function buildRecoveryEmbed(input: RecoveryEmbedInput): unknown {
  return {
    title: `${input.toolDisplayName} recovered`,
    url: input.sourceUrl,
    description: `Upstream status page is back to operational (was ${statusLabel(input.previousStatus)}).`,
    color: COLOR_RECOVERY,
    timestamp: input.timestamp,
    footer: { text: `Source: ${input.sourceName}` },
  };
}

type WebhookPayload = { embeds: unknown[]; username?: string };

async function postOnce(
  url: string,
  payload: WebhookPayload,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true, status: res.status };
  const body = await res.text().catch(() => "");
  return { ok: false, status: res.status, body };
}

export async function postEmbeds(embeds: unknown[]): Promise<DiscordOutcome> {
  const url = process.env.DISCORD_TOOL_ALERTS_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: "no_webhook_url" };
  if (embeds.length === 0) return { ok: true, sent: 0 };

  // Discord allows up to 10 embeds per webhook POST. In normal operation
  // we expect 1-2 transitions per tick; the chunk-by-10 here is defensive.
  let sent = 0;
  for (let i = 0; i < embeds.length; i += 10) {
    const chunk = embeds.slice(i, i + 10);
    const payload: WebhookPayload = { embeds: chunk, username: "Gawk" };

    const first = await postOnce(url, payload);
    if (first.ok) {
      sent += chunk.length;
      continue;
    }
    // Retry once on 5xx after 1s. Bail on 4xx (bad URL / malformed body).
    if (first.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      const second = await postOnce(url, payload);
      if (second.ok) {
        sent += chunk.length;
        continue;
      }
      return {
        ok: false,
        error: `Discord ${second.status}: ${second.body ?? "<empty>"}`,
        status: second.status,
      };
    }
    return {
      ok: false,
      error: `Discord ${first.status}: ${first.body ?? "<empty>"}`,
      status: first.status,
    };
  }
  return { ok: true, sent };
}
