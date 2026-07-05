# Gawk — Data Sources

Every number on this dashboard traces back to a publicly verifiable source. Gawk aggregates — it does not invent metrics, re-score labs, or manufacture values. When a source is unavailable, the affected card falls to graceful degradation with a "last known value" and timestamp rather than blanking silently.

As of 2026-07-05, Gawk tracks **42 verified sources** across GitHub activity, status pages, platform-infrastructure status pages, published research, model distribution, package adoption, community sentiment, AI publishers, and model benchmarks — plus active reachability probes for each AI tool.

---

## Verified sources

### Code activity (11)
- GitHub Events API
- GH Archive — hourly public-event dumps
- GitHub Contents API
- GitHub Code Search — filename discovery
- GitHub Repository Search — topic discovery
- GitHub Repository Metadata — stars, open issues, last-pushed, archived flag
- ecosyste.ms — npm reverse-dependencies
- GitHub Repository Events API — labs activity fetcher
- GitHub Repository Events API — tracked repos (founder-curated list)
- GitLab — universe pulse + tracked project events
- AI Labs — curated HQ registry

### Status pages — AI tools (6)
- Anthropic Status — Claude Code + API
- OpenAI Status — summary
- OpenAI Status — incidents
- GitHub Status — covers Copilot
- Windsurf Status
- Cursor Status

### Tool reachability probes (measured, not declared)
Alongside each tool's **declared** status page above, Gawk runs an **active reachability probe** — it hits the tool's real service endpoint and records whether it answered, from a single probe location. Shown symmetrically with the declared status, never merged into it; a disagreement (page says operational, probe unreachable) is surfaced, not resolved. The signal is "reachable", never "up/healthy" — a response proves the service answered, not that the backend is well. A single failed probe never asserts an outage (hysteresis). Latency is one-location round-trip (mostly geography). Endpoints (some undocumented; failure degrades to "pending", never fabricated): api.anthropic.com, api.openai.com, api.github.com, server.codeium.com, api2.cursor.sh.

### Status pages — platform infrastructure (4)
These four track the services Gawk itself runs on. Surfaced operator-side only (`/admin`); the public Tool Health card grid stays AI-focused.
- Vercel Status — host
- Supabase Status — data layer
- Cloudflare Status — DNS + proxy
- Upstash Status — Redis cache

### Model distribution + research (4)
- GitHub Issues — anthropics/claude-code
- HuggingFace Models API — text-generation by downloads
- OpenRouter — model usage rankings (top-weekly)
- arXiv API — cs.AI + cs.LG, recent

### Package adoption (6)
- PyPI — recent download counters (via pypistats.org)
- npm — download counters (api.npmjs.org)
- crates.io — Rust crate download counters
- Docker Hub — container pull counters
- Homebrew — formula install counters
- Visual Studio Marketplace — extension catalogue

The PyPI, npm, and GitHub Repository Metadata sources also power the Agents panel — an 8-row view of agent-framework adoption (LangGraph, CrewAI, smolagents, AutoGen, OpenAI Agents, Pydantic AI) plus two tombstones (AutoGPT as legacy reference, Sweep as dormant).

### Community sentiment (3)
- Hacker News — AI-filtered story stream
- Reddit — r/LocalLLaMA (top-of-day, AI-themed sub)
- Reddit — r/ClaudeAI (top-of-day, Anthropic-adjacent sub)

### Model benchmarks (1)
- Chatbot Arena — `lmarena-ai/leaderboard-dataset` (HuggingFace)

### AI publishers (7)
- The Register — AI/ML section feed
- Heise Online — global Atom, AI-filtered
- Synced Review — AI research, China/global
- MarkTechPost — AI research, India-based team
- Analytics Vidhya — Indian AI / data-science publisher
- MIT Technology Review — AI topic feed
- latent.space — AI engineering newsletter

---

## Tracked gaps (surfaced, not hidden)

_(Cursor's first-party status page — `status.cursor.com` — is now tracked, and every tool carries an active reachability probe; both are listed under Verified sources above. No AI-tool card is in no-data mode.)_

---

## Governance

- **Every number ships with a source.** A metric on the dashboard that cannot be cited to one of the 35 sources above does not ship.
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

_Last updated: 2026-05-03._
