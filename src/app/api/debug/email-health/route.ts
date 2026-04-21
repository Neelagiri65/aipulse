/**
 * /api/debug/email-health — auth-gated inspector for the email-capture
 * pipeline's configuration. Reports whether each moving part is
 * configured; Issue 4 will add live DNS lookups and the Resend
 * /domains probe. Dashboard surfaces should never call this — it's
 * for operator sanity only.
 *
 * Auth: same INGEST_SECRET header as cron routes. Probing config
 * status shouldn't require a new secret.
 */

import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FieldStatus = {
  configured: boolean;
  message: string;
};

function configStatus(name: string, present: boolean): FieldStatus {
  return {
    configured: present,
    message: present ? `${name} present` : `${name} not set`,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const required = process.env.INGEST_SECRET;
  if (!required) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured on server" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-ingest-secret");
  if (provided !== required) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const resendKey = optionalEnv("RESEND_API_KEY");
  const fromAddress = optionalEnv("EMAIL_FROM_ADDRESS");
  const dmarcRua = optionalEnv("DMARC_RUA_EMAIL");
  const turnstileSecret = optionalEnv("TURNSTILE_SECRET_KEY");
  const turnstileSite = optionalEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const tokenSecret = optionalEnv("TOKEN_SIGNING_SECRET");

  const probes = {
    resendApiKey: configStatus("RESEND_API_KEY", !!resendKey),
    fromAddress: configStatus("EMAIL_FROM_ADDRESS", !!fromAddress),
    dmarcRua: configStatus("DMARC_RUA_EMAIL", !!dmarcRua),
    turnstileSecret: configStatus("TURNSTILE_SECRET_KEY", !!turnstileSecret),
    turnstileSite: configStatus("NEXT_PUBLIC_TURNSTILE_SITE_KEY", !!turnstileSite),
    tokenSigningSecret: configStatus("TOKEN_SIGNING_SECRET", !!tokenSecret),
    spf: { configured: false, message: "DNS probe lands in Issue 4" },
    dkim: { configured: false, message: "DNS probe lands in Issue 4" },
    dmarcRecord: { configured: false, message: "DNS probe lands in Issue 4" },
    resendDomain: {
      configured: false,
      message: "Resend /domains probe lands in Issue 4",
    },
  };

  const degraded = Object.values(probes).filter((p) => !p.configured).length;

  return NextResponse.json({
    ok: degraded === 0,
    degradedFields: degraded,
    probes,
    checkedAt: new Date().toISOString(),
  });
}
