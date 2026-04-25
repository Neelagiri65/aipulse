import { ModelUsagePageClient } from "@/components/panels/model-usage/ModelUsagePageClient";

export const metadata = {
  title: "Model Usage · AI Pulse",
  description:
    "Live ranking of LLMs by real OpenRouter request volume. Click a row for pricing, context window, OpenRouter source link, and 30-day rank history.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string }>;

export default async function ModelUsagePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { focus } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Model Usage</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Live ranking of large-language models by real OpenRouter
          request volume. The order is OpenRouter&apos;s — we mirror it,
          we never re-rank. Pricing, context window, and the OpenRouter
          model page are one click away on every row.
        </p>
      </header>
      <ModelUsagePageClient initialFocusedSlug={focus ?? null} />
    </main>
  );
}
