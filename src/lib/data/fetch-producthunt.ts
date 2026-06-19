/**
 * Gawk — Product Hunt source
 *
 * Fetches the day's top launches in Product Hunt's "Artificial Intelligence"
 * topic via the PH API v2 GraphQL endpoint. Keeps gawk AI-focused (the raw PH
 * front page is mostly non-AI products). Auth is a developer token in
 * PRODUCT_HUNT_TOKEN; when unset or the call fails, returns an empty set —
 * graceful degradation, never fabricated cards.
 *
 * PH developer tokens are rate-limited, so this is meant for a periodic
 * (cron / per-derive) read, not high-frequency polling.
 */

const PH_TOKEN = process.env.PRODUCT_HUNT_TOKEN;
const PH_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

export type ProductHuntPost = {
  id: string;
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  createdAt: string;
};

export type ProductHuntResult = {
  ok: boolean;
  posts: ProductHuntPost[];
  generatedAt: string;
};

// Curated, not a raw dump: the week's most-upvoted launches in the AI topic,
// ordered by community upvotes. A rolling 7-day window means it's always
// populated (today's 0-vote just-launched filler is excluded), and the
// vote floor drops the long tail of noise.
const WINDOW_DAYS = 7;
const FETCH_N = 25;
const MIN_VOTES = 20;

function buildQuery(): string {
  const postedAfter = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return `query {
  posts(first: ${FETCH_N}, order: VOTES, postedAfter: "${postedAfter}", topic: "artificial-intelligence") {
    edges { node { id name tagline url votesCount createdAt } }
  }
}`;
}

export async function fetchProductHuntLaunches(): Promise<ProductHuntResult> {
  const generatedAt = new Date().toISOString();
  if (!PH_TOKEN) return { ok: true, posts: [], generatedAt };
  try {
    const r = await fetch(PH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PH_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: buildQuery() }),
    });
    if (!r.ok) return { ok: false, posts: [], generatedAt };
    const json = await r.json();
    const edges = json?.data?.posts?.edges ?? [];
    const posts: ProductHuntPost[] = edges
      .map((e: { node?: ProductHuntPost }) => e.node)
      .filter((n: ProductHuntPost | undefined): n is ProductHuntPost => !!n && !!n.id && !!n.url)
      .filter((n: ProductHuntPost) => (n.votesCount ?? 0) >= MIN_VOTES)
      .sort((a: ProductHuntPost, b: ProductHuntPost) => (b.votesCount ?? 0) - (a.votesCount ?? 0));
    return { ok: true, posts, generatedAt };
  } catch {
    return { ok: false, posts: [], generatedAt };
  }
}
