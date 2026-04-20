# Research: Semantic Scholar + ORCID as OpenAlex alternatives

**Date:** 2026-04-20
**Protocol:** /research-first (per global CLAUDE.md) — second pass after OpenAlex was empirically ruled out.
**Author:** session 20 (Builder)
**Status:** BLOCKER CONFIRMED for S2 and ORCID. Path 3 fails. Path A (OpenAlex broadened) works technically but has a geographic-integrity problem that changes the product claim. Final recommendation below.

---

## What I was asked to test

The user invoked `/research-first` a second time after the first brief ruled OpenAlex out. Four alternate paths were proposed:

1. Semantic Scholar API — `authors.affiliations` field.
2. ORCID API — researcher → current affiliation with city/country.
3. Query Semantic Scholar directly for recent AI papers with institutions (skip ArXiv as the starting point).
4. Curated institution map (~100 top AI labs, hand-coded coords).

---

## Empirical findings

All numbers below came from hitting the live APIs on 2026-04-20. Reproducible from `/tmp/arxiv-bare-ids.txt`, `/tmp/arxiv-oldest-ids.txt`.

### Semantic Scholar — match rate + institution coverage

| Cohort | Matched in S2 | Papers with ≥1 affiliated author | Author-level affiliation coverage |
|---|---|---|---|
| Today's top 20 cs.AI/cs.LG (<24h) | **0 / 20** (batch 400: "no valid ids") | — | — |
| ~9-day-old cohort | 10 / 10 | 0 / 10 | **0 / 49 (0%)** |
| ~2-month-old cohort | 20 / 20 | 1 / 20 | **1 / 232 (0.4%)** |
| Known-published (Llama 2, GPT-3, etc.) | 5 / 5 | varies | 0–15% typical |

**Verdict: S2 is strictly worse than OpenAlex on ArXiv preprints.** 0% author-level coverage on 9-day-old papers vs OpenAlex's 1.3% at the same age. And when S2 does have affiliations (Llama 2: 5/68 authors), they're **raw strings** like `"Facebook AI Research"`, `"Meta AI"`, `"Facebook AI"` — three spellings of the same org in one cohort — not structured entities with coordinates.

### Semantic Scholar — API surface constraints

| Constraint | Reality |
|---|---|
| Rate limit (unauth) | Hit 429 on the **2nd consecutive call** with 2s spacing. Roughly "1 req / minute" effective throughput in practice. Documented "1000/sec shared" is nominal, not observed. |
| Bulk endpoint supports `authors.affiliations` | **No.** `/paper/search/bulk` returns HTTP 400: "Unrecognized or unsupported fields: [authors.affiliations]". Must use `/paper/{id}` one-at-a-time — which is rate-limited. |
| API-key pool | Available on request form, not instant. Would add a per-deploy secret. |

**Verdict: S2 cannot be used from a polling dashboard without an API key. Even with one, the data isn't there.**

### ORCID — dead at source

| Test | Result |
|---|---|
| Does the ArXiv Atom feed carry ORCID IDs for today's top 20? | **0 / 112 authors** carry any ORCID reference. |
| Does `<arxiv:affiliation>` appear? | **0 / 112.** |

**Verdict: ORCID path is foreclosed before it starts.** ArXiv submitters don't fill in ORCID or affiliation metadata. There's nothing to look up.

### Path 3 — S2 /paper/search directly for recent AI papers

`/paper/search` rate-limited on first call (429). `/paper/search/bulk` doesn't expose the affiliations field. There is no viable bulk query path to "recent AI papers with institution data" via S2.

### Path A revisited — OpenAlex broadened, with institution filter

This is the only path that technically works. Findings from the filter `filter=concepts.id:C154945302,has_raw_affiliation_strings:true,type:article`:

| Metric | Value |
|---|---|
| Total matching works | ~10M |
| Sample (50) plottable | **44–49 / 50 (88–98%)** |
| Author-level country coverage | ≥1 country on nearly every plottable paper |
| Data shape | Structured: `authorships[].institutions[] = {display_name, country_code, ror, ...}`. No string-matching needed. |
| Rate limit | 100k req/day polite pool, no key required. Plenty of headroom. |

**But:** the geographic distribution in the sample:

```
Top countries (narrow DL/ML concept, 50-paper sample):
  FR  38    ← France, Zenodo/HAL-heavy
  US  15
  CH  14    ← Switzerland, CERN-Zenodo hosted
  GR  13    ← Greece, university repos
  GH  10    ← Ghana
  UG   6    ← Uganda
  JP   5
  LY   4    ← Libya
  UA   4
  PK   4

Top sources:
  Zenodo (CERN)                          28
  SPIRE — Sciences Po                     8
  Open MIND                                7
  Various university repositories         variable
```

**What's missing from this sample:**
- China (CN): 0–2 papers despite being one of the largest AI research producers. Chinese institutional indexing is concentrated in systems (CNKI, etc.) that OpenAlex does not fully ingest.
- Google Research, Google DeepMind, OpenAI, Anthropic, Meta AI, Microsoft Research: **zero presence.** These orgs publish to ArXiv (no affiliations) or to corporate blogs (no OpenAlex record). They do not upload to Zenodo or institutional repositories.

**What this means for the product claim:**

The Research map layer, if shipped via Path A, will visually depict **"which countries host institutional repositories with good metadata hygiene"** — not **"where AI research happens in the world"**. A user looking at the globe will see France dominant, Ghana + Uganda + Libya + Ukraine as hotspots, and Silicon Valley / Beijing as silent.

This is the CodePulse V1 lesson from the project's CLAUDE.md: *"If the data disproves the thesis, ship the data honestly"*. We can ship Path A, but the caption has to match the data — not the intent.

---

## Architectural-constraint check (re-run for each surviving path)

The non-negotiables from `CLAUDE.md`:

| Constraint | Path A (OA broadened) | Path 3 (S2 direct) | Path 4 (curated labs) |
|---|---|---|---|
| Every number has a verifiable public source | ✓ (OpenAlex + ROR) | ✓ when reachable | ✓ (curated list + gh-events) |
| No synthetic / simulated data | ✓ — server-side filtered to papers with structured institutions | — rate-limited, 0–15% coverage | ✓ |
| Graceful degradation | ✓ — if OA down, show stale + timestamp | — rate limit IS the default state | ✓ — same |
| Deterministic detection (no LLM inference) | ✓ | ✓ | ✓ |
| No per-request LLM calls | ✓ | ✓ | ✓ |
| **Honest product claim** | **✗ risky** — map biased toward repo-metadata hygiene, not research activity | n/a | ✓ if scoped to "top AI labs" |

---

## Options, ranked

### Path A — OpenAlex broadened, with narrowed claim. RECOMMEND with caveat.
- Ship the Research map layer.
- Label it honestly. Suggested copy: **"Institutional AI Research — OpenAlex-indexed papers, last 30d, with ≥1 structured affiliation."** Footnote: *"Frontier industry research (OpenAI, Google, DeepMind, Anthropic, Meta AI) is structurally under-represented — those orgs publish to ArXiv/preprint servers that don't carry affiliation metadata. This map reflects institutional-repository publishing, not total AI research activity."*
- Complexity: M. One source added to `data-sources.ts`, one fetch file, one new map layer with new dot colour, updated `/api/research` to merge the OpenAlex institutional feed with the existing ArXiv list.
- Match rate on filtered feed: 88–98% plottable. Geographic data is *real* but *biased* — the disclosure handles the bias honestly.

### Path 4 variant — "Top AI Labs" layer reusing gh-events. STRONG ALTERNATIVE.
- Curate ~30 top AI orgs with coords + their GitHub orgs: `anthropics` (SF), `openai` (SF), `google-deepmind` (London), `facebookresearch` (Menlo Park / Paris), `microsoft` (Redmond), `tsinghua-*` (Beijing), etc.
- Plot their GitHub activity this week as a new layer using data we **already have** (the gh-events pipeline is already running 5000 req/hr).
- No new external data source. No upstream metadata problem.
- Geography is correct by construction — plots exactly where the frontier labs are.
- Complexity: S. Curated JSON + one Globe layer variant.
- The "Research" panel stays the ArXiv list (unchanged). The globe gains a "Top Labs this week" layer that reflects real AI lab activity.

### Path B (from first brief) — two separate signals. Still valid.
Keep ArXiv Research panel as-is (list-only, no geocoding). Add a new OpenAlex-backed "Institutional Research" layer as per Path A. Two independent pipelines.

### Path 3, Path C, Path D
- Path 3 (S2 direct): **eliminated by empirical test.** API doesn't support the field in bulk, rate-limited, data sparse.
- Path C (from first brief — ship partial OA coverage as caveated): low signal, not recommended.
- Null (defer): still valid if none of A / B / 4 land.

---

## Recommendation

**Do Path 4 first** ("Top AI Labs" layer via gh-events), then **Path A** (OpenAlex institutional layer with the caveat-labelled copy). In that order.

Rationale:
1. Path 4 gives immediate visible signal in the right places (SF / London / Beijing / Mountain View) using a pipeline we already run. High product-integrity, low build cost, ships this session.
2. Path A complements it: the honest "institutional AI research" map shows the long-tail of academic AI work that Path 4 misses by design. Combined, the two layers give a fuller picture than either alone.
3. Path A alone would ship a map that visually under-represents Silicon Valley and Beijing — a risk of mis-reading by early users.

If you'd rather ship Path A as originally approved, that's valid too — but I'd want to write the caveat copy directly into the panel header, not bury it in a footnote, to satisfy the non-negotiable on honest source attribution.

---

## What I need from you

Three options:

1. **Ship Path 4 first, Path A next session.** (My recommendation.)
2. **Ship Path A as approved** — confirm the caveat copy is visible, not footnoted.
3. **Reject this brief — propose a fifth path.**

No code until you pick.

---

## Appendix — reproducible test commands

```bash
# S2 batch (with backoff)
curl -sS "https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,authors.name,authors.affiliations" \
  -H "Content-Type: application/json" \
  -d '{"ids":["arXiv:2604.10034","arXiv:2604.10035"]}'

# OpenAlex broadened filter
curl -sS "https://api.openalex.org/works?filter=concepts.id:C154945302,has_raw_affiliation_strings:true,type:article&per-page=50&sort=publication_date:desc&mailto=brindha@nativerse-ventures.com"

# Check ArXiv feed for ORCID / affiliation tags
grep -oE "orcid[^<\"]*|arxiv:affiliation" /tmp/arxiv-top20.xml
```
