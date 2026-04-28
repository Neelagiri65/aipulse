# Gawk

Live observatory for the global AI ecosystem. Aggregates 30+ public data sources — model adoption, lab activity, benchmark scores, package downloads, OpenRouter spend rankings, regional news — onto one dashboard. Every number cites its source. Nothing is invented, nothing is scored by an LLM pretending to be objective.

Live at [gawk.dev](https://gawk.dev).

## Source registry

The full list of tracked sources, governance rules, and graceful-degradation behaviour is published at [`/data-sources.md`](./public/data-sources.md). The typed registry with sanity ranges and verifiedAt timestamps is in [`src/lib/data-sources.ts`](./src/lib/data-sources.ts).

## Methodology

Feed-card severity, trigger thresholds, and quiet-day behaviour are documented at [`/methodology`](https://gawk.dev/methodology) and pre-committed in [`src/lib/feed/thresholds.ts`](./src/lib/feed/thresholds.ts).

## Stack

Next.js 16 (App Router) · Tailwind 4 + shadcn/ui · Vercel Edge · Upstash Redis · GitHub Actions cron · react-globe.gl + three.js. Tests: Vitest unit + Playwright visual smoke.

## Local dev

```bash
cp .env.example .env.local      # populate from macOS Keychain
npm install
npm run dev                     # http://localhost:3000
```

```bash
npm run test                    # Vitest unit
npm run test:visual             # Playwright against gawk.dev (default)
LOCAL_URL=http://localhost:3000 npm run test:visual   # against local dev
npm run build                   # production build
```

## Constraints

- Every displayed number traces to a verifiable public source.
- Aggregates, does not score. No invented rankings. No LLM trust scores.
- Graceful degradation is mandatory: when a source is down, show grey card + last known value + timestamp.
- See [`CLAUDE.md`](./CLAUDE.md) for the full non-negotiables.
