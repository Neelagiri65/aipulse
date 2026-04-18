# AI Pulse — Complete Architecture Specification V3

## The Real-Time Nervous System of the Global AI Ecosystem

**One-line:** A live observatory aggregating every publicly observable signal across the AI ecosystem — from silicon to models to tools to agents to code to production to policy — into a single real-time dashboard.

**Analogy:** World Monitor is for geopolitics. Bloomberg Terminal is for finance. AI Pulse is for AI.

**Core principle:** Every data point on the dashboard traces to a verifiable public source. AI Pulse editorialises nothing. It aggregates, measures, and displays. The credibility IS the product.

**Inspiration:** World Monitor (worldmonitor.app) — 435+ feeds, 65+ data sources, 45 data layers, 10-second refresh, 44k stars, zero-cost infrastructure via Vercel + browser-first compute.

---

## PART 0: LESSONS FROM CODEPULSE V1

### What went wrong and what this spec corrects

1. **Wrong sample population.** V1 searched for CLAUDE.md files in top-starred repos. Popular repos ≠ heavy AI tool users. The methodology was never challenged before code was written. **Fix:** Every data source in this spec includes a "validity check" — a specific test that confirms the data actually measures what we claim it measures, run before any code is written.

2. **Tried to generate scores instead of aggregating facts.** V1 invented a scoring algorithm (82 regex patterns + LLM) and produced thin, unconvincing results. **Fix:** AI Pulse primarily aggregates data that already exists and is already trusted — status pages, published research, GitHub issue counts, benchmark results, pricing pages. Original analysis is clearly labelled and backed by methodology documentation.

3. **No adversarial review of methodology.** Every technical decision was approved without challenge. **Fix:** Dual-model build methodology (see Part 1) with mandatory Auditor review at every checkpoint.

4. **Scope creep before core validation.** Built a globe, community features, and educational content before confirming the core measurement worked. **Fix:** Strict phase gating. Phase 1 must produce a trustworthy dashboard with real, live data before any additional features are added. Each phase has a validation gate that must pass before proceeding.

5. **Confused "interesting" with "trustworthy."** When 96% of repos scored zero, the response was "interesting finding, pivot the narrative" instead of "the measurement is broken." **Fix:** Every metric has a pre-defined "sanity check" — an expected range based on external evidence. If results fall outside that range, the methodology is investigated before the data is published.

---

## PART 1: DUAL-MODEL BUILD METHODOLOGY

### 1.1 The Two Roles

**Builder (Sonnet-tier / Claude Code):**
- Writes code, implements features, executes tasks
- Proposes approaches, architectures, data sources
- Optimises for shipping speed and code quality
- Bias: action and completion

**Auditor (Opus-tier / /advisor command):**
- Reviews every decision before it's committed
- Challenges assumptions, validates data sources, stress-tests claims
- Checks that every displayed number traces to a verifiable source
- Has veto power — nothing ships without Auditor approval
- Bias: correctness and trustworthiness

### 1.2 Mandatory Checkpoints

The Auditor is consulted at these points in every session:

1. **Before any new data source is added:** "Is this source public? Is it reliable? How often does it update? What happens if it goes down? Can a user independently verify this number?"

2. **Before any metric is displayed:** "What does this number actually measure? What assumptions does it require? What's the expected range based on external evidence? If a sceptical user challenges this, what's our defence?"

3. **Before any visual is designed:** "Does this visualisation accurately represent the underlying data? Could it be misleading? Is the scale appropriate? Are comparisons fair?"

4. **Before any claim is made in UI copy:** "Can we cite a specific source for this claim? Is the source less than 90 days old? Is it from a credible institution?"

5. **Before each phase gate:** "Does the dashboard currently display only trustworthy, verifiable information? Would we be comfortable if a journalist fact-checked every number?"

### 1.3 Session Protocol

```
SESSION START:
1. Builder reads HANDOFF.md
2. Auditor reads HANDOFF.md + north star spec
3. Builder proposes session plan
4. Auditor challenges: "What assumptions are in this plan? What could go wrong?"
5. Plan is revised and approved

DURING SESSION:
- Builder implements
- At each checkpoint, Builder pauses and presents to Auditor
- Auditor approves or blocks with specific reasons
- If blocked, Builder revises

SESSION END:
1. Builder runs /mom validation
2. Auditor reviews: "Is everything displayed on the dashboard currently true and verifiable?"
3. HANDOFF.md updated with Auditor sign-off
```

### 1.4 Implementation in Claude Code

Configure the `/advisor` command to use Opus as the Auditor model. At every checkpoint listed above, the Builder calls `/advisor` with the specific decision and waits for approval before proceeding.

For the human (you): you see both perspectives and make the final call. The dual-model process ensures you're making informed decisions, not rubber-stamping unchallenged proposals.

---

## PART 2: PRODUCT VISION

### 2.1 What AI Pulse Is

A live, public dashboard that aggregates every publicly observable signal across the AI ecosystem into a unified real-time view. It answers: "What is happening in AI right now, and is any of it trustworthy?"

It is the single place where a developer, researcher, investor, journalist, or policymaker can see:
- Which AI tools are up or down right now
- Which models are leading on which benchmarks
- What the real productivity impact of AI tools is (not the hype)
- What security risks AI-generated code is introducing
- What regulatory changes are coming and when
- How the autonomous agent ecosystem is evolving
- What the community actually thinks vs what marketing claims

### 2.2 What AI Pulse Is NOT

- Not a scoring engine that generates its own ratings
- Not an opinion platform
- Not a review site
- Not limited to coding tools
- Not a product comparison tool
- Not a news aggregator (it aggregates DATA, not articles)

### 2.3 The Trust Contract

Every number on the dashboard has a source citation. Every source is publicly accessible. Every methodology is documented. If a user clicks any metric, they can see: what it measures, where the data comes from, when it was last updated, and how to independently verify it.

If we can't cite a verifiable source for a claim, it doesn't appear on the dashboard.

---

## PART 3: THE 13 DATA LAYERS

Each layer includes: what it measures, specific data sources, specific API endpoints or URLs, update frequency, validity checks, and sanity check ranges.

### Layer 1: Silicon and Hardware

**What it measures:** GPU availability, pricing, and supply chain signals affecting AI infrastructure.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| Cloud GPU pricing aggregators | Spot and on-demand pricing for H100, A100, H200, B200 across providers | vast.ai/api, sfcompute.com, runpod.io/api | Hourly |
| NVIDIA investor relations | Earnings, production announcements, new chip launches | investor.nvidia.com | Quarterly + event-driven |
| TSMC monthly revenue reports | Chip production volume signals | investor.tsmc.com | Monthly |
| Tom's Hardware / AnandTech | Benchmark data for new hardware | Public articles | Event-driven |
| Export control announcements | US/China chip restrictions | commerce.gov, public filings | Event-driven |

**Validity check:** Can we independently verify the GPU price by visiting the provider's website? Yes — every price traces to a public pricing page.

**Sanity check:** H100 spot prices should be in the $1-5/hr range. If our data shows $50/hr or $0.01/hr, the source is broken.

**Displayed on dashboard:** GPU price heatmap by provider and region. New chip timeline. Supply chain alert feed.

---

### Layer 2: Cloud AI Infrastructure

**What it measures:** Status, pricing, and availability of cloud AI services.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| AWS Health Dashboard | Bedrock service status | health.aws.amazon.com | Real-time (RSS/API) |
| Google Cloud Status | Vertex AI service status | status.cloud.google.com | Real-time (RSS) |
| Azure Status | OpenAI Service status | status.azure.com | Real-time (RSS) |
| Together AI status | Inference status | status.together.ai | Real-time |
| Groq status | Inference status | status.groq.com | Real-time |
| Fireworks status | Inference status | status.fireworks.ai | Real-time |
| Replicate status | Inference status | status.replicate.com | Real-time |
| Cloudflare Radar | Internet infrastructure health | radar.cloudflare.com/api | Real-time |
| Artificial Analysis | Inference benchmarks (latency, throughput) | artificialanalysis.ai | Weekly |

**Validity check:** Status pages are operated by the providers themselves. These are the canonical source for uptime data.

**Sanity check:** Major providers should show 99%+ uptime over 30 days. If any shows below 95%, verify against third-party monitoring (Downdetector).

**Displayed on dashboard:** Provider status grid (green/amber/red). Latency sparklines by provider. Historical uptime percentage.

---

### Layer 3: Foundation Models

**What it measures:** Every model release, benchmark result, pricing change, and capability update across all providers.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| LMSYS Chatbot Arena | Community-voted model rankings | chat.lmsys.org API | Daily |
| Artificial Analysis | Performance benchmarks, pricing, latency | artificialanalysis.ai | Weekly |
| HuggingFace Open LLM Leaderboard | Open model benchmarks | huggingface.co/spaces/open-llm-leaderboard | Daily |
| Provider blogs | Model announcements, benchmarks | anthropic.com/news, openai.com/blog, blog.google/technology/ai | Event-driven |
| Provider pricing pages | Per-token costs | anthropic.com/pricing, openai.com/api/pricing | Event-driven (tracked for changes) |
| Provider changelogs | Model updates, deprecations | docs.anthropic.com, platform.openai.com/docs/changelog | Event-driven |
| Papers With Code | Benchmark results from publications | paperswithcode.com/api | Daily |
| SWE-bench | Coding benchmark results | swebench.com | Event-driven |
| ARC-AGI | Reasoning benchmark | arcprize.org | Event-driven |

**Validity check:** Benchmark results should match what providers publish on their own blogs. Cross-reference at least 2 sources for any benchmark claim.

**Sanity check:** Top model scores on established benchmarks should increase or stay flat over time. A sudden drop suggests a data error, not a real regression.

**Displayed on dashboard:** Model leaderboard with benchmark radar chart. Pricing timeline. Context window comparison matrix. Release timeline across all providers.

---

### Layer 4: AI Coding Tools

**What it measures:** Health, quality, adoption, and community sentiment for AI coding tools.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| Anthropic status page | Claude Code / API status | status.anthropic.com (RSS) | Real-time |
| GitHub Issues (claude-code repo) | Issue count, velocity, quality complaints | api.github.com/repos/anthropics/claude-code/issues | Hourly |
| GitHub Issues (cursor repo) | Issue count, velocity | api.github.com (if public) | Hourly |
| Downdetector | Outage reports from users | downdetector.com (scrape or API) | Real-time |
| VS Code Marketplace | Extension installs for Copilot, Continue, Cline | marketplace.visualstudio.com/api | Daily |
| npm registry | Claude Code, Cursor downloads | api.npmjs.org/downloads | Daily |
| Piebald-AI | Claude Code system prompt versions | github.com/Piebald-AI/claude-code-system-prompts | Per CC release |
| Twitter/X API | Sentiment and volume for tool mentions | api.x.com (or scrape) | Hourly |
| Reddit API | r/ClaudeAI, r/cursor post volume and sentiment | reddit.com/r/*/about.json | Hourly |
| Hacker News API | AI tool stories on front page | hn.algolia.com/api | Hourly |

**Validity check:** Issue counts are directly verifiable on GitHub. Status page data is canonical. Download counts are from official registries.

**Sanity check:** Claude Code should have 100-1000+ open issues (large active project). If our count shows 0, the API call is failing. Download trends should be generally upward for growing tools.

**Displayed on dashboard:** Tool health cards (status, uptime, version, issue count, sentiment bar). Issue velocity sparklines. Version release timeline. Community sentiment gauge.

---

### Layer 5: AI Application Tools

**What it measures:** Status and adoption signals for AI tools beyond coding.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| OpenAI status page | ChatGPT, API status | status.openai.com | Real-time |
| Google AI status | Gemini status | Included in cloud status | Real-time |
| Perplexity status | Search AI status | If available | Real-time |
| SimilarWeb / public traffic estimates | Monthly visits to major AI platforms | Public reports | Monthly |
| App store rankings | ChatGPT, Claude app rankings and reviews | Apple/Google APIs | Daily |
| Product Hunt | New AI tool launches | producthunt.com/api | Daily |

**Displayed on dashboard:** Application tool status grid. Adoption trend sparklines. New tool launch feed.

---

### Layer 6: Autonomous Agents

**What it measures:** The health, security, and adoption of autonomous AI agent frameworks.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| OpenClaw GitHub | Stars, forks, releases, issues, contributors | api.github.com/repos/openclaw/openclaw | Hourly |
| OpenClaw security advisories | Vulnerability reports, malicious skill detections | GitHub Security tab | Event-driven |
| LangChain/LangGraph GitHub | Release velocity, adoption metrics | api.github.com | Daily |
| CrewAI GitHub | Same | api.github.com | Daily |
| AutoGen GitHub | Same | api.github.com | Daily |
| Vercel AI SDK GitHub | Same | api.github.com | Daily |
| NVIDIA NemoClaw | Enterprise agent deployment signals | GitHub + NVIDIA blog | Event-driven |
| Agent marketplace metrics | Skill/plugin counts across ecosystems | Public APIs/scraping | Daily |
| Agentic AI Foundation | Standards, protocols, announcements | Linux Foundation + GitHub | Event-driven |

**Validity check:** GitHub metrics are directly verifiable. Release dates are in public changelogs.

**Sanity check:** OpenClaw should show 200k+ stars (verified). Growth rate should be positive. If negative, investigate.

**Displayed on dashboard:** Agent framework comparison cards. Security incident feed. Skill marketplace growth chart. Adoption trend lines.

---

### Layer 7: Developer Ecosystem Activity

**What it measures:** How the global developer community is engaging with AI tools.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| GitHub Events API | Public push events, PR events globally | api.github.com/events | 30-second poll |
| GitHub Search API | Repos with AI config files (CLAUDE.md, .cursorrules, etc.) | api.github.com/search/code | 6-hourly |
| GH Archive | Historical event data for trend analysis | data.gharchive.org | Hourly dumps |
| npm/PyPI download stats | AI library adoption (langchain, anthropic SDK, openai SDK) | api.npmjs.org, pypistats.org/api | Daily |
| Stack Overflow | Question volume by AI tool tag | api.stackexchange.com | Daily |
| GitHub Trending | AI-related repos trending | github.com/trending | Daily |

**Validity check:** GitHub Events API is the canonical source for public activity. Download counts are from official registries.

**Sanity check:** AI library downloads should be in the millions/month range. If showing zero, API is broken.

**Displayed on dashboard:** The globe — live commit activity with AI tool signals colour-coded. Package adoption trend charts. Config file ecosystem growth.

---

### Layer 8: Code Quality and Security

**What it measures:** The impact of AI-generated code on quality and security at ecosystem scale.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| Stanford/MIT AI code security study | Vulnerability rates in AI vs human code | Published paper | Cited statically, updated on new publications |
| METR productivity studies | Controlled measurements of AI tool impact | metr.org/blog | Event-driven |
| DORA reports (Google) | Delivery stability, change failure rates | dora.dev | Annual + updates |
| Exceeds AI benchmarks | AI code churn, rework rates | blog.exceeds.ai | Monthly |
| OWASP Top 10 for LLM Applications | Security framework for AI apps | owasp.org | Annual |
| GitHub Advisory Database | CVEs in AI-related packages | api.github.com/advisories | Real-time |
| npm audit data | Vulnerabilities in AI tool dependencies | registry.npmjs.org | Real-time |
| Snyk vulnerability DB | Security findings in AI-adjacent packages | snyk.io/vuln | Daily |

**Validity check:** Research findings are from peer-reviewed or reputable institution publications. CVE data is from canonical vulnerability databases.

**Sanity check:** AI code vulnerability rate should be in the 10-20% range (Stanford/MIT: 14.3%). If our aggregation shows 0% or 100%, something is wrong.

**Displayed on dashboard:** Productivity paradox tracker (perceived vs actual). Vulnerability rate comparison (AI vs human). Security advisory feed. Code quality trend line from published research.

---

### Layer 9: Research and Publications

**What it measures:** The pace and direction of AI research globally.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| ArXiv API | New AI papers per day, categories, authors | export.arxiv.org/api | Daily |
| Semantic Scholar API | Citation counts, trending papers | api.semanticscholar.org | Daily |
| Major lab blogs | Research announcements | Anthropic, OpenAI, Google DeepMind, Meta FAIR blogs (RSS) | Event-driven |
| Conference acceptance lists | NeurIPS, ICML, ICLR accepted papers | Public announcements | Seasonal |
| AI Safety Institute reports | Model evaluations | aisi.gov.uk/blog | Event-driven |

**Displayed on dashboard:** Paper volume trend. Trending research topics. Major lab announcement feed. Safety evaluation results.

---

### Layer 10: Regulatory and Policy

**What it measures:** AI regulation, legislation, and policy changes globally.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| EU AI Act implementation timeline | Compliance deadlines, enforcement dates | Public EU documents | Event-driven |
| US AI executive orders | Federal policy changes | whitehouse.gov, federalregister.gov | Event-driven |
| NIST AI RMF | Standards and framework updates | nist.gov/artificial-intelligence | Event-driven |
| UK AISI | Safety evaluations, policy recommendations | aisi.gov.uk | Event-driven |
| China AI regulations | Restrictions, requirements | Public translations | Event-driven |
| AI litigation tracker | Copyright, liability, employment cases | Public court filings | Weekly |

**Validity check:** Government sources are canonical. Dates are from official publications.

**Sanity check:** EU AI Act high-risk deadline is August 2, 2026. This is a known, fixed date.

**Displayed on dashboard:** Regulatory timeline with upcoming deadlines. Policy change feed. Jurisdiction heatmap showing regulatory activity by country.

---

### Layer 11: Market and Financial

**What it measures:** The business side of AI — funding, revenue, valuations, market size.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| Crunchbase (public data) | Funding rounds for AI companies | Public listings | Daily |
| SEC filings (EDGAR) | Public company AI revenue disclosures | sec.gov/cgi-bin/browse-edgar | Quarterly |
| Public earnings transcripts | AI revenue mentions from Microsoft, Google, Amazon | Public transcripts | Quarterly |
| Market research reports | AI market size estimates | McKinsey, Goldman, Gartner summaries | Quarterly |
| AI company stock prices | Public market performance | Yahoo Finance API or similar | Real-time |

**Displayed on dashboard:** Funding trend chart. AI company market cap tracker. Revenue growth signals. Market size estimates with source attribution.

---

### Layer 12: Community and Social

**What it measures:** What the AI community is actually saying, discussing, and building.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| Hacker News API | Front page AI stories, comment sentiment | hn.algolia.com/api | Hourly |
| Reddit API | Subreddit sizes, post volume, trending topics | reddit.com API | Hourly |
| Twitter/X | Mention volume, sentiment for major AI topics | API or scrape | Hourly |
| Discord server sizes | Community sizes for major AI tools/projects | Public invite pages | Daily |
| YouTube | AI tutorial/review video volume | YouTube Data API | Daily |
| GitHub Trending | AI repos gaining stars | github.com/trending | Daily |
| Podcast tracking | Major AI podcast episode frequency and topics | Public RSS feeds | Weekly |

**Displayed on dashboard:** Community sentiment gauges per tool. Trending topics word cloud. Discussion volume sparklines. Notable thread feed.

---

### Layer 13: Autonomous Agent Deployments

**What it measures:** Real-world autonomous agent activity and incidents.

**Data sources and endpoints:**
| Source | What it provides | URL/API | Update frequency |
|---|---|---|---|
| OpenClaw release notes | Feature changes, security fixes | GitHub Releases API | Per release |
| OpenClaw issue tracker | Bug reports, security issues, feature requests | GitHub Issues API | Hourly |
| OpenClaw managed hosting providers | Deployment count signals (if public) | OneClaw, DigitalOcean public pages | Weekly |
| Agent security incident reports | Published security findings | Cisco, AISI, public advisories | Event-driven |
| MCP server registry | Available tool integrations | mcp.so or similar | Daily |
| A2A protocol activity | Agent-to-agent communication standards | Linux Foundation | Event-driven |

**Displayed on dashboard:** Agent ecosystem health. Security incident timeline. Deployment growth signals. Skill/plugin marketplace metrics.

---

## PART 4: THE GLOBE

### 4.1 What the Globe Shows

The centre of the dashboard is a 3D globe (globe.gl + Three.js) showing real-time AI activity worldwide. This is NOT decoration — every dot represents a real, verifiable event.

**Dot types:**
| Colour | What it represents | Data source |
|---|---|---|
| Teal (#2dd4bf) | Commit to a repo with AI tool config files | GitHub Events API |
| White (#ffffff) | Commit to a repo without AI tool signals | GitHub Events API |
| Red (#f87171) pulsing | Region affected by an AI tool outage | Status pages + Downdetector |
| Amber (#fbbf24) pulsing | Region affected by a quality regression report | GitHub Issues + community reports |
| Blue (#60a5fa) | Tool migration signal (config file type changed) | GitHub Events API |
| Purple (#a78bfa) | New AI research paper (author institution location) | ArXiv API |

**Arcs:**
| Colour | What it represents |
|---|---|
| Teal | PR opened in one location, merged in another (AI-configured repos) |
| Red | Outage impact spreading across regions |
| Blue | Tool migration flow (developer switching tools) |

**Globe performance target:** 60fps with 1000+ active dots. Instanced rendering, LOD, offscreen culling — same techniques as GitHub's globe and World Monitor.

### 4.2 Globe Data Pipeline

GitHub Events API polled every 30 seconds → filter for PushEvents → check if repo has AI config files (cached lookup from Layer 7 discovery) → geocode author location from GitHub profile → emit to globe renderer via SSE.

Geographic data comes from GitHub user profiles (city/country field). Not all users have this — display only events with resolvable locations. Display coverage percentage transparently: "Showing 34% of events (those with author location data)."

---

## PART 5: DASHBOARD LAYOUT

### 5.1 Full Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AI PULSE  [LIVE ●]  [14,219 repos] [42 models] [6 tools]  [10s refresh]│
├──────────────┬───────────────────────────────────────┬───────────────────┤
│              │                                       │                   │
│  LIVE FEED   │         3D GLOBE                      │   TOOL HEALTH     │
│              │                                       │                   │
│  Streaming   │  Real-time AI activity worldwide      │   Claude Code     │
│  events from │  Colour-coded by type                 │   Cursor          │
│  all 13      │  Hover for details                    │   Copilot         │
│  layers      │  Legend at bottom                     │   Windsurf        │
│              │                                       │   Codex           │
│  Colour-     │                                       │                   │
│  coded       ├───────────────────────────────────────┤   Each with:      │
│  borders:    │                                       │   - Status dot    │
│  🟢 positive │   METRICS ROW (4 cards)               │   - Uptime %      │
│  🔴 negative │   AI commits/hr | AI code share |     │   - Version       │
│  🟡 neutral  │   Vuln rate     | Trust index         │   - Sentiment bar │
│  🔵 info     │                                       │   - Issue count   │
│              ├───────────────────────────────────────┤                   │
│  Sources     │                                       │   MODEL RANKINGS  │
│  cited on    │   CHART AREA (tabbed)                 │                   │
│  every item  │   [Paradox] [Adoption] [Quality]      │   Top models by   │
│              │   [Security] [Models] [Agents]        │   Arena ranking   │
│              │                                       │   with price/perf │
│              │   Currently: Productivity Paradox     │                   │
│              │   Perceived: +27%  Measured: +3%      │   REGULATORY      │
│              │   Gap: 24 points                      │   TIMELINE        │
│              │   Source: METR 2026                    │                   │
│              │                                       │   Upcoming        │
│              │                                       │   deadlines       │
│              │                                       │   EU AI Act: Aug  │
│              │                                       │   CO AI Act: Jun  │
├──────────────┴───────────────────────────────────────┴───────────────────┤
│ TICKER: [Claude v2.1.108 · 3h ago] [Stanford: 14.3% vuln rate AI code] │
│ [METR: -19% → +18% productivity shift] [OpenClaw: 250k stars, 25 ch.] │
│ [EU AI Act high-risk: Aug 2 2026] [41% of global code now AI-generated]│
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Every Number Has a Citation

When a user hovers or clicks any metric:

```
┌─────────────────────────────────────────────┐
│ AI-generated code vulnerability rate: 14.3% │
│                                             │
│ Source: Stanford University & MIT            │
│ Study: "Security of AI-Generated Code"      │
│ Published: March 2026                        │
│ Sample: 2 million code snippets              │
│ Comparison: 9.1% for human-written code      │
│                                             │
│ [View source paper ↗]                       │
│                                             │
│ Last verified: 2026-04-18                    │
│ Next scheduled check: 2026-07-18             │
└─────────────────────────────────────────────┘
```

This is the trust contract. Every number is clickable and citable.

---

## PART 6: SECONDARY PAGES

### /audit — CLAUDE.md Health Check

The original CodePulse paste-and-audit tool. User pastes their CLAUDE.md, gets instant deterministic scoring (82 patterns, client-side) plus optional "deep scan" via Gemini API (with consent).

Lives here as a feature of AI Pulse, not the entire product. Clearly labelled as "experimental — scored against 82 known patterns, not comprehensive."

### /explore — Deep Dives

Full data exploration by layer:
- /explore/models — benchmark comparison, pricing calculator, capability matrix
- /explore/tools — detailed tool health history, issue analysis, version timeline
- /explore/agents — OpenClaw ecosystem health, security incidents, adoption
- /explore/security — vulnerability tracking, code quality research, CVE feed
- /explore/research — paper volume, trending topics, lab output comparison
- /explore/regulation — policy timeline, jurisdiction comparison, compliance tracker
- /explore/market — funding trends, revenue signals, market sizing

### /methodology — Full Transparency

Complete documentation of every data source, every update frequency, every sanity check, every limitation. Published openly so anyone can audit our methodology.

### /api — Public Data Access

JSON API for programmatic access to all aggregated data. Rate-limited. Every response includes source citations.

---

## PART 7: TECHNICAL ARCHITECTURE

### 7.1 Zero-Cost Infrastructure (World Monitor Model)

**Key principle: browser-first compute.** All heavy processing — chart rendering, globe rendering, data transformation, filtering — runs client-side. Server-side components are thin: CORS proxies, cache layers, API key gatekeepers.

| Component | Service | Cost |
|---|---|---|
| Frontend + Edge API | Vercel Hobby (free tier) | $0 |
| Scheduled data collection | GitHub Actions (free tier, 2000 min/month) | $0 |
| Data storage | Static JSON in GitHub repo | $0 |
| Real-time event stream | Upstash Redis free tier (10k cmd/day) | $0 |
| LLM for /audit deep scan | Gemini 2.5 Flash API | ~$7/month |
| Domain | aipulse.dev or similar | ~$12/year |
| Auth (community features) | GitHub OAuth | $0 |
| **Total** | | **~$8/month** |

### 7.2 Tech Stack

| Category | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla TypeScript + Vite | Performance. No framework overhead. World Monitor model. |
| 3D Globe | globe.gl + Three.js | Real-time event visualisation |
| Charts | D3.js / Chart.js | Real-time updating charts |
| Real-time | Server-Sent Events (SSE) | 10-second push from Upstash Redis |
| Edge API | Vercel Edge Functions | Thin proxies + cache |
| Workers | GitHub Actions (cron) | Data collection across all layers |
| Cache | Upstash Redis free tier | Live events + leaderboard data |
| Data | Static JSON + GitHub Releases | Pre-computed, versioned |
| AI | Gemini 2.5 Flash | /audit deep scan only |

### 7.3 Data Pipeline

```
┌─────────────────────────────────────────────────────────┐
│              GITHUB ACTIONS CRON WORKERS                  │
│                                                          │
│  Every 5 min:  Status page checks (all providers)        │
│  Every 30 min: GitHub Issues counts (tool repos)         │
│  Every hour:   GitHub Events processing                  │
│  Every 6 hours: Model pricing page checks                │
│  Daily:        Benchmark aggregation, research papers    │
│  Daily:        Community sentiment aggregation            │
│  Daily:        Agent ecosystem metrics                    │
│  Weekly:       Market/financial data refresh              │
│                                                          │
│  Output: data/*.json files committed to repo             │
│  On commit: Vercel auto-deploys                          │
└─────────────────────────────────────────────────────────┘
```

### 7.4 Data File Structure

```
data/
├── status.json          — tool/provider status (5-min refresh)
├── models.json          — model registry, benchmarks, pricing
├── tools.json           — AI coding tool metrics
├── agents.json          — agent framework metrics
├── research.json        — paper counts, trending topics
├── security.json        — vulnerability data, CVEs
├── regulation.json      — policy timeline, deadlines
├── market.json          — funding, revenue signals
├── community.json       — sentiment, discussion volumes
├── globe-events.json    — recent events for globe (rolling 1hr)
├── meta.json            — last refresh timestamps per layer
└── sources.json         — citation registry (every source URL)
```

---

## PART 8: BUILD PLAN

### Phase 0: Validation (Days 1-2)
**Before any code is written.**

- Manually verify that each Layer 1-13 data source is accessible and returns expected data
- For each source: make the API call, inspect the response, confirm the data format
- Document any sources that require authentication, have rate limits, or are unreliable
- Build a source validation spreadsheet: source name, URL, tested date, response format, reliability rating
- **Auditor gate:** Auditor reviews the validation spreadsheet. Any source rated "unreliable" is dropped or replaced before code starts.

### Phase 1: Core Dashboard (Days 3-8)
**Status pages + model rankings + tool health.**

Focus on the three most trustworthy, most immediately valuable data types:
1. Tool/provider status (are things up or down?)
2. Model benchmarks and pricing (which model is best for what price?)
3. Tool health metrics (issue counts, versions, community sentiment)

These are the easiest to verify, the most immediately useful, and the hardest to get wrong.

**Auditor gate:** Dashboard displays only data that the Auditor has verified against primary sources. Every number is clickable and shows its citation.

### Phase 2: Globe + Live Feed (Days 9-14)
**Real-time event visualisation.**

- GitHub Events API integration for live commit tracking
- Globe rendering with AI-configured repo detection
- Live feed panel with events from all layers
- SSE for real-time push to connected clients
- Bottom ticker with key facts

**Auditor gate:** Globe dots must represent real events. No synthetic or simulated data. Live feed items must cite sources.

### Phase 3: Research + Security + Regulation (Days 15-18)
**Published research aggregation + security signals + policy timeline.**

- ArXiv paper tracking
- Published security research integration (Stanford/MIT, METR)
- CVE and vulnerability feed
- Regulatory timeline with upcoming deadlines

**Auditor gate:** Every research claim must cite the specific paper/report. Every deadline must cite the specific regulation.

### Phase 4: Agents + Market + Community (Days 19-22)
**Autonomous agent ecosystem + financial signals + social sentiment.**

- OpenClaw and agent framework tracking
- Funding/revenue signals from public sources
- Community sentiment aggregation
- Reddit/HN/Twitter volume tracking

**Auditor gate:** Sentiment analysis methodology must be documented and defensible. Financial data must come from SEC filings or official announcements, not estimates.

### Phase 5: /audit Tool + /explore Pages (Days 23-26)
**CLAUDE.md audit tool + deep-dive exploration pages.**

- Paste-and-audit with deterministic + optional Gemini scoring
- /explore pages for each layer
- /methodology page with full transparency documentation

**Auditor gate:** Audit tool clearly labels its limitations. /methodology page is complete and honest.

### Phase 6: Polish + Launch (Days 27-30)
**Performance, mobile, error handling, launch.**

- 3-tier caching (Redis → Edge → Service Worker)
- Mobile responsive layout
- Error handling and graceful degradation
- SEO and meta tags
- Launch blog post with key findings
- Submit to HN, Reddit, Twitter, Product Hunt

**Auditor gate:** Final review — every number on the dashboard verified one last time. Launch post fact-checked.

---

## PART 9: WHAT EXISTS VS WHAT DOESN'T

### Already exists (we aggregate, not reinvent):
- Model benchmark leaderboards (LMSYS, Artificial Analysis, HuggingFace)
- Status pages (every provider has one)
- GitHub activity tracking (GitHub's own globe, GH Archive)
- AI news aggregation (many sites)
- Research paper tracking (ArXiv, Semantic Scholar)

### Doesn't exist (our unique value):
- **Unified view across ALL layers simultaneously** — nobody shows models + tools + agents + security + regulation + market in one dashboard
- **Real-time correlation across layers** — when a model update causes a tool quality regression which triggers community backlash which affects market sentiment, that causal chain is visible
- **Source-cited trust contract** — every number clickable and verifiable
- **Globe visualisation of AI activity specifically** — GitHub's globe shows all activity, ours filters for AI signals
- **Productivity paradox tracker** — live display of perceived vs measured AI productivity
- **Agent ecosystem health** — nobody aggregates OpenClaw + LangChain + CrewAI health in one view
- **Cross-tool comparison with identical methodology** — same metrics applied to Claude, Cursor, Copilot, Windsurf

---

## PART 10: SUCCESS METRICS

| Metric | 30 days | 90 days | 180 days |
|---|---|---|---|
| Dashboard MAU | 10,000 | 50,000 | 200,000 |
| GitHub stars | 2,000 | 15,000 | 40,000 |
| API consumers | 50 | 500 | 2,000 |
| Media citations | 5 | 20 | 50 |
| Data sources tracked | 30 | 80 | 150 |
| Layers fully operational | 5 | 10 | 13 |
| Factual errors reported by users | <5 | <10 | <10 |
| Source verification coverage | 100% | 100% | 100% |

---

## PART 11: NAME AND IDENTITY

**Name:** AI Pulse

**Tagline:** "Every signal. Every layer. Real time."

**Alternative tagline:** "The real-time nervous system of the global AI ecosystem."

**Design language:** Dark monitoring dashboard (same DESIGN.md from CodePulse). Teal accent. Monospace for data, sans-serif for labels. Information-dense. No decoration. Every pixel communicates data.

**Domain options:** aipulse.dev, aipulse.io, thepulse.ai

---

## PART 12: RELATIONSHIP TO CODEPULSE

AI Pulse is the evolution of CodePulse. The existing infrastructure is reusable:
- Vercel deployment pipeline
- GitHub Actions workflow architecture
- Gemini API integration
- DESIGN.md and frontend design system
- Scoring engine (for /audit feature)
- Test infrastructure (Vitest + Playwright)

What changes:
- Product scope expands from "CLAUDE.md health" to "entire AI ecosystem"
- Primary value shifts from "original scoring" to "trusted aggregation"
- Data sources expand from 3 (GitHub, Piebald, Gemini) to 50+
- Dashboard layout redesigned for multi-layer information density
- Globe becomes the centrepiece (was planned but never central to v1)

The CodePulse repo can be renamed/repurposed or a new repo started. The Auditor should weigh in on whether to build on the existing codebase or start fresh.

---

*This specification is designed for dual-model execution. The Builder implements. The Auditor challenges. Nothing ships without both agreeing it's trustworthy. The product's credibility depends on this process being followed rigorously.*

*The first session begins with Phase 0: source validation. No code until the data sources are confirmed.*
