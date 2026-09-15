/**
 * The package→tool table cannot drift: every key is a package a registry
 * actually tracks, every value is a TOOLS id, and the rows are exactly the
 * ones the file's header argues for.
 */
import { describe, expect, it } from "vitest";
import { PACKAGE_TOOL, packageToolId } from "@/lib/feed/attribution";
import { TOOLS } from "@/components/health/tools";
import { NPM_TRACKED_PACKAGES } from "@/lib/data/pkg-npm";
import { PYPI_TRACKED_PACKAGES } from "@/lib/data/pkg-pypi";
import { VSCODE_TRACKED_EXTENSIONS } from "@/lib/data/pkg-vscode";

const TRACKED: Record<string, readonly string[]> = {
  npm: NPM_TRACKED_PACKAGES,
  pypi: PYPI_TRACKED_PACKAGES,
  vscode: VSCODE_TRACKED_EXTENSIONS,
};
const TOOL_IDS = new Set<string>(TOOLS.map((t) => t.id));

describe("PACKAGE_TOOL — exact identity only, and only for tracked packages", () => {
  it.each(Object.entries(PACKAGE_TOOL))("%s → %s is a tracked package and a real tool id", (key, toolId) => {
    const [registry, name] = key.split(/:(.+)/);
    expect(TRACKED[registry], `registry ${registry} has no tracked list wired into this test`).toBeDefined();
    expect(TRACKED[registry]).toContain(name);
    expect(TOOL_IDS.has(toolId)).toBe(true);
  });

  it("is exactly the argued-for rows — adding one means re-reading the header", () => {
    expect(Object.keys(PACKAGE_TOOL).sort()).toEqual(
      ["npm:openai", "pypi:openai", "vscode:Codeium.codeium", "vscode:GitHub.copilot"].sort(),
    );
  });

  it("packageToolId answers only for a row; vendor-named packages that are not the tool stay null", () => {
    expect(packageToolId("vscode", "GitHub.copilot")).toBe("copilot");
    expect(packageToolId("npm", "openai")).toBe("openai-api");
    expect(packageToolId("npm", "@anthropic-ai/sdk")).toBeNull();
    expect(packageToolId("pypi", "anthropic")).toBeNull();
    expect(packageToolId("vscode", "saoudrizwan.claude-dev")).toBeNull();
    expect(packageToolId("brew", "ollama")).toBeNull();
  });
});
