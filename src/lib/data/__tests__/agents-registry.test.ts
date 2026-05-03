/**
 * Agents-panel registry shape sanity. The registry is the single editorial
 * source for the framework slate — its shape is the contract the fetcher,
 * view assembler, and digest section all rely on. Add a row here and
 * downstream code picks it up automatically.
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_FRAMEWORKS,
  type AgentFramework,
} from "@/lib/data/agents-registry";

describe("AGENT_FRAMEWORKS registry", () => {
  it("ships exactly 8 frameworks (Phase A scope lock)", () => {
    expect(AGENT_FRAMEWORKS).toHaveLength(8);
  });

  it("uses unique stable ids", () => {
    const ids = AGENT_FRAMEWORKS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(AGENT_FRAMEWORKS)(
    "$id has a non-empty name, github repo, and at least one language",
    (f: AgentFramework) => {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.githubRepo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(f.languages.length).toBeGreaterThan(0);
    },
  );

  it.each(AGENT_FRAMEWORKS)(
    "$id has at least one of pypiPackage / npmPackage, OR is in tombstone category",
    (f: AgentFramework) => {
      const hasPackage = Boolean(f.pypiPackage || f.npmPackage);
      const isTombstone = f.category === "legacy" || f.category === "dormant";
      expect(hasPackage || isTombstone).toBe(true);
    },
  );

  it("includes the locked frameworks from PRD §3", () => {
    const ids = AGENT_FRAMEWORKS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "langgraph",
        "crewai",
        "smolagents",
        "autogen",
        "openai-agents",
        "pydantic-ai",
        "autogpt",
        "sweep",
      ]),
    );
  });

  it("autogen tracks the live successor namespace, not the deprecated 'autogen' package", () => {
    const f = AGENT_FRAMEWORKS.find((x) => x.id === "autogen");
    expect(f?.pypiPackage).toBe("autogen-agentchat");
  });

  it("langgraph and openai-agents are tracked as multi-language", () => {
    const lg = AGENT_FRAMEWORKS.find((x) => x.id === "langgraph");
    expect(lg?.languages).toEqual(
      expect.arrayContaining(["python", "javascript"]),
    );
    expect(lg?.pypiPackage).toBeTruthy();
    expect(lg?.npmPackage).toBeTruthy();

    const oa = AGENT_FRAMEWORKS.find((x) => x.id === "openai-agents");
    expect(oa?.languages).toEqual(
      expect.arrayContaining(["python", "javascript"]),
    );
    expect(oa?.pypiPackage).toBeTruthy();
    expect(oa?.npmPackage).toBeTruthy();
  });

  it("sweep is editorially classed dormant with no PyPI / npm presence", () => {
    const f = AGENT_FRAMEWORKS.find((x) => x.id === "sweep");
    expect(f?.category).toBe("dormant");
    expect(f?.pypiPackage).toBeUndefined();
    expect(f?.npmPackage).toBeUndefined();
  });

  it("autogpt is editorially classed legacy", () => {
    const f = AGENT_FRAMEWORKS.find((x) => x.id === "autogpt");
    expect(f?.category).toBe("legacy");
  });
});
