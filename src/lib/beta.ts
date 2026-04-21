/**
 * beta gate — controls whether the email-capture modal is visible to
 * a given visitor. Stays "off" until session 34 ships the daily digest;
 * capturing addresses before there's a digest to send is a broken
 * promise.
 *
 * Evaluation order:
 *   1. NEXT_PUBLIC_BETA_ENABLED === "all"     → on for everyone.
 *   2. `?beta=1` in the request URL            → on (middleware sets a
 *      sticky cookie so subsequent visits stay on without the param).
 *   3. `aip_beta` cookie present on request   → on.
 *   4. Otherwise                               → off.
 *
 * No other cookie values count — the presence check is deliberate so
 * the cookie can be deleted to opt back out.
 */

export const BETA_COOKIE_NAME = "aip_beta";
export const BETA_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export type BetaSignals = {
  envFlag?: string;
  url?: string | URL;
  cookieHeader?: string | null;
};

export function isBetaEnabled(signals: BetaSignals): boolean {
  const envFlag = signals.envFlag ?? process.env.NEXT_PUBLIC_BETA_ENABLED;
  if (envFlag === "all") return true;

  if (signals.url !== undefined) {
    try {
      const url = typeof signals.url === "string"
        ? new URL(signals.url)
        : signals.url;
      if (url.searchParams.get("beta") === "1") return true;
    } catch {
      // malformed URL → treat as no beta param, fall through
    }
  }

  if (signals.cookieHeader) {
    if (hasCookie(signals.cookieHeader, BETA_COOKIE_NAME)) return true;
  }

  return false;
}

export function hasCookie(cookieHeader: string, name: string): boolean {
  const needle = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    if (part.trim().startsWith(needle)) return true;
  }
  return false;
}
