import { describe, it, expect } from "vitest";
import {
  shouldShowMcpPrompt,
  readMcpCookies,
  MCP_PROMPT_DELAY_MS,
  MCP_DISMISSED_COOKIE,
  MCP_OPENED_COOKIE,
} from "@/lib/mcp-prompt";

const base = {
  hasDismissed: false,
  hasOpened: false,
  subscribePromptVisible: false,
  subscribePromptShownThisVisit: false,
  isMobile: false,
  consentResolved: true,
  elapsedMs: MCP_PROMPT_DELAY_MS,
};

describe("shouldShowMcpPrompt", () => {
  it("shows once every gate passes", () => {
    expect(shouldShowMcpPrompt(base)).toBe(true);
  });

  it("never stacks on the digest prompt — one card in that corner, not two", () => {
    expect(
      shouldShowMcpPrompt({ ...base, subscribePromptVisible: true }),
    ).toBe(false);
  });

  it("one prompt per visit — a dismissed digest prompt does not hand over to this one", () => {
    // The digest prompt showed at 5s and the visitor closed it: it is no longer
    // "visible", but it took this visit's slot.
    expect(
      shouldShowMcpPrompt({ ...base, subscribePromptVisible: false, subscribePromptShownThisVisit: true }),
    ).toBe(false);
  });

  it("desktop only — never over a phone's reading pane", () => {
    expect(shouldShowMcpPrompt({ ...base, isMobile: true })).toBe(false);
  });

  it("waits longer than the digest prompt's 5s", () => {
    expect(shouldShowMcpPrompt({ ...base, elapsedMs: 5000 })).toBe(false);
    expect(shouldShowMcpPrompt({ ...base, elapsedMs: MCP_PROMPT_DELAY_MS - 1 })).toBe(false);
  });

  it("respects a refusal and an acceptance alike", () => {
    expect(shouldShowMcpPrompt({ ...base, hasDismissed: true })).toBe(false);
    // Someone who already went and looked must never be asked again.
    expect(shouldShowMcpPrompt({ ...base, hasOpened: true })).toBe(false);
  });

  it("lets the consent banner go first", () => {
    expect(shouldShowMcpPrompt({ ...base, consentResolved: false })).toBe(false);
  });
});

describe("readMcpCookies", () => {
  it("reads both flags, and is not fooled by a name that merely contains one", () => {
    expect(readMcpCookies(`${MCP_DISMISSED_COOKIE}=1`)).toEqual({
      hasDismissed: true,
      hasOpened: false,
    });
    expect(readMcpCookies(`a=1; ${MCP_OPENED_COOKIE}=1; b=2`)).toEqual({
      hasDismissed: false,
      hasOpened: true,
    });
    expect(readMcpCookies("not_gawk_mcp_dismissed_really=1")).toEqual({
      hasDismissed: false,
      hasOpened: false,
    });
    expect(readMcpCookies("")).toEqual({ hasDismissed: false, hasOpened: false });
  });
});
