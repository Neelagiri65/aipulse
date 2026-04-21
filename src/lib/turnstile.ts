/**
 * turnstile — server-side verification of Cloudflare Turnstile tokens.
 * Client widget produces a short-lived token; our /api/subscribe route
 * exchanges it against siteverify before accepting the submission.
 *
 * Fails closed on network errors (no soft-approve) because the gate
 * is our primary bot defence on the subscribe path.
 */

import { optionalEnv } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type VerifyInput = {
  token: string;
  remoteIp?: string | null;
  secret?: string;
  fetchImpl?: typeof fetch;
};

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "no-secret" | "no-token" | "rejected" | "network"; detail?: string };

type SiteverifyBody = {
  success: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstile(input: VerifyInput): Promise<VerifyOutcome> {
  if (!input.token) return { ok: false, reason: "no-token" };

  const secret = input.secret ?? optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) return { ok: false, reason: "no-secret" };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", input.token);
  if (input.remoteIp) form.set("remoteip", input.remoteIp);

  try {
    const impl = input.fetchImpl ?? fetch;
    const resp = await impl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!resp.ok) {
      return { ok: false, reason: "network", detail: `HTTP ${resp.status}` };
    }
    const body = (await resp.json()) as SiteverifyBody;
    if (!body.success) {
      return {
        ok: false,
        reason: "rejected",
        detail: (body["error-codes"] ?? []).join(",") || "unknown",
      };
    }
    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "network", detail };
  }
}
