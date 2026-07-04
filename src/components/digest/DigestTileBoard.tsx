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
import { deriveTranslateUrl, TRANSLATE_LABEL } from "@/lib/i18n/translate-link";
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

/** Map a TL;DR chip label to its section anchor so the chip row works
 *  as a jump bar (navigation) rather than repeating the headline. */
function chipAnchor(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("tool")) return "tool-health";
  if (l.includes("sdk")) return "sdk-adoption";
  if (l.includes("benchmark")) return "benchmarks";
  if (l.includes("model")) return "model-usage";
  if (l.includes("hn")) return "hn";
  if (l.includes("agent")) return "agents";
  if (l.includes("lab")) return "labs";
  return null;
}

/** The composed subject is "Gawk — {date} · {payload}". The masthead
 *  already carries the wordmark and the date, so the band headline shows
 *  only the payload — display de-duplication, the stored subject is
 *  untouched (and the email, where it IS the subject line, keeps it). */
function bandHeadline(subject: string, date: string): string {
  const stripped = subject.replace(
    new RegExp(`^Gawk\\s*—\\s*${date}\\s*·\\s*`),
    "",
  );
  return stripped.length > 0 ? stripped : subject;
}

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
            {bandHeadline(digest.subject, digest.date)}
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
              const anchor = chipAnchor(m ? m[2] : chip);
              const body = (
                <>
                  <p className="gd-mono text-xl font-bold" style={{ color: C.ink }}>
                    {m ? m[1] : chip}
                  </p>
                  {m ? (
                    <p className="text-[11px]" style={{ color: C.muted }}>
                      {m[2]} {anchor ? "↓" : ""}
                    </p>
                  ) : null}
                </>
              );
              return anchor ? (
                <a
                  key={i}
                  href={`#${anchor}`}
                  className="gd-tile px-3 py-2 text-center"
                  style={{ backgroundColor: C.card }}
                >
                  {body}
                </a>
              ) : (
                <div key={i} className="px-3 py-2 text-center" style={{ backgroundColor: C.card }}>
                  {body}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* BAND 1: hero + the first metric section side by side. */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          {/* Hero tile — What moved */}
          {digest.inferences && digest.inferences.length > 0 ? (
            <section
              data-testid="digest-inferences"
              className="gd-tile rounded-lg p-5 lg:w-1/2"
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

          {/* First metric section: header on top, its tiles beneath. */}
          {statSections[0] ? (
            <div className="lg:w-1/2 scroll-mt-4" id={statSections[0].anchorSlug}>
              <GroupHeader section={statSections[0]} baseUrl={baseUrl} date={digest.date} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <StatTiles
                  section={statSections[0]}
                  baseUrl={baseUrl}
                  date={digest.date}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Remaining metric sections: header, then tiles — order guaranteed. */}
        {statSections.slice(1).map((section) => (
          <div key={section.id} id={section.anchorSlug} className="mt-5 scroll-mt-4">
            <GroupHeader section={section} baseUrl={baseUrl} date={digest.date} />
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTiles section={section} baseUrl={baseUrl} date={digest.date} />
            </div>
          </div>
        ))}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:grid-flow-dense">
          {/* Tool health — wide tile, pulses only while incidents are live */}
          {toolHealth ? (
            <section
              id={toolHealth.anchorSlug}
              className={`gd-tile col-span-2 scroll-mt-4 rounded-lg p-5 sm:col-span-4 ${hasIncidents ? "gd-pulse" : ""}`}
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
              id={section.anchorSlug}
              className="gd-tile col-span-2 scroll-mt-4 rounded-lg p-5"
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

function GroupHeader({
  section,
  baseUrl,
  date,
}: {
  section: DigestSection;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
      <p className="min-w-0">
        <span
          className="gd-mono text-[11px] font-bold uppercase"
          style={{ color: C.blue, letterSpacing: "0.18em" }}
        >
          {section.title}
        </span>
        <span className="gd-display ml-3 text-base" style={{ fontWeight: 500 }}>
          {section.headline}
        </span>
      </p>
      <p className="max-w-full text-[11px]" style={{ color: C.muted }}>
        {whyThisMatters(section.id)}{" "}
        {section.sourceUrls.slice(0, 3).map((u, i) => (
          <span key={u}>
            <a href={u} style={{ color: C.blue }}>
              {hostOf(u)}
            </a>
            {i < Math.min(section.sourceUrls.length, 3) - 1 ? ", " : ""}
          </span>
        ))}
        <a
          href={`${baseUrl}/digest/${date}#${section.anchorSlug}`}
          style={{ color: C.blue }}
        >
          {" "}· view all →
        </a>
      </p>
    </div>
  );
}

function StatTiles({
  section,
  baseUrl,
  date,
}: {
  section: DigestSection;
  baseUrl: string;
  date: string;
}): React.JSX.Element {
  const visible = section.items.slice(0, 8);
  const overflow = section.items.length - visible.length;
  const anchor = `${baseUrl}/digest/${date}#${section.anchorSlug}`;
  return (
    <>
      {visible.map((item, i) => (
        <StatTile
          key={i}
          section={section}
          item={item}
          baseUrl={baseUrl}
          date={date}
        />
      ))}
      {overflow > 0 ? (
        <a
          href={anchor}
          className="gd-tile col-span-1 flex h-[150px] flex-col items-start justify-between rounded-lg p-4"
          style={{ backgroundColor: C.sunk, border: `1px solid ${C.hairline}` }}
        >
          <span className="gd-mono text-2xl font-bold" style={{ color: C.ink }}>
            +{overflow}
          </span>
          <span className="text-[12px] font-medium" style={{ color: C.body }}>
            more · view all →
          </span>
        </a>
      ) : null}
    </>
  );
}

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
          <span>
            <p className="text-[12px] leading-snug" style={{ color: C.body }}>
              {item.detail ?? item.headline}
            </p>
            {item.caveat ? (
              <p className="mt-1 line-clamp-3 text-[10px] italic leading-tight" style={{ color: C.muted }}>
                {item.caveat}
              </p>
            ) : null}
          </span>
          <p className="text-[11px]">
            {item.sourceUrl ? (
              <a href={item.sourceUrl} style={{ color: C.blue }}>
                {item.sourceLabel ?? "Source"}
              </a>
            ) : null}
            {(() => {
              const tx = item.sourceUrl
                ? deriveTranslateUrl(item.sourceUrl, item.sourceLang)
                : null;
              return tx ? (
                <>
                  {" · "}
                  <a href={tx} style={{ color: C.blue }}>
                    {TRANSLATE_LABEL}
                  </a>
                </>
              ) : null;
            })()}
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
              {(() => {
                const tx = item.sourceUrl
                  ? deriveTranslateUrl(item.sourceUrl, item.sourceLang)
                  : null;
                return tx ? (
                  <>
                    {" · "}
                    <a href={tx} style={{ color: C.blue }}>
                      {TRANSLATE_LABEL}
                    </a>
                  </>
                ) : null;
              })()}
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
