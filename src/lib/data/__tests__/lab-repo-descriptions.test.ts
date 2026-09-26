import { describe, expect, it, vi } from "vitest";
import { describeLabRepos, describeLabs, describeRepos, fetchRepoDescription } from "@/lib/data/lab-repo-descriptions";
import type { LabActivity, LabsPayload, RepoBreakdown } from "@/lib/data/fetch-labs";

const repo = (owner: string, name: string, total: number): RepoBreakdown =>
  ({ owner, repo: name, sourceUrl: `https://github.com/${owner}/${name}`, total, byType: {}, stale: false }) as unknown as RepoBreakdown;

describe("describeRepos — the active repositories in their owners' own words", () => {
  it("names each repo, keeps its description, adds a stop only where there is none", () => {
    expect(describeRepos([
      { owner: "anthropics", repo: "claude-code", description: "Claude Code is an agentic coding tool that lives in your terminal" },
      { owner: "anthropics", repo: "courses", description: "Anthropic's educational courses." },
      { owner: "anthropics", repo: "quiet" },
    ])).toBe("anthropics/claude-code — Claude Code is an agentic coding tool that lives in your terminal. anthropics/courses — Anthropic's educational courses.");
    expect(describeRepos([{ owner: "a", repo: "b" }])).toBeUndefined();
  });
});

describe("describeLabRepos", () => {
  it("describes only active repos, most events first, at most three", async () => {
    const lab = { repos: [repo("o", "idle", 0), repo("o", "small", 5), repo("o", "big", 90), repo("o", "mid", 20), repo("o", "tail", 1)] } as unknown as LabActivity;
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify({ description: `about ${url.split("/").pop()}` }), { status: 200 }));
    const text = await describeLabRepos(lab, "t", fetchImpl as unknown as typeof fetch);
    expect(text).toBe("o/big — about big. o/mid — about mid. o/small — about small.");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("a repo that fails or has no description is left out; the call never throws", async () => {
    const down = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await fetchRepoDescription("o", "r", undefined, down as unknown as typeof fetch)).toBeUndefined();
    const blank = vi.fn().mockResolvedValue(new Response(JSON.stringify({ description: null }), { status: 200 }));
    expect(await fetchRepoDescription("o", "r", "t", blank as unknown as typeof fetch)).toBeUndefined();
  });
  it("describeLabs: every lab with a described active repo carries reposDescribed + summary; the rest are unchanged", async () => {
    // live, 2026-09-26: anthropics/claude-code's own description
    const cc = "Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows - all through natural language commands.";
    const anthropic = { id: "anthropic", displayName: "Anthropic", repos: [repo("anthropics", "claude-code", 90)] } as unknown as LabActivity;
    const quiet = { id: "quiet", displayName: "Quiet", repos: [repo("q", "idle", 0)] } as unknown as LabActivity;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ description: cc }), { status: 200 }));
    const out = await describeLabs({ labs: [anthropic, quiet], generatedAt: "t", failures: [] } as unknown as LabsPayload, undefined, fetchImpl as unknown as typeof fetch);
    expect(out.labs[0].reposDescribed).toBe(`anthropics/claude-code — ${cc}`);
    expect(out.labs[0].summary).toBe(`anthropics/claude-code — ${cc}`);
    expect(out.labs[1]).toBe(quiet);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // the idle repo is never read
  });
});
