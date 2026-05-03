/**
 * Agents-panel framework registry — the single editorial source for which
 * agent frameworks Gawk tracks. Every downstream concern (fetcher, view
 * assembler, digest section, dashboard panel) reads from this one array.
 *
 * Adding or removing a framework is a code change under Auditor review,
 * not a config flag. The slate is deliberately narrow: 6 alive frameworks
 * + 2 tombstones (1 legacy, 1 dormant). The tombstones exist to make the
 * ecosystem's churn visible — Sweep dying and AutoGPT becoming a museum
 * piece are themselves signal worth showing.
 *
 * Per PRD §3 and the empirical probe in session 51:
 *   - autogen tracks `autogen-agentchat`, the live Microsoft successor
 *     namespace. The deprecated bare `autogen` package on PyPI returns
 *     ~45k/wk and is a different abandoned project; tracking it would
 *     misrepresent ecosystem state.
 *   - pydantic-ai tracks the meta-package `pydantic-ai`; the lean variant
 *     `pydantic-ai-slim` is ~4× larger but users compare the meta number.
 *   - autogpt's PyPI presence (~116/wk) is essentially zero — kept as a
 *     legacy reference point for its 184k stars.
 *   - sweep has no PyPI distribution; row is GH-only with a dormant badge.
 *
 * Snapshot of weekly downloads at registry-lock time (2026-05-03):
 *   langgraph py 11.0M  · langgraph js 2.05M
 *   crewai py 1.76M
 *   smolagents py 128k
 *   autogen-agentchat py 337k
 *   openai-agents py 7.0M · @openai/agents js 667k
 *   pydantic-ai py 9.6M
 *   autogpt py 116/wk (legacy)
 *   sweep n/a (dormant)
 */

export type AgentFrameworkLanguage = "python" | "javascript";

/**
 * - `alive`   → maintained, on the modern adoption track.
 * - `legacy`  → historically significant but no longer the recommended
 *               way to build agents (kept as a reference point).
 * - `dormant` → editorially declared dead; show with tombstone badge
 *               regardless of any recent GH activity.
 *
 * The runtime view layer ALSO derives a `pushedAt > 90d` dormant flag
 * from GH metadata. That is independent of this category — a framework
 * categorised `alive` here can still surface as runtime-dormant if its
 * repo goes quiet.
 */
export type AgentFrameworkCategory = "alive" | "legacy" | "dormant";

export type AgentFramework = {
  /** Stable kebab-case id. Used as cache key + ?focus= deep-link anchor. */
  id: string;
  /** Display name shown in the panel + digest section. */
  name: string;
  category: AgentFrameworkCategory;
  /** PyPI package name (pypistats endpoint). Omit if no Python distribution. */
  pypiPackage?: string;
  /** npm package name. Use the raw scoped form (e.g. "@scope/name"). */
  npmPackage?: string;
  /** GitHub repo as "owner/name". Always present — the GH meta call is the */
  /** one signal every framework guarantees, including tombstones. */
  githubRepo: string;
  /** Languages the framework targets. Drives the per-row language chip. */
  languages: AgentFrameworkLanguage[];
  /** Per-framework caveat surfaced verbatim in the digest + panel tooltip. */
  caveat?: string;
};

export const AGENT_FRAMEWORKS: readonly AgentFramework[] = [
  {
    id: "langgraph",
    name: "LangGraph",
    category: "alive",
    pypiPackage: "langgraph",
    npmPackage: "@langchain/langgraph",
    githubRepo: "langchain-ai/langgraph",
    languages: ["python", "javascript"],
  },
  {
    id: "crewai",
    name: "CrewAI",
    category: "alive",
    pypiPackage: "crewai",
    githubRepo: "crewAIInc/crewAI",
    languages: ["python"],
  },
  {
    id: "smolagents",
    name: "smolagents",
    category: "alive",
    pypiPackage: "smolagents",
    githubRepo: "huggingface/smolagents",
    languages: ["python"],
  },
  {
    id: "autogen",
    name: "AutoGen",
    category: "alive",
    pypiPackage: "autogen-agentchat",
    githubRepo: "microsoft/autogen",
    languages: ["python"],
    caveat:
      "Tracks the live `autogen-agentchat` package — the deprecated bare `autogen` PyPI name is a different abandoned project and is not counted here.",
  },
  {
    id: "openai-agents",
    name: "OpenAI Agents",
    category: "alive",
    pypiPackage: "openai-agents",
    npmPackage: "@openai/agents",
    githubRepo: "openai/openai-agents-python",
    languages: ["python", "javascript"],
  },
  {
    id: "pydantic-ai",
    name: "Pydantic AI",
    category: "alive",
    pypiPackage: "pydantic-ai",
    githubRepo: "pydantic/pydantic-ai",
    languages: ["python"],
    caveat:
      "Tracks the `pydantic-ai` meta-package; the lean `pydantic-ai-slim` variant is roughly 4× larger but users typically compare the meta number.",
  },
  {
    id: "autogpt",
    name: "AutoGPT",
    category: "legacy",
    pypiPackage: "autogpt",
    githubRepo: "Significant-Gravitas/AutoGPT",
    languages: ["python"],
    caveat:
      "Legacy reference point — 184k stars but PyPI distribution is essentially unused (~100/wk). Kept to show the arc from 2023's hype project to today's production stack.",
  },
  {
    id: "sweep",
    name: "Sweep",
    category: "dormant",
    githubRepo: "SweepAI/sweep",
    languages: ["python"],
    caveat:
      "Dormant — last commit September 2025. Kept as a tombstone to make ecosystem churn visible.",
  },
];
