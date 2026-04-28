/**
 * resend — thin wrapper around the Resend SDK for the two emails the
 * subscribe flow sends today: the double-opt-in confirm and the
 * unsubscribe receipt. Broadcast / digest paths land in session 34.
 *
 * Fail-soft on Resend API errors:
 *   - On 5xx / network failure, return {ok: false, queued: true} so
 *     the caller preserves the subscriber's pending status and can
 *     retry.
 *   - On 4xx (validation / auth), return {ok: false, fatal: true}
 *     so the caller surfaces the error to the operator.
 *
 * Tests inject a custom `sender` shaped like the Resend emails API.
 */

import type { ReactElement } from "react";
import ConfirmEmail from "@/lib/email/templates/confirm";
import UnsubscribeReceipt from "@/lib/email/templates/unsub";

export type SendOptions = {
  from: string;
  to: string;
  subject: string;
  react: ReactElement;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; queued: true; error: string }
  | { ok: false; fatal: true; error: string };

export type EmailSender = {
  send(options: SendOptions): Promise<SendResult>;
};

let cachedDefault: EmailSender | null | undefined;

function defaultSender(): EmailSender | null {
  if (cachedDefault !== undefined) return cachedDefault;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    cachedDefault = null;
    return cachedDefault;
  }
  cachedDefault = buildResendSender(apiKey);
  return cachedDefault;
}

export function __resetResendSenderCache(): void {
  cachedDefault = undefined;
}

type SendInput = {
  to: string;
  confirmUrl: string;
  unsubUrl: string;
  sender?: EmailSender;
};

export async function sendConfirm(input: SendInput): Promise<SendResult> {
  const sender = input.sender ?? defaultSender();
  if (!sender) {
    return { ok: false, queued: true, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.EMAIL_FROM_ADDRESS ?? "Gawk <digest@example.invalid>";
  return sender.send({
    from,
    to: input.to,
    subject: "Confirm your Gawk subscription",
    react: ConfirmEmail({
      confirmUrl: input.confirmUrl,
      unsubUrl: input.unsubUrl,
    }),
  });
}

type UnsubInput = {
  to: string;
  resubscribeUrl: string;
  sender?: EmailSender;
};

export async function sendUnsubscribeReceipt(
  input: UnsubInput,
): Promise<SendResult> {
  const sender = input.sender ?? defaultSender();
  if (!sender) {
    return { ok: false, queued: true, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.EMAIL_FROM_ADDRESS ?? "Gawk <digest@example.invalid>";
  return sender.send({
    from,
    to: input.to,
    subject: "You have unsubscribed from Gawk",
    react: UnsubscribeReceipt({ resubscribeUrl: input.resubscribeUrl }),
  });
}

/**
 * buildResendSender — wraps the Resend SDK's `emails.send` into our
 * narrow SendResult shape. Separated so tests can skip the SDK entirely
 * by passing a handwritten sender.
 */
function buildResendSender(apiKey: string): EmailSender {
  return {
    async send(options: SendOptions): Promise<SendResult> {
      try {
        const { Resend } = await import("resend");
        const client = new Resend(apiKey);
        const { data, error } = await client.emails.send({
          from: options.from,
          to: options.to,
          subject: options.subject,
          react: options.react,
        });
        if (error) {
          const message = (error as { message?: string }).message ?? String(error);
          const status = (error as { statusCode?: number }).statusCode;
          if (status && status >= 500) {
            return { ok: false, queued: true, error: message };
          }
          return { ok: false, fatal: true, error: message };
        }
        const id = data?.id ?? "";
        return { ok: true, id };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, queued: true, error: message };
      }
    },
  };
}

/**
 * Extract the domain from an `EMAIL_FROM_ADDRESS` value, handling both
 * `"Name <user@domain>"` and `user@domain` formats. Returns null on
 * malformed input.
 */
export function extractSenderDomain(fromAddress: string): string | null {
  const match = fromAddress.match(/<([^>]+)>/);
  const address = match ? match[1] : fromAddress.trim();
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return null;
  return address.slice(at + 1).trim().toLowerCase();
}
