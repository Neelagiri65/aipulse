/**
 * Upload a Gawk Daily vertical video to TikTok via Content Posting API.
 *
 * Prerequisites:
 *   1. TikTok developer app with Content Posting API enabled
 *   2. OAuth token stored at ~/.secrets/tiktok-token.json
 *   3. Client config at ~/.secrets/tiktok-config.json
 *
 * Note: Unaudited apps post as private by default. Apply for audit at
 * developers.tiktok.com to enable public posting.
 *
 * Usage:
 *   npx tsx scripts/video/upload-tiktok.ts
 *   npx tsx scripts/video/upload-tiktok.ts --file out/custom-vertical.mp4
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import { createServer } from "http";
import { buildMetadata } from "./video-metadata";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const TIKTOK_CONFIG_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/tiktok-config.json"
);
const TIKTOK_TOKEN_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/tiktok-token.json"
);

const DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_VIDEO = resolve(ROOT, `out/gawk-daily-${DATE}-vertical.mp4`);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const VIDEO_PATH = getArg("--file", DEFAULT_VIDEO);

const BASE_URL = "https://open.tiktokapis.com/v2";

type TikTokConfig = {
  client_key: string;
  client_secret: string;
};

type TikTokToken = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  open_id: string;
};

function loadConfig(): TikTokConfig {
  if (!existsSync(TIKTOK_CONFIG_PATH)) {
    console.error(`Missing TikTok config: ${TIKTOK_CONFIG_PATH}`);
    console.error("Create it with: { client_key, client_secret }");
    process.exit(1);
  }
  return JSON.parse(readFileSync(TIKTOK_CONFIG_PATH, "utf-8"));
}

function loadToken(): TikTokToken | null {
  if (!existsSync(TIKTOK_TOKEN_PATH)) return null;
  return JSON.parse(readFileSync(TIKTOK_TOKEN_PATH, "utf-8"));
}

function saveToken(token: TikTokToken): void {
  writeFileSync(TIKTOK_TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function authenticate(config: TikTokConfig): Promise<TikTokToken> {
  const existing = loadToken();

  if (existing) {
    // Refresh if expired
    if (existing.expires_at && existing.expires_at < Date.now()) {
      console.log("Refreshing TikTok token...");
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: config.client_key,
          client_secret: config.client_secret,
          grant_type: "refresh_token",
          refresh_token: existing.refresh_token,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Token refresh failed: ${err}`);
      }

      const data = await res.json();
      const token: TikTokToken = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 86400) * 1000,
        open_id: data.open_id || existing.open_id,
      };
      saveToken(token);
      return token;
    }
    return existing;
  }

  // First-time OAuth flow
  const redirectUri = "http://localhost:8086";
  const scopes = "video.publish,video.upload";
  const csrfState = Math.random().toString(36).slice(2);

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${config.client_key}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfState}`;

  console.log("\nOpening browser for TikTok authorization...\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "", redirectUri);
      const authCode = url.searchParams.get("code");
      if (authCode) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authorized. You can close this tab.</h2><script>window.close()</script>");
        server.close();
        resolve(authCode);
      } else {
        res.writeHead(400);
        res.end("Missing code parameter");
      }
    });
    server.listen(8086, () => {
      import("open").then((m) => m.default(authUrl)).catch(() => {
        console.log(`Open this URL manually:\n${authUrl}\n`);
      });
    });
    server.on("error", reject);
    setTimeout(() => { server.close(); reject(new Error("Auth timeout (120s)")); }, 120000);
  });

  // Exchange code for token
  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: config.client_key,
      client_secret: config.client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await tokenRes.json();
  const token: TikTokToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 86400) * 1000,
    open_id: data.open_id,
  };
  saveToken(token);
  console.log("TikTok token saved.\n");
  return token;
}

async function waitForPublish(publishId: string, accessToken: string): Promise<string> {
  const maxAttempts = 30;
  const intervalMs = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${BASE_URL}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await res.json();
    const status = data?.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      return data.data.publicaly_available_post_id?.[0] || publishId;
    }
    if (status === "FAILED") {
      throw new Error(`TikTok publish failed: ${JSON.stringify(data)}`);
    }

    console.log(`Processing... (${status || "PROCESSING"}) [${i + 1}/${maxAttempts}]`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("TikTok processing timed out");
}

async function upload() {
  if (!existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  const fileSize = statSync(VIDEO_PATH).size;
  const config = loadConfig();
  const token = await authenticate(config);
  const { title, caption } = buildMetadata("tiktok");

  console.log(`Uploading to TikTok...`);
  console.log(`Video: ${VIDEO_PATH}`);
  console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Caption: ${caption.slice(0, 80)}...\n`);

  // Step 1: Initialize upload — direct post with file upload
  const initRes = await fetch(`${BASE_URL}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: title.slice(0, 150),
        description: caption.slice(0, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Upload init failed: ${err}`);
  }

  const initData = await initRes.json();
  const publishId = initData.data?.publish_id;
  const uploadUrl = initData.data?.upload_url;

  if (!uploadUrl) {
    throw new Error(`No upload URL returned: ${JSON.stringify(initData)}`);
  }

  console.log(`Upload URL received. Uploading video data...`);

  // Step 2: Upload the video file
  const videoData = readFileSync(VIDEO_PATH);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
      "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
    },
    body: videoData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Video upload failed: ${err}`);
  }

  console.log("Video uploaded. Waiting for processing...");

  // Step 3: Poll for completion
  const postId = await waitForPublish(publishId, token.access_token);
  const url = `https://www.tiktok.com/@gawkdev/video/${postId}`;

  console.log(`\nPublished: ${url}`);
  console.log(`Post ID: ${postId}`);

  // Save upload record
  const uploadLog = resolve(ROOT, "data/upload-log.json");
  const log = existsSync(uploadLog) ? JSON.parse(readFileSync(uploadLog, "utf-8")) : [];
  log.push({
    date: DATE,
    platform: "tiktok",
    postId,
    url,
    title,
    uploadedAt: new Date().toISOString(),
  });
  writeFileSync(uploadLog, JSON.stringify(log, null, 2));

  return url;
}

upload().catch((e) => {
  console.error("TikTok upload failed:", e.message || e);
  process.exit(1);
});
