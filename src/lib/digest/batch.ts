/**
 * Batch-payload construction for Resend's batch send API.
 *
 * Pure. Takes a chunk of recipients and the rendered body, returns the
 * plain-JSON payload array Resend expects. Unsub links are per-recipient
 * and embedded both in the RFC 8058 `List-Unsubscribe` header *and* in
 * the HTML body (rendered upstream via `renderHtml`). Gmail's one-click
 * unsub only fires when both headers are present.
 *
 * The HTML renderer is a callback so Issue 5 can land before Issue 6's
 * react-email template does — tests pass a fake renderer, production
 * supplies the compiled template.
 */

export type DigestRecipient = {
  emailHash: string;
  email: string;
  unsubToken: string;
  geo: { country: string | null; region: string | null; covered: boolean };
};

export type DigestBatchItem = {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

export type BuildBatchPayloadOpts = {
  from: string;
  subject: string;
  /** Absolute URL to the one-click unsubscribe handler, without query
   *  string. The recipient's token is appended. */
  unsubBaseUrl: string;
  /** mailto: address for the RFC 2369 alternate unsub mechanism. */
  unsubMailto: string;
  renderHtml: (recipient: DigestRecipient) => string;
  /** Optional operational tags Resend exposes in its webhooks/logs. */
  tags?: Array<{ name: string; value: string }>;
  /** Short campaign/date id for the List-ID header. Example:
   *  "digest-2026-04-22.gawk.dev". */
  listId: string;
};

/** Deterministically split a large recipient list into chunks for
 *  Resend's 100-email-per-batch API cap. */
export function chunkForBatch<T>(items: readonly T[], size = 100): T[][] {
  if (size <= 0) return [];
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildBatchPayload(
  recipients: readonly DigestRecipient[],
  opts: BuildBatchPayloadOpts,
): DigestBatchItem[] {
  return recipients.map((r) => buildBatchItem(r, opts));
}

/**
 * Strip CR, LF and null from any value destined for an email header.
 *
 * Resend (and SMTP generally) rejects the *entire* batch if any header
 * key or value contains a carriage return, line feed, or null character:
 * "Header keys and values cannot contain carriage return, line feed, or
 * null characters." The usual source is an env var saved with a trailing
 * newline (e.g. `NEXT_PUBLIC_SITE_ORIGIN`) that becomes *internal* once
 * interpolated into a URL ("https://gawk.dev\n/api/subscribe/..."), so a
 * trailing-only `.trim()` at the env read site is not enough — by the
 * time it reaches the header the newline is mid-string. This chokepoint
 * strips every occurrence regardless of which upstream input was dirty,
 * and doubles as standard header-injection hardening (CRLF in from/to/
 * subject is the classic injection vector). Clean values pass through
 * unchanged.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\u0000]/g, "");
}

export function buildBatchItem(
  recipient: DigestRecipient,
  opts: BuildBatchPayloadOpts,
): DigestBatchItem {
  const unsubUrl = `${opts.unsubBaseUrl}?token=${encodeURIComponent(recipient.unsubToken)}`;
  const headers: Record<string, string> = {
    "List-ID": sanitizeHeaderValue(opts.listId),
    "List-Unsubscribe": sanitizeHeaderValue(`<${unsubUrl}>, <${opts.unsubMailto}>`),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return {
    from: sanitizeHeaderValue(opts.from),
    to: sanitizeHeaderValue(recipient.email),
    subject: sanitizeHeaderValue(opts.subject),
    html: opts.renderHtml(recipient),
    headers,
    tags: opts.tags,
  };
}
