/**
 * Pure helper for rendering GitHub event types as short uppercase pills.
 * Lives outside event-detail.tsx so server components (e.g. /lab/[slug])
 * can import it without dragging the "use client" boundary along.
 */

export function shortEventType(type: string): string {
  switch (type) {
    case "PushEvent":
      return "PUSH";
    case "PullRequestEvent":
      return "PR";
    case "PullRequestReviewEvent":
      return "PR REVIEW";
    case "IssuesEvent":
      return "ISSUE";
    case "IssueCommentEvent":
      return "ISSUE CMT";
    case "ReleaseEvent":
      return "RELEASE";
    case "CreateEvent":
      return "CREATE";
    case "ForkEvent":
      return "FORK";
    case "WatchEvent":
      return "STAR";
    default:
      return type.replace(/Event$/, "").toUpperCase();
  }
}
