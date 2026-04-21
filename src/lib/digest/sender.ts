/**
 * Digest sender — orchestrates the hard-gate → chunk → batch-send flow.
 *
 * Contract:
 *   1. Preconditions checked by caller (domain-verify ok, body composed).
 *      `sendDigest` itself does not re-verify the domain.
 *   2. Recipients are chunked at ≤100/batch (Resend cap).
 *   3. Each chunk is sent through `batchSender.sendBatch(payload)`.
 *   4. On 5xx: retry up to `maxRetries` (default 3) with backoff.
 *      On 4xx: the whole chunk is marked as failed; individual emails
 *      that Resend returns as bounced are extracted into `bounced[]`.
 *   5. Per-subscriber bounces flip the subscriber to `unsubscribed`
 *      status via `onBounce` — the sender doesn't talk to Redis
 *      directly, that's the route's business.
 *
 * Returns aggregate counts so the caller can record cron-health.
 */

import { buildBatchPayload, chunkForBatch, type DigestRecipient } from "@/lib/digest/batch";

export type BatchSendSuccess = {
  ok: true;
  /** Resend returns the list of created email ids, in recipient order. */
  ids: string[];
};

export type BatchSendFailure = {
  ok: false;
  statusCode: number;
  message: string;
  /** When the error is per-recipient (permissive validation), Resend
   *  exposes the failing indexes so the sender can mark specific
   *  addresses as bounced. */
  perEmailErrors?: Array<{ index: number; message: string }>;
};

export type BatchSendResult = BatchSendSuccess | BatchSendFailure;

export type BatchSender = {
  sendBatch: (
    payload: ReturnType<typeof buildBatchPayload>,
  ) => Promise<BatchSendResult>;
};

export type SendDigestInput = {
  recipients: readonly DigestRecipient[];
  from: string;
  subject: string;
  unsubBaseUrl: string;
  unsubMailto: string;
  listId: string;
  renderHtml: (recipient: DigestRecipient) => string;
  batchSender: BatchSender;
  /** Callback for per-recipient bounces. Route uses this to flip the
   *  subscriber record to `unsubscribed` + clear `encryptedEmail`. */
  onBounce?: (recipient: DigestRecipient, message: string) => Promise<void>;
  /** Callback for non-retryable chunk failures (after retries). Route
   *  uses this to record a digest:errors entry. */
  onChunkFailure?: (chunkIndex: number, err: BatchSendFailure) => Promise<void>;
  /** Seam for tests to avoid wall-clock delays. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Seam for tests. */
  now?: () => number;
  maxRetries?: number;
  tags?: Array<{ name: string; value: string }>;
  chunkSize?: number;
};

export type SendDigestResult = {
  sent: number;
  bounced: string[];
  errors: Array<{ hash?: string; message: string }>;
  attemptedChunks: number;
  failedChunks: number;
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CHUNK_SIZE = 100;

export async function sendDigest(
  input: SendDigestInput,
): Promise<SendDigestResult> {
  const sleep = input.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;

  const result: SendDigestResult = {
    sent: 0,
    bounced: [],
    errors: [],
    attemptedChunks: 0,
    failedChunks: 0,
  };

  const chunks = chunkForBatch(input.recipients, input.chunkSize ?? DEFAULT_CHUNK_SIZE);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const payload = buildBatchPayload(chunk, {
      from: input.from,
      subject: input.subject,
      unsubBaseUrl: input.unsubBaseUrl,
      unsubMailto: input.unsubMailto,
      listId: input.listId,
      renderHtml: input.renderHtml,
      tags: input.tags,
    });

    result.attemptedChunks += 1;
    let lastErr: BatchSendFailure | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const r = await input.batchSender.sendBatch(payload);
      if (r.ok) {
        result.sent += chunk.length;
        lastErr = null;
        break;
      }
      lastErr = r;
      const retryable = r.statusCode >= 500 && r.statusCode < 600;
      if (!retryable || attempt === maxRetries) break;
      // Exponential backoff: 500ms, 1s, 2s.
      await sleep(500 * 2 ** attempt);
    }

    if (lastErr) {
      result.failedChunks += 1;
      if (lastErr.statusCode >= 400 && lastErr.statusCode < 500 && lastErr.perEmailErrors) {
        for (const pe of lastErr.perEmailErrors) {
          const recipient = chunk[pe.index];
          if (!recipient) continue;
          result.bounced.push(recipient.emailHash);
          if (input.onBounce) await input.onBounce(recipient, pe.message);
          result.errors.push({ hash: recipient.emailHash, message: pe.message });
        }
        // Count the ones that did succeed in a permissive batch.
        const failedIndexes = new Set(lastErr.perEmailErrors.map((p) => p.index));
        result.sent += chunk.length - failedIndexes.size;
      } else {
        result.errors.push({ message: lastErr.message });
      }
      if (input.onChunkFailure) await input.onChunkFailure(ci, lastErr);
    }
  }

  return result;
}
