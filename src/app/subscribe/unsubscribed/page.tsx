import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

export const metadata: Metadata = {
  // Self-canonical. The root layout used to declare `canonical: "/"`,
  // which every page inherited — telling Google to drop this page and credit
  // the homepage instead.
  alternates: { canonical: "/subscribe/unsubscribed" },
  title: "Unsubscribed — gawk.dev",
};

type UnsubState = "ok" | "invalid" | "not-found" | "error";

const COPY: Record<UnsubState, { heading: string; body: string }> = {
  ok: {
    heading: "You've unsubscribed.",
    body: "Sorry to see you go. We've removed you from the list. If this was a mistake, you can re-subscribe below.",
  },
  invalid: {
    heading: "That link is invalid.",
    body: "The token didn't verify. If you're trying to unsubscribe, use the link at the bottom of any digest email you've received.",
  },
  "not-found": {
    heading: "Nothing to unsubscribe.",
    body: "We couldn't find a subscription for that token. You may already be unsubscribed.",
  },
  error: {
    heading: "Something went wrong.",
    body: "The server hit an unexpected error. Try again — if it persists, email us and quote the trace id from the page URL.",
  },
};

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const params = await searchParams;
  const raw = params.state;
  const state: UnsubState = isState(raw) ? raw : "invalid";
  const copy = COPY[state];
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center text-foreground">
      <BrandHeader />
      <h1 className="mb-3 text-3xl font-semibold tracking-tight">
        {copy.heading}
      </h1>
      <p className="mb-6 text-[15px] leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Back to dashboard
        </Link>
        <Link
          href="/subscribe"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Re-subscribe
        </Link>
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
      data-testid="unsub-brand-header"
    >
      {/* The site header's lockup, not a second one. This was a pulse dot
          wearing a glow in the pre-rename accent, beside a letterspaced
          wordmark without the .dev — the old identity, on one of the two pages
          a new subscriber actually lands on. */}
      <span className="ap-brand__mark" aria-hidden />
      <span className="font-mono text-[16px] font-bold text-foreground">
        gawk.dev
      </span>
    </Link>
  );
}

function isState(v: unknown): v is UnsubState {
  return (
    v === "ok" || v === "invalid" || v === "not-found" || v === "error"
  );
}
