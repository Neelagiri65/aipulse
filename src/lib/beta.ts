/**
 * beta gate — controls whether the email-capture modal is visible to
 * a given visitor.
 *
 * As of Session 34 (digest send shipped) the default is ON. The gate
 * still exists so `NEXT_PUBLIC_BETA_ENABLED="off"` can kill-switch the
 * subscribe surface if we need to pull it fast; explicit query/cookie
 * overrides still turn it on during a kill-switched incident so the
 * operator can test a fix against production without rolling env.
 *
 * Evaluation order:
 *   1. NEXT_PUBLIC_BETA_ENABLED === "off" AND no override signal → off.
 *   2. `?beta=1` in the request URL              → on (middleware sets
 *      a sticky cookie so subsequent visits stay on without the param).
 *   3. `aip_beta` cookie present                  → on.
 *   4. Otherwise (env is "all", undefined, or anything else)  → on.
 *
 * The previous gate (envFlag === "all" → on, else → off) gave us a
 * tight beta-window during sessions 33/34 when subscribe captured
 * addresses but there was no digest to send. That constraint is gone.
 */

export const BETA_COOKIE_NAME = "aip_beta";
export const BETA_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export type BetaSignals = {
  envFlag?: string;
  url?: string | URL;
  cookieHeader?: string | null;
};

export function isBetaEnabled(signals: BetaSignals): boolean {
  const hasOverride = hasBetaOverride(signals);
  if (hasOverride) return true;

  const envFlag = signals.envFlag ?? process.env.NEXT_PUBLIC_BETA_ENABLED;
  if (envFlag === "off") return false;

  return true;
}

function hasBetaOverride(signals: BetaSignals): boolean {
  if (signals.url !== undefined) {
    try {
      const url =
        typeof signals.url === "string" ? new URL(signals.url) : signals.url;
      if (url.searchParams.get("beta") === "1") return true;
    } catch {
      // malformed URL → fall through to other signals
    }
  }

  if (signals.cookieHeader && hasCookie(signals.cookieHeader, BETA_COOKIE_NAME)) {
    return true;
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
