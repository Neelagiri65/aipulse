/**
 * Brand sting concat — pure command assembly for the optional cinematic
 * intro/outro stings (Option A of the Higgsfield research note,
 * 2026-07-05: one-time generated brand assets, ZERO runtime dependency
 * on any generation API).
 *
 * Contract:
 *  - Stings are static, committed assets (assets/video/*-sting-*.mp4),
 *    generated once with a silent AAC track baked in.
 *  - Missing assets → no concat (plan.run=false) — the pipeline output
 *    is byte-for-byte what it is today. Polish never blocks the product.
 *  - The concat re-encodes through a normalising filter graph (scale +
 *    SAR + fps) so sting encoding quirks can't corrupt the daily video.
 */

export type StingPlan =
  | { run: false; reason: string }
  | { run: true; cmd: string; inputs: string[] };

export function buildStingConcat(opts: {
  mainFile: string;
  introFile: string | null;
  outroFile: string | null;
  outFile: string;
  vertical: boolean;
  /** Main video has an AAC track. Stings are silent-AAC by contract;
   *  a no-audio main (dev --no-audio path) skips stings entirely. */
  hasAudio: boolean;
}): StingPlan {
  const { mainFile, introFile, outroFile, outFile, vertical, hasAudio } = opts;
  if (!introFile && !outroFile) {
    return { run: false, reason: "no sting assets present (assets/video/) — skipping brand stings" };
  }
  if (!hasAudio) {
    return { run: false, reason: "main video has no audio track (--no-audio dev path) — skipping brand stings" };
  }

  const inputs = [introFile, mainFile, outroFile].filter(
    (f): f is string => f !== null,
  );
  const [w, h] = vertical ? [1080, 1920] : [1920, 1080];
  const norm = inputs
    .map(
      (_, i) =>
        `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];` +
        `[${i}:a]aresample=44100[a${i}]`,
    )
    .join(";");
  const pairs = inputs.map((_, i) => `[v${i}][a${i}]`).join("");
  const filter = `${norm};${pairs}concat=n=${inputs.length}:v=1:a=1[v][a]`;

  const cmd = [
    "ffmpeg -y",
    ...inputs.map((f) => `-i "${f}"`),
    `-filter_complex "${filter}"`,
    '-map "[v]" -map "[a]"',
    "-c:v libx264 -preset medium -crf 23",
    "-c:a aac -b:a 128k",
    "-movflags +faststart",
    `"${outFile}"`,
  ].join(" ");

  return { run: true, cmd, inputs };
}
