/**
 * Data-lake archiver — pure logic for the append-only public dataset
 * (github.com/Neelagiri65/gawk-data).
 *
 * Trust contract (mirrors the gawk-data README):
 *  - Records are archived exactly as served by gawk's public API. No
 *    rewriting, no enrichment, no synthesis.
 *  - Every line carries a capture envelope for auditable provenance.
 *  - Append-only, deduplicated by source event id; a record is written
 *    once and never mutated.
 *  - Archiving is gated on /api/trust-audit: a breach on live output
 *    means the tick SKIPS rather than persist suspect data (the PRD's
 *    hard rule — storing untrue data launders noise into "insight").
 *  - Corrupt archive state fails LOUD: we throw rather than silently
 *    rewrite history.
 */

export type Envelope = {
  v: 1;
  capturedAt: string;
  endpoint: string;
  record: unknown;
};

export function makeEnvelope(record: unknown, endpoint: string, capturedAt: string): Envelope {
  return { v: 1, capturedAt, endpoint, record };
}

type GlobePoint = { meta?: { eventId?: string | number; sourceKind?: string } };

/**
 * Stable dedup key for a served map point. GitHub and GitLab event ids
 * are independent numeric spaces, so the key is sourceKind-qualified.
 * Returns null for a point with no event id — such a record is
 * unidentifiable and must be skipped, never archived under a synthetic
 * key (no-synthesis rule).
 */
export function eventKey(point: GlobePoint): string | null {
  const id = point?.meta?.eventId;
  if (id === undefined || id === null || id === "") return null;
  return `${point?.meta?.sourceKind ?? "events-api"}:${id}`;
}

export type MergeResult = {
  content: string;
  added: number;
  skippedNoId: number;
  total: number;
};

/**
 * Merge freshly served points into an existing NDJSON day file.
 * Existing lines are parsed strictly — a corrupt line throws (the file
 * is written only by this archiver; corruption means investigate, not
 * paper over).
 */
export function mergeEventLines(
  existingNdjson: string,
  points: unknown[],
  endpoint: string,
  capturedAt: string,
): MergeResult {
  const lines = existingNdjson.split("\n").filter((l) => l.trim() !== "");
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    let parsed: Envelope;
    try {
      parsed = JSON.parse(line) as Envelope;
    } catch {
      throw new Error(`Corrupt archive line ${i + 1}: not valid JSON`);
    }
    const key = eventKey(parsed.record as GlobePoint);
    if (key) seen.add(key);
  }

  let added = 0;
  let skippedNoId = 0;
  const out = [...lines];
  for (const p of points) {
    const key = eventKey(p as GlobePoint);
    if (!key) {
      skippedNoId++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(JSON.stringify(makeEnvelope(p, endpoint, capturedAt)));
    added++;
  }

  return {
    content: out.join("\n") + (out.length ? "\n" : ""),
    added,
    skippedNoId,
    total: out.length,
  };
}

/** Archive only when the live-output trust audit is clean. */
export function shouldArchive(audit: { ok?: boolean; findings?: unknown[] } | null | undefined): boolean {
  if (!audit) return false;
  return audit.ok === true && (audit.findings ?? []).length === 0;
}

export type HistoryCaptureDecision =
  | { capture: true }
  | { capture: false; reason: string; loud: boolean };

/**
 * Decide whether an /api/history?limit=1 response is fit to archive as
 * today's DailySnapshot record. The 2026-07 Upstash incident destroyed
 * 14 days of these blobs — Redis was their only home. Archiving them
 * here makes git the durable copy, but ONLY a same-day, non-degraded
 * response may be locked in (the file is once-per-day, never
 * overwritten — locking in a stale or empty read would archive the
 * outage instead of the day).
 *
 * Outcomes:
 *  - capture:true            — newest served snapshot is dated today.
 *  - loud:false skip         — newest snapshot is a prior day's: the
 *                              daily-snapshot cron (~06:00 UTC) hasn't
 *                              fired yet. A later tick captures it.
 *  - loud:true skip          — degraded:true (read rejected; flag ships
 *                              with the /api/history degraded-flag PR
 *                              and is simply absent before it) or an
 *                              empty snapshot list. Both mean the store
 *                              could not serve history — that's an
 *                              incident signal, not a quiet wait.
 */
export function shouldCaptureHistory(
  body: { snapshots?: Array<{ date?: unknown }>; degraded?: unknown } | null | undefined,
  capturedAt: string,
): HistoryCaptureDecision {
  if (!body || !Array.isArray(body.snapshots)) {
    return { capture: false, reason: "malformed history response", loud: true };
  }
  if (body.degraded === true) {
    return { capture: false, reason: "history read degraded", loud: true };
  }
  if (body.snapshots.length === 0) {
    return { capture: false, reason: "history served zero snapshots", loud: true };
  }
  const newest = body.snapshots[0]?.date;
  const today = capturedAt.slice(0, 10);
  if (newest !== today) {
    return {
      capture: false,
      reason: `newest snapshot is ${String(newest)}, not ${today} — daily-snapshot cron not fired yet`,
      loud: false,
    };
  }
  return { capture: true };
}

/** UTC-keyed repo paths for a capture instant. */
export function archivePaths(capturedAt: string): { eventsFile: string; snapshotsDir: string } {
  const d = new Date(capturedAt);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid capturedAt: ${capturedAt}`);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const day = `${yyyy}-${mm}-${dd}`;
  return {
    eventsFile: `events/${yyyy}/${mm}/${day}.ndjson`,
    snapshotsDir: `snapshots/${yyyy}/${mm}/${day}`,
  };
}
