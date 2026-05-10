/**
 * Generates narration audio from the video script.
 *
 * Backends (checked in order):
 *   1. Piper TTS (local, free, no API key) — requires `piper` binary + voice model
 *   2. OpenAI TTS (paid, OPENAI_API_KEY) — fallback for environments without Piper
 *
 * Install Piper (Ubuntu/CI):
 *   apt-get install -y piper
 *   # or download from https://github.com/rhasspy/piper/releases
 *   # Voice models: https://huggingface.co/rhasspy/piper-voices
 *
 * Usage: npx tsx scripts/video/generate-tts.ts
 * Output: data/video-narration.mp3
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import type { VideoData } from "../../src/video/types";

const PIPER_VOICE = process.env.PIPER_VOICE || "en_US-lessac-medium";
const PIPER_VOICE_DIR = process.env.PIPER_VOICE_DIR || resolve(process.cwd(), "data/piper-voices");
const OPENAI_VOICE = "onyx";
const OPENAI_MODEL = "tts-1";

function isPiperAvailable(): boolean {
  try {
    execSync("piper --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getVoiceModelPath(): string | null {
  const onnxPath = resolve(PIPER_VOICE_DIR, `${PIPER_VOICE}.onnx`);
  if (existsSync(onnxPath)) return onnxPath;

  // Check system piper-voices location
  const systemPath = `/usr/share/piper-voices/${PIPER_VOICE}.onnx`;
  if (existsSync(systemPath)) return systemPath;

  return null;
}

function downloadVoiceModel(): string {
  const onnxPath = resolve(PIPER_VOICE_DIR, `${PIPER_VOICE}.onnx`);
  const jsonPath = resolve(PIPER_VOICE_DIR, `${PIPER_VOICE}.onnx.json`);

  if (existsSync(onnxPath) && existsSync(jsonPath)) return onnxPath;

  console.log(`Downloading Piper voice model: ${PIPER_VOICE}...`);
  execSync(`mkdir -p "${PIPER_VOICE_DIR}"`, { stdio: "inherit" });

  const baseUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium`;
  execSync(
    `curl -sL "${baseUrl}/en_US-lessac-medium.onnx" -o "${onnxPath}" && ` +
    `curl -sL "${baseUrl}/en_US-lessac-medium.onnx.json" -o "${jsonPath}"`,
    { stdio: "inherit", timeout: 60000 }
  );

  console.log(`Voice model downloaded to ${PIPER_VOICE_DIR}`);
  return onnxPath;
}

async function generateWithPiper(script: string, outPath: string): Promise<void> {
  const modelPath = getVoiceModelPath() ?? downloadVoiceModel();
  const wavPath = outPath.replace(/\.mp3$/, ".wav");

  console.log(`Generating audio with Piper (voice: ${PIPER_VOICE})...`);

  // Piper reads from stdin, writes WAV to file
  execSync(
    `echo ${JSON.stringify(script)} | piper --model "${modelPath}" --output_file "${wavPath}"`,
    { stdio: ["pipe", "inherit", "inherit"], timeout: 30000 }
  );

  // Convert WAV to MP3 via ffmpeg
  const hasFFmpeg = (() => { try { execSync("ffmpeg -version", { stdio: "ignore" }); return true; } catch { return false; } })();

  if (hasFFmpeg) {
    console.log("Converting WAV to MP3...");
    execSync(`ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${outPath}"`, {
      stdio: ["pipe", "inherit", "inherit"],
      timeout: 30000,
    });
    execSync(`rm "${wavPath}"`, { stdio: "ignore" });
  } else {
    console.log("ffmpeg not found — keeping WAV output.");
    // Rename wav to mp3 path for consistency (it's still WAV inside)
    execSync(`mv "${wavPath}" "${outPath}"`, { stdio: "ignore" });
  }

  console.log(`Wrote ${outPath}`);
}

async function generateWithOpenAI(script: string, outPath: string, apiKey: string): Promise<void> {
  console.log(`Generating audio with OpenAI TTS (voice: ${OPENAI_VOICE})...`);

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      voice: OPENAI_VOICE,
      input: script,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS failed (${res.status}): ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const dataPath = resolve(process.cwd(), "data/video-daily.json");
  const data: VideoData = JSON.parse(readFileSync(dataPath, "utf-8"));

  const fullScript = data.scenes.map((s) => s.narration).join(" . ");
  console.log(`Script (${fullScript.split(/\s+/).length} words):\n${fullScript}\n`);

  const outPath = resolve(process.cwd(), "data/video-narration.mp3");

  if (isPiperAvailable()) {
    await generateWithPiper(fullScript, outPath);
  } else if (process.env.OPENAI_API_KEY) {
    await generateWithOpenAI(fullScript, outPath, process.env.OPENAI_API_KEY);
  } else {
    console.error(
      "No TTS backend available.\n" +
      "  Install Piper: apt-get install piper (or download from GitHub releases)\n" +
      "  Or set OPENAI_API_KEY for OpenAI TTS fallback."
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
