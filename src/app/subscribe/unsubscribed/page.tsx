import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

export const metadata: Metadata = {
  title: "Unsubscribed — Gawk",
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
    <main className="mx-auto max-w-md px-6 py-24 text-center text-foreground">
      <h1 className="mb-3 font-mono text-2xl tracking-tight">
        {copy.heading}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">{copy.body}</p>
      <div className="flex items-center justify-center gap-3 text-sm">
        <Link href="/" className="underline underline-offset-2">
          Back to dashboard
        </Link>
        <Link href="/subscribe" className="underline underline-offset-2">
          Re-subscribe
        </Link>
      </div>
      <PrivacyFooter />
    </main>
  );
}

function isState(v: unknown): v is UnsubState {
  return (
    v === "ok" || v === "invalid" || v === "not-found" || v === "error"
  );
}
