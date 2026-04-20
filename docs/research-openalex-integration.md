# Research: OpenAlex integration for the Research tab

**Date:** 2026-04-20
**Protocol:** /research-first (per global CLAUDE.md)
**Author:** session 20 (Builder)
**Status:** BLOCKER FOUND — feature as specified is not buildable. Pivot decision required before any code.

---

## Step 1 — What the user asked for

> *"Build OpenAlex integration for the Research tab. For each ArXiv paper, look up the work in OpenAlex by DOI or title, extract author affiliations with institution IDs, resolve each institution to a country and coordinates. Every research paper plottable on the map by institution location."*

One-line goal: **make every ArXiv paper in the Research tab plottable on the globe by author-institution coordinates.**

---

## Step 2 — Empirical test against the proposed architecture

I did not want to trust documentation or speculation, so I ran the actual API flow against the current top-20 ArXiv cs.AI/cs.LG papers and measured.

### Test A — Match rate by age of paper

| Cohort | ArXiv IDs tested | OpenAlex DOI-match rate |
|---|---|---|
| Today (fresh, <24h) | `2604.162xx` × 20 | **0 / 20** |
| ~9 days old | `2604.100xx` × 10 | 10 / 10 |
| ~2 months old | `2603.27xxx` sample × 20 | 18 / 20 |
| Known-published (2023–2024, highly cited) | 5 sample | 4 / 5 |

**Finding 1:** OpenAlex does eventually index ArXiv preprints via the DOI prefix `10.48550/arXiv.{id}`, but with a lag of **5–9 days** from submission to appearance. The freshest papers — the ones the Research tab is designed to surface — have a **0% match rate** on the day they appear.

### Test B — Institution coverage, even when matched

This is the finding that kills the feature as specified.

| Cohort | Papers matched | Authors total | Authors with structured `institutions` | **Author-level coverage** |
|---|---|---|---|---|
| ~2-month-old ArXiv papers | 18 | 224 | 3 | **1.3%** |
| Llama 2 paper (published, highly cited) | ✓ matched | 68 | **0** | **0%** |
| OpenAlex's own paper (2205.01833) | ✓ matched | several | 0 | **0%** |

**Finding 2:** OpenAlex's institution field is almost entirely empty for papers whose primary location is ArXiv. Not "sparse" — effectively zero. Even Meta AI's Llama 2 paper with 68 named authors has zero structured institutions.

### Test C — Why (verified upstream)

- **ArXiv's own Atom feed:** `<arxiv:affiliation>` subelement is the documented place for affiliation data, **but: 0 / 112 authors** across the current top-20 papers carry that tag. ArXiv's [own documentation](https://info.arxiv.org/help/api/user-manual.html) confirms affiliation is optional free-text on submission; submitters don't fill it in.
- **OpenAlex pulls institution data from Crossref and other upstream catalogues.** ArXiv DOIs (via DataCite) do not include structured author affiliations. So OpenAlex has nothing to pull.
- **Result:** the upstream metadata simply does not exist in structured form for ArXiv preprints.

### Test D — Alternative sources?

- **Semantic Scholar:** rate-limited on first call without an API key (429 Too Many Requests). Would require registering for the API-key programme and still depends on the same upstream affiliation metadata that ArXiv doesn't publish.
- **ArXiv Institutional Submission Data:** aggregate-only (N submissions per member institution per month), not paper-level. Can't plot individual papers.
- **OpenAlex filtered to `primary_location.source.type = repository`** (i.e. preprints from all servers, not ArXiv specifically): **34% of papers have ≥1 structured institution** — because HAL, SSRN, institutional repositories, etc. sometimes carry richer metadata. Better, but still not "every paper plottable".
- **OpenAlex filtered to journals**: 20% of recent AI journal papers have structured institutions. A lot of retraction notes and editorial content pollute the feed. Needs careful filtering.

---

## Step 3 — Architectural constraints check

The project's non-negotiables (from `CLAUDE.md`):

1. **"Every displayed number has a verifiable public source."** — OK: OpenAlex is public, API is documented.
2. **"No synthetic or simulated data on the globe. Every dot is a real, verifiable event."** — *This is where the proposed design fails.* If we plot an ArXiv paper at the submitter's affiliation without structured metadata, we'd be inferring / guessing. If we skip papers with no affiliation, 98.7% of ArXiv papers never get a dot.
3. **"Graceful degradation is mandatory."** — "Research layer on the map is empty 98.7% of the time" is not graceful degradation; it's the default state.
4. **"Deterministic detection only. Never an LLM inferring 'looks AI-generated'."** — By extension: never an LLM inferring an affiliation from PDF text. Rules out a PDF-extraction pivot.

**Verdict: the proposed architecture (ArXiv → OpenAlex → institution coordinates) violates constraints 2 and 3 empirically.**

---

## Step 4 — Known pitfalls

- **Vault failures checked:** no prior failures on academic-API ingestion in `~/Obsidian/agent-vault/learnings/failures/` (6 failures logged; none relevant).
- **Directly relevant past failure: `contextkey-cloud-api-flaw.md`** — the lesson is "write a 1-paragraph architectural constraint test before building, verify the design against each constraint". That's what this research doc is. Catching this now is the exact pattern.
- **Prior art checked:** several academic-bibliometric dashboards (Dimensions, Lens.org, OurResearch's own tools) exist, but none plot ArXiv-specifically on a map — for exactly this reason. The ones that do plot AI research geographically plot **published** works, not preprints.

---

## Step 5 — Success / failure criteria

**If this shipped as the user proposed:**
- Success would be: ≥15 / 20 Research papers visible on the map, clustered by real institution coordinates, updated every poll.
- Failure would be: <5 / 20 visible. The map layer looks broken. Users see a Research toggle that produces 0–2 dots.
- **Predicted outcome on the empirical data: 0–1 / 20 on most days, 3–5 / 20 occasionally.** This is failure.

---

## Step 6 — Options to proceed

Three honest paths, plus a null option:

### Path A — Broaden the source, drop ArXiv-exclusivity
Switch the Research tab from "top 20 ArXiv cs.AI preprints" to "top 20 OpenAlex cs.AI works with ≥1 structured institution, sorted by publication date desc". Blend of preprint repos (HAL, SSRN, institutional) + journal articles + some ArXiv.
- **Pro:** 100% of plotted papers are plottable (they're filtered in). Geographic story works.
- **Con:** Research tab no longer = "what hit ArXiv today". Freshness drops from hours to days. The "recency of AI research" signal weakens; the "geography of AI research" signal is honest.
- **Complexity:** M. New fetch pipeline, discard ArXiv fetcher OR keep ArXiv as a secondary non-geographic list.

### Path B — Two separate signals
Keep the ArXiv Research panel unchanged (list-only, no map). Add a NEW layer "Institutional research" sourced from OpenAlex `authorships.institutions` filter. Separate nav entry. The ArXiv panel stays as the "freshest preprints" ticker; the new layer is the "who is publishing AI research, where" globe story.
- **Pro:** Preserves recency signal AND geographic signal, cleanly separated. Honest about what each one is.
- **Con:** Two pipelines to maintain. More crons. Higher build cost than Path A.
- **Complexity:** M-L.

### Path C — Ship the filter, tell the truth
Keep ArXiv as-is. Add OpenAlex lookup. On papers where OpenAlex has institutions, show them on the map + list. On papers without, show the list row with an explicit "Affiliation not published" caveat. Never synthesise a dot.
- **Pro:** Cheapest to build. Honest.
- **Con:** Map layer is 0–3 dots most days. Does not deliver the product goal ("Research tab becomes geographic"). Low user impact.
- **Complexity:** S.

### Path D — Drop the feature, ship regional RSS first
The user flagged OpenAlex and regional RSS as the two highest-value next steps. OpenAlex is blocked by upstream data reality. **Regional RSS feeds have no such blocker** — the same pattern as HN ingestion, which is already working. Ship that first, revisit research-geography once the project has Upstash Redis and can afford a heavier enrichment pipeline (possibly against GRID or ROR directly).
- **Pro:** Unblocks visible progress. Avoids a session spent on a feature whose data layer is empty.
- **Con:** The "research tab becomes geographic" ambition is deferred, not solved.
- **Complexity:** N/A for this session.

---

## Recommendation

**Path A** is the intellectually honest build. It accepts the finding and delivers the user's underlying intent ("make Research geographic") via a different source. The product decision is whether the Research tab is allowed to stop being "ArXiv-exclusive" — that's the user's call, not Builder's.

If the user wants ArXiv-exclusivity preserved, **Path B** is the next-best and the expensive option.

**Path C** ships fast but does not satisfy the stated product goal, so I'd flag it as "visible feature, low signal" in the HANDOFF.

**Path D** is the honest punt.

---

## What I need from you before any code

One decision:
1. **A, B, C, or D.**

If A or B, one sub-decision:
2. Do we keep the ArXiv list somewhere, or fully replace it with the OpenAlex-backed mix?

Once decided, I will:
- Update `docs/` with a PRD per CLAUDE.md Phase 1 Step 2.
- Decompose into issues per Step 3.
- Build TDD per Phase 2.
- Not before.

---

## Appendix — reproducible test commands

```bash
# Match rate by age — change the 'start' offset to sample different cohorts
curl -sS "https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&start=0&max_results=20" > /tmp/arxiv.xml

# For each extracted ID:
curl -sS "https://api.openalex.org/works/doi:10.48550/arXiv.{ID}?mailto=brindha@nativerse-ventures.com"

# Institution coverage on the match — check authorships[*].institutions[*].country_code
```

All numbers in this document came from hitting the live APIs on 2026-04-20. Reproducible with the commands above.
