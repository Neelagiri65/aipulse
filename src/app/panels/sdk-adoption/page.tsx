import { SdkAdoptionPageClient } from "@/components/panels/sdk-adoption/SdkAdoptionPageClient";

export const metadata = {
  title: "SDK Adoption · AI Pulse",
  description:
    "Within-package daily delta heatmap across PyPI, npm, crates.io, Docker Hub, and Homebrew. Click a row for the 30-day sparkline, source, and aggregator caveat.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string }>;

export default async function SdkAdoptionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { focus } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          SDK Adoption
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Within-package daily delta vs trailing 30d baseline, per registry.
          Cross-row colour intensity is never compared — every cell is normalised
          inside its own package&apos;s history. PyPI numbers carry an inline
          pypistats third-party-aggregator caveat; npm, crates, Docker Hub, and
          Homebrew are first-party.
        </p>
      </header>
      <SdkAdoptionPageClient initialFocusedRowId={focus ?? null} />
    </main>
  );
}
