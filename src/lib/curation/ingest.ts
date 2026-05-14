import type { CurationEvent } from "./types";

const GAWK_BASE = process.env.GAWK_BASE_URL || "https://gawk.dev";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const AI_KEYWORDS = [
  "artificial intelligence", "machine learning", "large language model",
  "LLM", "GPT", "Claude", "Gemini", "OpenAI", "Anthropic", "DeepSeek",
  "Mistral", "Meta AI", "neural network", "transformer", "diffusion",
  "AI agent", "RAG", "fine-tuning", "RLHF", "inference",
  "ChatGPT", "Copilot", "Cursor", "Windsurf", "coding assistant",
  "llama", "ollama", "stable diffusion", "midjourney", "DALL-E",
  "vector database", "embedding", "tokenizer", "prompt engineering",
  "AI model", "foundation model", "MCP", "model context protocol",
  "agentic", "AI coding", "code generation", "reasoning model",
  "vision model", "multimodal", "text-to-image", "text-to-video",
  "speech-to-text", "TTS", "voice AI", "AI safety", "alignment",
  "benchmark", "MMLU", "HumanEval", "open source AI", "weights",
  "quantization", "GGUF", "ONNX", "vLLM", "tensor", "GPU",
  "CUDA", "compute", "training run", "AI startup", "AI lab",
  "Hugging Face", "Replicate", "Perplexity", "Cohere",
  "AI regulation", "AI policy", "frontier model",
  "NVIDIA", "AMD", "Apple Silicon", "TPU", "NPU", "chip", "silicon",
  "data center", "cloud computing", "edge AI", "on-device",
  "robotics", "autonomous", "self-driving", "computer vision",
  "NLP", "natural language", "deep learning", "reinforcement learning",
  "open source", "developer tool", "API", "SDK",
  "Linux", "kernel", "CVE", "security", "exploit",
  "tech industry", "startup", "venture capital", "acquisition",
];

const NOISE_PATTERNS = [
  /what if .* experienced/i,
  /blockbuster/i,
  /movie to watch/i,
  /transfer to a new mac/i,
  /wallpaper/i,
  /meme/i,
  /nostalgia/i,
  /years ago.*today/i,
];

function isAIRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  if (NOISE_PATTERNS.some(p => p.test(text))) return false;
  return AI_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

function eventId(source: string, key: string): string {
  return `${source}:${key}`;
}

export async function ingestGawkModels(): Promise<CurationEvent[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/v1/models?limit=20`);
    if (!res.ok) return [];
    const data = await res.json() as {
      rows: { rank: number; name: string; shortName: string; previousRank: number | null;
        pricing: { promptPerMTok: number | null; completionPerMTok: number | null } }[];
    };
    return (data.rows ?? [])
      .filter((m) => m.previousRank != null && m.previousRank !== m.rank)
      .map((m) => ({
        id: eventId("gawk-models", m.name),
        source: "gawk-models" as const,
        title: `${m.shortName ?? m.name} moved from rank ${m.previousRank} to ${m.rank}`,
        summary: `Price: $${m.pricing?.promptPerMTok ?? "?"}/M prompt tokens`,
        url: null,
        timestamp: new Date().toISOString(),
        metrics: { rank: m.rank, previousRank: m.previousRank ?? undefined },
        geo: null,
        tags: ["models", "ranking"],
      }));
  } catch { return []; }
}

export async function ingestGawkTools(): Promise<CurationEvent[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/v1/status`);
    if (!res.ok) return [];
    const data = await res.json() as { data: Record<string, { status: string }> };
    return Object.entries(data.data ?? {})
      .filter(([, v]) => v.status !== "operational")
      .map(([name, v]) => ({
        id: eventId("gawk-tools", name),
        source: "gawk-tools" as const,
        title: `${name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} is ${v.status}`,
        summary: `Tool health degraded`,
        url: null,
        timestamp: new Date().toISOString(),
        metrics: {},
        geo: null,
        tags: ["tools", "outage", v.status],
      }));
  } catch { return []; }
}

export async function ingestGawkSDK(): Promise<CurationEvent[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/v1/sdk`);
    if (!res.ok) return [];
    const data = await res.json() as {
      packages: { id: string; label: string; registry: string;
        days: { delta: number | null }[] }[];
    };
    const events: CurationEvent[] = [];
    for (const pkg of data.packages ?? []) {
      const recent = pkg.days.filter(d => d.delta !== null).slice(-3);
      if (recent.length === 0) continue;
      const avg = recent.reduce((s, d) => s + (d.delta ?? 0), 0) / recent.length;
      if (Math.abs(avg) > 5) continue;
      const pct = Math.round(avg * 1000) / 10;
      if (Math.abs(pct) < 10) continue;
      events.push({
        id: eventId("gawk-sdk", pkg.id),
        source: "gawk-sdk" as const,
        title: `${pkg.label} downloads ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on ${pkg.registry}`,
        summary: `3-day average delta: ${pct}%`,
        url: null,
        timestamp: new Date().toISOString(),
        metrics: { deltaPct: pct, downloads: undefined },
        geo: null,
        tags: ["sdk", pkg.registry],
      });
    }
    return events;
  } catch { return []; }
}

export async function ingestGawkWire(): Promise<CurationEvent[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/v1/feed`);
    if (!res.ok) return [];
    const data = await res.json() as {
      cards: { headline: string; detail?: string; type: string; sourceName: string }[];
    };
    return (data.cards ?? []).filter(c => isAIRelevant(c.headline + " " + (c.detail ?? ""))).slice(0, 10).map((c, i) => ({
      id: eventId("gawk-wire", `${i}-${c.headline.slice(0, 30)}`),
      source: "gawk-wire" as const,
      title: c.headline,
      summary: c.detail ?? "",
      url: null,
      timestamp: new Date().toISOString(),
      metrics: {},
      geo: null,
      tags: ["wire", c.type, c.sourceName],
    }));
  } catch { return []; }
}

export async function ingestHN(): Promise<CurationEvent[]> {
  try {
    const res = await fetch(`${GAWK_BASE}/api/hn`);
    if (!res.ok) return [];
    const data = await res.json() as {
      items: { title: string; points: number; numComments?: number; url?: string }[];
    };
    return (data.items ?? [])
      .filter(i => i.points >= 20 && (i.numComments ?? 0) >= 3)
      .filter(i => isAIRelevant(i.title))
      .slice(0, 15)
      .map((i, idx) => ({
        id: eventId("hn", `${idx}-${i.title.slice(0, 30)}`),
        source: "hn" as const,
        title: i.title,
        summary: `${i.points} points, ${i.numComments ?? 0} comments`,
        url: i.url ?? null,
        timestamp: new Date().toISOString(),
        metrics: { points: i.points, comments: i.numComments },
        geo: null,
        tags: ["hn", "discussion"],
      }));
  } catch { return []; }
}

export async function ingestReddit(): Promise<CurationEvent[]> {
  const subs = ["MachineLearning", "LocalLLaMA", "artificial", "ChatGPT"];
  const events: CurationEvent[] = [];
  for (const sub of subs) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=10`, {
        headers: { "User-Agent": "gawk.dev/1.0 curation-bot" },
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        data: { children: { data: { title: string; score: number; num_comments: number;
          url: string; permalink: string; created_utc: number } }[] };
      };
      for (const post of data.data?.children ?? []) {
        const d = post.data;
        if (d.score < 20 || d.num_comments < 3) continue;
        if (!isAIRelevant(d.title)) continue;
        events.push({
          id: eventId("reddit", d.permalink),
          source: "reddit" as const,
          title: decodeHtmlEntities(d.title),
          summary: `r/${sub} · ${d.score} upvotes · ${d.num_comments} comments`,
          url: `https://reddit.com${d.permalink}`,
          timestamp: new Date(d.created_utc * 1000).toISOString(),
          metrics: { points: d.score, comments: d.num_comments },
          geo: null,
          tags: ["reddit", sub],
        });
      }
    } catch { continue; }
  }
  return events;
}

export async function ingestArxiv(): Promise<CurationEvent[]> {
  const query = encodeURIComponent("cat:cs.AI OR cat:cs.CL OR cat:cs.CV");
  try {
    const res = await fetch(
      `http://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=15`
    );
    if (!res.ok) return [];
    const text = await res.text();
    const events: CurationEvent[] = [];
    const entries = text.split("<entry>");
    for (const entry of entries.slice(1)) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\n/g, " ") ?? "";
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().slice(0, 200) ?? "";
      const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ?? "";
      if (!title || !id) continue;
      events.push({
        id: eventId("arxiv", id),
        source: "arxiv" as const,
        title,
        summary,
        url: id,
        timestamp: published,
        metrics: {},
        geo: null,
        tags: ["arxiv", "research"],
      });
    }
    return events;
  } catch { return []; }
}

export async function ingestGDELT(): Promise<CurationEvent[]> {
  const keywords = encodeURIComponent("artificial intelligence OR large language model OR OpenAI OR Anthropic OR DeepSeek");
  try {
    const res = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${keywords}&mode=ArtList&maxrecords=20&timespan=24h&format=json`
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      articles?: { title: string; url: string; seendate: string;
        sourcecountry?: string; language?: string; domain: string }[];
    };
    return (data.articles ?? []).map((a) => ({
      id: eventId("gdelt", a.url),
      source: "gdelt" as const,
      title: a.title,
      summary: `via ${a.domain}`,
      url: a.url,
      timestamp: a.seendate ? new Date(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")).toISOString() : new Date().toISOString(),
      metrics: {},
      geo: a.sourcecountry ? { country: a.sourcecountry } : null,
      tags: ["gdelt", "news", a.language ?? "en"],
    }));
  } catch { return []; }
}

export async function ingestGitHubTrending(): Promise<CurationEvent[]> {
  try {
    const res = await fetch("https://github.com/trending?since=daily&spoken_language_code=en", {
      headers: { "User-Agent": "gawk.dev/1.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const events: CurationEvent[] = [];
    const repoPattern = /<a href="\/([^"]+)"[^>]*class="[^"]*">\s*<span[^>]*>[^<]*<\/span>\s*\/\s*([^<]+)/g;
    const starsPattern = /(\d[\d,]*)\s*stars today/g;
    const repos = [...html.matchAll(/<article class="Box-row"[^>]*>([\s\S]*?)<\/article>/g)];
    for (const [, block] of repos.slice(0, 10)) {
      const allHrefs = [...block.matchAll(/href="\/([^"]+)"/g)].map(m => m[1]);
      const href = allHrefs.find(h => /^[^/]+\/[^/]+$/.test(h) && !h.startsWith("login"));
      if (!href) continue;
      const [owner, name] = href.split("/");
      const desc = decodeHtmlEntities(block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]?.trim().replace(/<[^>]+>/g, "").trim() ?? "");
      const starsToday = block.match(/([\d,]+)\s*stars today/)?.[1]?.replace(/,/g, "") ?? "0";
      const isAI = AI_KEYWORDS.some(k => (name + " " + desc).toLowerCase().includes(k.toLowerCase()));
      if (!isAI && parseInt(starsToday) < 50) continue;
      events.push({
        id: eventId("github-trending", href),
        source: "github-trending" as const,
        title: `${owner}/${name} trending on GitHub (${starsToday} stars today)`,
        summary: desc.slice(0, 200),
        url: `https://github.com/${href}`,
        timestamp: new Date().toISOString(),
        metrics: { stars: parseInt(starsToday) },
        geo: null,
        tags: ["github", "trending"],
      });
    }
    return events;
  } catch { return []; }
}

export async function ingestAll(): Promise<CurationEvent[]> {
  const results = await Promise.allSettled([
    ingestGawkModels(),
    ingestGawkTools(),
    ingestGawkSDK(),
    ingestGawkWire(),
    ingestHN(),
    ingestReddit(),
    ingestArxiv(),
    ingestGDELT(),
    ingestGitHubTrending(),
  ]);

  const events: CurationEvent[] = [];
  const sourceNames = [
    "gawk-models", "gawk-tools", "gawk-sdk", "gawk-wire",
    "hn", "reddit", "arxiv", "gdelt", "github-trending",
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      console.log(`  [${sourceNames[i]}] ${r.value.length} events`);
      events.push(...r.value);
    } else {
      console.warn(`  [${sourceNames[i]}] failed: ${r.reason}`);
    }
  }

  return events;
}
