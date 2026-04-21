import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

export const metadata: Metadata = {
  title: "Privacy — AI Pulse",
  description:
    "What data AI Pulse collects, why, how to opt out, and where to delete your record.",
};

/**
 * /privacy — plain-language privacy notice.
 *
 * Companion to /privacy/preferences (which manages the consent cookie)
 * and /api/consent/delete (which wipes the audit trail). This page is
 * the legal surface: what we collect, why, how long, how to delete.
 *
 * Editorial note: we deliberately keep this short and in the first
 * person. The norm is 20-page policies nobody reads; our bet is that
 * a visitor who can read the whole policy in under two minutes trusts
 * us more than a visitor who bounces off fine print.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-foreground">
      <h1 className="mb-6 font-mono text-2xl tracking-tight">Privacy</h1>

      <section className="mb-8 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          What we collect
        </h2>
        <p>
          When you visit AI Pulse, we log HTTP request metadata (path,
          referrer, anonymised IP) on Vercel&apos;s edge — the standard
          request log every website keeps. None of that is sold or shared.
        </p>
        <p>
          If you&apos;re in the EU, EEA, UK, or California, and you agree,
          we also mount Vercel Analytics. That counts which panels open
          and which pages load. It does not fingerprint you and does not
          use a persistent device id.
        </p>
        <p>
          If you subscribe by email, we store the SHA-256 hash of your
          address, your country and region (from the request header,
          never the IP), and the tokens for the confirm + unsubscribe
          links. That&apos;s it.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          What we don&apos;t collect
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>We don&apos;t track you across sites.</li>
          <li>We don&apos;t fingerprint your browser.</li>
          <li>We don&apos;t sell data. There is no third-party ad network.</li>
          <li>We don&apos;t use LLM scoring or profiling on your input.</li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Global Privacy Control
        </h2>
        <p>
          If your browser sends a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Sec-GPC: 1
          </code>{" "}
          header — Firefox does by default, so do Brave and DuckDuckGo —
          we treat that as a refusal of analytics and marketing cookies,
          without showing the banner. You don&apos;t need to do anything.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Your controls
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link href="/privacy/preferences" className="underline underline-offset-2">
              /privacy/preferences
            </Link>{" "}
            — change which categories you&apos;ve agreed to, any time.
          </li>
          <li>
            <Link href="/privacy/preferences" className="underline underline-offset-2">
              Delete my consent record
            </Link>{" "}
            — clears your stored categories and writes a tombstone in
            our audit log so we have proof you were removed.
          </li>
          <li>
            To unsubscribe from email: every digest carries a one-click
            unsubscribe link. We also honour the one-click List-Unsubscribe
            header mailbox providers send.
          </li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Retention
        </h2>
        <p>
          Consent audit entries are kept indefinitely (the law requires
          proof of consent). They contain: visitor id, action, categories,
          country/region, timestamp. No IP, no user agent, no email.
        </p>
        <p>
          Email subscriber records are kept until you unsubscribe. After
          unsubscribe, we keep the status record so we don&apos;t email
          you again if someone re-enters your address.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Contact
        </h2>
        <p>
          Questions or a request under GDPR/CCPA? Email privacy at the
          domain you reached us on. Include the word &ldquo;privacy&rdquo; in the
          subject so it doesn&apos;t land in the digest queue.
        </p>
      </section>

      <PrivacyFooter />
    </main>
  );
}
