import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";
import { ymdUtc } from "@/lib/data/snapshot";

export const metadata: Metadata = {
  title: "Subscription confirmation — Gawk",
};

type ConfirmState = "ok" | "expired" | "invalid" | "not-found" | "error";

const COPY: Record<ConfirmState, { heading: string; body: string }> = {
  ok: {
    heading: "You're subscribed.",
    body: "We'll send one daily digest at 08:00 UTC. Every number cites its public source. Unsubscribe any time via the link at the bottom of every email.",
  },
  expired: {
    heading: "That link has expired.",
    body: "Confirmation links are good for 24 hours. Subscribe again and we'll send a fresh one.",
  },
  invalid: {
    heading: "That link is invalid.",
    body: "The token didn't verify. If you copy-pasted from a terminal, check that the whole link made it across — they're long.",
  },
  "not-found": {
    heading: "Nothing to confirm.",
    body: "We couldn't find a pending subscription for that token. It may have already been confirmed, or the subscription was deleted.",
  },
  error: {
    heading: "Something went wrong.",
    body: "The server hit an unexpected error. Try the link again — if it persists, email us and quote the trace id from the page URL.",
  },
};

/**
 * /subscribe/confirm — landing page reached by redirect from
 * /api/subscribe/confirm?token=...&state=<ConfirmState>.
 *
 * S62g.2: brand mark + "What's next" preview added for the success
 * state. A new subscriber from the LinkedIn launch lands here as
 * their first impression of the product after the email click — a
 * bare text page lost them.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const params = await searchParams;
  const raw = params.state;
  const state: ConfirmState = isState(raw) ? raw : "invalid";
  const copy = COPY[state];
  const today = ymdUtc();
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center text-foreground">
      <BrandHeader />
      <h1 className="mb-3 text-3xl font-semibold tracking-tight">
        {copy.heading}
      </h1>
      <p className="mb-6 text-[15px] leading-relaxed text-muted-foreground">
        {copy.body}
      </p>

      {state === "ok" && (
        <div
          className="mb-6 rounded border border-primary/30 bg-primary/[0.04] px-4 py-4 text-left"
          data-testid="confirm-whats-next"
        >
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
            What&rsquo;s next
          </p>
          <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-foreground/90">
            <li>
              Tomorrow at 08:00 UTC you&rsquo;ll receive the first daily
              digest in your inbox.
            </li>
            <li>
              Today&rsquo;s digest is already live — read it now to see
              the format.{" "}
              <Link
                href={`/digest/${today}`}
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Read today&rsquo;s digest →
              </Link>
            </li>
            <li>
              Add{" "}
              <span className="font-mono text-[12px] text-foreground">
                digest@gawk.dev
              </span>{" "}
              to your address book so the digest doesn&rsquo;t land in
              promotions.
            </li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Back to dashboard
        </Link>
        {state !== "ok" && (
          <Link
            href="/subscribe"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Try subscribing again
          </Link>
        )}
      </div>
      <PrivacyFooter />
    </main>
  );
}

function BrandHeader() {
  return (
    <Link
      href="/"
      className="mb-8 inline-flex items-center gap-3"
      data-testid="confirm-brand-header"
    >
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_rgba(45,212,191,0.6)]"
      />
      <span className="font-mono text-[16px] font-bold tracking-[0.36em] text-foreground">
        GAWK
      </span>
    </Link>
  );
}

function isState(v: unknown): v is ConfirmState {
  return (
    v === "ok" ||
    v === "expired" ||
    v === "invalid" ||
    v === "not-found" ||
    v === "error"
  );
}
