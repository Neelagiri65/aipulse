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

const QUERY = `query {
  posts(first: 10, order: RANKING, topic: "artificial-intelligence") {
    edges { node { id name tagline url votesCount createdAt } }
  }
}`;

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
      body: JSON.stringify({ query: QUERY }),
    });
    if (!r.ok) return { ok: false, posts: [], generatedAt };
    const json = await r.json();
    const edges = json?.data?.posts?.edges ?? [];
    const posts: ProductHuntPost[] = edges
      .map((e: { node?: ProductHuntPost }) => e.node)
      .filter((n: ProductHuntPost | undefined): n is ProductHuntPost => !!n && !!n.id && !!n.url);
    return { ok: true, posts, generatedAt };
  } catch {
    return { ok: false, posts: [], generatedAt };
  }
}
