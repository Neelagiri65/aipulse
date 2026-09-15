/**
 * The picker's two URL-related affordances, rendered statically: the
 * "Shared stack" proposal line (only when a proposal is passed) and the
 * "Copy link" button (only with a stack AND an origin — the server has no
 * origin, so the HTML never carries a link).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StackPicker } from "@/components/health/StackPicker";

const noop = () => {};

describe("StackPicker × shared stack", () => {
  it("no proposal: no line, no share button without an origin", () => {
    const html = renderToStaticMarkup(<StackPicker stack={["cursor"]} onChange={noop} />);
    expect(html).not.toContain("stack-shared");
    expect(html).not.toContain("stack-share");
    expect(html).toContain('data-testid="stack-clear"');
  });

  it("a proposal renders one inline line naming the tools, with Use it and Keep mine", () => {
    const html = renderToStaticMarkup(
      <StackPicker stack={["cursor"]} onChange={noop} shared={["copilot", "claude-code"]} onUseShared={noop} onDismissShared={noop} />,
    );
    expect(html).toContain("Shared stack: GitHub Copilot, Claude Code");
    expect(html).toContain('data-testid="stack-shared-use"');
    expect(html).toContain("Keep mine");
    expect(html.match(/data-testid="stack-shared"/g)).toHaveLength(1);
  });

  it("with nothing stored the dismiss reads Dismiss, not Keep mine", () => {
    const html = renderToStaticMarkup(<StackPicker stack={null} onChange={noop} shared={["windsurf"]} />);
    expect(html).toContain("Shared stack: Windsurf");
    expect(html).toContain(">Dismiss<");
    expect(html).not.toContain("Keep mine");
  });

  it("with a stack and an origin the share button carries the exact URL", () => {
    const html = renderToStaticMarkup(<StackPicker stack={["cursor", "copilot"]} onChange={noop} origin="https://gawk.dev" />);
    expect(html).toContain('data-testid="stack-share"');
    expect(html).toContain('data-share-url="https://gawk.dev/?stack=cursor,copilot"');
    expect(html).toContain("Copy link");
  });

  it("no stack: no share button even with an origin", () => {
    const html = renderToStaticMarkup(<StackPicker stack={null} onChange={noop} origin="https://gawk.dev" />);
    expect(html).not.toContain("stack-share");
    expect(html).toContain("pick the tools you use");
  });
});
