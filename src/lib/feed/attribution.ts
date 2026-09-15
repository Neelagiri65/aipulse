/**
 * Which tracked package IS one of the six tools. Exact identity only.
 *
 * A feed card names a tool only when its deriver says so (`meta.toolId`,
 * see src/lib/feed/stack.ts rule 6). This table is the one place a package
 * trend is allowed to say so, and every row has to be the tool's own
 * artefact — the extension the tool ships, the SDK the API publishes.
 * Nothing here is inferred from a vendor name: "openai" the org is not
 * "codex" the tool, and r/ClaudeAI is Claude, not Claude Code.
 *
 * Rows considered and left OUT (so the next reader does not re-litigate):
 *   - npm:@anthropic-ai/sdk, pypi:anthropic — the Anthropic API has no tool
 *     card in TOOLS (claude-code is the CLI, not the API).
 *   - vscode:saoudrizwan.claude-dev — that is Cline, a third-party extension.
 *   - vscode:Continue.continue, sourcegraph.cody-ai, TabNine — not tracked tools.
 *   - reddit-claudeai — a subreddit about Claude, not about Claude Code.
 *   - Hugging Face authors (anthropic, openai, …) — an org is not a tool.
 *
 * The guard test asserts every key here is a package the registries actually
 * track and every value is a TOOLS id, so the table cannot drift.
 */
import type { ToolId } from "@/lib/stack";

/** `${registry}:${name}` → tool. Keep it short; every row is a claim. */
export const PACKAGE_TOOL: Readonly<Record<string, ToolId>> = {
  // GitHub Copilot's own VS Code extension.
  "vscode:GitHub.copilot": "copilot",
  // The Codeium extension is the Windsurf plugin; the TOOLS registry itself
  // lists the tool as "Windsurf · IDE (formerly Codeium)".
  "vscode:Codeium.codeium": "windsurf",
  // The OpenAI API's official SDKs. The tool card is "OpenAI API · hosted
  // models"; its SDK download trend is about that API, not about Codex.
  "npm:openai": "openai-api",
  "pypi:openai": "openai-api",
};

export function packageToolId(registry: string, name: string): ToolId | null {
  return PACKAGE_TOOL[`${registry}:${name}`] ?? null;
}
