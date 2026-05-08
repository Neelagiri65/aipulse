import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API Documentation · Gawk",
  description:
    "Public API v1 for Gawk — real-time AI tool status, model rankings, SDK adoption, and more. Free, no auth required.",
};

const BASE = "https://gawk.dev/api/v1";

type Endpoint = {
  method: string;
  path: string;
  description: string;
  params?: string[];
  example: string;
  responseHint: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/status",
    description:
      "Live health status for all tracked AI tools. Polls Anthropic, OpenAI, GitHub (Copilot), Codeium (Windsurf), and Cursor status pages.",
    example: `curl ${BASE}/status`,
    responseHint: `{ "data": { "claude-api": { "status": "operational", ... }, ... }, "polledAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/feed",
    description:
      "Ranked card stream — the same feed powering the Gawk dashboard. Includes tool alerts, model movers, new releases, SDK trends, news, and research.",
    example: `curl ${BASE}/feed`,
    responseHint: `{ "cards": [ { "type": "TOOL_ALERT", "severity": "high", ... }, ... ], "generatedAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/models",
    description:
      "OpenRouter model rankings — top models by weekly usage, with rank deltas and pricing.",
    params: ["limit (1-100, default 30) — number of rows returned"],
    example: `curl "${BASE}/models?limit=10"`,
    responseHint: `{ "ordering": "top-weekly", "rows": [ { "rank": 1, "name": "...", "previousRank": 3, ... } ], "generatedAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/sdk",
    description:
      "SDK adoption data across PyPI, npm, crates.io, Docker Hub, Homebrew, and VS Code Marketplace. Weekly download counts with 7-day and 30-day deltas.",
    params: [
      "window (1-60, default 30) — analysis window in days",
      "baseline (1-60, default 30) — baseline comparison window",
    ],
    example: `curl ${BASE}/sdk`,
    responseHint: `{ "packages": [ { "name": "anthropic", "registry": "pypi", "weeklyDownloads": 142000, ... } ], "generatedAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/agents",
    description:
      "Agent framework activity — GitHub stars, downloads, and push recency for tracked agent frameworks (LangChain, CrewAI, AutoGen, etc.).",
    example: `curl ${BASE}/agents`,
    responseHint: `{ "rows": [ { "id": "langchain", "stars": 102000, "weeklyDownloads": 850000, ... } ], "generatedAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/labs",
    description:
      "AI labs activity — 7-day GitHub event counts for tracked repositories of major AI labs (Anthropic, OpenAI, Google DeepMind, Meta AI, etc.).",
    example: `curl ${BASE}/labs`,
    responseHint: `{ "labs": [ { "id": "anthropic", "totalEvents": 47, "repos": [...] } ], "generatedAt": "..." }`,
  },
  {
    method: "GET",
    path: "/api/v1/sources",
    description:
      "Data source registry — every source Gawk tracks, with metadata and freshness indicators.",
    example: `curl ${BASE}/sources`,
    responseHint: `{ "ok": true, "entries": [...], "meta": { "lastRunAt": "...", "totalEntries": 42 }, "generatedAt": "..." }`,
  },
];

export default function ApiDocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <Link
        href="/"
        className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to dashboard
      </Link>

      <h1 className="mb-2 font-mono text-3xl font-semibold tracking-tight">
        Gawk Public API
      </h1>
      <p className="mb-8 text-muted-foreground">
        Free, public, no authentication required. Every response includes the
        same data powering{" "}
        <Link href="/" className="underline hover:text-foreground">
          gawk.dev
        </Link>
        . Every number traces to a verifiable public source.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xl font-semibold">Base URL</h2>
        <code className="block rounded bg-muted px-4 py-2 text-sm">
          https://gawk.dev/api/v1
        </code>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xl font-semibold">Rate Limits</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">100 requests per hour</strong>{" "}
            per IP address (unauthenticated)
          </li>
          <li>
            Rate limit headers included on every response:{" "}
            <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>,{" "}
            <code>X-RateLimit-Reset</code>
          </li>
          <li>
            Exceeding the limit returns <code>429 Too Many Requests</code> with
            a <code>Retry-After</code> header
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xl font-semibold">
          Response Headers
        </h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <code>X-Gawk-Generated-At</code> — ISO timestamp when this data was
            generated
          </li>
          <li>
            <code>X-Gawk-Source-Count</code> — number of items in the response
          </li>
          <li>
            <code>X-Gawk-Cache-Age</code> — CDN cache max-age in seconds
          </li>
          <li>
            <code>Access-Control-Allow-Origin: *</code> — CORS enabled for all
            origins
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-6 font-mono text-xl font-semibold">Endpoints</h2>
        <div className="space-y-8">
          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400">
                  {ep.method}
                </span>
                <code className="font-mono text-sm">{ep.path}</code>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {ep.description}
              </p>
              {ep.params && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Query Parameters
                  </p>
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {ep.params.map((p) => (
                      <li key={p}>
                        <code>{p.split(" — ")[0]}</code>
                        {p.includes(" — ") && (
                          <span> — {p.split(" — ")[1]}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mb-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Example
                </p>
                <code className="block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                  {ep.example}
                </code>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Response Shape
                </p>
                <code className="block overflow-x-auto whitespace-pre rounded bg-muted px-3 py-2 text-xs">
                  {ep.responseHint}
                </code>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-2 font-mono text-lg font-semibold">Notes</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>All timestamps are ISO 8601 UTC.</li>
          <li>
            All data is sourced from public APIs (status pages, OpenRouter,
            HuggingFace, PyPI, npm, GitHub). See{" "}
            <Link href="/sources" className="underline hover:text-foreground">
              /sources
            </Link>{" "}
            for the full registry.
          </li>
          <li>
            Responses are CDN-cached. The <code>X-Gawk-Cache-Age</code> header
            tells you the max-age.
          </li>
          <li>
            The API is unauthenticated. API keys for higher rate limits are
            coming.
          </li>
          <li>
            Found a bug or want a new endpoint?{" "}
            <a
              href="https://github.com/Neelagiri65/aipulse/issues"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open an issue
            </a>
            .
          </li>
        </ul>
      </section>
    </main>
  );
}
