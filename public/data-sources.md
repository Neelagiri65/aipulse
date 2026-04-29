# Gawk — Data Sources

Every number on this dashboard traces back to a publicly verifiable source. Gawk aggregates — it does not invent metrics, re-score labs, or manufacture values. When a source is unavailable, the affected card falls to graceful degradation with a "last known value" and timestamp rather than blanking silently.

As of 2026-04-29, Gawk tracks **29 verified sources** across GitHub activity, status pages, published research, model distribution, package adoption, community sentiment, regional press, and model benchmarks.

---

## Verified sources

### GitHub activity (8)
- GitHub Events API
- GH Archive — hourly public-event dumps
- GitHub Contents API
- GitHub Code Search — filename discovery
- GitHub Repository Search — topic discovery
- ecosyste.ms — npm reverse-dependencies
- GitHub Repository Events API — labs activity fetcher
- AI Labs — curated HQ registry

### Status pages (5)
- Anthropic Status — Claude Code + API
- OpenAI Status — summary
- OpenAI Status — incidents
- GitHub Status — covers Copilot
- Windsurf Status

### Model distribution + research (3)
- GitHub Issues — anthropics/claude-code
- HuggingFace Models API — text-generation by downloads
- arXiv API — cs.AI + cs.LG, recent

### Package adoption (6)
- PyPI — recent download counters (via pypistats.org)
- npm — download counters (api.npmjs.org)
- crates.io — Rust crate download counters
- Docker Hub — container pull counters
- Homebrew — formula install counters
- Visual Studio Marketplace — extension catalogue

### Community sentiment (1)
- Hacker News — AI-filtered story stream

### Model benchmarks (1)
- Chatbot Arena — `lmarena-ai/leaderboard-dataset` (HuggingFace)

### Press / regional (5)
- The Register — AI/ML section feed
- Heise Online — global Atom, AI-filtered
- Synced Review — AI research, China/global
- MarkTechPost — AI research, India-based team
- MIT Technology Review — AI topic feed

---

## Tracked gaps (surfaced, not hidden)

### Cursor
No public status endpoint and no public issue tracker at the time of checking. The Cursor card stays on the dashboard in explicit no-data mode rather than silently omitted — a dashboard that hides Cursor reads as "not an AI coding tool worth tracking", which isn't honest. Reinstatement requires a publicly hit-able endpoint with a stable schema.

---

## Governance

- **Every number ships with a source.** A metric on the dashboard that cannot be cited to one of the 29 sources above does not ship.
- **Deterministic only.** Pattern matching, keyword allowlists, file existence checks. No LLM classification anywhere in the ingest pipeline.
- **Pre-committed sanity ranges.** Each source has an expected value range set before data lands on the dashboard. Data outside that range is investigated before the metric returns to the UI — never recalibrated to make the narrative look better.
- **Graceful degradation.** When a source is unavailable the card stays on the dashboard in a "last known value" state with a timestamp, not blanked.
- **Never retroactively edited.** Sources are added or removed in commit history; sanity ranges are widened in commit history. The audit trail is the history.

## Outbound channels

Gawk re-broadcasts a subset of its public, source-cited cards into operator-facing channels. Every embed quotes the upstream status page verbatim — no editorial layer, no inferred severity.

- **Email digest** — daily summary, opt-in. Sent from `noreply@gawk.dev` (Resend, eu-west-1).
- **Discord webhook for tool-status transitions** — fires once when a tracked tool flips to a non-operational status on its upstream status page, and once again when it recovers. Yellow embed for `degraded`, red for `partial_outage` / `major_outage`, green on recovery. Dedup state is persisted so two consecutive ticks of the same status emit one embed.

## Full registry detail

The complete source registry — endpoint URLs, polling cadences, rate-limit budgets, sanity-range bounds, caveats, and per-source curation criteria — is editorial intelligence rather than shipped code. Available on request.

---

_Last updated: 2026-04-29._
