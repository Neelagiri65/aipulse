"use client";

/**
 * ConsentBanner — first-visit prompt for covered jurisdictions.
 *
 * Render path:
 *   1. On mount, GET /api/consent. Server mints/returns the visitor id,
 *      reads stored state, and echoes whether Sec-GPC is set + whether
 *      this visitor is in a covered jurisdiction.
 *   2. shouldShowBanner() decides whether to render:
 *        - non-covered          → never show (analytics on by default)
 *        - Sec-GPC:1            → don't show (browser has pre-answered)
 *        - aip_consent cookie   → don't show (user has already chosen)
 *   3. On choice, POST /api/consent with the categories + action. The
 *      server writes the audit entry, sets the aip_consent cookie. We
 *      dismiss the banner client-side by the presence of that cookie.
 *
 * Visual: bottom-centre, non-modal, doesn't block page interaction.
 * Buttons: Reject all · Customise · Accept all. Customise opens the
 * preferences panel at /privacy/preferences in a new tab so the user
 * can keep reading the dashboard.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  normaliseCategories,
  shouldShowBanner,
  choiceToCategories,
} from "@/lib/consent-client";
import { readConsentCookie } from "@/lib/consent-cookies";
import type { ConsentCategories, ConsentAction } from "@/lib/data/consent";

type ConsentGetResponse = {
  ok: boolean;
  visitorId: string;
  categories: ConsentCategories;
  gpc: boolean;
  covered: boolean;
};

export function ConsentBanner() {
  const [state, setState] = useState<ConsentGetResponse | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Presence of aip_consent means the user answered previously.
    // Checked client-side so we don't even mount a flash of banner.
    if (typeof document !== "undefined") {
      const cookieSeen = readConsentCookie(document.cookie);
      if (cookieSeen) setHasInteracted(true);
    }
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
        setState(body);
      } catch {
        /* fail-soft: no banner if the endpoint is unreachable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(
    async (categories: ConsentCategories, action: ConsentAction) => {
      if (busy) return;
      setBusy(true);
      try {
        await fetch("/api/consent", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            analytics: categories.analytics,
            marketing: categories.marketing,
            action,
          }),
        });
        setHasInteracted(true);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  if (!state) return null;

  const show = shouldShowBanner({
    covered: state.covered,
    gpc: state.gpc,
    hasInteracted,
  });
  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and analytics consent"
      data-testid="consent-banner"
      className="fixed bottom-4 left-1/2 z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <h2 className="mb-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        Your privacy
      </h2>
      <p className="mb-3 text-sm text-foreground/90">
        AI Pulse uses a single analytics cookie to measure which panels
        people open — nothing else. We never sell data. You can change
        your mind any time at{" "}
        <a
          href="/privacy/preferences"
          className="underline underline-offset-2 hover:text-foreground"
        >
          /privacy/preferences
        </a>
        .
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            submit(
              normaliseCategories(choiceToCategories("reject-all")),
              "revoke",
            )
          }
          data-testid="consent-reject"
        >
          Reject all
        </Button>
        <a
          href="/privacy/preferences"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="consent-customise"
          className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
        >
          Customise
        </a>
        <Button
          variant="default"
          size="sm"
          disabled={busy}
          onClick={() =>
            submit(
              normaliseCategories(choiceToCategories("accept-all")),
              "grant",
            )
          }
          data-testid="consent-accept"
        >
          Accept all
        </Button>
      </div>
    </div>
  );
}
