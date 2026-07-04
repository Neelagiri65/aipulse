/**
 * DigestTileBoard — the /digest/{date} archive as a Nativerse live-tile
 * board (founder direction 2026-07-05: Windows-Phone Metro grid, warm
 * paper canvas, brand marks, motivated motion).
 *
 * Design system: BRAND-BIBLE §14–16 exactly — warm paper #FAFAF6 canvas
 * (this page is a deliberate light island regardless of the site's dark
 * chrome), ink #16160F, royal blue #2A33C2 as the ONLY accent, status
 * colours for data direction, Sentient/Supreme/Tabular with bible
 * fallbacks, hairlines, small radii, 4px spacing base.
 *
 * Motion (bible §16: motivated, 120/200/360ms, reduced-motion safe,
 * never decorative):
 *   - stat tiles FLIP on hover/focus/tap to reveal unit + source — the
 *     user asks, the tile answers (no timed auto-flips: motion that
 *     hides a number on a timer fights scannability and the bible);
 *   - the Tool Health tile PULSES only while it reports incidents —
 *     motion explaining live state;
 *   - hover raise (scale 1.02 + soft warm shadow) for tactility.
 *
 * Server component; all motion is pure CSS. The only client island is
 * the existing SectionShareButton.
 */

import { SectionShareButton } from "@/components/digest/SectionShareButton";
import type {
  DigestBody,
  DigestSection,
  DigestSectionItem,
} from "@/lib/digest/types";
import { deltaDirection, splitFirstSignedToken } from "@/lib/email/delta";
import { tileIcon } from "@/lib/digest/marks";
import { whyThisMatters } from "@/lib/digest/why-this-matters";

export type DigestTileBoardProps = {
  digest: DigestBody;
  baseUrl: string;
};

/* Palette (BRAND-BIBLE §14) */
const C = {
  paper: "#FAFAF6",
  card: "#FFFFFF",
  sunk: "#F2F1EA",
  ink: "#16160F",
  body: "#3A3A30",
  muted: "#6B6B5E",
  hairline: "#E7E6DE",
  blue: "#2A33C2",
  up: "#157A40",
  warn: "#B26A00",
  down: "#C0392B",
};

const FONT_LINK =
  "https://api.fontshare.com/v2/css?f[]=sentient@400,500,700&f[]=supreme@400,500,600&f[]=tabular@400,500&display=swap";

const CSS = `
  .gd-board { font-family: Supreme, -apple-system, "Segoe UI", Arial, sans-serif; }
  .gd-display { font-family: Sentient, "Iowan Old Style", Georgia, serif; }
  .gd-mono { font-family: Tabular, ui-monospace, Menlo, monospace; }

  /* Strict monochrome icon rule: every tile icon renders as a dark
     charcoal silhouette — colour on the board is reserved for semantic
     deltas and the incident pulse. Self-hosted marks are charcoal SVGs
     already; the filter normalises favicon fallbacks to match. */
  .gd-icon-img { filter: grayscale(1) brightness(0.45) contrast(1.2); }

  .gd-tile {
    transition: transform 120ms cubic-bezier(.2,0,0,1), box-shadow 120ms cubic-bezier(.2,0,0,1);
  }
  .gd-tile:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(22,22,15,0.12);
    z-index: 1;
  }
  .gd-flip:focus-visible { outline: 2px solid #2A33C2; outline-offset: 2px; }

  /* Flip tiles: user-initiated reveal (hover / keyboard focus / tap). */
  .gd-flip { perspective: 900px; }
  .gd-flip-inner {
    position: relative; width: 100%; height: 100%;
    transform-style: preserve-3d;
    transition: transform 360ms cubic-bezier(.2,0,0,1);
  }
  .gd-flip:hover .gd-flip-inner,
  .gd-flip:focus-within .gd-flip-inner { transform: rotateY(180deg); }
  .gd-face {
    position: absolute; inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    display: flex; flex-direction: column;
  }
  .gd-face-back { transform: rotateY(180deg); }

  /* Incident pulse: motion explaining live state, nothing else pulses. */
  @keyframes gd-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(178,106,0,0.35); }
    50% { box-shadow: 0 0 0 8px rgba(178,106,0,0); }
  }
  .gd-pulse { animation: gd-pulse 2s cubic-bezier(.2,0,0,1) infinite; }

  @media (prefers-reduced-motion: reduce) {
    .gd-tile, .gd-flip-inner { transition: none; }
    .gd-tile:hover { transform: none; }
    .gd-flip:hover .gd-flip-inner,
    .gd-flip:focus-within .gd-flip-inner { transform: none; }
    .gd-flip:hover .gd-face-back,
    .gd-flip:focus-within .gd-face-back { transform: none; position: relative; }
    .gd-flip:hover .gd-face-front,
    .gd-flip:focus-within .gd-face-front { display: none; }
    .gd-pulse { animation: none; }
  }
`;

export function DigestTileBoard({
  digest,
  baseUrl,
}: DigestTileBoardProps): React.JSX.Element {
  const chips = digest.tldr
    ? digest.tldr.split("·").map((c) => c.trim()).filter(Boolean)
    : [];
  const toolHealth = digest.sections.find((s) => s.id === "tool-health");
  const statSections = digest.sections.filter((s) =>
    ["sdk-adoption", "agents", "model-usage"].includes(s.id),
  );
  const listSections = digest.sections.filter(
    (s) => !["tool-health", "sdk-adoption", "agents", "model-usage"].includes(s.id),
  );
  const hasIncidents = /([1-9]\d*)\s+incident/.test(toolHealth?.headline ?? "");

  return (
    <main
      className="gd-board min-h-screen"
      style={{ backgroundColor: C.paper, color: C.ink }}
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONT_LINK} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Masthead — ONE committed ink band: lockup at scale + the day's
            headline together (two stacked weak headers read as neither). */}
        <header
          className="rounded-t-lg px-6 pb-7 pt-6 sm:px-8"
          style={{ backgroundColor: C.ink }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className="gd-mono text-[11px] font-medium uppercase"
                style={{ color: "#9AA3FF", letterSpacing: "0.18em" }}
              >
                Live telemetry · daily brief
              </p>
              <p
                className="gd-mono mt-1 text-3xl sm:text-4xl"
                style={{ color: C.paper, fontWeight: 500, letterSpacing: "0.16em" }}
              >
                GAWK
              </p>
              <p className="mt-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/nativerse-mark.svg"
                  alt="Nativerse"
                  width={20}
                  height={20}
                />
                <span
                  className="gd-display text-base lowercase"
                  style={{ color: "#A3A396", fontWeight: 400 }}
                >
                  by nativerse
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="gd-mono text-[11px]" style={{ color: "#A3A396", letterSpacing: "0.14em" }}>
                <span style={{ color: "#9AA3FF" }}>●</span> ARCHIVE
              </p>
              <p className="gd-mono mt-1 text-base font-medium" style={{ color: C.paper }}>
                {digest.date}
              </p>
            </div>
          </div>
          <h1
            className="gd-display mt-6 max-w-3xl text-2xl leading-snug sm:text-3xl"
            style={{ color: C.paper, fontWeight: 500, letterSpacing: "-0.018em", textWrap: "balance" }}
          >
            {digest.subject}
          </h1>
        </header>
        <div style={{ backgroundColor: C.blue, height: 3 }} />

        <p className="mt-5 text-sm" style={{ color: C.body }}>
          {digest.mode === "bootstrap"
            ? "First-day snapshot — where things stand now. Diff mode resumes tomorrow once we have two days to compare."
            : digest.mode === "quiet"
              ? "Nothing meaningful moved in the AI ecosystem in the last 24h. Baseline metrics unchanged."
              : "What verifiably moved in the AI ecosystem in the last 24h. Every number traces to a public source."}
        </p>

        {/* Stat chips */}
        {chips.length > 0 ? (
          <div
            className="mt-5 grid gap-px"
            style={{
              backgroundColor: C.hairline,
              border: `1px solid ${C.hairline}`,
              gridTemplateColumns: `repeat(${Math.min(chips.length, 5)}, minmax(0, 1fr))`,
            }}
          >
            {chips.slice(0, 5).map((chip, i) => {
              const m = chip.match(/^(\d+)\s+(.*)$/);
              return (
                <div key={i} className="px-3 py-2 text-center" style={{ backgroundColor: C.card }}>
                  <p className="gd-mono text-xl font-bold" style={{ color: C.ink }}>
                    {m ? m[1] : chip}
                  </p>
                  {m ? (
                    <p className="text-[11px]" style={{ color: C.muted }}>
                      {m[2]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* THE TILE GRID */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:grid-flow-dense">
          {/* Hero tile — What moved */}
          {digest.inferences && digest.inferences.length > 0 ? (
            <section
              data-testid="digest-inferences"
              className="gd-tile col-span-2 rounded-lg p-5 sm:col-span-2 sm:row-span-2 sm:min-h-[312px]"
              style={{
                backgroundColor: C.sunk,
                border: `1px solid ${C.hairline}`,
              }}
            >
              <p
                className="gd-mono text-[11px] font-bold uppercase"
                style={{ color: C.blue, letterSpacing: "0.18em" }}
              >
                What moved
              </p>
              <ul className="mt-4 space-y-4">
                {digest.inferences.map((line, i) => {
                  const d = deltaDirection(line);
                  const parts = splitFirstSignedToken(line);
                  const glyphColor = d === "up" ? C.up : d === "down" ? C.down : C.blue;
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="gd-mono text-sm font-bold" style={{ color: glyphColor }}>
                        {d === "up" ? "▲" : d === "down" ? "▼" : "■"}
                      </span>
                      <span className="text-[16px] font-medium leading-snug" style={{ color: C.ink }}>
                        {!parts ? (
                          line
                        ) : (
                          <>
                            {parts.before}
                            <span
                              className="gd-mono font-semibold"
                              style={{ color: parts.direction === "up" ? C.up : C.down }}
                            >
                              {parts.token}
                            </span>
                            {parts.after}
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Stat flip tiles from the metric-shaped sections */}
          {statSections.flatMap((section) =>
            section.items.slice(0, 8).map((item, i) => (
              <StatTile
                key={`${section.id}-${i}`}
                section={section}
                item={item}
                baseUrl={baseUrl}
                date={digest.date}
              />
            )),
          )}

          {/* Tool health — wide tile, pulses only while incidents are live */}
          {toolHealth ? (
            <section
              className={`gd-tile col-span-2 rounded-lg p-5 sm:col-span-4 ${hasIncidents ? "gd-pulse" : ""}`}
              style={{
                backgroundColor: hasIncidents ? "#FBF4E6" : C.card,
                border: `1px solid ${hasIncidents ? "#EAD9B8" : C.hairline}`,
              }}
            >
              <SectionHeader section={toolHealth} baseUrl={baseUrl} date={digest.date} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${baseUrl}/api/digest/chart/tool-health/${digest.date}`}
                alt={`Tool health, 7 days ending ${digest.date}: daily 04:00 UTC snapshot per tool. Green operational, amber degraded, red outage, grey no data.`}
                width={720}
                height={320}
                className="mt-3 w-full rounded"
                style={{ border: `1px solid ${C.hairline}` }}
              />
              <ItemList items={toolHealth.items} baseUrl={baseUrl} />
              <SourceRow section={toolHealth} baseUrl={baseUrl} date={digest.date} />
            </section>
          ) : null}

          {/* List tiles for the editorial sections */}
          {listSections.map((section) => (
            <section
              key={section.id}
              className="gd-tile col-span-2 rounded-lg p-5"
              style={{ backgroundColor: C.card, border: `1px solid ${C.hairline}` }}
            >
              <SectionHeader section={section} baseUrl={baseUrl} date={digest.date} />
              <ItemList items={section.items} baseUrl={baseUrl} />
              <SourceRow section={section} baseUrl={baseUrl} date={digest.date} />
            </section>
          ))}
        </div>

        <footer
          className="mt-8 border-t pt-4 text-xs leading-relaxed"
          style={{ borderColor: C.hairline, color: C.muted }}
        >
          GAWK is the live-telemetry track of Nativerse. Clarity. Trust. Every
          number traces to a public source ·{" "}
          <a href={`${baseUrl}/sources`} style={{ color: C.blue }}>
            Sources
          </a>{" "}
          ·{" "}
          <a href={`${baseUrl}/methodology`} style={{ color: C.blue }}>
            Methodology
          </a>
        </footer>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

function StatTile({
  section,
  item,
  baseUrl,
  date,
}: {
  section: DigestSection;
  item: DigestSectionItem;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  const direction = deltaDirection(item.detail, item.headline);
  const icon = tileIcon(item);
  const figure = item.detail
    ? splitFirstSignedToken(item.detail) ??
      (item.headline ? splitFirstSignedToken(item.headline) : null)
    : null;
  const color = direction === "up" ? C.up : direction === "down" ? C.down : C.ink;
  const label = item.headline.replace(/\s+climbed.*$|\s+slipped.*$/i, "");

  return (
    <div
      className="gd-tile gd-flip col-span-1 h-[150px] rounded-lg"
      tabIndex={0}
      aria-label={`${item.headline}${item.detail ? ` — ${item.detail}` : ""}`}
    >
      <div className="gd-flip-inner">
        {/* FRONT: mark + the number. */}
        <div
          className="gd-face gd-face-front items-start justify-between rounded-lg p-4"
          style={{ backgroundColor: C.card, border: `1px solid ${C.hairline}` }}
        >
          {icon ? (
            <span
              className="inline-flex items-center justify-center rounded"
              style={{
                backgroundColor: C.sunk,
                border: `1px solid ${C.hairline}`,
                // Bible §13: marks never render below 24px; uniform 36px
                // tile keeps optical weight identical across all sources.
                width: 36,
                height: 36,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={icon.src}
                alt=""
                width={24}
                height={24}
                className="gd-icon-img"
                style={{ objectFit: "contain" }}
              />
            </span>
          ) : (
            <span
              className="gd-mono rounded px-1.5 text-xs font-bold"
              style={{ backgroundColor: C.sunk, border: `1px solid ${C.hairline}` }}
            >
              {section.title.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="gd-mono text-[26px] font-bold leading-none" style={{ color }}>
              {figure ? figure.token : "—"}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-tight" style={{ color: C.ink }}>
              {label}
            </p>
          </div>
        </div>
        {/* BACK: the context — user asked, tile answers. */}
        <div
          className="gd-face gd-face-back justify-between rounded-lg p-4"
          style={{ backgroundColor: C.sunk, border: `1px solid ${C.hairline}` }}
        >
          <p className="text-[12px] leading-snug" style={{ color: C.body }}>
            {item.detail ?? item.headline}
          </p>
          <p className="text-[11px]">
            {item.sourceUrl ? (
              <a href={item.sourceUrl} style={{ color: C.blue }}>
                {item.sourceLabel ?? "Source"}
              </a>
            ) : null}
            {item.panelHref ? (
              <>
                {item.sourceUrl ? " · " : ""}
                <a href={`${baseUrl}${item.panelHref}`} style={{ color: C.blue }}>
                  View →
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  section,
  baseUrl,
  date,
}: {
  section: DigestSection;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  return (
    <div>
      <p
        className="gd-mono text-[11px] font-bold uppercase"
        style={{ color: C.blue, letterSpacing: "0.18em" }}
      >
        {section.title}
      </p>
      <h2 className="gd-display mt-1 text-lg leading-snug" style={{ fontWeight: 500 }}>
        {section.headline}
      </h2>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>
        <span style={{ color: C.blue, fontWeight: 600 }}>Why this matters</span>
        {" · "}
        {whyThisMatters(section.id)}
      </p>
    </div>
  );
}

function ItemList({
  items,
  baseUrl,
}: {
  items: DigestSectionItem[];
  baseUrl: string;
}): React.JSX.Element {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item, i) => {
        const d = deltaDirection(item.detail, item.headline);
        const glyphColor = d === "up" ? C.up : d === "down" ? C.down : C.muted;
        return (
          <li key={i} className="flex gap-2">
            <span
              className="gd-mono mt-0.5 w-4 shrink-0 text-center text-[12px] font-bold"
              style={{ color: glyphColor }}
              aria-hidden
            >
              {d === "up" ? "▲" : d === "down" ? "▼" : "›"}
            </span>
            <span className="min-w-0">
            <p className="text-sm font-medium" style={{ color: C.ink }}>
              {item.headline}
            </p>
            {item.detail ? (
              <p
                className="gd-mono text-xs"
                style={{ color: d === "neutral" ? C.muted : d === "up" ? C.up : C.down }}
              >
                {item.detail}
              </p>
            ) : null}
            <p className="text-[11px]" style={{ color: C.muted }}>
              {item.sourceUrl ? (
                <a href={item.sourceUrl} style={{ color: C.blue }}>
                  {item.sourceLabel ?? item.sourceUrl}
                </a>
              ) : null}
              {item.panelHref ? (
                <>
                  {item.sourceUrl ? " · " : ""}
                  <a href={`${baseUrl}${item.panelHref}`} style={{ color: C.blue }}>
                    View on Gawk →
                  </a>
                </>
              ) : null}
            </p>
            {item.caveat ? (
              <p className="text-[11px] italic" style={{ color: C.muted }}>
                {item.caveat}
              </p>
            ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SourceRow({
  section,
  baseUrl,
  date,
}: {
  section: DigestSection;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-[11px]" style={{ color: C.muted }}>
        {section.sourceUrls.length > 0 ? (
          <>
            Source:{" "}
            {section.sourceUrls.map((u, i) => (
              <span key={u}>
                <a href={u} style={{ color: C.blue }}>
                  {hostOf(u)}
                </a>
                {i < section.sourceUrls.length - 1 ? ", " : ""}
              </span>
            ))}
          </>
        ) : null}
      </p>
      <span className="shrink-0">
        <SectionShareButton
          sectionId={section.id}
          sectionTitle={section.title}
          headline={section.headline}
          permalink={`${baseUrl}/digest/${date}#${section.anchorSlug}`}
        />
      </span>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default DigestTileBoard;
