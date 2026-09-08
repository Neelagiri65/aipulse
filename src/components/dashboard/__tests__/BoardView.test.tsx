import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardView } from "@/components/dashboard/BoardView";

describe("BoardView", () => {
  it("renders the way back, the title, the count, the body, and the deep link", () => {
    const html = renderToStaticMarkup(
      <BoardView id="benchmarks" count={20} statBar={<span>1514 TOP ELO</span>} onBack={() => {}}>
        <p>body</p>
      </BoardView>,
    );
    expect(html).toContain('data-testid="board-view"');
    expect(html).toContain('data-board="benchmarks"');
    expect(html).toContain('href="/?tab=more"');
    expect(html).toContain("‹ More");
    expect(html).toContain("Chatbot Arena");
    expect(html).toContain("top 20 · lmarena-leaderboard");
    expect(html).toContain(">20<");
    expect(html).toContain("1514 TOP ELO");
    expect(html).toContain("<p>body</p>");
    expect(html).toContain('href="/?tab=more&amp;board=benchmarks"');
    expect(html).not.toContain("Open the full page");
  });

  it("offers the standalone page when the board has one", () => {
    const html = renderToStaticMarkup(
      <BoardView id="sdk-adoption" fullPageHref="/panels/sdk-adoption" onBack={() => {}}>
        <p>body</p>
      </BoardView>,
    );
    expect(html).toContain('href="/panels/sdk-adoption"');
    expect(html).toContain("Open the full page");
  });
});
