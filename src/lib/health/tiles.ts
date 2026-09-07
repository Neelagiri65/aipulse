/**
 * The four compact tiles on Health (canvas Health board; PRD web-restyle-v2 §7). Pure: every
 * tile is a number the dashboard already displays elsewhere, with its source and the time the
 * source was read. Before a source answers the tile is pending ("—", no fabricated time) — never 0.
 *
 * The mover tile shares the highlights strip's truth (`topCardOfType`), so the model named here is
 * the model named on the strip, not a second derivation from the raw OpenRouter rows.
 */
import type { FeedResponse } from "@/lib/feed/types";
import type { StatusResult } from "@/lib/data/fetch-status";
import type { GlobeEventsResult } from "@/lib/data/fetch-events";
import type { LabsPayload } from "@/lib/data/fetch-labs";
import { topCardOfType } from "@/lib/feed/highlights";
import { FEED_TRIGGERS } from "@/lib/feed/thresholds";
import { OPENROUTER_SOURCE_NAME } from "@/lib/feed/degraded-sources";
import { deriveSev } from "@/components/chrome/StatusBar";

export type HealthTileId = "mover" | "tools" | "aicfg" | "labs";

export type HealthTile = {
  id: HealthTileId;
  /** The number, or "—" while pending. */
  value: string;
  label: string;
  source: string;
  sourceUrl: string;
  /** ISO time the source was read; null while pending. */
  at: string | null;
  pending: boolean;
};

export type HealthTilesInput = {
  feed?: FeedResponse;
  status?: StatusResult;
  events?: GlobeEventsResult;
  labs?: LabsPayload;
};

export const REGISTRY_URL = "https://github.com/Neelagiri65/aipulse/blob/main/data/ai-labs.json";

const MOVER_HEADLINE = /^(.+) (up|down) (\d+) ranks on OpenRouter weekly$/;

function moverTile(feed?: FeedResponse): HealthTile {
  const base = { id: "mover" as const, source: OPENROUTER_SOURCE_NAME, sourceUrl: "https://openrouter.ai/rankings" };
  if (!feed) return { ...base, value: "—", label: "top model move on OpenRouter weekly", at: null, pending: true };
  const degraded = feed.degradedSources?.some((s) => s.source === OPENROUTER_SOURCE_NAME) ?? false;
  if (degraded) {
    return { ...base, value: "—", label: "OpenRouter ranking degraded · catalogue order, rank moves unavailable", at: feed.lastComputed, pending: false };
  }
  const card = topCardOfType(feed, "MODEL_MOVER");
  if (!card) {
    return { ...base, value: "—", label: `no model moved more than ${FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA} ranks on OpenRouter weekly`, at: feed.lastComputed, pending: false };
  }
  const m = card.meta;
  const rank = typeof m.currentRank === "number" ? m.currentRank : null;
  const delta = typeof m.delta === "number" ? m.delta : null;
  const parsed = MOVER_HEADLINE.exec(card.headline);
  const name = typeof m.name === "string" ? m.name : parsed ? parsed[1] : card.headline;
  const move =
    delta === null
      ? parsed
        ? `${parsed[2]} ${parsed[3]}`
        : ""
      : `${delta < 0 ? "up" : "down"} ${Math.abs(delta)}`;
  return {
    ...base,
    value: rank === null ? "—" : `#${rank}`,
    // previousRank is yesterday's 00:00 UTC snapshot, not a rolling 24 h (openrouter-types.ts).
    label: `${name} · ${move} since yesterday 00:00 UTC · weekly ranking`,
    sourceUrl: card.sourceUrl || base.sourceUrl,
    at: card.timestamp,
    pending: false,
  };
}

function toolsTile(status?: StatusResult): HealthTile {
  const base = { id: "tools" as const, source: "vendor status pages", sourceUrl: "/sources" };
  const sev = deriveSev(status);
  if (!status || sev.total === 0) return { ...base, value: "—", label: "tools operational at the last check", at: null, pending: true };
  return { ...base, value: `${sev.operational}/${sev.total}`, label: "tools operational at the last check", at: status.polledAt, pending: false };
}

function aiConfigTile(events?: GlobeEventsResult): HealthTile {
  const base = { id: "aicfg" as const, source: "GitHub + GitLab public events", sourceUrl: "/sources" };
  if (!events) return { ...base, value: "—", label: "AI-cfg events in the window", at: null, pending: true };
  const c = events.coverage;
  return {
    ...base,
    value: c.windowAiConfig.toLocaleString("en-GB"),
    label: `AI-cfg events · ${c.windowMinutes} min · of ${c.windowSize.toLocaleString("en-GB")} received`,
    at: events.polledAt,
    pending: false,
  };
}

function labsTile(labs?: LabsPayload): HealthTile {
  const base = { id: "labs" as const, source: "data/ai-labs.json", sourceUrl: REGISTRY_URL };
  if (!labs) return { ...base, value: "—", label: "HQs on the registry", at: null, pending: true };
  return { ...base, value: labs.labs.length.toLocaleString("en-GB"), label: "HQs on the registry · curated, each with a cited source", at: labs.generatedAt, pending: false };
}

export function deriveHealthTiles(input: HealthTilesInput): HealthTile[] {
  return [moverTile(input.feed), toolsTile(input.status), aiConfigTile(input.events), labsTile(input.labs)];
}
