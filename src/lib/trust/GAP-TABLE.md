# Trust Harness — feed × invariant coverage (living gap table)

Layer A = output-invariant CI test exercising the real pipeline fn.
Invariants (prd-trust-harness §1): **F**resh · **A**ttributed · **D**elta-provenance · **R**eal(non-synthetic) · **S**pam-free · **V**erifiable(durable/link-resolves).

`✓` guarded by an output-level test · `·` not applicable · `✗` GAP.

| Feed | F | A | D | R | S | V | Layer A test | Notes |
|---|---|---|---|---|---|---|---|---|
| map events (globe) | ✓ | ✓ | · | ✓ | ✓ | ✓ | fetch-events + spam-actor.test.ts | durable-type gate (#54/#55) + throwaway-actor filter |
| benchmarks (Elo) | ✗ | ✗ | ✓ | · | · | ✗ | benchmarks-trust.test.ts | delta-provenance done; F/A/V TODO |
| model-usage (OpenRouter) | ✗ | ✗ | ✓ | · | · | ✗ | openrouter-trust.test.ts | S91 fabrication reconstructed END-TO-END (catalogue-fallback prior → 0 movers) |
| sdk-adoption | ✗ | ✗ | ✓ | · | · | ✗ | sdk-adoption-trust.test.ts | +734% spike suppression PINNED |
| agents | ✗ | ✗ | ✓ | · | · | ✗ | agents-trust.test.ts | delta-provenance (bootstrap/new-from-zero) framed via invariant |
| labs | ✓ | ✓ | · | ✓ | · | ✓ | lab-highlight-trust.test.ts | 7d payload gate (LABS_MAX_AGE_MS = WINDOW_MS — the gate derives from the claim); headline count = payload total (R); all-zero registry emits nothing; within-window staleness stays disclosed via staleSources |
| HN (NEWS) | ✓ | ✓ | · | · | · | ✓ | news-trust.test.ts | 6h window IS the freshness guarantee; sourceUrl=news.ycombinator.com |
| reddit (NEWS) | ✓ | ✓ | · | · | · | ✓ | reddit-trust.test.ts | 12h window; sourceUrl=reddit.com comments |
| producthunt | · | ✓ | · | ✓ | · | ✓ | product-launch-trust.test.ts | RANKING feed (multi-day legit, ~6d observed) → no freshness window; killed the `generatedAt` fabrication (dateless post dropped, not stamped-now); host=producthunt.com |
| research/arXiv | ✓ | ✓ | · | · | · | ✓ | research-trust.test.ts | NEW 7d gate in deriver (`fetch-research` had no age bound); host=arxiv.org |
| RSS | ✓ | ✓ | · | · | · | ✗ | rss-trust.test.ts | `normaliseItem` drops no-link / unparseable-date at ingest; url attribution via checkResolvableSource (arbitrary publisher host) |
| gitlab | ✓ | ✓ | · | ✓ | ✓ | ✓ | gitlab-events.test.ts | built with invariants in mind |
| digest | ✗ | ✗ | ✗ | · | · | ✗ | (template tests behavioural) | composes all — inherits their gaps |

## Rollout order (highest stakes / worst coverage first)
1. ~~model-usage~~ ✅ DONE — S91 reconstructed end-to-end (openrouter-trust.test.ts).
2. ~~sdk-adoption + agents~~ ✅ DONE — +734% spike suppression pinned; agents delta-provenance framed.
3. ~~map spam-actor filter~~ ✅ DONE — throwaway-actor gate (spam-actor.ts).
4. ~~HN / reddit / producthunt / research / RSS~~ ✅ DONE — freshness + attribution (the five zero-coverage text feeds). Two deriver fixes surfaced by the empirical probe: research got a 7d freshness gate (`fetch-research` had NO age bound — a frozen ingest would serve month-old cache as newest); PH's `generatedAt` fabrication killed (a dateless post was stamped "now" = "just launched"). labs still uncovered (event counts).
5. ~~Layer B live auditor~~ ✅ BUILT — /api/trust-audit + integrity-watch pages on any served-invariant violation (auditor.ts).

## Known residuals (surfaced, not hidden)
- **PH ranking width**: PRODUCT_LAUNCH shows PH-ranked AI products up to ~6 days old (observed on prod). That's PH's ranking semantics, NOT staleness — the timestamp is the real `createdAt`, shown honestly. Flagged so it isn't mistaken for a stale-item bug.
- **Layer B per-card freshness — PARTIALLY CLOSED**: `auditServedOutput` now runs per-card `checkFresh` on feed cards for the types whose deriver declares a compose window — NEWS (reddit 12h, the wider of the two), NEW_RELEASE (48h), RESEARCH (7d), LAB_HIGHLIGHT (7d payload window) — ceiling = 2 × (deriver window + 12h feed budget), same 2× slack convention as the globe. Windows are IMPORTED from `thresholds.ts` / the derivers (no parallel truth). Still ungated per-card: PRODUCT_LAUNCH (deliberate — ranking semantics), TOOL_ALERT / MODEL_MOVER / SDK_TREND (no deriver-declared window; gating would invent one).

## Done this session
- Shared invariants spine (`invariants.ts`) — the executable §1.
- benchmarks delta-provenance (first NEW feed guard).
- map events durable-evidence (#54/#55) retro-fits the V invariant.
- model-usage S91 fabrication guard END-TO-END (openrouter-trust.test.ts).
- sdk-adoption +734% spike suppression pinned; agents delta-provenance framed.
- spam-actor filter (throwaway-account gate) — fired on live data.
- **Layer B LIVE AUDITOR** (/api/trust-audit) — served-output invariants, pages Discord via integrity-watch. Catches #54/#53/S88/S91 classes structurally on prod.
- **Text feeds (HN/reddit/research/PH/RSS)** — Layer A freshness+attribution. Empirical prod probe drove two real deriver fixes: research 7d gate + PH `generatedAt` fabrication kill.
