/**
 * Delta-direction detection for digest presentation (Direction A,
 * research-digest-redesign-2026-07-05).
 *
 * Pure classifier over the EXISTING verbatim copy — it never rewrites a
 * number, it only decides which semantic colour a line earns:
 *   up      — a gain   ("+2.3M 24h downloads", "climbed +44 to #6")
 *   down    — a loss   ("−22.1k day-over-day", "-16%", "slipped -38")
 *   neutral — no signed magnitude found (holds, ties, prose)
 *
 * Direction is styling only. The trust contract is untouched: the copy the
 * reader sees is byte-identical to what the composer produced.
 */

export type DeltaDirection = "up" | "down" | "neutral";

/** A signed magnitude: +/‐/− (ascii hyphen, unicode minus) or an arrow,
 *  immediately followed by a digit — anchored to a token boundary so
 *  hyphenated words ("day-over-day") and slugs never match. */
const UP_RE = /(^|[\s(])[+▲]\s?\d/;
const DOWN_RE = /(^|[\s(])[-−▼]\s?\d/;

export function deltaDirection(
  ...texts: Array<string | undefined>
): DeltaDirection {
  for (const t of texts) {
    if (!t) continue;
    // First signed token wins; check DOWN before UP only when it appears
    // earlier in the string, so mixed lines ("+44 to #6, was -3") follow
    // the leading signal.
    const up = t.search(UP_RE);
    const down = t.search(DOWN_RE);
    if (up === -1 && down === -1) continue;
    if (up === -1) return "down";
    if (down === -1) return "up";
    return up <= down ? "up" : "down";
  }
  return "neutral";
}
