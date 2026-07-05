# Trust Harness — feed × invariant coverage (living gap table)

Layer A = output-invariant CI test exercising the real pipeline fn.
Invariants (prd-trust-harness §1): **F**resh · **A**ttributed · **D**elta-provenance · **R**eal(non-synthetic) · **S**pam-free · **V**erifiable(durable/link-resolves).

`✓` guarded by an output-level test · `·` not applicable · `✗` GAP.

| Feed | F | A | D | R | S | V | Layer A test | Notes |
|---|---|---|---|---|---|---|---|---|
| map events (globe) | ✓ | ✓ | · | ✓ | ✗ | ✓ | fetch-events.test.ts | durable-type gate + read filter (#54/#55). **GAP: spam-actor filter** (amendashelani class) |
| benchmarks (Elo) | ✗ | ✗ | ✓ | · | · | ✗ | benchmarks-trust.test.ts | delta-provenance done; F/A/V TODO |
| model-usage (OpenRouter) | ✗ | ✗ | ✓ | · | · | ✗ | openrouter-trust.test.ts | S91 fabrication reconstructed END-TO-END (catalogue-fallback prior → 0 movers) |
| sdk-adoption | ✗ | ✗ | ✗ | · | · | ✗ | — | +734% incident class (S79/80) UNGUARDED |
| agents | ✗ | ✗ | ✗ | · | · | ✗ | — | weekly % deltas unguarded |
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
2. **sdk-adoption + agents** — delta-provenance on download %s (the +734% class).
3. **map spam-actor filter** — throwaway-account gate (F invariant extension).
4. HN / producthunt / research / RSS — freshness + attribution (zero-coverage feeds).
5. **Layer B live auditor** — once ≥3 feeds have reusable fixtures, the scheduled job samples live `/api/*` output and asserts these same invariants against reality.

## Done this session
- Shared invariants spine (`invariants.ts`) — the executable §1.
- benchmarks delta-provenance (first NEW feed guard).
- map events durable-evidence (#54/#55) retro-fits the V invariant.
- model-usage S91 fabrication guard END-TO-END (openrouter-trust.test.ts).
