/**
 * Render tests for TranslatableText (S61).
 *
 * Project convention is `renderToStaticMarkup` (no jsdom configured).
 * Visible-on-first-paint state coverage lives here; the interaction
 * state machine (onClick → loading → translated/failed) is covered
 * by unit tests on `translateText` + `parseTranslateResponse` plus
 * the component's small reducer-style branch logic, which is short
 * enough to inspect by eye. A dom-test harness is deferred to a
 * future session if/when more interactive components warrant it.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TranslatableText } from "@/components/wire/TranslatableText";

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("TranslatableText — eligibility", () => {
  it("renders text plainly with no toggle when lang is 'en'", () => {
    const out = html(<TranslatableText text="Hello world" lang="en" />);
    expect(out).toContain("Hello world");
    expect(out).not.toContain('data-testid="translate-toggle"');
    expect(out).not.toContain("via Google Translate");
  });

  it("renders text plainly when lang is null/undefined/empty", () => {
    expect(html(<TranslatableText text="A" lang={null} />)).not.toContain(
      "translate-toggle",
    );
    expect(html(<TranslatableText text="A" lang={undefined} />)).not.toContain(
      "translate-toggle",
    );
    expect(html(<TranslatableText text="A" lang="" />)).not.toContain(
      "translate-toggle",
    );
  });

  it("renders text plainly for regional English variants (en-GB, en-us)", () => {
    expect(html(<TranslatableText text="A" lang="en-GB" />)).not.toContain(
      "translate-toggle",
    );
    expect(html(<TranslatableText text="A" lang="en-us" />)).not.toContain(
      "translate-toggle",
    );
  });

  it("renders an initial Translate button for non-English lang", () => {
    const out = html(<TranslatableText text="Hallo Welt" lang="de" />);
    expect(out).toContain('data-testid="translate-toggle"');
    expect(out).toContain("Translate");
  });

  it("treats lang case-insensitively (uppercase DE still eligible, En not)", () => {
    expect(html(<TranslatableText text="A" lang="DE" />)).toContain(
      "translate-toggle",
    );
    expect(html(<TranslatableText text="A" lang="En" />)).not.toContain(
      "translate-toggle",
    );
  });
});

describe("TranslatableText — link surface", () => {
  it("renders an external anchor when linkUrl is provided", () => {
    const out = html(
      <TranslatableText
        text="Hallo"
        lang="de"
        linkUrl="https://www.heise.de/news/test"
      />,
    );
    expect(out).toContain("<a");
    expect(out).toContain('href="https://www.heise.de/news/test"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("renders a span (no anchor) when linkUrl is omitted", () => {
    const out = html(<TranslatableText text="Hallo" lang="de" />);
    // The translatable span MUST NOT be wrapped in an anchor.
    expect(out).toContain('<span');
    expect(out).toContain('data-testid="translatable-text"');
    // No href on the translatable text node itself.
    const idxText = out.indexOf('data-testid="translatable-text"');
    const sliceBefore = out.slice(0, idxText);
    // Most-recently-opened tag before the testid should be a <span ...>, not <a ...>.
    const lastSpan = sliceBefore.lastIndexOf("<span");
    const lastAnchor = sliceBefore.lastIndexOf("<a ");
    expect(lastSpan).toBeGreaterThan(lastAnchor);
  });

  it("falls back to the original text as the HTML title (tooltip)", () => {
    const out = html(<TranslatableText text="Hallo Welt" lang="de" />);
    expect(out).toContain('title="Hallo Welt"');
  });

  it("respects an explicit hoverTitle override", () => {
    const out = html(
      <TranslatableText text="Hallo" lang="de" hoverTitle="Custom tooltip" />,
    );
    expect(out).toContain('title="Custom tooltip"');
  });
});

describe("TranslatableText — initial paint accessibility", () => {
  it("toggle button has an aria-label distinct from the visible emoji+label", () => {
    const out = html(<TranslatableText text="Hallo" lang="de" />);
    expect(out).toContain('aria-label="Translate to English"');
  });
});
