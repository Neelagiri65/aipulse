# AI Pulse — Data Sources

This is the transparency contract. Every number on the AI Pulse dashboard traces back to one of the sources below. Every source is publicly accessible. If a source cannot be verified, the dashboard renders a grey "last known value" state with a timestamp rather than fabricating or omitting the metric silently.

The machine-readable mirror of this document lives at [`src/lib/data-sources.ts`](../src/lib/data-sources.ts). The two files are kept in sync — adding a source in one without the other is a bug.

---

## Verified sources (safe to consume)

### GitHub Events API
- **ID:** `gh-events`
- **Public URL:** https://docs.github.com/en/rest/activity/events
- **API endpoint:** `https://api.github.com/events`
- **Response format:** JSON
- **Update frequency:** Realtime (polled every 30 seconds, authenticated)
- **Rate limit:** 5,000 requests per hour authenticated · 60 unauthenticated
- **Auth:** GitHub personal access token (server-side only)
- **What it measures:** Public GitHub events (push, pull request, issue, fork, star) across every public repository. It is a firehose; AI-tool signal detection happens downstream via `gh-contents`.
- **Sanity check:** One page returns 30 events. Expected per-response range: 1–100 events. Zero means the API call is broken.
- **Caveat:** Events do not carry geolocation. Location is resolved from the author's GitHub profile city/country field, which is optional. Expect the globe to show a fraction of total events.
- **Powers:** Globe activity dots · live event feed
- **Last verified:** 2026-04-18

### GitHub Contents API
- **ID:** `gh-contents`
- **Public URL:** https://docs.github.com/en/rest/repos/contents
- **API endpoint:** `https://api.github.com/repos/{owner}/{repo}/contents/{path}`
- **Response format:** JSON
- **Update frequency:** Event-driven (on each Event-triggered probe, cached 24h)
- **Rate limit:** 5,000 per hour authenticated — cache aggressively
- **Auth:** GitHub personal access token
- **What it measures:** File existence in a repository. AI Pulse uses it only to check for the presence of AI tool configuration files (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.continue/`, `.windsurfrules`). The detection is deterministic file-existence only — never an LLM inferring intent from content.
- **Sanity check:** Response is 200 with file metadata or 404 when absent. Any other status indicates a source change.
- **Caveat:** File renames (e.g., `.cursorrules` deleted and `CLAUDE.md` created within 7 days) are treated as migration signals only when both deltas are observed in-window. Never inferred from a single snapshot.
- **Powers:** Globe colour coding · migration arcs
- **Last verified:** 2026-04-18

### Anthropic Status (Claude Code + API)
- **ID:** `anthropic-status`
- **Public URL:** https://status.claude.com
- **API endpoint:** `https://status.claude.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (AI Pulse polls every 5 minutes via edge cache)
- **Rate limit:** None documented; polling budgeted to 5-minute intervals
- **Auth:** None
- **What it measures:** Current status (operational · degraded · partial_outage · major_outage) and ongoing incidents for every Anthropic-operated component, including the Claude API and Claude Code (CLI).
- **Sanity check:** Response includes `status.indicator ∈ {none, minor, major, critical}` and an array of components. Any other shape indicates a source change.
- **Powers:** Tool health card — Claude Code · Tool health card — Claude API
- **Last verified:** 2026-04-18

### OpenAI Status (ChatGPT + API)
- **ID:** `openai-status`
- **Public URL:** https://status.openai.com
- **API endpoint:** `https://status.openai.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented; polling budgeted to 5-minute intervals
- **Auth:** None
- **What it measures:** Current status and incidents for OpenAI-operated components including ChatGPT and the OpenAI API.
- **Sanity check:** Same Statuspage.io v2 schema as Anthropic.
- **Powers:** Tool health card — OpenAI API
- **Last verified:** 2026-04-18

### GitHub Issues — anthropics/claude-code
- **ID:** `gh-issues-claude-code`
- **Public URL:** https://github.com/anthropics/claude-code/issues
- **API endpoint:** `https://api.github.com/search/issues?q=repo:anthropics/claude-code+is:issue+is:open&per_page=1`
- **Response format:** JSON (`total_count` + `items[]`)
- **Update frequency:** Hourly
- **Rate limit:** Search API — 30 req/min authenticated (1,800/hr). One call/hour per tool, cached 60 min.
- **Auth:** GitHub personal access token
- **What it measures:** Open issue count for `anthropics/claude-code`, used as a community-pressure sparkline on the Claude Code card.
- **Sanity check:** Active flagship tool; wide range acceptable. Observed 9,635 open issues on verification (2026-04-18). Zero indicates broken API call. Range: 100–30,000.
- **Caveat:** Initial sanity range (50–5,000) was widened after verification returned 9,635. Range adjusted to reflect observed reality, not to manufacture a result.
- **Powers:** Tool health card — Claude Code (issue count)
- **Last verified:** 2026-04-18

### GitHub Status (covers Copilot)
- **ID:** `github-status`
- **Public URL:** https://www.githubstatus.com
- **API endpoint:** `https://www.githubstatus.com/api/v2/summary.json`
- **Response format:** JSON (Statuspage.io v2 schema)
- **Update frequency:** Minutely (polled every 5 minutes via edge cache)
- **Rate limit:** None documented
- **Auth:** None
- **What it measures:** GitHub platform components. The `Copilot` component (exact name, verified literal) surfaces operational state for GitHub Copilot. Also present: `Copilot AI Model Providers`.
- **Sanity check:** Response must include a component named exactly `Copilot`. If absent on any future poll, the Copilot card falls to graceful degradation and the change is investigated.
- **Powers:** Tool health card — GitHub Copilot
- **Last verified:** 2026-04-18

---

## Dropped / not yet sourced

### Cursor
- **Status (2026-04-18):** No confirmed public Statuspage endpoint. `status.cursor.com` was speculative and has been removed from the registry to protect the trust contract ("trustworthiness over completeness").
- **Reinstatement criterion:** A publicly hit-able status endpoint with a stable JSON schema. When found, add to `data-sources.ts` and re-add the Cursor health card to `TOOLS`.

---

## Governance

- Adding a source requires a new entry in both `src/lib/data-sources.ts` and this document, in the same commit.
- Flipping a source from pending → verified requires a manual endpoint test, a recorded sanity-check result, and the dated commit as evidence.
- Any source that returns data outside its sanity-check range is treated as broken — the affected feature falls back to graceful degradation, and the discrepancy is investigated before the metric returns to the UI.
- Widening a sanity-check range after verification is allowed and must be documented (see `gh-issues-claude-code` caveat). Recalibrating a range to chase a narrative is forbidden.

_Last updated: 2026-04-18_
