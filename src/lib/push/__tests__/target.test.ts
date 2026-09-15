import { describe, expect, it } from "vitest";
import { isKnownToolId, selectRecipients } from "@/lib/push/target";

type R = { endpoint: string; tools?: readonly string[] | null };
const everyone: R = { endpoint: "e0" }; // legacy raw record, no tools key
const emptyList: R = { endpoint: "e1", tools: [] };
const cursorOnly: R = { endpoint: "e2", tools: ["cursor"] };
const copilotAndClaude: R = { endpoint: "e3", tools: ["copilot", "claude-code"] };
const nullTools: R = { endpoint: "e4", tools: null };
const all: R[] = [everyone, emptyList, cursorOnly, copilotAndClaude, nullTools];
const ids = (xs: R[]) => xs.map((x) => x.endpoint);

describe("selectRecipients — scoped where a record asked, fail open everywhere else", () => {
  it("no tool id → everyone", () => {
    expect(ids(selectRecipients(all, undefined))).toEqual(ids(all));
    expect(ids(selectRecipients(all, null))).toEqual(ids(all));
  });
  it("an unknown tool id → everyone (alerting never fails closed on a junk id)", () => {
    expect(ids(selectRecipients(all, "not-a-tool"))).toEqual(ids(all));
    expect(ids(selectRecipients(all, 42))).toEqual(ids(all));
  });
  it("a known tool id → legacy, empty-list and null-tools records plus records listing that tool", () => {
    expect(ids(selectRecipients(all, "cursor"))).toEqual(["e0", "e1", "e2", "e4"]);
    expect(ids(selectRecipients(all, "copilot"))).toEqual(["e0", "e1", "e3", "e4"]);
    expect(ids(selectRecipients(all, "windsurf"))).toEqual(["e0", "e1", "e4"]);
  });
  it("does not mutate and returns a new array", () => {
    const out = selectRecipients(all, undefined);
    expect(out).not.toBe(all);
    expect(all).toHaveLength(5);
  });
});

describe("isKnownToolId", () => {
  it("accepts exactly the TOOLS ids", () => {
    expect(isKnownToolId("claude-code")).toBe(true);
    expect(isKnownToolId("openai-api")).toBe(true);
    expect(isKnownToolId("claude")).toBe(false);
    expect(isKnownToolId("")).toBe(false);
    expect(isKnownToolId(undefined)).toBe(false);
  });
});
