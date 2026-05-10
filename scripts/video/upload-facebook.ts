/**
 * Upload a Gawk Daily video to a Facebook Page via Graph API.
 *
 * Supports both landscape (YouTube) and vertical (Reels) formats.
 * Uses resumable upload for reliability.
 *
 * Prerequisites:
 *   1. Facebook Page for Gawk
 *   2. Meta App with pages_manage_posts permission (approved via App Review)
 *   3. Page access token stored at ~/.secrets/meta-token.json
 *   4. Meta config at ~/.secrets/meta-config.json with page_id
 *
 * Usage:
 *   npx tsx scripts/video/upload-facebook.ts
 *   npx tsx scripts/video/upload-facebook.ts --file out/custom.mp4
 *   npx tsx scripts/video/upload-facebook.ts --as-reel
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import { buildMetadata } from "./video-metadata";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const META_CONFIG_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/meta-config.json"
);
const META_TOKEN_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/meta-token.json"
);

const DATE = new Date().toISOString().slice(0, 10);
const AS_REEL = args.includes("--as-reel");
const DEFAULT_VIDEO = AS_REEL
  ? resolve(ROOT, `out/gawk-daily-${DATE}-vertical.mp4`)
  : resolve(ROOT, `out/gawk-daily-${DATE}.mp4`);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const VIDEO_PATH = getArg("--file", DEFAULT_VIDEO);

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

type MetaConfig = {
  ig_user_id: string;
  page_id: string;
  app_id: string;
  app_secret: string;
};

type MetaToken = {
  access_token: string;
  token_type: string;
  expires_at?: number;
};

function loadConfig(): MetaConfig {
  if (!existsSync(META_CONFIG_PATH)) {
    console.error(`Missing Meta config: ${META_CONFIG_PATH}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(META_CONFIG_PATH, "utf-8"));
}

function loadToken(): MetaToken {
  if (!existsSync(META_TOKEN_PATH)) {
    console.error(`Missing Meta token: ${META_TOKEN_PATH}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(META_TOKEN_PATH, "utf-8"));
}

async function getPageAccessToken(config: MetaConfig, userToken: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/${config.page_id}?fields=access_token&access_token=${userToken}`
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get page token: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function uploadResumable(pageId: string, pageToken: string, videoPath: string, title: string, description: string): Promise<string> {
  const fileSize = statSync(videoPath).size;

  // Step 1: Start resumable upload session
  const startRes = await fetch(`${BASE_URL}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_phase: "start",
      file_size: fileSize,
      access_token: pageToken,
    }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Upload start failed: ${err}`);
  }

  const { upload_session_id, video_id } = await startRes.json();
  console.log(`Upload session started: ${upload_session_id}`);

  // Step 2: Transfer the file
  const videoData = readFileSync(videoPath);
  const formData = new FormData();
  formData.append("upload_phase", "transfer");
  formData.append("upload_session_id", upload_session_id);
  formData.append("start_offset", "0");
  formData.append("access_token", pageToken);
  formData.append("video_file_chunk", new Blob([videoData]), "video.mp4");

  const transferRes = await fetch(`${BASE_URL}/${pageId}/videos`, {
    method: "POST",
    body: formData,
  });

  if (!transferRes.ok) {
    const err = await transferRes.text();
    throw new Error(`Upload transfer failed: ${err}`);
  }

  console.log("Video data transferred.");

  // Step 3: Finish upload with metadata
  const finishRes = await fetch(`${BASE_URL}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_phase: "finish",
      upload_session_id,
      title,
      description,
      access_token: pageToken,
    }),
  });

  if (!finishRes.ok) {
    const err = await finishRes.text();
    throw new Error(`Upload finish failed: ${err}`);
  }

  const finishData = await finishRes.json();
  return finishData.id || video_id;
}

async function uploadAsReel(pageId: string, pageToken: string, videoPath: string, description: string): Promise<string> {
  const videoData = readFileSync(videoPath);
  const formData = new FormData();
  formData.append("access_token", pageToken);
  formData.append("description", description);
  formData.append("source", new Blob([videoData]), "reel.mp4");

  const res = await fetch(`${BASE_URL}/${pageId}/video_reels`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reel upload failed: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function upload() {
  if (!existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  const config = loadConfig();
  const tokenData = loadToken();
  const pageToken = await getPageAccessToken(config, tokenData.access_token);
  const { title, caption } = buildMetadata("facebook");

  console.log(`Uploading to Facebook${AS_REEL ? " (as Reel)" : ""}...`);
  console.log(`Video: ${VIDEO_PATH}`);
  console.log(`Title: ${title}`);
  console.log(`Size: ${(statSync(VIDEO_PATH).size / 1024 / 1024).toFixed(1)} MB\n`);

  let videoId: string;
  if (AS_REEL) {
    videoId = await uploadAsReel(config.page_id, pageToken, VIDEO_PATH, caption);
  } else {
    videoId = await uploadResumable(config.page_id, pageToken, VIDEO_PATH, title, caption);
  }

  const url = `https://www.facebook.com/${config.page_id}/videos/${videoId}`;
  console.log(`\nUploaded: ${url}`);
  console.log(`Video ID: ${videoId}`);

  // Save upload record
  const uploadLog = resolve(ROOT, "data/upload-log.json");
  const log = existsSync(uploadLog) ? JSON.parse(readFileSync(uploadLog, "utf-8")) : [];
  log.push({
    date: DATE,
    platform: AS_REEL ? "facebook-reel" : "facebook",
    videoId,
    url,
    title,
    uploadedAt: new Date().toISOString(),
  });
  writeFileSync(uploadLog, JSON.stringify(log, null, 2));

  return url;
}

upload().catch((e) => {
  console.error("Facebook upload failed:", e.message || e);
  process.exit(1);
});
