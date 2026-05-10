/**
 * Reads data/video-daily.json, concatenates scene narrations,
 * and calls OpenAI TTS to produce an MP3 audio file.
 *
 * Usage: OPENAI_API_KEY=... npx tsx scripts/video/generate-tts.ts
 * Output: data/video-narration.mp3
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { VideoData } from "../../src/video/types";

const VOICE = "onyx";
const MODEL = "tts-1";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const dataPath = resolve(process.cwd(), "data/video-daily.json");
  const data: VideoData = JSON.parse(readFileSync(dataPath, "utf-8"));

  const fullScript = data.scenes.map((s) => s.narration).join("\n\n");
  console.log(`Script (${fullScript.length} chars):\n${fullScript}\n`);

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: fullScript,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`OpenAI TTS failed (${res.status}): ${err}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outPath = resolve(process.cwd(), "data/video-narration.mp3");
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
