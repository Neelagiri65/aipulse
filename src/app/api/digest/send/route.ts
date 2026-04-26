/**
 * /api/digest/send — the daily digest cron endpoint.
 *
 * Flow:
 *   - Auth: INGEST_SECRET header (via `withIngest`), same gate as every
 *     other cron-triggered write in this repo.
 *   - Today's UTC date, previous-day for diffing.
 *   - sendDigestForDate wires the pure Issue 2-8 pieces: build composer,
 *     domain-verify hard-gate, subscriber load with decrypted plaintext,
 *     batch-send with 5xx retry, archive write on success.
 *   - Returns {date, subject, mode, recipientCount, send:{sent,bounced,
 *     errors,...}} for cron-health + observability.
 *
 * Required envs at run time:
 *   - INGEST_SECRET              — cron auth, shared across workflows.
 *   - SUBSCRIBER_EMAIL_ENC_KEY   — 32-byte hex key for decryption.
 *
 * Required for actual delivery (any missing → run is skipped with
 * reason:"resend-not-configured" and 200 so the cron stays green):
 *   - RESEND_API_KEY             — batch send + domains.get().
 *   - RESEND_DOMAIN_ID           — the registered domain on Resend.
 *   - EMAIL_FROM_ADDRESS         — "AI Pulse <digest@aipulse.dev>" format.
 *   - EMAIL_UNSUB_MAILTO         — mailto for the List-Unsubscribe header.
 *
 * Optional envs:
 *   - NEXT_PUBLIC_SITE_ORIGIN    — overrides the request-derived base URL
 *                                   for "View on AI Pulse" and unsub links.
 *
 * Route runtime is node (we need `node:crypto` for email decryption and
 * `node:dns/promises` for DMARC). maxDuration is 300s to cover large
 * batches — Resend's batch API returns quickly but we chain N chunks.
 */

import { NextResponse } from "next/server";
import { withIngest } from "@/app/api/_lib/withIngest";
import { ymdUtc } from "@/lib/data/snapshot";
import { readSnapshot } from "@/lib/data/snapshot";
import { readWire } from "@/lib/data/hn-store";
import { fetchIncidents24h } from "@/lib/digest/fetch-incidents-24h";
import { redisOpenRouterStore } from "@/lib/data/openrouter-store";
import {
  readConfirmedSubscribersWithEmail,
  updateSubscriberStatus,
} from "@/lib/data/subscribers";
import { decryptEmail } from "@/lib/mail/email-encryption";
import { writeDigestBody } from "@/lib/digest/archive";
import { appendDigestError } from "@/lib/digest/errors";
import { renderDigestHtml } from "@/lib/email/templates/digest";
import { extractSenderDomain } from "@/lib/email/resend";
import type { DomainClient } from "@/lib/digest/domain-verify";
import type { BatchSender, BatchSendResult } from "@/lib/digest/sender";
import {
  sendDigestForDate,
  type SendDigestForDateResult,
} from "@/lib/digest/send-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteResult =
  | SendDigestForDateResult
  | {
      ok: false;
      reason: "resend-not-configured";
      message: string;
      missing: string[];
    };

export const POST = withIngest<RouteResult>({
  workflow: "daily-digest",
  run: async (request: Request) => {
    const date = ymdUtc();
    const now = new Date();

    const from = process.env.EMAIL_FROM_ADDRESS;
    const apiKey = process.env.RESEND_API_KEY;
    const domainId = process.env.RESEND_DOMAIN_ID;
    const unsubMailto = process.env.EMAIL_UNSUB_MAILTO;

    if (!from || !apiKey || !domainId || !unsubMailto) {
      const missing: string[] = [];
      if (!from) missing.push("EMAIL_FROM_ADDRESS");
      if (!apiKey) missing.push("RESEND_API_KEY");
      if (!domainId) missing.push("RESEND_DOMAIN_ID");
      if (!unsubMailto) missing.push("EMAIL_UNSUB_MAILTO");
      return {
        ok: false,
        reason: "resend-not-configured",
        message: `daily digest paused — sender domain not yet wired through Resend. Missing env: ${missing.join(", ")}.`,
        missing,
      };
    }

    const domainName = extractSenderDomain(from);
    if (!domainName) {
      throw new Error(
        `EMAIL_FROM_ADDRESS "${from}" is malformed — cannot extract sender domain`,
      );
    }

    const baseUrl = inferBaseUrl(request);
    const unsubBaseUrl = `${baseUrl}/api/subscribe/unsubscribe`;

    const resendDomains = await buildResendDomainsClient(apiKey);
    const batchSender = await buildResendBatchSender(apiKey);

    return sendDigestForDate({
      date,
      now,
      from,
      unsubBaseUrl,
      unsubMailto,
      baseUrl,
      resendDomains,
      resendDomainId: domainId,
      resendDomainName: domainName,
      loadSnapshot: (d) => readSnapshot(d),
      loadHn: () => readWire(),
      loadIncidents24h: () => fetchIncidents24h({ now: now.getTime() }),
      loadModelUsageSnapshots: () => redisOpenRouterStore.readSnapshots(),
      loadSubscribers: () =>
        readConfirmedSubscribersWithEmail({ decrypt: decryptEmail }),
      batchSender,
      renderHtml: (args) => renderDigestHtml(args),
      writeArchive: (d, body) => writeDigestBody(d, body),
      appendError: async (d, entry) =>
        appendDigestError(d, {
          ...entry,
          kind: normaliseErrorKind(entry.kind),
          at: new Date().toISOString(),
        }),
      markBounced: async (hash) => {
        await updateSubscriberStatus(hash, {
          status: "unsubscribed",
          unsubscribedAt: new Date().toISOString(),
          encryptedEmail: null,
          lastDeliveryError: "bounced during digest send",
        });
      },
    });
  },
  toOutcome: (result) => {
    if (!result.ok) {
      // Skipped runs (Resend not yet configured) are intentionally ok in
      // cron-health terms — the workflow is paused, not broken. Surfacing
      // them as failures pollutes the GitHub profile activity feed and
      // hides the real signal once Resend is live.
      if (result.reason === "resend-not-configured") {
        return { ok: true, itemsProcessed: 0 };
      }
      return { ok: false, error: `${result.reason}: ${result.message}` };
    }
    if (result.send.failedChunks > 0 && result.send.sent === 0) {
      return {
        ok: false,
        error: `all ${result.send.attemptedChunks} batch chunks failed`,
      };
    }
    return { ok: true, itemsProcessed: result.send.sent };
  },
  toResponse: (result) => {
    if (!result.ok) {
      if (result.reason === "resend-not-configured") {
        return NextResponse.json(
          {
            ok: false,
            reason: result.reason,
            message: result.message,
            missing: result.missing,
          },
          { status: 200 },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          message: result.message,
          verify: result.verify,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      date: result.date,
      subject: result.subject,
      mode: result.mode,
      recipientCount: result.recipientCount,
      sent: result.send.sent,
      bounced: result.send.bounced,
      attemptedChunks: result.send.attemptedChunks,
      failedChunks: result.send.failedChunks,
      errors: result.send.errors,
    });
  },
});

export const GET = POST;

function inferBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://aipulse.dev";
  }
}

async function buildResendDomainsClient(apiKey: string): Promise<DomainClient> {
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  return {
    get: (id) =>
      client.domains.get(id) as ReturnType<DomainClient["get"]>,
  };
}

async function buildResendBatchSender(apiKey: string): Promise<BatchSender> {
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  return {
    sendBatch: async (payload): Promise<BatchSendResult> => {
      try {
        const { data, error } = await client.batch.send(
          payload.map((p) => ({
            from: p.from,
            to: p.to,
            subject: p.subject,
            html: p.html,
            headers: p.headers,
            tags: p.tags,
          })),
        );
        if (error) {
          const statusCode = error.statusCode ?? 0;
          const message = error.message ?? String(error);
          return { ok: false, statusCode, message };
        }
        const ids = (data?.data ?? [])
          .map((d) => d.id)
          .filter((s): s is string => typeof s === "string" && s.length > 0);
        return { ok: true, ids };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, statusCode: 0, message };
      }
    },
  };
}

const VALID_KINDS = new Set([
  "domain-verify",
  "batch-5xx",
  "batch-4xx",
  "bounce",
  "unknown",
]);

function normaliseErrorKind(
  kind: string,
): "domain-verify" | "batch-5xx" | "batch-4xx" | "bounce" | "unknown" {
  if (VALID_KINDS.has(kind)) {
    return kind as
      | "domain-verify"
      | "batch-5xx"
      | "batch-4xx"
      | "bounce"
      | "unknown";
  }
  return "unknown";
}
