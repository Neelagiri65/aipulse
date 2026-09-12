"use client";

/**
 * McpPromptModal — bottom-right prompt pointing at mcp.gawk.dev.
 *
 * gawk.dev answers "is the AI ecosystem working right now". mcpgawk is the
 * gateway that sits in front of the MCP servers an agent actually calls. Same
 * house, different job, and the only place the two currently meet is a link in
 * the top bar — which most readers never look at.
 *
 * The card mirrors the digest prompt's manners exactly: it waits, it never
 * appears alongside that prompt, a refusal sticks for a year, and opening the
 * gateway also stops it coming back. Clicking the card is the whole target —
 * it opens mcp.gawk.dev and the prompt disappears.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { readConsentCookie } from "@/lib/consent-cookies";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import {
  isConsentResolved,
  readSubscribeCookies,
  shouldShowSubscribePrompt,
} from "@/lib/subscribe-client";
import {
  MCP_DISMISSED_COOKIE,
  MCP_OPENED_COOKIE,
  MCP_URL,
  readMcpCookies,
  shouldShowMcpPrompt,
} from "@/lib/mcp-prompt";

type ConsentGetResponse = {
  ok: boolean;
  visitorId: string;
  gpc: boolean;
  covered: boolean;
};

const YEAR = 60 * 60 * 24 * 365;

export function McpPromptModal({
  betaEnabled,
}: {
  betaEnabled: boolean;
}): React.JSX.Element | null {
  const [consent, setConsent] = useState<ConsentGetResponse | null>(null);
  const [consentAnswered, setConsentAnswered] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [opened, setOpened] = useState(false);
  const [subscribeState, setSubscribeState] = useState({
    hasSubscribed: false,
    hasDismissed: false,
  });
  const mountedAtRef = useRef<number>(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const mcp = readMcpCookies(document.cookie);
    setDismissed(mcp.hasDismissed);
    setOpened(mcp.hasOpened);
    setSubscribeState(readSubscribeCookies(document.cookie));
    setConsentAnswered(Boolean(readConsentCookie(document.cookie)));
    mountedAtRef.current = Date.now();
    const t = setInterval(() => {
      setElapsedMs(Date.now() - mountedAtRef.current);
      // subscribeState is deliberately the mount-time snapshot and is NOT
      // re-read here. It used to be, so that a dismissed digest prompt handed
      // straight over to this card in the same visit — two prompts in one
      // sitting. With the snapshot, "digest prompt eligible" stays true for the
      // whole visit once its delay has passed, which is rule 4.
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Same consent contract as the digest prompt: fail soft, and never pop over
  // an unanswered banner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/consent", { cache: "no-store" });
        const json = (await res.json()) as ConsentGetResponse;
        if (!cancelled) setConsent(json);
      } catch {
        /* leave consent null — the card stays down */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (consentAnswered || typeof document === "undefined") return;
    const t = setInterval(() => {
      if (readConsentCookie(document.cookie)) setConsentAnswered(true);
    }, 1000);
    return () => clearInterval(t);
  }, [consentAnswered]);

  const writeCookie = useCallback((name: string) => {
    if (typeof document === "undefined") return;
    document.cookie = `${name}=1; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
  }, []);

  const dismiss = useCallback(() => {
    writeCookie(MCP_DISMISSED_COOKIE);
    setDismissed(true);
  }, [writeCookie]);

  const open = useCallback(() => {
    writeCookie(MCP_OPENED_COOKIE);
    setOpened(true);
  }, [writeCookie]);

  if (!consent) return null;

  const consentResolved = isConsentResolved({
    covered: consent.covered,
    gpc: consent.gpc,
    hasAnswered: consentAnswered,
  });

  const subscribePromptVisible = shouldShowSubscribePrompt({
    betaEnabled,
    hasSubscribed: subscribeState.hasSubscribed,
    hasDismissed: subscribeState.hasDismissed,
    consentResolved,
    elapsedMs,
  });

  const show = shouldShowMcpPrompt({
    hasDismissed: dismissed,
    hasOpened: opened,
    subscribePromptVisible,
    // Same value by construction: subscribeState is the mount snapshot, so
    // eligibility never flips back to false when the visitor dismisses the
    // digest prompt mid-visit. Passed explicitly so the pure gate and its
    // tests name the rule rather than rely on that wiring.
    subscribePromptShownThisVisit: subscribePromptVisible,
    isMobile,
    consentResolved,
    elapsedMs,
  });

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="mcpgawk — one gateway in front of every MCP server"
      data-testid="mcp-modal"
      className="fixed right-6 z-40 w-[min(360px,calc(100%-3rem))] overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur-md"
      style={{ bottom: "calc(var(--ap-chrome-bottom, 24px) + 16px)" }}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Also from gawk.dev
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss mcpgawk prompt"
          data-testid="mcp-dismiss"
          onClick={dismiss}
        >
          ×
        </Button>
      </div>
      <a
        href={MCP_URL}
        target="_blank"
        rel="noopener"
        onClick={open}
        data-testid="mcp-open"
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Image
          src="/og/mcpgawk.png"
          alt="mcpgawk — one gateway in front of all of them. Every MCP server measured, verified in a sandbox, and held to what it did yesterday. Locally."
          width={1200}
          height={630}
          className="mt-2 w-full"
          unoptimized
        />
        <div className="px-4 pb-4 pt-3">
          <p className="text-sm font-medium text-foreground">
            One gateway in front of every MCP server.
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Per-principal keys, policy and a hash-chained audit — and it knows
            what it fronts, because it measures every server and verifies
            behaviour in a sandbox. Locally.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-foreground underline underline-offset-4">
            Open mcp.gawk.dev ↗
          </span>
        </div>
      </a>
    </div>
  );
}
