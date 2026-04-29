/**
 * Gawk — Methodology page.
 *
 * Renders the locked feed-severity formula verbatim from
 * `thresholds.ts`. Per S40 PRD auditor lock: severity tiering is a
 * deterministic sort key over already-aggregated public data, not
 * an invented metric. This page makes that statement publicly,
 * cites the underlying source registry, and links to the git
 * history of `thresholds.ts` so any change is auditable.
 */

import Link from "next/link";

import { FEED_SEVERITIES, FEED_TRIGGERS } from "@/lib/feed/thresholds";
import type { CardType } from "@/lib/feed/types";

export const metadata = {
  title: "Methodology · Gawk",
  description:
    "How Gawk ranks cards on the feed. Deterministic sort key over public data, not an invented metric.",
};

const CARD_TYPE_DESCRIPTION: Record<CardType, string> = {
  TOOL_ALERT:
    "Any tracked tool (Claude Code, Claude API, OpenAI API, Codex, Copilot, Windsurf) reporting a status that is not 'operational' on its public status page.",
  MODEL_MOVER:
    "An OpenRouter top-30 model whose week-over-week rank delta exceeds the threshold (strictly greater than).",
  SDK_TREND:
    "A tracked package (PyPI / npm / crates / Docker / Brew) whose week-over-week download delta absolute value exceeds the threshold.",
  NEWS:
    "A Hacker News AI-filtered story whose points exceed the threshold within the configured time window.",
  RESEARCH:
    "An arXiv paper in the current top-5-by-recency snapshot for cs.AI + cs.LG.",
  LAB_HIGHLIGHT:
    "The single curated AI lab with the highest 7-day GitHub event total in the current snapshot.",
};

const ORDERED: CardType[] = [
  "TOOL_ALERT",
  "MODEL_MOVER",
  "SDK_TREND",
  "NEWS",
  "RESEARCH",
  "LAB_HIGHLIGHT",
];

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          How the feed is ranked
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Gawk aggregates publicly verifiable data — it does not invent
          metrics. The feed&rsquo;s severity is a{" "}
          <strong>deterministic sort key</strong> over already-aggregated
          public data, not an invented score. Every card cites a primary
          public source. The formula below is pre-committed in code and
          declared on this page; a threshold change is one git commit.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Severity formula</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4">Card type</th>
              <th className="py-2 pr-4">Severity</th>
              <th className="py-2">Fires when</th>
            </tr>
          </thead>
          <tbody>
            {ORDERED.map((t) => (
              <tr key={t} className="border-t border-border/50">
                <td className="py-3 pr-4 font-mono text-xs">{t}</td>
                <td className="py-3 pr-4 font-mono">{FEED_SEVERITIES[t]}</td>
                <td className="py-3 text-muted-foreground">
                  {CARD_TYPE_DESCRIPTION[t]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Numeric thresholds</h2>
        <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
          <li>
            MODEL_MOVER fires when |currentRank − previousRank| {">"}{" "}
            <strong>{FEED_TRIGGERS.MODEL_MOVER_RANK_DELTA}</strong> (strictly
            greater).
          </li>
          <li>
            SDK_TREND fires when |week-over-week %| {">"}{" "}
            <strong>{FEED_TRIGGERS.SDK_TREND_WOW_PCT}%</strong> (strictly
            greater).
          </li>
          <li>
            NEWS fires when HN points {">"}{" "}
            <strong>{FEED_TRIGGERS.NEWS_HN_POINTS}</strong> AND age ≤{" "}
            <strong>{FEED_TRIGGERS.NEWS_HN_WINDOW_HOURS}h</strong>.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sort order</h2>
        <p className="text-sm text-muted-foreground">
          Cards are sorted by severity descending, then by underlying-event
          timestamp descending within the same tier. Sort is deterministic
          and stable; identical inputs produce identical orderings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Quiet days</h2>
        <p className="text-sm text-muted-foreground">
          When zero cards with severity ≥ 40 land in the last 24 hours, the
          feed shows a quiet-day banner with the current state of the
          dashboard (top model, tool-health green/total, latest paper). The
          feed never fabricates cards to fill a slow day.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sources</h2>
        <p className="text-sm text-muted-foreground">
          Every card cites the public source the underlying number was read
          from. The full source registry — names, governance, transparency
          notes — is published at{" "}
          <Link href="/sources" className="underline">
            /sources
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3" id="regional-bias">
        <h2 className="text-lg font-semibold">Regional bias on the map</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Geographic placement on the live globe and flat map relies on a
          deterministic geocoder that resolves location strings from public
          GitHub and Hacker News profile fields. Coverage currently sits at
          around <strong>21%</strong> of raw events and is biased toward
          English-speaking developer profiles. Chinese, Indian, and other
          non-English developer activity is{" "}
          <strong>systematically underrepresented</strong> in the geographic
          view — the events still land in the Wire feed and panel
          aggregates, but they don&rsquo;t become dots until the geocoder
          can resolve their author&rsquo;s self-declared location.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Regional Wire publishers (MarkTechPost IN, Heise DE, Synced Review
          CN, The Register UK, MIT Technology Review US) and the curated AI
          Labs registry partially address this — both layers carry verifiable
          HQ coordinates and surface non-SF activity directly without depending
          on the geocoder. They are a counterweight, not a fix. Additional
          non-English sources are on the roadmap; suggestions are welcome via
          the Discord linked from the header.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Auditability</h2>
        <p className="text-sm text-muted-foreground">
          The severity formula and trigger thresholds live in{" "}
          <code className="font-mono text-xs">src/lib/feed/thresholds.ts</code>
          {". "}
          Any threshold change requires a git commit and is therefore
          auditable in the public repository&rsquo;s history.
        </p>
      </section>

      <p>
        <Link href="/" className="text-[var(--ap-accent,#2dd4bf)] underline">
          ← back to Gawk
        </Link>
      </p>
    </main>
  );
}
