import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The permalink page and its share image once each carried a private copy of the feed loader.
// The copies drifted: no summaries, no machine summaries, no quarantine. Each file must resolve
// its card through the shared loader (findFeedCard → loadFeedResponse), never compose its own.
const FILES = ["src/app/feed/[cardId]/page.tsx", "src/app/feed/[cardId]/opengraph-image.tsx"];

describe("card permalink surfaces use the shared feed loader", () => {
  it("covers exactly the two permalink files", () => {
    expect(FILES).toHaveLength(2);
  });
  for (const file of FILES) {
    it(`${file} resolves cards via findFeedCard and composes nothing itself`, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).toMatch(/import \{ findFeedCard \} from "@\/lib\/feed\/load"/);
      expect(src).not.toMatch(/composeFeed|FeedSnapshots|readWire|fetchAllStatus/);
    });
  }
});
