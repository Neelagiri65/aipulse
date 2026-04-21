/**
 * /api/debug/email-health — auth-gated inspector for the email-capture
 * pipeline. Reports env configuration + live DNS lookups (SPF / DKIM /
 * DMARC) + Resend domain status. Intended for operator ops, never for
 * dashboard surfaces.
 *
 * Auth: same INGEST_SECRET header as cron routes.
 */

import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { extractSenderDomain } from "@/lib/email/resend";
import {
  probeDkim,
  probeDmarc,
  probeResendDomain,
  probeSpf,
  type ProbeResult,
} from "@/lib/email/dns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function configStatus(name: string, present: boolean): ProbeResult {
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

  const domain = fromAddress ? extractSenderDomain(fromAddress) : null;

  const [spf, dkim, dmarcRec, resendDomain] = await Promise.all([
    domain
      ? probeSpf(domain)
      : Promise.resolve<ProbeResult>({
          configured: false,
          message: "EMAIL_FROM_ADDRESS not set — no domain to probe",
        }),
    domain
      ? probeDkim(domain)
      : Promise.resolve<ProbeResult>({
          configured: false,
          message: "EMAIL_FROM_ADDRESS not set — no domain to probe",
        }),
    domain
      ? probeDmarc(domain)
      : Promise.resolve<ProbeResult>({
          configured: false,
          message: "EMAIL_FROM_ADDRESS not set — no domain to probe",
        }),
    domain
      ? probeResendDomain(domain, resendKey)
      : Promise.resolve<ProbeResult>({
          configured: false,
          message: "EMAIL_FROM_ADDRESS not set — no domain to probe",
        }),
  ]);

  const probes = {
    resendApiKey: configStatus("RESEND_API_KEY", !!resendKey),
    fromAddress: configStatus("EMAIL_FROM_ADDRESS", !!fromAddress),
    dmarcRua: configStatus("DMARC_RUA_EMAIL", !!dmarcRua),
    turnstileSecret: configStatus("TURNSTILE_SECRET_KEY", !!turnstileSecret),
    turnstileSite: configStatus("NEXT_PUBLIC_TURNSTILE_SITE_KEY", !!turnstileSite),
    tokenSigningSecret: configStatus("TOKEN_SIGNING_SECRET", !!tokenSecret),
    spf,
    dkim,
    dmarcRecord: dmarcRec,
    resendDomain,
  };

  const degraded = Object.values(probes).filter((p) => !p.configured).length;

  return NextResponse.json({
    ok: degraded === 0,
    degradedFields: degraded,
    domain,
    probes,
    checkedAt: new Date().toISOString(),
  });
}
