import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedCardShareButton } from "@/components/feed/FeedCardShareButton";
import type { Card } from "@/lib/feed/types";

// Same posture as DigestPageView.test — stub the analytics dispatch so
// the component renders cleanly on the SSR path without touching
// window/document. Interactive paths (clipboard, state transitions)
// aren't covered here because the test env is `node` (no jsdom);
// they are exercised by the full Playwright suite.
vi.mock("@/lib/analytics", () => ({ track: () => {} }));

function card(partial: Partial<Card> = {}): Card {
  return {
    id: partial.id ?? "abc123",
    type: partial.type ?? "TOOL_ALERT",
    severity: partial.severity ?? 100,
    headline: partial.headline ?? "Claude Code degraded",
    detail: partial.detail,
    sourceName: partial.sourceName ?? "Anthropic Status",
    sourceUrl: partial.sourceUrl ?? "https://status.claude.com",
    timestamp: partial.timestamp ?? "2026-04-30T12:00:00.000Z",
    meta: partial.meta ?? {},
  };
}

describe("FeedCardShareButton — SSR markup", () => {
  it("renders LinkedIn + X intent links and a Copy button", () => {
    const html = renderToStaticMarkup(<FeedCardShareButton card={card()} />);
    expect(html).toContain("linkedin.com/sharing/share-offsite");
    expect(html).toContain("x.com/intent/tweet");
    expect(html).toContain('aria-label="Share on LinkedIn"');
    expect(html).toContain('aria-label="Share on X"');
    expect(html).toContain('aria-label="Copy card link"');
    expect(html).toContain(">Copy</button>");
  });

  it("uses the relative /feed/{id} URL on initial SSR (window.origin not yet known)", () => {
    const html = renderToStaticMarkup(
      <FeedCardShareButton card={card({ id: "abc123" })} />,
    );
    // SSR can't read window — permalink stays relative until the effect
    // resolves it client-side. LinkedIn share URL must still encode it.
    expect(html).toContain(encodeURIComponent("/feed/abc123"));
  });

  it("includes the card type label and headline in the X compose text", () => {
    const html = renderToStaticMarkup(
      <FeedCardShareButton
        card={card({
          type: "MODEL_MOVER",
          headline: "Tencent Hy3 Preview now #3, was #9",
        })}
      />,
    );
    // composeShareText pattern: "{type-label}: {headline} — via Gawk"
    expect(html).toContain("Model+mover");
    expect(html).toContain("via+Gawk");
  });

  it("emits a stable test id keyed by card id so tests can target rows", () => {
    const html = renderToStaticMarkup(
      <FeedCardShareButton card={card({ id: "stable-id-1" })} />,
    );
    expect(html).toContain('data-testid="feed-share-stable-id-1"');
  });

  it("uses safe link relations (noreferrer noopener) on intent anchors", () => {
    const html = renderToStaticMarkup(<FeedCardShareButton card={card()} />);
    // Both intent anchors must carry noreferrer + noopener so the
    // share-target window can't reach window.opener back at us.
    const liMatch = html.match(/Share on LinkedIn[^]*?rel="([^"]+)"/);
    const xMatch = html.match(/Share on X[^]*?rel="([^"]+)"/);
    // Order check: opening tag attributes appear BEFORE the aria-label,
    // so look for rel near the link href instead.
    expect(html).toMatch(/rel="noreferrer noopener"[^>]*linkedin\.com|linkedin\.com[^>]*rel="noreferrer noopener"/);
    expect(html).toMatch(/rel="noreferrer noopener"[^>]*x\.com\/intent|x\.com\/intent[^>]*rel="noreferrer noopener"/);
    void liMatch;
    void xMatch;
  });
});
