"use client";

/**
 * SubscribeForm — shared form used by both the floating modal and the
 * full-page /subscribe landing. Keeping one form for both surfaces means
 * the server contract (fields, Turnstile mount, error copy) only has one
 * implementation to audit.
 *
 * Turnstile: the widget is loaded if NEXT_PUBLIC_TURNSTILE_SITE_KEY is
 * set. In dev / preview without a key, the token is empty and the API
 * short-circuits to "ok" when TURNSTILE_SECRET is also unset (see
 * verifyTurnstile). This keeps local testing frictionless without ever
 * shipping to prod without captcha — both env vars are required in the
 * production environment and verified by the route on POST.
 *
 * Honeypot: a visually-hidden `website` input. Humans skip it; bots
 * fill it. The server rejects any non-empty value before hashing.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  responseToFormState,
  SUBSCRIBE_SUBSCRIBED_COOKIE,
  type SubscribeFormState,
} from "@/lib/subscribe-client";

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "dark" | "light" | "auto";
  size?: "normal" | "compact" | "invisible";
};

type TurnstileApi = {
  render: (target: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onTurnstileLoaded?: () => void;
  }
}

const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded&render=explicit";

export type SubscribeFormProps = {
  /** Visual compactness — modal uses "compact", full page uses "default". */
  variant?: "default" | "compact";
  /** Fires once the server accepts the submission (pending or resent). */
  onSuccess?: (email: string) => void;
};

export function SubscribeForm({
  variant = "default",
  onSuccess,
}: SubscribeFormProps): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<SubscribeFormState>({ kind: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const emailId = useId();
  const siteKey = useMemo(
    () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
    [],
  );

  useEffect(() => {
    if (!siteKey) return;
    if (typeof window === "undefined") return;

    const mount = () => {
      if (!widgetRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: (token) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(""),
        "expired-callback": () => setTurnstileToken(""),
        theme: "dark",
        size: "compact",
      });
    };

    if (window.turnstile) {
      mount();
    } else {
      window.onTurnstileLoaded = mount;
      if (!document.querySelector(`script[src*="turnstile/v0/api.js"]`)) {
        const script = document.createElement("script");
        script.src = TURNSTILE_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* widget might have been torn down already */
        }
      }
    };
  }, [siteKey]);

  const submit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (state.kind === "submitting") return;
      const submitted = email.trim();
      setState({ kind: "submitting" });
      let body: unknown = null;
      try {
        const r = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: submitted,
            turnstileToken,
            website: honeypot,
          }),
        });
        body = await r.json().catch(() => null);
      } catch {
        body = null;
      }
      const next = responseToFormState(
        body as Parameters<typeof responseToFormState>[0],
        submitted,
      );
      setState(next);
      if (next.kind === "sent" || next.kind === "already") {
        if (typeof document !== "undefined") {
          // Client-visible cookie; 1y. Used by the modal's elapsed-time
          // gate so we don't prompt again on the next visit.
          document.cookie = `${SUBSCRIBE_SUBSCRIBED_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        }
        onSuccess?.(submitted);
      }
      // Refresh Turnstile for any subsequent retry.
      if (widgetIdRef.current && typeof window !== "undefined" && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          /* reset failures are non-fatal */
        }
        setTurnstileToken("");
      }
    },
    [email, honeypot, onSuccess, state.kind, turnstileToken],
  );

  if (state.kind === "sent") {
    return (
      <div
        data-testid="subscribe-sent"
        className="space-y-2 text-sm text-foreground"
      >
        <p className="font-medium">Check your inbox.</p>
        <p className="text-muted-foreground">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-mono text-foreground">{state.email}</span>. Click
          it within 24 hours to start receiving the daily digest.
        </p>
      </div>
    );
  }
  if (state.kind === "already") {
    return (
      <div
        data-testid="subscribe-already"
        className="space-y-2 text-sm text-foreground"
      >
        <p className="font-medium">You&apos;re already subscribed.</p>
        <p className="text-muted-foreground">
          We&apos;ve got that address on the list. If you haven&apos;t been
          getting the digest, check your spam folder — or unsubscribe via the
          link in any past email and re-subscribe here.
        </p>
      </div>
    );
  }

  const compact = variant === "compact";

  return (
    <form
      onSubmit={submit}
      data-testid="subscribe-form"
      className="space-y-3"
      noValidate
    >
      <div className="space-y-1">
        <label
          htmlFor={emailId}
          className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === "submitting"}
          data-testid="subscribe-email"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      {/* Visually-hidden honeypot — only bots fill this. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor={`${emailId}-website`}>
          Website
          <input
            id={`${emailId}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {siteKey ? (
        <div ref={widgetRef} data-testid="turnstile-mount" />
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Captcha disabled in this environment.
        </p>
      )}

      <div className={compact ? "flex items-center justify-between gap-2" : "space-y-2"}>
        <p className="text-[11px] text-muted-foreground">
          One daily email. Unsubscribe in one click.
        </p>
        <Button
          type="submit"
          size={compact ? "sm" : "default"}
          disabled={state.kind === "submitting"}
          data-testid="subscribe-submit"
        >
          {state.kind === "submitting" ? "Sending…" : "Subscribe"}
        </Button>
      </div>

      {state.kind === "error" && (
        <p
          role="alert"
          data-testid="subscribe-error"
          className="text-[12px] text-destructive"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
