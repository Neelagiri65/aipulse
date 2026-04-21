import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

export const metadata: Metadata = {
  title: "Subscription confirmation — AI Pulse",
};

type ConfirmState = "ok" | "expired" | "invalid" | "not-found" | "error";

const COPY: Record<ConfirmState, { heading: string; body: string }> = {
  ok: {
    heading: "You're subscribed.",
    body: "We'll send one daily digest. You can unsubscribe any time via the link at the bottom of every email.",
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
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center text-foreground">
      <h1 className="mb-3 font-mono text-2xl tracking-tight">
        {copy.heading}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">{copy.body}</p>
      <div className="flex items-center justify-center gap-3 text-sm">
        <Link href="/" className="underline underline-offset-2">
          Back to dashboard
        </Link>
        {state !== "ok" && (
          <Link
            href="/subscribe"
            className="underline underline-offset-2"
          >
            Try subscribing again
          </Link>
        )}
      </div>
      <PrivacyFooter />
    </main>
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
