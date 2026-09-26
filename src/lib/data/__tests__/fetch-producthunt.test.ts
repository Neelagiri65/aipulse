import { afterEach, describe, expect, it, vi } from "vitest";

// Live post, 2026-09-26 (/api/panels/producthunt).
const CLUESO = {
  id: "1252189",
  name: "Clueso MCP",
  tagline: "Create and edit videos by chatting",
  description:
    "Make videos with Claude, ChatGPT, or any AI agent. Give Clueso an idea, deck, reference video, or recording, and it handles the whole video production: storyboard, scenes, voiceover, music, and editing, on-brand. Everything stays editable, by hand or by chat.",
  url: "https://www.producthunt.com/products/clueso",
  votesCount: 543,
  createdAt: "2026-09-22T07:01:00Z",
};
const ECHO = { ...CLUESO, id: "2", name: "Echo", tagline: "Same words twice", description: "Same words twice.", votesCount: 100 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("fetchProductHuntLaunches — summary", () => {
  it("each post carries `summary` = its description as the launch card quotes it; none when it only repeats the tagline", async () => {
    vi.stubEnv("PRODUCT_HUNT_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { posts: { edges: [{ node: CLUESO }, { node: ECHO }] } } }))));
    const { fetchProductHuntLaunches } = await import("@/lib/data/fetch-producthunt");
    const r = await fetchProductHuntLaunches();
    expect(r.ok).toBe(true);
    expect(r.posts[0].summary).toBe(CLUESO.description);
    expect(r.posts[0].description).toBe(CLUESO.description);
    expect("summary" in r.posts[1]).toBe(false);
  });
});
