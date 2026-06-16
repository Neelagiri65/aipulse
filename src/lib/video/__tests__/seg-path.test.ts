import { describe, it, expect } from "vitest";
import { segSlug, segAudioPath, segSilencePath } from "../seg-path";

describe("segSlug", () => {
  it("strips the slash from scoped npm package ids (the 2026-06-16 incident)", () => {
    const slug = segSlug("sdk-@langchain/core");
    expect(slug).not.toContain("/");
    expect(slug).toBe("sdk--langchain-core");
  });

  it("strips the slash from HuggingFace org/model ids", () => {
    expect(segSlug("model-Qwen/Qwen3-0.6B")).toBe("model-Qwen-Qwen3-0.6B");
  });

  it("leaves already-safe ids untouched", () => {
    for (const id of ["intro", "outro", "model-DeepSeek-V4", "sdk-langchain-core"]) {
      expect(segSlug(id)).toBe(id);
    }
  });

  it("preserves dots, underscores and hyphens", () => {
    expect(segSlug("a.b_c-d")).toBe("a.b_c-d");
  });
});

describe("seg path builders", () => {
  it("never emit a path separator inside the segment filename", () => {
    for (const id of ["sdk-@langchain/core", "model-Qwen/Qwen3-0.6B"]) {
      const audio = segAudioPath(id);
      const silence = segSilencePath(id);
      // Exactly one separator: the "out/" prefix. No phantom subdirectory.
      expect(audio.split("/").length).toBe(2);
      expect(silence.split("/").length).toBe(2);
      expect(audio).toMatch(/^out\/narration-seg-.*\.mp3$/);
      expect(silence).toMatch(/^out\/silence-.*\.mp3$/);
    }
  });
});
