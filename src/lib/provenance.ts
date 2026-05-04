/**
 * Provenance tooltip helper — formats a single-line "Last verified
 * Xs ago via {url}" string for hover tooltips on metric cards.
 *
 * Trust contract: the recency string and the source URL travel
 * together so hovering any provenance-bearing element answers "is
 * this number fresh, and where can I verify it?" in one read. Pure
 * function; pass `nowMs` in tests for stable output.
 */

export function formatProvenanceTooltip(
  fetchedAtIso: string,
  sourceUrl: string,
  nowMs: number = Date.now(),
): string {
  const ago = formatRelativeAgo(fetchedAtIso, nowMs);
  return `Last verified ${ago} via ${sourceUrl}`;
}

export function formatRelativeAgo(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diffMs = nowMs - t;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
