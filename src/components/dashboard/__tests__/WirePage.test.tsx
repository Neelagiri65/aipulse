/**
 * The Wire keeps its five aspects through the restyle (PRD web-restyle-v2 §13): two sources on one
 * clock, provenance on every row, the coverage line, split freshness, the honest empty state.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WireDetail, WirePage, type WireItem } from "@/components/dashboard/WirePage";

const gh: WireItem = { kind: "gh", eventId: "1", type: "PushEvent", actor: "alice", repo: "alice/one", createdAt: "2026-09-07T09:00:00Z", hasAiConfig: true, sourceKind: "events-api" };
const ghArchive: WireItem = { kind: "gh", eventId: "2", type: "PullRequestEvent", actor: "gl:bob", repo: "gitlab.com/bob/two", createdAt: "2026-09-07T08:30:00Z", hasAiConfig: false, sourceKind: "gharchive" };
const hn: WireItem = { kind: "hn", id: "9", createdAt: "2026-09-07T08:45:00Z", title: "Show HN: a thing", author: "carol", points: 142, numComments: 37, hnUrl: "https://news.ycombinator.com/item?id=9", locationLabel: "London" };
const rows = [gh, hn, ghArchive];
const polledAt = "2026-09-07T09:10:00Z";

describe("WirePage", () => {
  it("coverage line states the window and the split count; the stamp is the GitHub poll clock", () => {
    const html = renderToStaticMarkup(<WirePage wireRows={rows} ghCoverage={{ windowMinutes: 240, windowSize: 3 }} polledAt={polledAt} isInitialLoading={false} />);
    expect(html).toContain("Chronological · last 240m · 3 rows (2 gh · 1 hn)");
    expect(html).toContain("live · 09:10:00Z");
    expect(html).not.toContain("HN: last fetched");
  });

  it("provenance on every row: ai-cfg / no-cfg words with solid / hollow marks, archive flagged, HN pill orange", () => {
    const html = renderToStaticMarkup(<WirePage wireRows={rows} polledAt={polledAt} isInitialLoading={false} />);
    expect(html).toMatch(/ap-mark--solid[^]*?ai-cfg/);
    expect(html).toMatch(/ap-mark--hollow[^]*?no-cfg · archive/);
    expect(html).toContain('class="ap-hnpill"');
    expect(html).toContain("HN · 142");
    expect(html).toContain("37 comments · London");
    // ages are measured against the poll time before the clock ticks (SSR), never fabricated
    expect(html).toContain("PUSH · 10m · @alice · ai-cfg");
  });

  it("split freshness: the HN staleness line appears only past 30 minutes", () => {
    const fresh = renderToStaticMarkup(<WirePage wireRows={rows} hnMeta={{ lastFetchOkTs: polledAt, staleMinutes: 12 }} polledAt={polledAt} isInitialLoading={false} />);
    expect(fresh).not.toContain("HN: last fetched");
    const stale = renderToStaticMarkup(<WirePage wireRows={rows} hnMeta={{ lastFetchOkTs: polledAt, staleMinutes: 48 }} polledAt={polledAt} isInitialLoading={false} />);
    expect(stale).toContain("HN: last fetched 48m ago");
  });

  it("honest empty states, in the exact words", () => {
    expect(renderToStaticMarkup(<WirePage wireRows={[]} isInitialLoading={true} />)).toContain("Loading feed…");
    expect(renderToStaticMarkup(<WirePage wireRows={[]} isInitialLoading={false} error="HTTP 503" />)).toContain("Feed error · HTTP 503");
    const empty = renderToStaticMarkup(<WirePage wireRows={[]} isInitialLoading={false} />);
    expect(empty).toContain("No rows in this window. Waiting for next poll.");
    expect(empty).not.toContain("wire-detail");
  });

  it("desktop selects the first row into the detail; mobile rows are links to their source", () => {
    const desktop = renderToStaticMarkup(<WirePage wireRows={rows} polledAt={polledAt} isInitialLoading={false} />);
    expect(desktop).toContain('data-testid="wire-detail"');
    expect(desktop).toContain("GitHub public event · PUSH · 07/09/2026 09:00 UTC");
    expect(desktop).toContain('href="https://github.com/alice/one"');
    expect(desktop).toMatch(/class="ap-trow is-selected"/);
    const mobile = renderToStaticMarkup(<WirePage wireRows={rows} polledAt={polledAt} isInitialLoading={false} variant="mobile" />);
    expect(mobile).not.toContain("wire-detail");
    expect(mobile).toMatch(/<a [^>]*href="https:\/\/news\.ycombinator\.com\/item\?id=9"[^>]*class="ap-trow__head ap-wirerow"/);
    expect(mobile).not.toContain("is-selected");
  });

  it("WireDetail for an HN row: points, comments, the discussion link", () => {
    const html = renderToStaticMarkup(<WireDetail row={hn} nowMs={Date.parse(polledAt)} />);
    expect(html).toContain("Hacker News · 142 points · 37 comments · 07/09/2026 08:45 UTC");
    expect(html).toContain("Open on Hacker News");
    expect(html).toContain("The link is the discussion, not the article.");
  });

  it("a GitLab event is named as GitLab in the detail, with its GitLab links", () => {
    const html = renderToStaticMarkup(<WireDetail row={{ ...(ghArchive as Extract<WireItem, { kind: "gh" }>), sourceKind: "gitlab", eventId: "gl:77" }} nowMs={Date.parse(polledAt)} />);
    expect(html).toContain("GitLab public event · PR ·");
    expect(html).toContain("GitLab public events API · event gl:77");
    expect(html).toContain('href="https://gitlab.com/bob"');
    expect(html).toContain("40m ago by the publisher");
  });

  it("a tracked-repo event names its complete stream in the Source line", () => {
    const html = renderToStaticMarkup(<WireDetail row={{ ...(gh as Extract<WireItem, { kind: "gh" }>), sourceKind: "tracked-repo" }} nowMs={Date.parse(polledAt)} />);
    expect(html).toContain("GitHub Events API · tracked repo (complete stream, not the sampled firehose) · event 1");
  });

  it("pages the list: the first 200 rows, then a show-more with the honest remainder", () => {
    const many: WireItem[] = Array.from({ length: 450 }, (_, i) => ({ ...(gh as Extract<WireItem, { kind: "gh" }>), eventId: String(i) }));
    const html = renderToStaticMarkup(<WirePage wireRows={many} ghCoverage={{ windowMinutes: 240, windowSize: 450 }} polledAt={polledAt} isInitialLoading={false} />);
    expect(html).toContain("450 rows (450 gh · 0 hn)");
    expect((html.match(/class="ap-trow(?: is-selected)?"/g) ?? []).length).toBe(200);
    expect(html).toContain("Show 200 more");
    expect(html).toContain("200 of 450 rows shown");
  });
});
