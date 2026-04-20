"use client";

import { forwardRef } from "react";
import type { EventMeta } from "@/components/globe/event-detail";
import { shortEventType } from "@/components/globe/event-detail";

/**
 * Full detail card for a single AI-Lab dot (or a cluster that only
 * contains labs — typically 1, occasionally 2 when two HQs fall in the
 * same 4° bucket). Renders:
 *   - lab name + kind badge (industry / academic / non-profit)
 *   - city, country, HQ source link (verifiable coord provenance)
 *   - 7d total event count + per-type breakdown pills
 *   - tracked repos with per-repo count + GitHub link
 *   - stale / quiet flags so the card never lies about gaps
 *
 * Deliberately *does not* rescore, rename, or merge labs — it renders
 * exactly what fetchLabActivity emitted. Opens on lab-dot click; the
 * renderer (event-detail.EventCard) decides to delegate here when the
 * cluster is lab-majority.
 */

const CARD_WIDTH = 380;
const CARD_MARGIN = 48;
const MAX_VISIBLE_LABS = 2;

type LabCardProps = {
  labs: EventMeta[];
  anchor: { x: number; y: number };
  containerSize: { w: number; h: number };
  onClose: () => void;
};

export const LabCard = forwardRef<HTMLDivElement, LabCardProps>(function LabCard(
  { labs, anchor, containerSize, onClose },
  ref,
) {
  const placeRight = anchor.x + CARD_MARGIN + CARD_WIDTH <= containerSize.w;
  const left = placeRight
    ? anchor.x + CARD_MARGIN
    : Math.max(CARD_MARGIN, anchor.x - CARD_WIDTH - CARD_MARGIN);
  const top = Math.min(
    Math.max(CARD_MARGIN, anchor.y - 40),
    Math.max(CARD_MARGIN, containerSize.h - 320),
  );

  const visible = labs.slice(0, MAX_VISIBLE_LABS);
  const overflow = Math.max(0, labs.length - visible.length);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${labs.length} AI lab${labs.length === 1 ? "" : "s"} in this region`}
      style={{ left, top, width: CARD_WIDTH, zIndex: 1200 }}
      className="absolute rounded-md border border-border/60 bg-background/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(168,85,247,0.25)] backdrop-blur-md"
    >
      <div className="flex h-7 items-center gap-2 border-b border-border/50 px-2.5 font-mono text-[10px] uppercase tracking-wider text-foreground/70">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: "#a855f7",
            boxShadow: "0 0 6px rgba(168,85,247,0.6)",
          }}
          aria-hidden
        />
        <span className="flex-1 truncate">
          <span style={{ color: "#a855f7" }}>
            {labs.length} AI Lab{labs.length === 1 ? "" : "s"}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:bg-white/5 hover:text-foreground"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <ul className="divide-y divide-border/40">
        {visible.map((lab, i) => (
          <LabBody key={lab.labId ?? `idx:${i}`} lab={lab} />
        ))}
      </ul>
      {overflow > 0 && (
        <div className="border-t border-border/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          and {overflow} more lab{overflow === 1 ? "" : "s"} in this region
        </div>
      )}
    </div>
  );
});

function LabBody({ lab }: { lab: EventMeta }) {
  const name = lab.displayName ?? lab.labId ?? "(unknown lab)";
  const kind = lab.labKind;
  const city = lab.labCity;
  const country = lab.labCountry;
  const total = typeof lab.labTotal === "number" ? lab.labTotal : 0;
  const byType = lab.labByType ?? {};
  const repos = lab.labRepos ?? [];
  const orgs = lab.labOrgs ?? [];
  const hq = lab.labHqSourceUrl;
  const primary = lab.labUrl;
  const isStale = lab.labStale === true;
  const isInactive = lab.labInactive === true;

  const typeEntries = Object.entries(byType)
    .filter(([, n]) => n > 0)
    .sort((a, z) => z[1] - a[1]);

  return (
    <li className="px-2.5 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#a855f7" }}
        >
          AI LAB
        </span>
        {kind && <KindPill kind={kind} />}
        {isStale && (
          <span className="ap-sev-pill ap-sev-pill--pending">STALE</span>
        )}
        {isInactive && !isStale && (
          <span className="ap-sev-pill ap-sev-pill--pending">QUIET 7D</span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[13px] font-semibold text-foreground">
        {primary ? (
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#a855f7] hover:underline"
          >
            {name}
          </a>
        ) : (
          name
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">
          {city && country ? `${city}, ${country}` : country ?? city ?? "—"}
        </span>
        {hq && (
          <a
            href={hq}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 shrink-0 hover:text-[#a855f7] hover:underline"
          >
            HQ source ↗
          </a>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/60">
          7d activity
        </span>
        <span className="font-mono text-[14px] font-semibold tabular-nums text-foreground">
          {total}
        </span>
      </div>
      {typeEntries.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {typeEntries.map(([t, n]) => (
            <span
              key={t}
              className="ap-sev-pill ap-sev-pill--info tabular-nums"
              title={t}
            >
              {shortEventType(t)} · {n}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          No events in the 7-day window. Lab is tracked but quiet.
        </div>
      )}

      {repos.length > 0 && (
        <div className="mt-2.5 border-t border-border/30 pt-1.5">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-foreground/60">
            Tracked repos · {repos.length}
          </div>
          <ul className="space-y-0.5">
            {repos.map((r) => (
              <li
                key={`${r.owner}/${r.repo}`}
                className="flex items-center justify-between gap-2 font-mono text-[10px]"
              >
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-foreground/80 hover:text-[#a855f7] hover:underline"
                >
                  {r.owner}/{r.repo}
                </a>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.stale && (
                    <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-1 py-[1px] text-[8px] uppercase tracking-wider text-amber-400">
                      stale
                    </span>
                  )}
                  <span className="tabular-nums text-muted-foreground">
                    {r.total}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orgs.length > 0 && (
        <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-foreground/50">
          GH orgs ·{" "}
          {orgs.map((o, i) => (
            <span key={o}>
              <a
                href={`https://github.com/${o}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#a855f7] hover:underline"
              >
                {o}
              </a>
              {i < orgs.length - 1 && <span className="text-foreground/30">, </span>}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function KindPill({ kind }: { kind: "industry" | "academic" | "non-profit" }) {
  const label =
    kind === "industry"
      ? "INDUSTRY"
      : kind === "academic"
        ? "ACADEMIC"
        : "NON-PROFIT";
  const cls =
    kind === "industry"
      ? "ap-sev-pill ap-sev-pill--info"
      : "ap-sev-pill ap-sev-pill--pending";
  return <span className={cls}>{label}</span>;
}
