"use client";

/**
 * SubscribeModal — bottom-right floating prompt for the daily digest.
 *
 * The component assumes the beta gate has already decided "yes" (parent
 * only mounts when isBetaEnabled is true); it then runs through the
 * consent-sequence + elapsed-time + dismissed-cookie checks in
 * shouldShowSubscribePrompt and renders the form when all gates pass.
 *
 * Consent sequencing: we wait for GET /api/consent to return before we
 * even evaluate whether to render. That RPC always resolves quickly;
 * meanwhile the 5s elapsed-time gate is ticking. If the visitor is in a
 * covered jurisdiction and hasn't answered the banner, consentResolved
 * stays false and the modal never mounts — the banner gets first pass.
 *
 * Dismissed = "not now". Writing the aip_subscribe_dismissed cookie on
 * close rather than on route change means the refusal persists across
 * navigation; one year so it doesn't feel nagging.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubscribeForm } from "./SubscribeForm";
import { readConsentCookie } from "@/lib/consent-cookies";
import {
  SUBSCRIBE_DISMISSED_COOKIE,
  isConsentResolved,
  readSubscribeCookies,
  shouldShowSubscribePrompt,
} from "@/lib/subscribe-client";

type ConsentGetResponse = {
  ok: boolean;
  visitorId: string;
  gpc: boolean;
  covered: boolean;
};

export function SubscribeModal(): React.JSX.Element | null {
  const [consent, setConsent] = useState<ConsentGetResponse | null>(null);
  const [consentAnswered, setConsentAnswered] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [localDismissed, setLocalDismissed] = useState(false);
  const [localSubscribed, setLocalSubscribed] = useState(false);
  const mountedAtRef = useRef<number>(Date.now());

  // Read cookie state once on mount, plus start the elapsed-time ticker.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const { hasSubscribed, hasDismissed } = readSubscribeCookies(
      document.cookie,
    );
    setLocalSubscribed(hasSubscribed);
    setLocalDismissed(hasDismissed);
    setConsentAnswered(Boolean(readConsentCookie(document.cookie)));
    mountedAtRef.current = Date.now();
    const t = setInterval(() => {
      setElapsedMs(Date.now() - mountedAtRef.current);
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Fetch consent state once, so we know covered + gpc. Fails soft —
  // if the endpoint is unreachable we don't surface the modal; the
  // covered==undefined path keeps consentResolved=false which hides the
  // modal. That's the safer failure mode than popping over a banner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/consent", {
          method: "GET",
          credentials: "include",
        });
        if (!r.ok) return;
        const body = (await r.json()) as ConsentGetResponse;
        if (cancelled) return;
        setConsent(body);
      } catch {
        /* fail-soft: modal stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-check the aip_consent cookie as it lands (the banner may answer
  // mid-session). Poll sparingly — 1s is enough to let the banner close
  // and the modal take its place without feeling laggy.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (consentAnswered) return;
    const t = setInterval(() => {
      if (readConsentCookie(document.cookie)) {
        setConsentAnswered(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [consentAnswered]);

  const dismiss = useCallback(() => {
    if (typeof document !== "undefined") {
      document.cookie = `${SUBSCRIBE_DISMISSED_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    setLocalDismissed(true);
  }, []);

  if (!consent) return null;

  const consentResolved = isConsentResolved({
    covered: consent.covered,
    gpc: consent.gpc,
    hasAnswered: consentAnswered,
  });

  const show = shouldShowSubscribePrompt({
    betaEnabled: true, // parent gates on this already
    hasSubscribed: localSubscribed,
    hasDismissed: localDismissed,
    consentResolved,
    elapsedMs,
  });

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Subscribe to the AI Pulse daily digest"
      data-testid="subscribe-modal"
      className="fixed bottom-6 right-6 z-40 w-[min(360px,calc(100%-3rem))] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Daily digest · beta
          </h2>
          <p className="mt-1 text-sm font-medium text-foreground">
            One email. What shipped, what broke.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss subscribe prompt"
          data-testid="subscribe-dismiss"
          onClick={dismiss}
        >
          ×
        </Button>
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Models released, benchmarks shifted, labs hiring — pulled from the
        same feeds you see here, summarised once a day. One-click
        unsubscribe on every email.
      </p>
      <SubscribeForm variant="compact" />
    </div>
  );
}
