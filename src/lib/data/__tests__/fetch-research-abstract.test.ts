import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecentPapers } from "@/lib/data/fetch-research";

// One entry in the shape export.arxiv.org returns (recorded 2026-09-25, abstract shortened).
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2012.12104v1</id>
    <title>A Deep Reinforcement Learning Approach for Ramp Metering</title>
    <updated>2020-12-09T05:08:41Z</updated>
    <link href="https://arxiv.org/abs/2012.12104v1" rel="alternate" type="text/html"/>
    <summary>Ramp metering that uses traffic signals to regulate vehicle flows
      has been widely implemented. Comparing with point detectors, traffic cameras could cover larger areas.</summary>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <published>2020-12-09T05:08:41Z</published>
    <author><name>Bing Liu</name></author>
  </entry>
</feed>`;

describe("fetchRecentPapers — the abstract is read from <summary>", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("parses the abstract, whitespace-collapsed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED, { status: 200 })));
    const r = await fetchRecentPapers();
    expect(r.ok).toBe(true);
    expect(r.papers[0].abstract).toBe(
      "Ramp metering that uses traffic signals to regulate vehicle flows has been widely implemented. " +
      "Comparing with point detectors, traffic cameras could cover larger areas.");
  });
});
