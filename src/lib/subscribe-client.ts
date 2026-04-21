/**
 * subscribe-client — pure logic for the email-capture modal.
 *
 * Keeping the decision rules here (should we show the prompt? is the
 * consent sequence satisfied? has the user already answered?) means the
 * modal component stays a thin shell that renders whatever this module
 * decides. Every branch is unit-tested without React.
 *
 * The rules encode the product contract for the modal:
 *   1. Beta gate must be on (S33 ships email capture gated; the modal
 *      is invisible in production until S34 lands the digest it will
 *      feed).
 *   2. The visitor must not already be subscribed (local flag set after
 *      a successful POST /api/subscribe).
 *   3. The visitor must not have dismissed the modal in this device
 *      (local flag + cookie; "not now" counts as a refusal).
 *   4. For covered jurisdictions, consent must be resolved — either the
 *      user has answered the banner (aip_consent cookie present) or
 *      Sec-GPC has decided for them. Non-covered visitors aren't gated.
 *      This keeps us from double-asking: banner first, then modal.
 *   5. An elapsed-time gate so the prompt doesn't fire the instant the
 *      page mounts. 5s is long enough to get past the initial read of
 *      the observatory stage, short enough that most visitors are still
 *      engaged.
 */

export const SUBSCRIBE_DISMISSED_COOKIE = "aip_subscribe_dismissed";
export const SUBSCRIBE_SUBSCRIBED_COOKIE = "aip_subscribed";
export const SUBSCRIBE_PROMPT_DELAY_MS = 5000;

export type SubscribePromptInputs = {
  /** Is the beta cookie (or env flag, or ?beta=1) on for this visitor? */
  betaEnabled: boolean;
  /** Has this visitor already submitted an address (from cookie)? */
  hasSubscribed: boolean;
  /** Has this visitor dismissed the modal this device (from cookie)? */
  hasDismissed: boolean;
  /** Is the consent question resolved for this visitor?
   *  - Non-covered visitor → always true (no banner shown).
   *  - Covered + Sec-GPC set → true (browser answered).
   *  - Covered + aip_consent cookie present → true (user answered).
   *  - Covered + banner still showing → false. */
  consentResolved: boolean;
  /** Milliseconds since page mounted. */
  elapsedMs: number;
};

export function shouldShowSubscribePrompt(
  input: SubscribePromptInputs,
): boolean {
  if (!input.betaEnabled) return false;
  if (input.hasSubscribed) return false;
  if (input.hasDismissed) return false;
  if (!input.consentResolved) return false;
  if (input.elapsedMs < SUBSCRIBE_PROMPT_DELAY_MS) return false;
  return true;
}

/**
 * Derive whether the consent question is resolved from the signals we
 * fetch via GET /api/consent. Kept separate from shouldShowSubscribePrompt
 * so the modal can show the form immediately on /subscribe (direct URL
 * visit), where we still want the consent check but no elapsed-time gate.
 */
export function isConsentResolved(input: {
  covered: boolean;
  gpc: boolean;
  hasAnswered: boolean;
}): boolean {
  if (!input.covered) return true;
  if (input.gpc) return true;
  if (input.hasAnswered) return true;
  return false;
}

export type SubscribeFormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent"; email: string }
  | { kind: "already" }
  | { kind: "error"; message: string };

/**
 * Map a POST /api/subscribe response body into a form state. Single
 * place the UI looks up copy from, so the modal and /subscribe page
 * show the exact same messaging for the same server outcome.
 */
export function responseToFormState(
  response: { ok: boolean; status?: string; error?: { code?: string; message?: string } } | null,
  submittedEmail: string,
): SubscribeFormState {
  if (!response) {
    return {
      kind: "error",
      message: "Couldn't reach the server. Try again in a moment.",
    };
  }
  if (response.ok) {
    if (response.status === "already_confirmed") return { kind: "already" };
    return { kind: "sent", email: submittedEmail };
  }
  const code = response.error?.code;
  if (code === "INVALID_EMAIL") {
    return { kind: "error", message: "That address doesn't look right." };
  }
  if (code === "RATE_LIMITED") {
    return {
      kind: "error",
      message: "Too many attempts from this connection. Try again in an hour.",
    };
  }
  if (code === "TURNSTILE_FAILED") {
    return {
      kind: "error",
      message: "Captcha didn't verify. Refresh the page and try again.",
    };
  }
  if (code === "DELIVERY_QUEUED" || code === "DELIVERY_FATAL") {
    return {
      kind: "error",
      message:
        "We couldn't send the confirmation email just now. Try again, or email us directly if it persists.",
    };
  }
  return {
    kind: "error",
    message: response.error?.message ?? "Something went wrong. Try again.",
  };
}

function hasCookie(cookieHeader: string, name: string): boolean {
  const needle = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    if (part.trim().startsWith(needle)) return true;
  }
  return false;
}

export function readSubscribeCookies(cookieHeader: string | null | undefined): {
  hasSubscribed: boolean;
  hasDismissed: boolean;
} {
  if (!cookieHeader) return { hasSubscribed: false, hasDismissed: false };
  return {
    hasSubscribed: hasCookie(cookieHeader, SUBSCRIBE_SUBSCRIBED_COOKIE),
    hasDismissed: hasCookie(cookieHeader, SUBSCRIBE_DISMISSED_COOKIE),
  };
}
