import { describe, expect, it } from "vitest";
import { parseStack, partitionByStack, serializeStack, toggleTool } from "@/lib/stack";

describe("parseStack — explicit choice only, corrupt input is 'no stack'", () => {
  it("accepts known ids, drops unknown, dedupes, keeps the visitor's order", () => {
    expect(parseStack(JSON.stringify(["cursor", "claude-code", "nope", "cursor"]))).toEqual(["cursor", "claude-code"]);
  });
  it.each([null, undefined, "", "not json", "{}", "[]", '["nope"]', "42"])("%s → null", (raw) => {
    expect(parseStack(raw as string | null)).toBeNull();
  });
});

describe("serializeStack / toggleTool", () => {
  it("round-trips and normalises", () => {
    expect(serializeStack(["cursor", "cursor", "claude-code"])).toBe('["cursor","claude-code"]');
    expect(serializeStack(null)).toBeNull();
    expect(serializeStack([])).toBeNull();
  });
  it("toggling the last tool off yields no stack, not an empty stack", () => {
    expect(toggleTool(null, "cursor")).toEqual(["cursor"]);
    expect(toggleTool(["cursor"], "claude-code")).toEqual(["cursor", "claude-code"]);
    expect(toggleTool(["cursor"], "cursor")).toBeNull();
  });
});

describe("partitionByStack — nothing hidden", () => {
  const rows = ["claude-code", "copilot", "cursor"].map((id) => ({ tool: { id: id as "cursor" } }));
  it("no stack → everything is mine, nothing is other", () => {
    expect(partitionByStack(rows, null)).toEqual({ mine: rows, others: [] });
    expect(partitionByStack(rows, [])).toEqual({ mine: rows, others: [] });
  });
  it("a stack splits rows without dropping any, keeping TOOLS order inside each group", () => {
    const { mine, others } = partitionByStack(rows, ["cursor", "claude-code"]);
    expect(mine.map((r) => r.tool.id)).toEqual(["claude-code", "cursor"]);
    expect(others.map((r) => r.tool.id)).toEqual(["copilot"]);
    expect(mine.length + others.length).toBe(rows.length);
  });
});
