import type { Metadata } from "next";
import Link from "next/link";
import { SubscribeForm } from "@/components/subscribe/SubscribeForm";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

const SUBSCRIBE_DESCRIPTION =
  "Track AI tool outages, model rankings, and SDK adoption in real time. One daily email — every number cites its public source. No ads, no hype.";

export const metadata: Metadata = {
  title: "Subscribe — Gawk daily digest",
  description: SUBSCRIBE_DESCRIPTION,
  openGraph: {
    title: "Subscribe — Gawk daily digest",
    description: SUBSCRIBE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    title: "Subscribe — Gawk daily digest",
    description: SUBSCRIBE_DESCRIPTION,
  },
};

/**
 * /subscribe — full-page form for visitors who arrive via direct link,
 * footer, or email-client reply. Mirrors the modal's form exactly (same
 * SubscribeForm component, same server contract), just presented as a
 * page rather than an overlay.
 *
 * No beta gate here by design — anyone can land on this URL (email
 * footer, shared link), and a beta-gated 404 would leak which signup
 * flows are live. The server still enforces everything else: honeypot,
 * Turnstile, rate limit, email validation.
 */
export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-foreground">
      <h1 className="mb-2 font-mono text-2xl tracking-tight">
        Daily Gawk
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        One email a day. Models released, benchmarks shifted, regulator
        moves, labs hiring — pulled from the same public feeds you see on
        the dashboard, nothing inferred or editorialised. Unsubscribe in
        one click from any email.
      </p>
      <div className="rounded-xl border border-border bg-background/70 p-5">
        <SubscribeForm variant="default" />
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">
        By subscribing you agree to our{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          privacy notice
        </Link>
        . We store a SHA-256 hash of your address plus your country/region
        so we can target the digest regionally. We never share the
        address.
      </p>
      <PrivacyFooter />
    </main>
  );
}
