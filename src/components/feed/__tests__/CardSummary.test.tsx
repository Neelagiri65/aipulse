import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardSummary } from "@/components/feed/CardSummary";

const machine = {
  text: "The article describes a 3B-parameter model released by Ant Group.",
  model: "openai/gpt-oss-20b",
  generatedAt: "2026-09-26T10:00:00Z",
};

describe("CardSummary", () => {
  it("the source's words alone, with no heading and no machine label", () => {
    const html = renderToStaticMarkup(<CardSummary card={{ summary: "Create, run, and share large language models (LLMs)" }} />);
    expect(html).not.toContain("In their words");
    expect(html).not.toContain("ap-summary__head");
    expect(html).toContain("Create, run, and share large language models (LLMs)");
    expect(html).toContain('data-summary-kind="source"');
    expect(html).not.toContain("Machine summary");
    expect(html).not.toContain("Written by");
  });

  it("a machine summary is headed 'Machine summary' only, with no written-by credit line", () => {
    const html = renderToStaticMarkup(<CardSummary card={{ machineSummary: machine }} />);
    expect(html).toContain("Machine summary");
    expect(html).toContain(machine.text);
    expect(html).not.toContain("Written by");
    expect(html).not.toContain("not the source");
    expect(html).toContain('data-summary-kind="machine"');
    expect(html).not.toContain("In their words");
  });

  it("both present: the source's words win, the machine text is not shown", () => {
    const html = renderToStaticMarkup(<CardSummary card={{ summary: "Own words.", machineSummary: machine }} />);
    expect(html).toContain("Own words.");
    expect(html).not.toContain(machine.text);
    expect(html).not.toContain("Written by");
  });

  it("neither, or only blank text, renders nothing", () => {
    expect(renderToStaticMarkup(<CardSummary card={{}} />)).toBe("");
    expect(renderToStaticMarkup(<CardSummary card={{ summary: "   " }} />)).toBe("");
    expect(renderToStaticMarkup(<CardSummary card={{ machineSummary: { ...machine, text: " \n" } }} />)).toBe("");
  });

  it("a blank summary falls through to the machine summary", () => {
    const html = renderToStaticMarkup(<CardSummary card={{ summary: " ", machineSummary: machine }} />);
    expect(html).toContain("Machine summary");
  });
});
