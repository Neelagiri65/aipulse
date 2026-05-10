/**
 * Upload a Gawk Daily video to YouTube via the Data API v3.
 *
 * First run opens a browser for OAuth consent (gawkdev@gmail.com).
 * Subsequent runs reuse the saved refresh token.
 *
 * Usage:
 *   npx tsx scripts/video/upload-youtube.ts
 *   npx tsx scripts/video/upload-youtube.ts --file out/custom.mp4
 *   npx tsx scripts/video/upload-youtube.ts --visibility unlisted
 */

import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync, createReadStream } from "fs";
import { resolve } from "path";
import { createServer } from "http";

const ROOT = process.cwd();
const args = process.argv.slice(2);

const CLIENT_SECRET_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/youtube-client-secret.json"
);
const TOKEN_PATH = resolve(
  process.env.HOME || "~",
  ".secrets/youtube-token.json"
);

const DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_VIDEO = resolve(ROOT, `out/gawk-daily-${DATE}.mp4`);

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const VIDEO_PATH = getArg("--file", DEFAULT_VIDEO);
const VISIBILITY = getArg("--visibility", "public") as "public" | "unlisted" | "private";

// Build metadata from manifest + narration
function buildMetadata(): { title: string; description: string; tags: string[] } {
  const manifestPath = resolve(ROOT, "data/video-manifest-youtube.json");
  const scriptPath = resolve(ROOT, "data/script-locked.json");

  let stories: { id: string; headline: string; startSec: number }[] = [];
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    stories = manifest.filter(
      (e: any) => e.segment !== "map" && e.segment !== "wipe" && e.segment !== "outro" && e.id !== "intro"
    );
  }

  const dateFormatted = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lead = stories[0]?.headline || "AI Infrastructure Daily Brief";
  const title = `${lead.slice(0, 60)} | Gawk Daily — ${dateFormatted}`;

  const timestamps = stories
    .map((s) => {
      const mm = String(Math.floor(s.startSec / 60)).padStart(2, "0");
      const ss = String(Math.floor(s.startSec % 60)).padStart(2, "0");
      return `${mm}:${ss} ${s.headline}`;
    })
    .join("\n");

  const description = `${stories.length} stories. ${Math.round(stories.reduce((a, s: any) => a + (s.holdSec || 7), 0))} seconds. Every number verified.

${timestamps}

Sources: OpenRouter /rankings, OpenRouter top-weekly via gawk.dev API

Every number on screen traces to a public source.
Data dashboard: https://gawk.dev
Subscribe for daily briefs: https://gawk.dev/subscribe

#AI #OpenRouter #AITools #DeveloperTools`;

  const tags = [
    "AI",
    "OpenRouter",
    "AI tools",
    "developer tools",
    "AI infrastructure",
    "gawk",
    "daily brief",
    "machine learning",
  ];

  return { title, description, tags };
}

async function authenticate(): Promise<ReturnType<typeof google.youtube>> {
  if (!existsSync(CLIENT_SECRET_PATH)) {
    console.error(`Missing OAuth credentials: ${CLIENT_SECRET_PATH}`);
    console.error("Download from Google Cloud Console → Credentials → OAuth 2.0 Client ID");
    process.exit(1);
  }

  const credentials = JSON.parse(readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    "http://localhost:8085"
  );

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    oauth2Client.setCredentials(token);

    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log("Refreshing expired token...");
      const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(refreshed);
      writeFileSync(TOKEN_PATH, JSON.stringify(refreshed, null, 2));
    }
  } else {
    // First-time auth: open browser
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/youtube.upload"],
    });

    console.log("\nOpening browser for YouTube authorization...");
    console.log("Sign in with gawkdev@gmail.com\n");

    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const url = new URL(req.url || "", "http://localhost:8085");
        const code = url.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h2>Authorized. You can close this tab.</h2><script>window.close()</script>");
          server.close();
          resolve(code);
        } else {
          res.writeHead(400);
          res.end("Missing code parameter");
        }
      });
      server.listen(8085, () => {
        import("open").then((m) => m.default(authUrl)).catch(() => {
          console.log(`Open this URL manually:\n${authUrl}\n`);
        });
      });
      server.on("error", reject);
      setTimeout(() => { server.close(); reject(new Error("Auth timeout (60s)")); }, 60000);
    });

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("Token saved.\n");
  }

  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function upload() {
  if (!existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  const { title, description, tags } = buildMetadata();
  const youtube = await authenticate();

  console.log(`Uploading: ${VIDEO_PATH}`);
  console.log(`Title: ${title}`);
  console.log(`Visibility: ${VISIBILITY}\n`);

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: "28", // Science & Technology
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: VISIBILITY,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: createReadStream(VIDEO_PATH),
    },
  });

  const videoId = res.data.id;
  const url = `https://youtu.be/${videoId}`;

  console.log(`\nUploaded: ${url}`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Status: ${res.data.status?.uploadStatus}`);

  // Save upload record
  const uploadLog = resolve(ROOT, "data/upload-log.json");
  const log = existsSync(uploadLog)
    ? JSON.parse(readFileSync(uploadLog, "utf-8"))
    : [];
  log.push({
    date: DATE,
    videoId,
    url,
    title,
    visibility: VISIBILITY,
    uploadedAt: new Date().toISOString(),
  });
  writeFileSync(uploadLog, JSON.stringify(log, null, 2));

  return url;
}

upload().catch((e) => {
  console.error("Upload failed:", e.message || e);
  process.exit(1);
});
