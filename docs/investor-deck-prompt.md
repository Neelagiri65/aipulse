# Prompt for Claude (Design) — Gawk.dev Investor Pitch Deck

Use this prompt in Claude.ai with the design/artifacts capability to generate the pitch deck.

---

## PROMPT START

Design a seed-stage investor pitch deck for Gawk.dev following Y Combinator's Michael Seibel framework exactly. The deck should be 8-10 slides, visually clean with large text, no design flourishes. Every slide supports one idea. Lead with whatever is most impressive.

### YC Framework Rules (non-negotiable)
- 2-sentence company description + 1 concrete example on the first slide
- Team slide: specific accomplishments, not titles
- Traction slide: every metric MUST include a timeframe ("X in Y weeks")
- Market size: bottom-up math, show the calculation, not just a TAM number
- The ask: explicit amount + milestones for 18-24 months
- No jargon: never use "platform", "leverage", "paradigm", "observatory"
- Slides should be "visually boring with clear, large text"
- If a section is weak, omit it entirely rather than include weak numbers

### Company Details

**Name:** Gawk (gawk.dev)
**Domain:** gawk.dev (live, 200 OK)
**Repo:** github.com/Neelagiri65/aipulse (public, 391 commits in 25 days)
**Founded:** 18 April 2026
**Founder:** Neelagiri (Srinathprasanna Shanmugam) — enterprise sales professional, solo founder, based in London

**2-sentence description (draft — refine this):**
"Gawk aggregates 38 live data sources across the AI ecosystem — model rankings, tool outages, SDK downloads, research papers, community signals — into one dashboard where every number links to its public source. We ship a daily video briefing, email digest, and open API so teams stop checking 38 different endpoints."

**Concrete example to include:**
"When OpenAI's API went down on [date], Gawk's dashboard showed the outage in under 5 minutes, correlated it with a spike in Anthropic SDK downloads, and the daily video briefing covered both signals — all with source links, zero editorial."

### Product — What's Live Today

Dashboard at gawk.dev with:
- 3D interactive globe showing real-time GitHub events at verified AI lab HQ locations (32 labs, 10 countries)
- Tool health grid: live operational status for Claude, OpenAI, Copilot, Windsurf, Codex (from 6 status page APIs)
- Model rankings: LMArena Elo leaderboard with weekly rank/Elo deltas, OpenRouter weekly rankings
- SDK adoption heatmap: download trends across PyPI, npm, crates.io, Docker Hub, VS Code Marketplace, Homebrew (6 registries, 25+ packages)
- Community wire: filtered feed from Hacker News, Reddit (r/LocalLLaMA, r/ClaudeAI), 7 RSS publishers across 5 countries
- Research panel: latest arXiv cs.AI + cs.LG papers
- AI agents panel: 8 frameworks tracked (LangChain, CrewAI, AutoGPT, etc.) with stars, liveness, package downloads
- /audit page: deterministic AI-config checker (CLAUDE.md, .cursorrules detection — no LLM)
- Public transparency page: every source named, methodology explained

### Distribution Channels (the moat — no competitor does this)

1. **Daily video** — fully automated pipeline: live data fetch, script generation, TTS narration, Playwright screenshot capture, ffmpeg composite, YouTube upload. Runs at 8am daily via local cron. YouTube + Instagram + Facebook + TikTok (last two pending app approval)
2. **Email digest** — daily, double-opt-in via Resend, SPF/DKIM/DMARC enforced, archived at /digest/[date]
3. **Web push notifications** — real-time tool health alerts (e.g. "Claude API degraded")
4. **Discord webhooks** — tool health transition alerts (green/yellow/red)
5. **Public API** — 7 versioned endpoints at /api/v1/ (feed, models, sdk, agents, labs, sources, status)
6. **RSS feed** — for power users
7. **Source health watchdog** — local Hermes 3 8B agent monitors all 38 endpoints every 6 hours, detects shape drift and anomalies

### Technical Differentiation

- Zero LLM calls in the production data pipeline. All AI-config detection is deterministic file-presence checks.
- Every displayed number has a typed registry entry with sanity ranges, verification date, source URL, and caveats (data-sources.ts — 1200 lines of source contracts)
- Graceful degradation enforced: source down = grey card + last known value + timestamp. Never fabricate.
- 23 automated cron workflows running on GitHub Actions
- Local Hermes 3 8B watchdog agent for endpoint health monitoring
- Built in 25 days, solo, 391 commits

### Data Sources (38 verified)

| Category | Count | Examples |
|---|---|---|
| GitHub activity | 10 | Events API, GH Archive, Code Search, Topics, Lab events |
| Status pages | 9 | Anthropic, OpenAI, Windsurf, GitHub/Copilot, + 4 platform infra |
| Press RSS | 7 | The Register, Heise, MIT Tech Review, Synced Review, Latent Space, MarkTechPost, Analytics Vidhya |
| Package adoption | 6 | PyPI, npm, crates.io, Docker Hub, VS Code Marketplace, Homebrew |
| Community | 3 | r/LocalLLaMA, r/ClaudeAI, Hacker News |
| Research | 1 | arXiv cs.AI + cs.LG |
| Model distribution | 1 | HuggingFace Models API |
| Model benchmark | 1 | LMArena (Chatbot Arena) Elo leaderboard |

### Competitive Landscape (be honest, not generous)

| Competitor | What they do well | What they don't do |
|---|---|---|
| Artificial Analysis | 15 sub-dashboards, credible model benchmarks | No live events, no status pages, no SDK adoption, no distribution |
| LM Market Cap | 409 services, 355 models, pricing calculators | No globe, no live events, no cross-layer view |
| AI News / smol.ai | 200+ sources, 150K subscribers, 15-min refresh | News aggregation only — no status, no benchmarks, no API |
| HuggingFace | 180M dev reach, trending + leaderboards | Could replicate Gawk's globe in one sprint — existential threat |
| GitHub | Owns the event data | Could build an AI-filtered globe trivially |

**Gawk's defensible edge:** Per-number source citation. No competitor links every cell to its upstream source. This is a trust contract, not a feature — it compounds with every source added.

**Honest threat:** HuggingFace or GitHub could build a competing view in one sprint. The moat is not the data — it's the editorial discipline (never editorialise, never score, never fabricate) plus the distribution rails (video/email/push/Discord/API) that no data-first competitor ships.

### Traction (FILL IN REAL NUMBERS — ask the founder)

The founder needs to provide these from their dashboards. Include timeframes with every number:
- [ ] YouTube: total views, subscribers, average watch time — "X views in Y days"
- [ ] Email: subscriber count, open rate — "X subscribers in Y days, Z% open rate"
- [ ] Website: unique visitors, page views — from Vercel Analytics
- [ ] API: total calls — from Vercel logs
- [ ] Push notification subscribers
- [ ] Discord server members
- [ ] Product velocity: "391 commits, 38 verified sources, 23 cron workflows, 7 API endpoints — built in 25 days, solo"

If any number is embarrassingly low, OMIT that metric entirely per YC guidance. Product velocity (391 commits in 25 days) is the strongest traction signal for a pre-revenue product.

### Non-Obvious Insight (the slide that wins the pitch)

Draft options — the founder should pick whichever resonates most:

1. "AI teams don't need another dashboard. They need a feed they trust enough to not check the original sources. Trust requires per-number citation — and that's an editorial discipline, not a feature. Nobody else enforces it because it's operationally painful: 38 sources, each with sanity ranges, verification dates, and graceful degradation. That pain is the moat."

2. "The AI ecosystem is 38 dashboards checked by the same 10,000 people. The first product to aggregate and distribute (video, email, push, API) wins because switching costs compound — you don't switch your morning briefing."

3. "Every AI data product editorialises. They score models, rank labs, generate trust ratings. The market doesn't need more opinions — it needs a Bloomberg terminal for AI: just the numbers, every number cited, updated in real time."

### Market Size (bottom-up — show the math)

The founder needs to define:
- Who exactly pays? (AI teams at startups? Enterprise DevOps? Investors tracking AI?)
- How many of them exist? (bottom-up: X companies with AI teams, Y developers per team)
- What would they pay? (API access at $X/mo? Premium alerts at $Y/mo?)
- Example: "50,000 AI-first startups x $49/mo API tier = $29.4M ARR addressable"

### Business Model (pick ONE — no "potpourri")

Options to choose from:
1. **Freemium API** — free tier (rate-limited), paid tier ($49-199/mo) for higher throughput + historical data + webhook alerts
2. **Premium alerts** — free dashboard, paid stack-specific health alerts ($29/mo per team)
3. **Enterprise data feed** — Bloomberg-style real-time feed for AI investment firms ($500+/mo)
4. **Sponsored placement** — AI tool vendors pay for verified placement in health grid (risky — conflicts with trust contract)

Recommendation: Lead with #1 (Freemium API). It's the simplest to explain, the API already exists, and it doesn't conflict with the trust contract.

### The Ask (FILL IN)

- How much are you raising?
- What milestones does it fund in 18-24 months?
- Example: "Raising $X to reach Y subscribers and Z API customers in 18 months by expanding from [current] to [target]."

### Design Guidelines

- Clean, minimal slides. White or very dark background. Large text.
- No gradients, no stock photos, no icons unless they're product screenshots
- Product screenshots should be actual screenshots of gawk.dev (the founder will provide these)
- Use the actual gawk.dev colour palette if possible
- Each slide: one idea, one message, large text
- Total deck: 8-10 slides maximum
- Format: PDF or Google Slides

### Slide Order (adapt based on what's strongest)

Per YC: lead with whatever is most impressive. Suggested order:

1. **Title + 2-sentence description** + concrete example
2. **Product demo** — screenshot of the live dashboard with callouts
3. **Distribution** — the 7-channel moat (this is the most impressive thing about Gawk)
4. **Traction** — product velocity + whatever real numbers are available (with timeframes)
5. **Non-obvious insight** — why trust + distribution beats data
6. **Market** — bottom-up math
7. **Competitive landscape** — honest grid
8. **Business model** — one model, simple
9. **Team** — solo founder, 391 commits in 25 days, enterprise sales background
10. **The ask** — amount + milestones

## PROMPT END
