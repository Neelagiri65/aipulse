/**
 * env — typed access for process.env entries introduced by the
 * email-capture + consent pipeline (session 33 onwards). Pre-existing
 * env reads (UPSTASH_*, INGEST_SECRET, GH_TOKEN) stay inline in their
 * original modules — this file is additive, not a migration.
 *
 * `requireEnv` throws on missing. Use for write-side paths where a
 * missing secret is a configuration bug (Resend send, consent write).
 *
 * `optionalEnv` returns undefined. Use for read-side probes and the
 * debug endpoint, so the dashboard reports "degraded" instead of 500.
 */

export type EnvVarName =
  | "RESEND_API_KEY"
  | "TURNSTILE_SECRET_KEY"
  | "NEXT_PUBLIC_TURNSTILE_SITE_KEY"
  | "EMAIL_FROM_ADDRESS"
  | "TOKEN_SIGNING_SECRET"
  | "DMARC_RUA_EMAIL"
  | "NEXT_PUBLIC_BETA_ENABLED"
  | "INGEST_SECRET"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN";

export function requireEnv(name: EnvVarName): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`missing required env var: ${name}`);
  }
  return v;
}

export function optionalEnv(name: EnvVarName): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return undefined;
  return v;
}
