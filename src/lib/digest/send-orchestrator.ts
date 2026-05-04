/**
 * sendDigestForDate — wires the Issue 2–8 pieces into one callable unit:
 *
 *   1. Build today's DigestBody (composer + snapshot loaders + HN + 24h
 *      incidents).
 *   2. Domain hard-gate (SPF + DKIM via Resend, DMARC via DNS). Abort
 *      the whole run on any failure — sending unverified burns the
 *      sender-domain reputation on first delivery.
 *   3. Load every confirmed subscriber with decrypted plaintext emails.
 *   4. Pre-render per-recipient HTML (renderHtml is async — react-email's
 *      render() returns a Promise), then hand a sync lookup to `sendDigest`.
 *   5. Write the `DigestBody` to the archive IFF something delivered.
 *      Archive is "what we sent", not "what we composed" — a 0-recipient
 *      dry-run doesn't earn a public /digest/{date} entry.
 *
 * Every dependency is injected; the route module wires production
 * defaults and tests pass in-memory fakes.
 */

import { buildDigestForDate, previousUtcDate } from "@/lib/digest/build";
import {
  checkDomainVerified,
  type DomainClient,
  type DomainVerifyResult,
  type DmarcResolver,
} from "@/lib/digest/domain-verify";
import { sendDigest, type BatchSender, type SendDigestResult } from "@/lib/digest/sender";
import type { DigestRecipient } from "@/lib/digest/batch";
import type { DigestBody } from "@/lib/digest/types";
import type { DailySnapshot } from "@/lib/data/snapshot";
import type { HnWireResult } from "@/lib/data/wire-hn";
import type { Incidents48hSplit } from "@/lib/digest/fetch-incidents-24h";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";
import type { AgentsViewDto } from "@/lib/data/agents-view";
import type { ConfirmedSubscriberWithEmail } from "@/lib/data/subscribers";

/**
 * Persisted marker recording that today's digest was successfully
 * delivered to ≥1 recipient. The orchestrator writes this AFTER
 * `send.sent > 0` and READS it at the start of the next invocation
 * to short-circuit duplicate sends — root cause of the 2026-05-01 +
 * 2026-05-02 double-fires (manual `workflow_dispatch` re-running on
 * top of the scheduled 08:00 UTC run with no server-side guard).
 *
 * Idempotency is per-UTC-date. The marker SHOULD survive at least
 * 7 days (TTL is the storage layer's job, not this module's).
 */
export type SentMarker = {
  /** ISO timestamp of the moment the marker was written. */
  sentAt: string;
  /** Number of recipients the orchestrator handed to sendDigest. */
  recipientCount: number;
  /** Number that actually delivered (send.sent — may be < recipientCount
   *  if some bounced or chunks failed). */
  deliveredCount: number;
  /** Subject line of the send the marker corresponds to. */
  subject: string;
};

export type SendDigestForDateInput = {
  date: string;
  now: Date;
  from: string;
  unsubBaseUrl: string;
  unsubMailto: string;
  baseUrl: string;
  resendDomains: DomainClient;
  resendDomainId: string;
  resendDomainName: string;
  /** Seam for tests to stub the DMARC DNS lookup. Production leaves this
   *  undefined so `resolveTxt` from node:dns/promises is used. */
  dmarcResolver?: DmarcResolver;
  loadSnapshot: (date: string) => Promise<DailySnapshot | null>;
  loadHn: () => Promise<HnWireResult>;
  loadIncidents24h: () => Promise<Incidents48hSplit>;
  /** Optional — see BuildDigestOpts.loadModelUsageSnapshots. */
  loadModelUsageSnapshots?: () => Promise<
    Record<string, ModelUsageSnapshotRow>
  >;
  /** Optional — see BuildDigestOpts.loadAgentsView. */
  loadAgentsView?: () => Promise<AgentsViewDto | null>;
  /** Optional — see BuildDigestOpts.loadHistory. NEWEST FIRST. */
  loadHistory?: () => Promise<DailySnapshot[]>;
  loadSubscribers: () => Promise<ConfirmedSubscriberWithEmail[]>;
  batchSender: BatchSender;
  renderHtml: (args: {
    digest: DigestBody;
    baseUrl: string;
    unsubUrl: string;
    countryCode: string | null;
  }) => Promise<string>;
  writeArchive: (date: string, body: DigestBody) => Promise<void>;
  appendError: (
    date: string,
    entry: { kind: string; subject: string; message: string; hash?: string },
  ) => Promise<void>;
  markBounced: (hash: string) => Promise<void>;
  /**
   * Idempotency-marker reader. When provided AND the marker for this
   * date is non-null AND `force !== true`, the orchestrator short-
   * circuits BEFORE doing any expensive work (no domain verify, no
   * subscriber decrypt, no batch send). Omit in tests that don't care
   * about the dedupe contract — the orchestrator falls through to a
   * normal send.
   */
  getSentMarker?: (date: string) => Promise<SentMarker | null>;
  /**
   * Idempotency-marker writer. When provided AND the run delivered to
   * ≥1 recipient, the orchestrator writes the marker so the NEXT
   * invocation short-circuits. Omit in tests that don't care.
   */
  markSent?: (date: string, marker: SentMarker) => Promise<void>;
  /**
   * Bypass the idempotency check. Set true for manual operator reruns
   * (e.g. retry after a partial-batch failure). Surfaced to the cron
   * route via `?force=1` and to the GH Actions workflow as a
   * `workflow_dispatch` input. Default false.
   */
  force?: boolean;
  /** Seam for tests to avoid wall-clock delays. */
  sleepFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
  chunkSize?: number;
};

export type SendDigestForDateResult =
  | {
      ok: false;
      reason: "no-snapshot" | "compose-failed" | "domain-not-verified";
      message: string;
      /** Populated when reason is "domain-not-verified". */
      verify?: DomainVerifyResult;
    }
  | {
      ok: true;
      skipped: true;
      reason: "already-sent-today";
      date: string;
      /** The marker read from the idempotency store — surfaces what the
       *  prior successful send delivered, for observability. */
      marker: SentMarker;
    }
  | {
      ok: true;
      skipped?: false;
      date: string;
      subject: string;
      mode: DigestBody["mode"];
      recipientCount: number;
      send: SendDigestResult;
    };

export async function sendDigestForDate(
  input: SendDigestForDateInput,
): Promise<SendDigestForDateResult> {
  // Idempotency short-circuit. Checked BEFORE the build to skip all
  // expensive work (snapshot reads, domain verify, subscriber decrypt,
  // batch send) on duplicate invocations. The marker is per-UTC-date;
  // a manual `?force=1` rerun bypasses the check (operator opt-in for
  // partial-failure retries).
  if (!input.force && input.getSentMarker) {
    const marker = await input.getSentMarker(input.date);
    if (marker) {
      return {
        ok: true,
        skipped: true,
        reason: "already-sent-today",
        date: input.date,
        marker,
      };
    }
  }

  const build = await buildDigestForDate({
    date: input.date,
    previousDate: previousUtcDate(input.date),
    now: input.now,
    loadSnapshot: input.loadSnapshot,
    loadHn: input.loadHn,
    loadIncidents24h: input.loadIncidents24h,
    loadModelUsageSnapshots: input.loadModelUsageSnapshots,
    loadAgentsView: input.loadAgentsView,
    loadHistory: input.loadHistory,
  });
  if (!build.ok) {
    return { ok: false, reason: build.reason, message: build.message };
  }

  const verify = await checkDomainVerified(
    input.resendDomains,
    input.resendDomainId,
    input.resendDomainName,
    { dmarcResolver: input.dmarcResolver },
  );
  if (!verify.ok) {
    const msg = `deliverability gate failed: ${verify.failingRecords.join(", ")}${
      verify.error ? ` (${verify.error})` : ""
    }`;
    await input.appendError(input.date, {
      kind: "domain-verify",
      subject: build.body.subject,
      message: msg,
    });
    return {
      ok: false,
      reason: "domain-not-verified",
      message: msg,
      verify,
    };
  }

  const subscribers = await input.loadSubscribers();
  const recipients: DigestRecipient[] = subscribers.map((s) => ({
    emailHash: s.emailHash,
    email: s.email,
    unsubToken: s.unsubToken,
    geo: s.geo,
  }));

  // Pre-render per-recipient HTML. renderHtml is async (react-email
  // returns a Promise), but sendDigest's callback is sync by design, so
  // we memo into a map keyed by emailHash and have the sync callback
  // read from it. Done sequentially to keep memory predictable at 10k
  // recipients — each render allocates a DOM-ish tree.
  const rendered = new Map<string, string>();
  for (const recipient of recipients) {
    const unsubUrl = `${input.unsubBaseUrl}?token=${encodeURIComponent(recipient.unsubToken)}`;
    const html = await input.renderHtml({
      digest: build.body,
      baseUrl: input.baseUrl,
      unsubUrl,
      countryCode: recipient.geo.country,
    });
    rendered.set(recipient.emailHash, html);
  }

  const listId = buildListId(input.date, input.resendDomainName);

  const send = await sendDigest({
    recipients,
    from: input.from,
    subject: build.body.subject,
    unsubBaseUrl: input.unsubBaseUrl,
    unsubMailto: input.unsubMailto,
    listId,
    renderHtml: (recipient) => rendered.get(recipient.emailHash) ?? "",
    batchSender: input.batchSender,
    sleepFn: input.sleepFn,
    maxRetries: input.maxRetries,
    chunkSize: input.chunkSize,
    tags: [
      { name: "workflow", value: "daily-digest" },
      { name: "date", value: build.body.date },
      { name: "mode", value: build.body.mode },
    ],
    onBounce: async (recipient, message) => {
      await input.markBounced(recipient.emailHash);
      await input.appendError(input.date, {
        kind: "bounce",
        subject: build.body.subject,
        message,
        hash: recipient.emailHash,
      });
    },
    onChunkFailure: async (chunkIndex, err) => {
      const kind =
        err.statusCode >= 500 && err.statusCode < 600
          ? "batch-5xx"
          : err.statusCode >= 400 && err.statusCode < 500
            ? "batch-4xx"
            : "unknown";
      await input.appendError(input.date, {
        kind,
        subject: build.body.subject,
        message: `chunk ${chunkIndex}: ${err.message}`,
      });
    },
  });

  // Archive + idempotency marker on real delivery. A 0-recipient run
  // (no confirmed subscribers yet, or every chunk failed) still builds
  // a body but shouldn't earn a public /digest/{date} entry — and
  // shouldn't write the marker either, so a real subsequent run can
  // still try to deliver the day's digest.
  if (send.sent > 0) {
    await input.writeArchive(input.date, build.body);
    if (input.markSent) {
      await input.markSent(input.date, {
        sentAt: new Date(input.now).toISOString(),
        recipientCount: recipients.length,
        deliveredCount: send.sent,
        subject: build.body.subject,
      });
    }
  }

  return {
    ok: true,
    skipped: false,
    date: build.body.date,
    subject: build.body.subject,
    mode: build.body.mode,
    recipientCount: recipients.length,
    send,
  };
}

/** Build the List-ID header for the campaign. Kept as `digest-<date>.<domain>`
 *  so operators can filter inbox test runs by date. */
export function buildListId(date: string, domainName: string): string {
  return `digest-${date}.${domainName}`;
}
