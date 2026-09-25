/**
 * gawk.dev — what the leading lab's active repositories are (registry: github-repo-meta)
 *
 * A LAB_HIGHLIGHT card is about GitHub activity across a lab's tracked repositories. Its summary
 * describes that content: each active repository's own `description`, as its owner wrote it on
 * GitHub, most events first. Read only for the one lab the card is about.
 */

import { GITHUB_REPO_META } from "@/lib/data-sources";
import type { LabActivity } from "@/lib/data/fetch-labs";

const FETCH_TIMEOUT_MS = 5_000;
const REVALIDATE_SECONDS = 24 * 60 * 60;
/** Repositories described per card; the card cuts the text at a sentence boundary anyway. */
export const LAB_REPOS_DESCRIBED = 3;

/** One repository's own GitHub description, or undefined. Never throws. */
export async function fetchRepoDescription(
  owner: string,
  repo: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const url = GITHUB_REPO_META.apiUrl!.replace("{owner}", owner).replace("{repo}", repo);
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: REVALIDATE_SECONDS, tags: [GITHUB_REPO_META.id] },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    } as RequestInit);
    if (!res.ok) return undefined;
    const body = (await res.json()) as { description?: unknown };
    const text = typeof body.description === "string" ? body.description.trim() : "";
    return text || undefined;
  } catch {
    return undefined;
  }
}

/**
 * "owner/repo — description." for the lab's active repos, most events first, joined into one
 * paragraph. Punctuation is added only where a description has no final stop, so the card can
 * cut it at a sentence boundary; every word is the owner's or the repository's name.
 */
export function describeRepos(entries: Array<{ owner: string; repo: string; description?: string }>): string | undefined {
  const parts = entries
    .filter((e) => e.description)
    .map((e) => {
      const d = e.description!.trim();
      return `${e.owner}/${e.repo} — ${/[.!?…]$/.test(d) ? d : `${d}.`}`;
    });
  return parts.length ? parts.join(" ") : undefined;
}

/** The lab's active repositories described, for the one lab a LAB_HIGHLIGHT card is about. */
export async function describeLabRepos(
  lab: LabActivity,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const active = [...lab.repos]
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, LAB_REPOS_DESCRIBED);
  const described = await Promise.all(
    active.map(async (r) => ({ owner: r.owner, repo: r.repo, description: await fetchRepoDescription(r.owner, r.repo, token, fetchImpl) })),
  );
  return describeRepos(described);
}
