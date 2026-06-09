/**
 * Upload today's Gawk Daily video to Discord via webhook.
 *
 * Posts the MP4 as a file attachment (autoplays in channel) with a
 * humanised caption generated from today's narration-locked stories.
 *
 * Env: DISCORD_DAILY_WEBHOOK_URL (webhook URL for the target channel).
 *
 * Usage:
 *   npx tsx scripts/video/upload-discord.ts
 *   npx tsx scripts/video/upload-discord.ts --dry-run
 */

import { readFileSync, existsSync, statSync } from "fs";
import { resolve, basename } from "path";
import { buildMetadata } from "./video-metadata";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DATE = new Date().toISOString().slice(0, 10);
const MAX_FILE_SIZE = 9 * 1024 * 1024; // 9MB — stay under Discord's 10MB limit

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const VIDEO_PATH = resolve(ROOT, getArg("--file", `out/gawk-daily-${DATE}.mp4`));

async function postWithRetry(
  url: string,
  formData: FormData,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const attempt = async () => {
    const res = await fetch(url, { method: "POST", body: formData });
    if (res.ok) return { ok: true, status: res.status };
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  };

  const first = await attempt();
  if (first.ok || first.status < 500) return first;

  // Retry once on 5xx after 1s
  await new Promise((r) => setTimeout(r, 1000));
  return attempt();
}

function buildCaption(): string {
  const meta = buildMetadata("discord");
  return meta.caption;
}

async function main() {
  const webhookUrl = process.env.DISCORD_DAILY_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("DISCORD_DAILY_WEBHOOK_URL is not set. Skipping Discord upload.");
    process.exit(0);
  }

  if (!existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  const fileSize = statSync(VIDEO_PATH).size;
  if (fileSize > MAX_FILE_SIZE) {
    console.error(`Video too large for Discord webhook (${(fileSize / 1024 / 1024).toFixed(1)}MB > 9MB limit). Skipping.`);
    process.exit(0);
  }

  const caption = buildCaption();

  console.log(`  Discord Daily — ${DATE}`);
  console.log(`  Video: ${basename(VIDEO_PATH)} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`  Caption:\n${caption}\n`);

  if (DRY_RUN) {
    console.log("  DRY RUN — not posting.");
    return;
  }

  const videoBuffer = readFileSync(VIDEO_PATH);
  const blob = new Blob([videoBuffer], { type: "video/mp4" });

  const formData = new FormData();
  formData.append(
    "payload_json",
    JSON.stringify({ content: caption, username: "Gawk Daily" }),
  );
  formData.append("files[0]", blob, basename(VIDEO_PATH));

  console.log("  Uploading...");
  const result = await postWithRetry(webhookUrl, formData);

  if (result.ok) {
    console.log(`  Uploaded: Discord #general (${DATE})`);
  } else {
    console.error(`  Discord upload failed: ${result.status} — ${result.body ?? "<empty>"}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Discord upload error:", e.message || e);
  process.exit(1);
});
