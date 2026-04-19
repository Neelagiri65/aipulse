/**
 * HuggingFace Models fetch — top text-generation models by downloads.
 *
 * Source: https://huggingface.co/api/models
 *   - `sort=downloads&direction=-1` → highest 30d downloads first
 *   - `filter=text-generation` → LLM-shaped pipelines only (we skip
 *     speech/vision/classifier models; the Models tab is about the
 *     generative-language ecosystem, not the whole HF catalogue).
 *   - `limit=20` → top 20 by downloads. The API also returns `likes`
 *     and `lastModified` which we surface directly.
 *   - No auth required for public listings.
 *
 * Trust contract: we echo the fields HuggingFace returns verbatim. No
 * re-ranking, no editorial filter. If the API adds a field, the UI
 * doesn't synthesise it; if a field is missing, the row omits it.
 *
 * Caching: 15 min via Next.js Data Cache. HF download counts update
 * hourly; the UI polls every 10 min so the worst-case staleness is
 * ~25 min — acceptable for a leaderboard that moves on weeks not
 * seconds. Tag-based invalidation is a no-op for now but keeps the
 * door open if we ever want to push fresh data server-side.
 */

export type HuggingFaceModel = {
  /** "org/name" — same shape as GitHub full_name. Always present. */
  id: string;
  /** "org" — derived server-side from id so the client doesn't have to split. */
  author: string;
  /** "name" — second half of id. */
  name: string;
  /** 30-day downloads per HuggingFace's `downloads` field. */
  downloads: number;
  /** Heart count on HF. Optional — older models don't always carry it. */
  likes: number;
  /** ISO string of the latest commit on the model repo. */
  lastModified: string;
  /** HuggingFace `pipeline_tag` — "text-generation" for this pull. */
  pipelineTag: string | null;
  /** Derived hub URL so the UI can link out without string-building. */
  hubUrl: string;
};

export type ModelsResult = {
  ok: boolean;
  models: HuggingFaceModel[];
  generatedAt: string;
  /** When true, we served stale/fallback data because the upstream call failed. */
  stale?: boolean;
  error?: string;
};

const HF_MODELS_URL =
  "https://huggingface.co/api/models?sort=downloads&direction=-1&filter=text-generation&limit=20";

type RawHfModel = {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipeline_tag?: string | null;
};

export async function fetchTopModels(): Promise<ModelsResult> {
  const generatedAt = new Date().toISOString();
  try {
    const res = await fetch(HF_MODELS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 15, tags: ["hf-models"] },
    });
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        generatedAt,
        stale: true,
        error: `hf /api/models returned ${res.status}`,
      };
    }
    const body = (await res.json()) as RawHfModel[];
    const models = body
      .filter((m): m is Required<Pick<RawHfModel, "id">> & RawHfModel =>
        typeof m.id === "string" && m.id.length > 0,
      )
      .slice(0, 20)
      .map(normalise);
    return { ok: true, models, generatedAt };
  } catch (err) {
    return {
      ok: false,
      models: [],
      generatedAt,
      stale: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalise(raw: RawHfModel): HuggingFaceModel {
  const id = raw.id!;
  // HF ids look like "mistralai/Mistral-7B-Instruct-v0.3" for scoped models
  // and "gpt2" for legacy unscoped ones. `author` is authoritative when
  // present; fall back to the id prefix otherwise.
  const slash = id.indexOf("/");
  const author =
    typeof raw.author === "string" && raw.author.length > 0
      ? raw.author
      : slash > 0
        ? id.slice(0, slash)
        : id;
  const name = slash > 0 ? id.slice(slash + 1) : id;
  return {
    id,
    author,
    name,
    downloads: typeof raw.downloads === "number" ? raw.downloads : 0,
    likes: typeof raw.likes === "number" ? raw.likes : 0,
    lastModified: typeof raw.lastModified === "string" ? raw.lastModified : "",
    pipelineTag: raw.pipeline_tag ?? null,
    hubUrl: `https://huggingface.co/${id}`,
  };
}
