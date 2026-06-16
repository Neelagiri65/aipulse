/**
 * Filesystem-safe paths for narration segments.
 *
 * Narration-segment ids can legitimately contain "/" — scoped npm packages
 * (`@langchain/core`) and HuggingFace org/model ids (`Qwen/Qwen3-0.6B`).
 * Interpolated raw into a filename, the "/" spawns a phantom subdirectory and
 * the edge-tts write fails with `FileNotFoundError`, which hard-stops the whole
 * daily-video pipeline (incident 2026-06-16: `@langchain/core` SDK story).
 *
 * Slug the FILENAME only. The `id` field itself stays raw in every JSON
 * artifact (script-locked, narration-locked, video-manifest), so the
 * cross-file `id === id` matching that drives segment timing is unaffected.
 */

/** Collapse any character that is unsafe in a filename to "-". */
export function segSlug(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "-");
}

/** Repo-relative narration-segment audio path (stored in segments JSON). */
export function segAudioPath(id: string): string {
  return `out/narration-seg-${segSlug(id)}.mp3`;
}

/** Repo-relative inter-segment silence-gap path. */
export function segSilencePath(id: string): string {
  return `out/silence-${segSlug(id)}.mp3`;
}
