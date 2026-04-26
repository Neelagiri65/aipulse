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
import type { HistoricalIncident } from "@/lib/data/status-history";
import type { ModelUsageSnapshotRow } from "@/lib/data/openrouter-types";
import type { ConfirmedSubscriberWithEmail } from "@/lib/data/subscribers";

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
  loadIncidents24h: () => Promise<HistoricalIncident[]>;
  /** Optional — see BuildDigestOpts.loadModelUsageSnapshots. */
  loadModelUsageSnapshots?: () => Promise<
    Record<string, ModelUsageSnapshotRow>
  >;
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
      date: string;
      subject: string;
      mode: DigestBody["mode"];
      recipientCount: number;
      send: SendDigestResult;
    };

export async function sendDigestForDate(
  input: SendDigestForDateInput,
): Promise<SendDigestForDateResult> {
  const build = await buildDigestForDate({
    date: input.date,
    previousDate: previousUtcDate(input.date),
    now: input.now,
    loadSnapshot: input.loadSnapshot,
    loadHn: input.loadHn,
    loadIncidents24h: input.loadIncidents24h,
    loadModelUsageSnapshots: input.loadModelUsageSnapshots,
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

  // Archive only when we actually delivered something. A 0-recipient run
  // (no confirmed subscribers yet) still builds a body but shouldn't earn
  // a public /digest/{date} entry — that'd imply a send that never happened.
  if (send.sent > 0) {
    await input.writeArchive(input.date, build.body);
  }

  return {
    ok: true,
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
