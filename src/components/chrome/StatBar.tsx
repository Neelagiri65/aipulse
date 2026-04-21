"use client";

/**
 * Master-detail summary row rendered in the `Win.statBar` slot.
 * One line, 10px monospace, segments separated by middle-dot dividers.
 *
 * Pure presentational — data derivation lives at the call site (Dashboard)
 * so the typed payloads stay close to the components that read them.
 *
 * Empty state: when `segments` is empty or every segment is null/undefined,
 * renders "—" so a panel never shows fabricated counts during initial load.
 *
 * See `docs/design-spec-v2.md` → FIX-13 for the per-panel formulae.
 */
export type StatSegment = {
  /** Short label (e.g. "OPERATIONAL", "CN", "cs.AI"). Rendered uppercase. */
  label: string;
  /** Display value — number or short string (e.g. "1500", "2026-04-17"). */
  value: number | string;
  /**
   * Optional semantic tone. Drives the value colour. Default = neutral
   * (--ap-fg). Use sparingly: the stat bar sits inside an accented frame,
   * so most segments should stay neutral and let the panel accent breathe.
   */
  tone?: "op" | "degrade" | "outage" | "info" | "neutral";
};

export type StatBarProps = {
  segments: Array<StatSegment | null | undefined>;
  /**
   * Optional trailing free-form note (e.g. "published 2026-04-17").
   * Rendered after segments at fg-dim with no leading divider.
   */
  trailing?: string;
};

const TONE_COLOR: Record<NonNullable<StatSegment["tone"]>, string> = {
  op: "var(--sev-op)",
  degrade: "var(--sev-degrade)",
  outage: "var(--sev-outage)",
  info: "var(--ap-accent)",
  neutral: "var(--ap-fg)",
};

export function StatBar({ segments, trailing }: StatBarProps) {
  const real = segments.filter((s): s is StatSegment => Boolean(s));
  if (real.length === 0 && !trailing) {
    return <span style={{ color: "var(--ap-fg-dim)" }}>—</span>;
  }
  return (
    <>
      {real.map((s, i) => (
        <span key={`${s.label}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {i > 0 && (
            <span aria-hidden style={{ color: "var(--ap-fg-dim)", margin: "0 4px" }}>
              ·
            </span>
          )}
          <span style={{ color: TONE_COLOR[s.tone ?? "neutral"], fontWeight: 500 }}>
            {s.value}
          </span>
          <span style={{ color: "var(--ap-fg-dim)" }}>{s.label}</span>
        </span>
      ))}
      {trailing && (
        <span
          style={{
            marginLeft: real.length > 0 ? 8 : 0,
            color: "var(--ap-fg-dim)",
            opacity: 0.85,
          }}
        >
          {trailing}
        </span>
      )}
    </>
  );
}
