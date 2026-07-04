# PRODUCT.md — Gawk

## What it is
Gawk (gawk.dev) is the real-time observatory for the global AI ecosystem — live, cited telemetry across 40 verified public sources (benchmarks, tool incidents, SDK downloads, agent frameworks, lab activity, model usage). It is the live-telemetry track of the **Nativerse** branded house ("GAWK, by nativerse"). Distribution: the live dashboard, a daily email digest, and per-day web archives (`/digest/{date}`).

## Register
`product` — design serves the data. Gawk is scanned and operated, not read. The single job of every surface: let a technical reader verify what moved in under a minute, and click through to the primary source of any number.

## Target users
AI-tool developers, ML practitioners, technical founders. They skim (51s median), they distrust unsourced claims, they read on phones and in dark-mode clients.

## Brand personality (inherited from the Nativerse Brand Bible — canonical at `~/nativerse-site/brand/BRAND-BIBLE.md`)
Honest, rigorous, clear, optimistic, independent. Sage archetype. Motto: "Clarity. Trust." Voice: plain, specific, British English, no hype, no em-dashes, cited not invented.

## Non-negotiables that constrain design
- Every displayed number traces to a public source (visible link).
- No invented rankings or scores; severity is a sort key, never a grade.
- Graceful degradation is a feature: stale/degraded/quarantined states are DISCLOSED, never hidden.
- Colour encodes data semantics only (green gain / red loss / amber incident); the sole brand accent is royal blue #2A33C2.
- Icons/logos: strict monochrome charcoal silhouettes, uniform 24px minimum (founder rule 2026-07-05).
- Motion must be motivated (explains state or answers the user), 120/200/360ms, reduced-motion safe. No timed auto-effects.

## Anti-references
Generic SaaS dashboards (gradient heroes, glassmorphism); crypto-terminal green-on-black; newsletter-slop cream templates. The dark site chrome exists, but digest surfaces are a deliberate warm-paper light island per the bible.

## Surfaces
- `/` dashboard + 2D map (dark chrome, legacy `globe*` naming — it is a MAP).
- `/board` bento prototype.
- `/digest/{date}` daily archive — Metro/live-tile board (founder direction).
- Daily email digest (react-email, Direction A "Editorial Data-Journalism").
