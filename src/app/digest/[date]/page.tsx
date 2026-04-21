/**
 * Public `/digest/{date}` page — read-only archive of a single daily
 * digest. Reached from:
 *   - the "View on AI Pulse" link in an email,
 *   - shared LinkedIn/X posts (share-offsite resolves og: tags here).
 *
 * Server component. Reads the `DigestBody` from Redis via
 * `readDigestBody(date)` and renders through `DigestPageView`. Bad dates
 * and missing archives both return 404 so we don't leak which dates the
 * system has (or doesn't have) processed.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { readDigestBody } from "@/lib/digest/archive";
import { DigestPageView } from "@/components/digest/DigestPageView";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function loadDigest(date: string) {
  if (!DATE_RE.test(date)) return null;
  return readDigestBody(date);
}

async function inferBaseUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://aipulse.dev";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const digest = await loadDigest(date);
  if (!digest) {
    return { title: "AI Pulse — archive not found", robots: { index: false } };
  }
  const baseUrl = await inferBaseUrl();
  const url = `${baseUrl}/digest/${digest.date}`;
  const description =
    digest.mode === "quiet"
      ? "A quiet day in the AI ecosystem. Baseline metrics from AI Pulse."
      : "Five verifiable things that moved in the AI ecosystem. Every number traces to a public source.";
  return {
    title: digest.subject,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: digest.subject,
      description,
      url,
      type: "article",
      publishedTime: digest.generatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: digest.subject,
      description,
    },
  };
}

export default async function DigestArchivePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const digest = await loadDigest(date);
  if (!digest) notFound();
  const baseUrl = await inferBaseUrl();
  return <DigestPageView digest={digest} baseUrl={baseUrl} />;
}
