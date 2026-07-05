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
| labs | ✗ | ✗ | · | · | · | ✗ | — | event counts |
| HN | ✗ | ✗ | · | · | ✗ | ✗ | NONE | zero tests |
| reddit | ✗ | ✗ | · | · | ✗ | ✗ | — | zero tests |
| producthunt | ✗ | ✗ | · | · | ✗ | ✗ | NONE | zero tests |
| research/arXiv | ✗ | ✗ | · | · | · | ✗ | NONE | zero tests |
| RSS | ✗ | ✗ | · | · | · | ✗ | — | zero tests |
| gitlab | ✓ | ✓ | · | ✓ | ✓ | ✓ | gitlab-events.test.ts | built with invariants in mind |
| digest | ✗ | ✗ | ✗ | · | · | ✗ | (template tests behavioural) | composes all — inherits their gaps |

## Rollout order (highest stakes / worst coverage first)
1. ~~model-usage~~ ✅ DONE — S91 reconstructed end-to-end (openrouter-trust.test.ts).
2. ~~sdk-adoption + agents~~ ✅ DONE — +734% spike suppression pinned; agents delta-provenance framed.
3. ~~map spam-actor filter~~ ✅ DONE — throwaway-actor gate (spam-actor.ts).
4. HN / producthunt / research / RSS — freshness + attribution (zero-coverage feeds).
5. ~~Layer B live auditor~~ ✅ BUILT — /api/trust-audit + integrity-watch pages on any served-invariant violation (auditor.ts).

## Done this session
- Shared invariants spine (`invariants.ts`) — the executable §1.
- benchmarks delta-provenance (first NEW feed guard).
- map events durable-evidence (#54/#55) retro-fits the V invariant.
- model-usage S91 fabrication guard END-TO-END (openrouter-trust.test.ts).
- sdk-adoption +734% spike suppression pinned; agents delta-provenance framed.
- spam-actor filter (throwaway-account gate) — fired on live data.
- **Layer B LIVE AUDITOR** (/api/trust-audit) — served-output invariants, pages Discord via integrity-watch. Catches #54/#53/S88/S91 classes structurally on prod.
