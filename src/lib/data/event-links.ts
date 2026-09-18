/**
 * Platform-aware links for a globe/wire event.
 *
 * Repo names carry their platform in the value: GitHub events store a
 * bare `owner/repo`, GitLab events store a `gitlab.com/{path}` (namespaced
 * at ingest, `gitlab-events.ts`). A single `https://github.com/{repo}`
 * template — the old convention at four call sites — sends every GitLab
 * dot to a 404. These helpers read the platform from the name and build
 * the correct destination, plus a clean display label.
 *
 * Actor logins are namespaced `gl:{username}` for GitLab; the profile
 * URL and display strip the prefix.
 *
 * WHICH VALUES BELONG HERE: any repo name that came from the EVENTS
 * payload, because that stream carries both platforms in one field. A
 * curated registry value typed `githubRepo` (`agents-registry.ts`) is
 * GitHub by construction and does not need the rule — routing it through
 * here would only add a null case that cannot happen. The distinction is
 * the value's origin, not the file it is rendered in.
 */

/** Canonical repo/project URL for an event. Null when the name is absent. */
export function repoHref(repo: string | undefined | null): string | undefined {
  if (!repo) return undefined;
  if (repo.startsWith("gitlab.com/")) return `https://${repo}`;
  return `https://github.com/${repo}`;
}

/** Display label for the repo: GitLab keeps the `gitlab.com/` prefix so a
 *  reader can tell the platform at a glance; GitHub shows the bare name. */
export function repoLabel(repo: string | undefined | null): string {
  return repo ?? "(unknown repo)";
}

/** Actor profile URL. GitLab logins are `gl:{username}`. */
export function actorHref(
  actor: string | undefined | null,
): string | undefined {
  if (!actor) return undefined;
  if (actor.startsWith("gl:")) {
    return `https://gitlab.com/${actor.slice(3)}`;
  }
  return `https://github.com/${actor}`;
}

/** Actor display: strip the `gl:` namespace so the UI shows the username. */
export function actorLabel(actor: string | undefined | null): string {
  if (!actor) return "(unknown)";
  return actor.startsWith("gl:") ? actor.slice(3) : actor;
}
