import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RowDrawer,
  composeShareHeadline,
  type RankHistoryPoint,
} from "@/components/panels/model-usage/RowDrawer";
import type { ModelUsageRow } from "@/lib/data/openrouter-types";

function mkRow(overrides: Partial<ModelUsageRow> = {}): ModelUsageRow {
  return {
    rank: 3,
    slug: "anthropic/claude-sonnet-4.6",
    permaslug: "anthropic/claude-sonnet-4.6-20260301",
    name: "Claude Sonnet 4.6",
    shortName: "Sonnet 4.6",
    author: "anthropic",
    authorDisplay: "Anthropic",
    pricing: {
      promptPerMTok: 3,
      completionPerMTok: 15,
      webSearchPerCall: 0.01,
    },
    contextLength: 200_000,
    knowledgeCutoff: "2026-01-01",
    supportsReasoning: true,
    modalitiesIn: ["text"],
    modalitiesOut: ["text"],
    hubUrl: "https://openrouter.ai/anthropic/claude-sonnet-4.6",
    ...overrides,
  };
}

describe("RowDrawer", () => {
  it("renders nothing when open=false", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={false}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toBe("");
  });

  it("renders the OpenRouter deep link", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain('href="https://openrouter.ai/anthropic/claude-sonnet-4.6"');
    expect(html).toContain("View on OpenRouter ↗");
  });

  it("renders prompt + completion + web-search pricing rows", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain("Prompt / 1M");
    expect(html).toContain("Completion / 1M");
    expect(html).toContain("Web search / call");
  });

  it("hides the web-search row when webSearchPerCall is null", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow({
          pricing: { promptPerMTok: 3, completionPerMTok: 15, webSearchPerCall: null },
        })}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).not.toContain("Web search / call");
  });

  it("renders 'not published' when prompt or completion pricing is null", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow({
          pricing: { promptPerMTok: null, completionPerMTok: null, webSearchPerCall: null },
        })}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain("not published");
  });

  it("suppresses the sparkline when fewer than 2 history points", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
        rankHistory={[{ date: "2026-04-26", rank: 3 }]}
      />,
    );
    expect(html).toContain("Rank history will appear");
  });

  it("renders the sparkline when ≥2 history points exist", () => {
    const history: RankHistoryPoint[] = [
      { date: "2026-04-25", rank: 5 },
      { date: "2026-04-26", rank: 3 },
    ];
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
        rankHistory={history}
      />,
    );
    expect(html).not.toContain("Rank history will appear");
    expect(html).toContain("OpenRouter rank, last 2 days");
  });

  it("uses role=dialog and aria-modal=true", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("renders the canonical OpenRouter caveat", () => {
    const html = renderToStaticMarkup(
      <RowDrawer
        row={mkRow()}
        open={true}
        onClose={() => {}}
        originUrl="https://aipulse.dev"
      />,
    );
    expect(html).toContain("OpenRouter request volume");
    expect(html).toContain("not end-user adoption");
  });
});

describe("composeShareHeadline", () => {
  it("includes rank, name, author, and prompt price", () => {
    const headline = composeShareHeadline(mkRow());
    expect(headline).toContain("#3");
    expect(headline).toContain("Sonnet 4.6");
    expect(headline).toContain("Anthropic");
    expect(headline).toContain("Mtok prompt");
  });

  it("omits price clause when null", () => {
    const headline = composeShareHeadline(
      mkRow({
        pricing: { promptPerMTok: null, completionPerMTok: null, webSearchPerCall: null },
      }),
    );
    expect(headline).not.toContain("Mtok");
  });
});
