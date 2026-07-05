/**
 * Brand sting concat — the assets-optional contract: absent stings or a
 * no-audio main → no concat (today's output untouched); present stings
 * → a normalising concat command with the right geometry per format.
 */
import { describe, expect, it } from "vitest";

import { buildStingConcat } from "@/lib/video/stings";

const base = {
  mainFile: "out/gawk-daily-2026-07-06.mp4",
  outFile: "out/gawk-daily-2026-07-06.stung.mp4",
  vertical: false,
  hasAudio: true,
};

describe("buildStingConcat", () => {
  it("no sting assets → run:false, pipeline output untouched", () => {
    const plan = buildStingConcat({ ...base, introFile: null, outroFile: null });
    expect(plan.run).toBe(false);
  });

  it("no-audio main (dev path) → run:false even with assets", () => {
    const plan = buildStingConcat({
      ...base,
      hasAudio: false,
      introFile: "assets/video/intro-sting-landscape.mp4",
      outroFile: "assets/video/outro-sting-landscape.mp4",
    });
    expect(plan.run).toBe(false);
  });

  it("intro + outro → 3-input concat in order intro, main, outro", () => {
    const plan = buildStingConcat({
      ...base,
      introFile: "assets/video/intro-sting-landscape.mp4",
      outroFile: "assets/video/outro-sting-landscape.mp4",
    });
    expect(plan.run).toBe(true);
    if (!plan.run) return;
    expect(plan.inputs).toEqual([
      "assets/video/intro-sting-landscape.mp4",
      "out/gawk-daily-2026-07-06.mp4",
      "assets/video/outro-sting-landscape.mp4",
    ]);
    expect(plan.cmd).toContain("concat=n=3:v=1:a=1");
    expect(plan.cmd).toContain("scale=1920:1080");
    expect(plan.cmd).toContain('"out/gawk-daily-2026-07-06.stung.mp4"');
  });

  it("intro only → 2-input concat, intro first", () => {
    const plan = buildStingConcat({
      ...base,
      introFile: "assets/video/intro-sting-landscape.mp4",
      outroFile: null,
    });
    expect(plan.run).toBe(true);
    if (!plan.run) return;
    expect(plan.inputs[0]).toContain("intro-sting");
    expect(plan.cmd).toContain("concat=n=2:v=1:a=1");
  });

  it("vertical format normalises to 1080x1920", () => {
    const plan = buildStingConcat({
      ...base,
      vertical: true,
      introFile: "assets/video/intro-sting-vertical.mp4",
      outroFile: null,
    });
    expect(plan.run).toBe(true);
    if (!plan.run) return;
    expect(plan.cmd).toContain("scale=1080:1920");
  });
});
