/**
 * Upload a Gawk Daily vertical video to Instagram Reels via Graph API.
 *
 * Prerequisites:
 *   1. Instagram Business/Creator account linked to a Facebook Page
 *   2. Meta App with instagram_content_publish permission (approved via App Review)
 *   3. Long-lived access token stored at ~/.secrets/meta-token.json
 *   4. Video must be at a public URL (uploaded to Vercel Blob / R2 / S3 first)
 *
 * Usage:
 *   npx tsx scripts/video/upload-instagram.ts
 *   npx tsx scripts/video/upload-instagram.ts --file out/custom-vertical.mp4
 *   npx tsx scripts/video/upload-instagram.ts --video-url https://example.com/video.mp4
 */

import { readFileSync, writeFileSync, existsSync, createReadStream, statSync } from "fs";
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
const DEFAULT_VIDEO = resolve(ROOT, `out/gawk-daily-${DATE}-vertical.mp4`);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const VIDEO_PATH = getArg("--file", DEFAULT_VIDEO);
const VIDEO_URL_OVERRIDE = getArg("--video-url", "");

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
    console.error("Create it with: { ig_user_id, page_id, app_id, app_secret }");
    process.exit(1);
  }
  return JSON.parse(readFileSync(META_CONFIG_PATH, "utf-8"));
}

function loadToken(): MetaToken {
  if (!existsSync(META_TOKEN_PATH)) {
    console.error(`Missing Meta token: ${META_TOKEN_PATH}`);
    console.error("Generate a long-lived token via the Meta Graph API Explorer:");
    console.error("  1. Get short-lived token from Graph API Explorer");
    console.error("  2. Exchange for long-lived: GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app_id}&client_secret={app_secret}&fb_exchange_token={short_token}");
    process.exit(1);
  }
  return JSON.parse(readFileSync(META_TOKEN_PATH, "utf-8"));
}

async function refreshTokenIfNeeded(config: MetaConfig, token: MetaToken): Promise<string> {
  if (token.expires_at && token.expires_at < Date.now()) {
    console.log("Token expired, refreshing...");
    const url = `${BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.app_id}&client_secret=${config.app_secret}&fb_exchange_token=${token.access_token}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token refresh failed: ${err}`);
    }
    const data = await res.json();
    const newToken: MetaToken = {
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      expires_at: Date.now() + (data.expires_in || 5184000) * 1000,
    };
    writeFileSync(META_TOKEN_PATH, JSON.stringify(newToken, null, 2));
    console.log("Token refreshed and saved.");
    return newToken.access_token;
  }
  return token.access_token;
}

async function uploadVideoToHosting(videoPath: string): Promise<string> {
  // If GAWK_VIDEO_HOST_URL is set, upload to that endpoint
  // Otherwise check for Vercel Blob token
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    console.log("Uploading to Vercel Blob...");
    // @ts-expect-error deploy-only dependency, not available locally
    const { put } = await import("@vercel/blob");
    const filename = `gawk-daily-${DATE}-vertical.mp4`;
    const stream = createReadStream(videoPath);
    const blob = await put(filename, stream, {
      access: "public",
      token: blobToken,
    });
    console.log(`Uploaded: ${blob.url}`);
    return blob.url;
  }

  // Fallback: serve locally via a temporary HTTP server (for testing only)
  console.error("No BLOB_READ_WRITE_TOKEN set.");
  console.error("Instagram requires a public video URL. Options:");
  console.error("  1. Set BLOB_READ_WRITE_TOKEN for Vercel Blob");
  console.error("  2. Pass --video-url with a public URL");
  console.error("  3. Upload manually and pass the URL");
  process.exit(1);
}

async function waitForProcessing(containerId: string, accessToken: string): Promise<void> {
  const maxAttempts = 30;
  const intervalMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BASE_URL}/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const data = await res.json();
    const status = data.status_code;

    if (status === "FINISHED") {
      console.log("Processing complete.");
      return;
    }
    if (status === "ERROR") {
      throw new Error(`Instagram processing failed: ${JSON.stringify(data)}`);
    }

    console.log(`Processing... (${status || "IN_PROGRESS"}) [${i + 1}/${maxAttempts}]`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Instagram processing timed out after 2.5 minutes");
}

async function upload() {
  if (!existsSync(VIDEO_PATH) && !VIDEO_URL_OVERRIDE) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    console.error("Run: npx tsx scripts/video/composite.ts --format vertical --video-format instagram");
    process.exit(1);
  }

  const config = loadConfig();
  const tokenData = loadToken();
  const accessToken = await refreshTokenIfNeeded(config, tokenData);
  const { caption } = buildMetadata("instagram");

  // Get public video URL
  let videoUrl = VIDEO_URL_OVERRIDE;
  if (!videoUrl) {
    videoUrl = await uploadVideoToHosting(VIDEO_PATH);
  }

  console.log(`\nUploading Instagram Reel...`);
  console.log(`Video URL: ${videoUrl}`);
  console.log(`Caption: ${caption.slice(0, 80)}...\n`);

  // Step 1: Create media container
  const containerRes = await fetch(`${BASE_URL}/${config.ig_user_id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`Container creation failed: ${err}`);
  }

  const { id: containerId } = await containerRes.json();
  console.log(`Container created: ${containerId}`);

  // Step 2: Wait for processing
  await waitForProcessing(containerId, accessToken);

  // Step 3: Publish
  const publishRes = await fetch(`${BASE_URL}/${config.ig_user_id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Publish failed: ${err}`);
  }

  const { id: mediaId } = await publishRes.json();
  const permalink = `https://www.instagram.com/reel/${mediaId}/`;
  console.log(`\nPublished: ${permalink}`);
  console.log(`Media ID: ${mediaId}`);

  // Save upload record
  const uploadLog = resolve(ROOT, "data/upload-log.json");
  const log = existsSync(uploadLog) ? JSON.parse(readFileSync(uploadLog, "utf-8")) : [];
  log.push({
    date: DATE,
    platform: "instagram",
    mediaId,
    permalink,
    uploadedAt: new Date().toISOString(),
  });
  writeFileSync(uploadLog, JSON.stringify(log, null, 2));

  return permalink;
}

upload().catch((e) => {
  console.error("Instagram upload failed:", e.message || e);
  process.exit(1);
});
