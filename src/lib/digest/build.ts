/**
 * Digest build orchestrator — loads inputs, calls the pure composer.
 *
 * Used by:
 *   - /admin/digest/preview       — render next send's body for review.
 *   - /api/digest/send (Issue 9)  — the cron-triggered send pipeline.
 *
 * The compose step is pure and already covered by tests; the only thing
 * worth testing here is that inputs are wired correctly and the
 * no-snapshot case degrades cleanly. Every dependency is passed as a
 * seam so the helper can be driven by in-memory fixtures.
 */

import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { Incidents48hSplit } from "@/lib/digest/fetch-incidents-24h";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";
import type { AgentsViewDto } from "@/lib/data/agents-view";
import { composeDigest } from "@/lib/digest/compose";
import type { DigestBody } from "@/lib/digest/types";

export type BuildDigestResult =
  | { ok: true; body: DigestBody }
  | { ok: false; reason: "no-snapshot" | "compose-failed"; message: string };

export type BuildDigestOpts = {
  /** UTC date (YYYY-MM-DD) the digest is "for" — i.e. today's snapshot. */
  date: string;
  /** YYYY-MM-DD for the day immediately before `date`. The caller
   *  computes this so the helper stays pure (no `new Date` inside). */
  previousDate: string;
  now: Date;
  loadSnapshot: (date: string) => Promise<DailySnapshot | null>;
  loadHn: () => Promise<HnWireResult>;
  loadIncidents24h: () => Promise<Incidents48hSplit>;
  /**
   * Optional: load the OpenRouter snapshot history (date → top-N
   * slugs). When omitted or returning fewer than 7 days, the
   * Model Usage section silently self-gates and is not emitted.
   */
  loadModelUsageSnapshots?: () => Promise<Record<string, ModelUsageSnapshotRow>>;
  /**
   * Optional: load the assembled Agents view (today + 7d-old delta).
   * When omitted or returning null, the Agents section is silently
   * dropped. Section composer is movement-gated so a populated DTO
   * with no rows above the threshold also drops the section.
   */
  loadAgentsView?: () => Promise<AgentsViewDto | null>;
};

export async function buildDigestForDate(
  opts: BuildDigestOpts,
): Promise<BuildDigestResult> {
  const today = await opts.loadSnapshot(opts.date);
  if (!today) {
    return {
      ok: false,
      reason: "no-snapshot",
      message: `no snapshot found for ${opts.date} — cron may not have run`,
    };
  }
  const yesterday = await opts.loadSnapshot(opts.previousDate);
  const hn = await opts.loadHn();
  const incidents = await opts.loadIncidents24h();
  const modelUsageSnapshots = opts.loadModelUsageSnapshots
    ? await opts.loadModelUsageSnapshots()
    : undefined;
  const agents = opts.loadAgentsView ? await opts.loadAgentsView() : null;
  try {
    const body = composeDigest({
      today,
      yesterday,
      hn,
      incidents24h: incidents.current24h,
      priorIncidentCount: incidents.priorCount,
      now: opts.now,
      modelUsageSnapshots,
      agents,
    });
    return { ok: true, body };
  } catch (e) {
    return {
      ok: false,
      reason: "compose-failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Compute previous UTC date (YYYY-MM-DD) given a reference date. */
export function previousUtcDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const ts = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const prev = new Date(ts - 24 * 60 * 60 * 1000);
  const yy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(prev.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
